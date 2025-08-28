import { resolveChain } from "@/lib/chain";
import AmmFactory from "@/out/AmmFactory.sol/AmmFactory.json";

type FactoryAbi = typeof AmmFactory.abi;

export async function readFactoryOwnerById(
  chainId: number
): Promise<string | null> {
  const chain = await resolveChain(chainId);
  if (!chain?.contracts.factory) return null;
  try {
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(chain.rpcUrl);
    const factory = new Contract(
      chain.contracts.factory,
      AmmFactory.abi as FactoryAbi,
      provider
    );
    type FactoryWithOwner = { owner: () => Promise<string> };
    const maybeOwner = factory as unknown as Partial<FactoryWithOwner>;
    if (typeof maybeOwner.owner === "function") return await maybeOwner.owner();
    return null;
  } catch {
    return null;
  }
}

export type PairInfo = {
  pairAddress: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
};

export async function listPairsByChainId(
  chainId: number,
  max = 200
): Promise<PairInfo[]> {
  const chain = await resolveChain(chainId);
  if (!chain?.contracts.factory) return [];
  try {
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(chain.rpcUrl);
    const factory = new Contract(
      chain.contracts.factory,
      AmmFactory.abi as FactoryAbi,
      provider
    );
    const pairsLen: bigint = await factory.allPairsLength();
    const len = Number(pairsLen);
    const count = Math.min(len, max);
    const indexes = Array.from({ length: count }, (_, i) => i);
    const pairAddresses: string[] = await Promise.all(
      indexes.map((i) => factory.allPairs(i))
    );

    // token0/token1 are methods on pair; to avoid loading pair ABI, the factory likely exposes getPair(tokenA, tokenB) only.
    // We can read token0/token1 using a minimal ERC20 interface on the pair if ABI is available; otherwise, skip details.
    // For now, attempt to read token0/token1 dynamically with a minimal ABI signature.
    const minimalPairAbi = [
      "function token0() view returns (address)",
      "function token1() view returns (address)",
    ];

    const results: PairInfo[] = await Promise.all(
      pairAddresses.map(async (addr) => {
        try {
          const pair = new Contract(addr, minimalPairAbi, provider);
          const [t0, t1] = await Promise.all([pair.token0(), pair.token1()]);
          return { pairAddress: addr, token0: t0, token1: t1 } as PairInfo;
        } catch {
          return {
            pairAddress: addr as `0x${string}`,
            token0: "0x0000000000000000000000000000000000000000",
            token1: "0x0000000000000000000000000000000000000000",
          } as PairInfo;
        }
      })
    );

    return results;
  } catch {
    return [];
  }
}
