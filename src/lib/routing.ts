import { resolveChain } from "@/lib/chain";
import type { ContractRunner } from "ethers";

export type Token = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
};
export type Path = string[]; // array of token addresses

type Reserves = {
  reserve0: bigint;
  reserve1: bigint;
  token0: string;
  token1: string;
  ts: number;
};

const ZERO = "0x0000000000000000000000000000000000000000";
const RESERVE_TTL_MS = 15_000;

const reservesCache: Map<string, Reserves> = new Map(); // pairAddr -> reserves

export function findBasesBySymbol(
  tokens: Token[],
  chainBasesSymbols: string[]
): Token[] {
  const wanted = new Set(chainBasesSymbols.map((s) => s.toLowerCase()));
  // Unique by symbol/address once
  const out: Token[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (!wanted.has((t.symbol || "").toLowerCase())) continue;
    const key = t.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function buildCandidatePaths(
  from: Token,
  to: Token,
  bases: Token[],
  maxHops = 3
): Path[] {
  const paths: Path[] = [];
  const A = from.address,
    B = to.address;
  if (A.toLowerCase() === B.toLowerCase()) return paths;
  // Direct
  paths.push([A, B]);
  // Single base
  for (const X of bases) {
    if (
      X.address.toLowerCase() === A.toLowerCase() ||
      X.address.toLowerCase() === B.toLowerCase()
    )
      continue;
    paths.push([A, X.address, B]);
  }
  if (maxHops >= 3) {
    for (let i = 0; i < bases.length; i++) {
      for (let j = 0; j < bases.length; j++) {
        if (i === j) continue;
        const X = bases[i];
        const Y = bases[j];
        if (
          [A, B].some(
            (addr) =>
              addr.toLowerCase() === X.address.toLowerCase() ||
              addr.toLowerCase() === Y.address.toLowerCase()
          )
        )
          continue;
        paths.push([A, X.address, Y.address, B]);
      }
    }
  }
  // Deduplicate
  const uniq = new Set<string>();
  const dedup: Path[] = [];
  for (const p of paths) {
    const k = p.map((x) => x.toLowerCase()).join("-");
    if (!uniq.has(k)) {
      uniq.add(k);
      dedup.push(p);
    }
  }
  return dedup;
}

async function getPairAddress(
  factory: string,
  tokenA: string,
  tokenB: string,
  provider: ContractRunner | null | undefined
): Promise<string> {
  const { Contract } = await import("ethers");
  const abi = ["function getPair(address,address) view returns (address)"];
  const c = new Contract(factory, abi, provider);
  const addr: string = await c.getPair(tokenA, tokenB);
  return addr && addr !== ZERO ? addr : ZERO;
}

async function getReserves(
  pairAddr: string,
  provider: ContractRunner | null | undefined
): Promise<Reserves | null> {
  const now = Date.now();
  const hit = reservesCache.get(pairAddr);
  if (hit && now - hit.ts < RESERVE_TTL_MS) return hit;
  try {
    const { Contract } = await import("ethers");
    const abi = [
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      "function getReserves() view returns (uint112,uint112,uint32)",
    ];
    const c = new Contract(pairAddr, abi, provider);
    const [t0, t1, reserves] = await Promise.all([
      c.token0(),
      c.token1(),
      c.getReserves(),
    ]);
    const r: Reserves = {
      token0: String(t0),
      token1: String(t1),
      reserve0: BigInt(reserves[0]),
      reserve1: BigInt(reserves[1]),
      ts: now,
    };
    reservesCache.set(pairAddr, r);
    return r;
  } catch {
    return null;
  }
}

function quoteHop(
  amountIn: bigint,
  from: string,
  to: string,
  r: Reserves
): bigint {
  const FEE_NUM = BigInt(997);
  const FEE_DEN = BigInt(1000);
  const isAToB =
    from.toLowerCase() === r.token0.toLowerCase() &&
    to.toLowerCase() === r.token1.toLowerCase();
  const isBToA =
    from.toLowerCase() === r.token1.toLowerCase() &&
    to.toLowerCase() === r.token0.toLowerCase();
  if (!isAToB && !isBToA) return BigInt(0);
  const reserveIn = isAToB ? r.reserve0 : r.reserve1;
  const reserveOut = isAToB ? r.reserve1 : r.reserve0;
  if (reserveIn === BigInt(0) || reserveOut === BigInt(0)) return BigInt(0);
  const amtInWithFee = amountIn * FEE_NUM;
  const numerator = amtInWithFee * reserveOut;
  const denominator = reserveIn * FEE_DEN + amtInWithFee;
  return denominator === BigInt(0) ? BigInt(0) : numerator / denominator;
}

function quoteHopForExactOut(
  amountOut: bigint,
  from: string,
  to: string,
  r: Reserves
): bigint {
  const FEE_NUM = BigInt(997);
  const FEE_DEN = BigInt(1000);
  const isAToB =
    from.toLowerCase() === r.token0.toLowerCase() &&
    to.toLowerCase() === r.token1.toLowerCase();
  const isBToA =
    from.toLowerCase() === r.token1.toLowerCase() &&
    to.toLowerCase() === r.token0.toLowerCase();
  if (!isAToB && !isBToA) return BigInt(0);
  const reserveIn = isAToB ? r.reserve0 : r.reserve1;
  const reserveOut = isAToB ? r.reserve1 : r.reserve0;
  if (reserveIn === BigInt(0) || reserveOut === BigInt(0)) return BigInt(0);
  if (amountOut >= reserveOut) return BigInt(0);
  // amountIn = floor((reserveIn * amountOut * FEE_DEN) / ((reserveOut - amountOut) * FEE_NUM)) + 1
  const numerator = reserveIn * amountOut * FEE_DEN;
  const denominator = (reserveOut - amountOut) * FEE_NUM;
  if (denominator === BigInt(0)) return BigInt(0);
  return numerator / denominator + BigInt(1);
}

export async function findBestRoute(
  chainId: number,
  tokensForChain: Token[],
  from: Token,
  to: Token,
  amountIn: bigint,
  basesSymbols: string[]
): Promise<{
  path: Path | null;
  amountOut: bigint;
  reservesUsed: Record<string, Reserves>;
}> {
  const chain = await resolveChain(chainId);
  if (!chain?.contracts.factory)
    return { path: null, amountOut: BigInt(0), reservesUsed: {} };
  const { JsonRpcProvider } = await import("ethers");
  const provider = new JsonRpcProvider(chain.rpcUrl);

  const bases = findBasesBySymbol(tokensForChain, basesSymbols);
  const candidates = buildCandidatePaths(from, to, bases, 3);

  // Unique pair lookups across all candidates
  const pairLookups: Array<{ a: string; b: string }> = [];
  const pairKey = (a: string, b: string) =>
    `${a.toLowerCase()}-${b.toLowerCase()}`;
  const pairKeySet = new Set<string>();
  for (const path of candidates) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const k = pairKey(a, b);
      const k2 = pairKey(b, a);
      if (pairKeySet.has(k) || pairKeySet.has(k2)) continue;
      pairKeySet.add(k);
      pairLookups.push({ a, b });
    }
  }

  // Resolve pair addresses
  const factory = chain.contracts.factory;
  const { JsonRpcProvider: _JRP } = await import("ethers");
  const provider2 = new _JRP(chain.rpcUrl);
  const addrs = await Promise.all(
    pairLookups.map(({ a, b }) => getPairAddress(factory, a, b, provider2))
  );
  const lookupToAddr = new Map<string, string>();
  pairLookups.forEach((p, idx) =>
    lookupToAddr.set(pairKey(p.a, p.b), addrs[idx])
  );

  // Fetch reserves for unique non-zero pairs
  const reservesUsed: Record<string, Reserves> = {};
  const uniquePairs = Array.from(new Set(addrs.filter((x) => x && x !== ZERO)));
  const reservesArr = await Promise.all(
    uniquePairs.map((addr) => getReserves(addr, provider))
  );
  uniquePairs.forEach((addr, idx) => {
    const r = reservesArr[idx];
    if (r) reservesUsed[addr.toLowerCase()] = r;
  });

  // Quote each candidate path, skipping if any hop pair missing
  let bestPath: Path | null = null;
  let bestOut = BigInt(0);
  for (const path of candidates) {
    let ok = true;
    let out = amountIn;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const addrAB =
        lookupToAddr.get(pairKey(a, b)) ||
        lookupToAddr.get(pairKey(b, a)) ||
        ZERO;
      if (!addrAB || addrAB === ZERO) {
        ok = false;
        break;
      }
      const r = reservesUsed[addrAB.toLowerCase()];
      if (!r) {
        ok = false;
        break;
      }
      out = quoteHop(out, a, b, r);
      if (out === BigInt(0)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (out > bestOut) {
      bestOut = out;
      bestPath = path;
    }
  }

  return { path: bestPath, amountOut: bestOut, reservesUsed };
}

export async function findBestRouteForExactOut(
  chainId: number,
  tokensForChain: Token[],
  from: Token,
  to: Token,
  amountOutDesired: bigint,
  basesSymbols: string[]
): Promise<{
  path: Path | null;
  amountIn: bigint;
  reservesUsed: Record<string, Reserves>;
}> {
  const chain = await resolveChain(chainId);
  if (!chain?.contracts.factory)
    return { path: null, amountIn: BigInt(0), reservesUsed: {} };
  const { JsonRpcProvider } = await import("ethers");
  const provider = new JsonRpcProvider(chain.rpcUrl);

  const bases = findBasesBySymbol(tokensForChain, basesSymbols);
  const candidates = buildCandidatePaths(from, to, bases, 3);

  // Unique pair lookups across all candidates
  const pairLookups: Array<{ a: string; b: string }> = [];
  const pairKey = (a: string, b: string) =>
    `${a.toLowerCase()}-${b.toLowerCase()}`;
  const pairKeySet = new Set<string>();
  for (const path of candidates) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const k = pairKey(a, b);
      const k2 = pairKey(b, a);
      if (pairKeySet.has(k) || pairKeySet.has(k2)) continue;
      pairKeySet.add(k);
      pairLookups.push({ a, b });
    }
  }

  // Resolve pair addresses
  const factory = chain.contracts.factory;
  const { JsonRpcProvider: _JRP } = await import("ethers");
  const provider2 = new _JRP(chain.rpcUrl);
  const addrs = await Promise.all(
    pairLookups.map(({ a, b }) => getPairAddress(factory, a, b, provider2))
  );
  const lookupToAddr = new Map<string, string>();
  pairLookups.forEach((p, idx) =>
    lookupToAddr.set(pairKey(p.a, p.b), addrs[idx])
  );

  // Fetch reserves for unique non-zero pairs
  const reservesUsed: Record<string, Reserves> = {};
  const uniquePairs = Array.from(new Set(addrs.filter((x) => x && x !== ZERO)));
  const reservesArr = await Promise.all(
    uniquePairs.map((addr) => getReserves(addr, provider))
  );
  uniquePairs.forEach((addr, idx) => {
    const r = reservesArr[idx];
    if (r) reservesUsed[addr.toLowerCase()] = r;
  });

  // For each path, compute required input to achieve amountOutDesired
  let bestPath: Path | null = null;
  let bestIn: bigint = BigInt(0);
  for (const path of candidates) {
    let ok = true;
    let requiredOut = amountOutDesired;
    // walk backwards from end to start
    for (let i = path.length - 1; i > 0; i--) {
      const a = path[i - 1];
      const b = path[i];
      const addrAB =
        lookupToAddr.get(pairKey(a, b)) ||
        lookupToAddr.get(pairKey(b, a)) ||
        ZERO;
      if (!addrAB || addrAB === ZERO) {
        ok = false;
        break;
      }
      const r = reservesUsed[addrAB.toLowerCase()];
      if (!r) {
        ok = false;
        break;
      }
      const neededIn = quoteHopForExactOut(requiredOut, a, b, r);
      if (neededIn === BigInt(0)) {
        ok = false;
        break;
      }
      requiredOut = neededIn; // rename for next hop backwards
    }
    if (!ok) continue;
    const amountIn = requiredOut;
    if (bestPath === null || amountIn < bestIn || bestIn === BigInt(0)) {
      bestIn = amountIn;
      bestPath = path;
    }
  }

  return { path: bestPath, amountIn: bestIn, reservesUsed };
}
