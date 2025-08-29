"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, Fragment } from "react";
import { getEffectiveNetworkId, resolveChain } from "@/lib/chain";
import { listPairsByChainId, type PairInfo } from "@/lib/ethers";
import SettingsPopover from "@/components/settings/SettingsPopover";
import TokenAmountSelector from "@/components/inputs/TokenAmountSelector";
import TokenLogo from "@/components/tokens/TokenLogo";
import SteelSlider from "@/components/inputs/SteelSlider";
import { getSlippagePct, SETTINGS_EVENTS } from "@/lib/settings";
import { Settings, Flame } from "lucide-react";
import type { ContractRunner } from "ethers";

type TokenMeta = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
};

type EnrichedPair = PairInfo & {
  token0Meta: TokenMeta | null;
  token1Meta: TokenMeta | null;
  reserve0: bigint | null;
  reserve1: bigint | null;
  totalSupply: bigint | null;
  burnedPct: number | null;
  userLpBalance: bigint | null;
  userLpPct: number | null;
};

export default function LiquidityPage() {
  const [chainId, setChainId] = useState<number | null>(null);
  const [pairsRaw, setPairsRaw] = useState<PairInfo[]>([]);
  const [tokenlist, setTokenlist] = useState<TokenMeta[]>([]);
  const [enriched, setEnriched] = useState<EnrichedPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<string | null>(null);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [manageModeByPair, setManageModeByPair] = useState<Record<string, "add" | "remove" | "burn">>({});
  const [removePctByPair, setRemovePctByPair] = useState<Record<string, number>>({});
  const [addAmt0ByPair, setAddAmt0ByPair] = useState<Record<string, string>>({});
  const [addAmt1ByPair, setAddAmt1ByPair] = useState<Record<string, string>>({});
  const [settingsOpenFor, setSettingsOpenFor] = useState<string | null>(null);
  const [txBusyFor, setTxBusyFor] = useState<string | null>(null);
  const [txErrorFor, setTxErrorFor] = useState<Record<string, string>>({});
  const [slippagePct, setSlippagePct] = useState<number>(3);
  const [searchQuery, setSearchQuery] = useState<string>("");
  type SortKey = "burnedPct" | "userLpPct" | null;
  const [sortKey, setSortKey] = useState<SortKey>("userLpPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Build quick lookup for tokenlist
  const tokenlistMap = useMemo(() => {
    const map = new Map<string, TokenMeta>();
    if (!chainId) return map;
    for (const t of tokenlist) {
      if (t.chainId !== chainId) continue;
      map.set(t.address.toLowerCase(), t);
    }
    return map;
  }, [tokenlist, chainId]);

  useEffect(() => {
    fetch("/tokenlist.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTokenlist((j.tokens || []) as TokenMeta[]))
      .catch(() => setTokenlist([]));
  }, []);

  // Load global slippage and listen for updates
  useEffect(() => {
    setSlippagePct(getSlippagePct());
    const onSync = () => setSlippagePct(getSlippagePct());
    window.addEventListener(SETTINGS_EVENTS.slippageUpdated, onSync);
    return () => window.removeEventListener(SETTINGS_EVENTS.slippageUpdated, onSync);
  }, []);

  // Track connected account
  useEffect(() => {
    try {
      const eth = (window as unknown as { ethereum?: { request?: (args: { method: string }) => Promise<unknown>; on?: (ev: string, fn: (accts: unknown) => void) => void; removeListener?: (ev: string, fn: (accts: unknown) => void) => void } }).ethereum;
      if (!eth) return;
      eth.request?.({ method: "eth_accounts" })
        .then((accts: unknown) => {
          const arr = Array.isArray(accts) ? (accts as string[]) : [];
          setAccount(arr && arr.length > 0 ? arr[0] : null);
        })
        .catch(() => {});
      const onAccountsChanged = (accts: unknown) => {
        const arr = Array.isArray(accts) ? (accts as string[]) : [];
        setAccount(arr && arr.length > 0 ? arr[0] : null);
      };
      eth.on?.("accountsChanged", onAccountsChanged);
      return () => eth.removeListener?.("accountsChanged", onAccountsChanged);
    } catch {}
  }, []);

  const fetchPairs = async (id: number) => {
    setLoading(true);
    try {
    const res = await listPairsByChainId(id, 200);
      setPairsRaw(res);
    } finally {
    setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const id = await getEffectiveNetworkId();
      setChainId(id);
      await fetchPairs(id);
    })();

    type NetworkChangedDetail = { chainId?: number };
    const onChanged = (e: CustomEvent<NetworkChangedDetail>) => {
      const id = e.detail?.chainId;
      if (typeof id === "number") {
        setChainId(id);
        fetchPairs(id);
      }
    };
    const handler = onChanged as EventListener;
    window.addEventListener("krchange:network-changed", handler);
    return () => window.removeEventListener("krchange:network-changed", handler);
  }, []);

  useEffect(() => {
    (async () => {
      if (!chainId) return;
      if (!pairsRaw || pairsRaw.length === 0) {
        setEnriched([]);
        return;
      }

      const chain = await resolveChain(chainId);
      if (!chain) return;
      const { JsonRpcProvider, Contract } = await import("ethers");
      const provider = new JsonRpcProvider(chain.rpcUrl);

      // Deduplicate token addresses across pairs
      const uniqTokenAddrs = Array.from(
        new Set(
          pairsRaw
            .flatMap((p) => [p.token0.toLowerCase(), p.token1.toLowerCase()])
        )
      );

      // Load token metas: from tokenlist, or cache, or on-chain
      const metaMap = new Map<string, TokenMeta>();
      const toFetch: string[] = [];
      for (const addr of uniqTokenAddrs) {
        const hit = tokenlistMap.get(addr);
        if (hit) {
          metaMap.set(addr, hit);
          continue;
        }
        // localStorage cache
        let cached: TokenMeta | null = null;
        try {
          const raw = window.localStorage.getItem(
            `krchange:tokenmeta:${chainId}:${addr}`
          );
          if (raw) cached = JSON.parse(raw) as TokenMeta;
        } catch {}
        if (cached && cached.symbol && typeof cached.decimals === "number") {
          metaMap.set(addr, cached);
        } else {
          toFetch.push(addr);
        }
      }

      if (toFetch.length > 0) {
        const erc20Abi = [
          "function symbol() view returns (string)",
          "function name() view returns (string)",
          "function decimals() view returns (uint8)",
        ];
        await Promise.all(
          toFetch.map(async (addr) => {
            try {
              const c = new Contract(addr, erc20Abi, provider);
              const [symbol, name, decimalsRaw] = await Promise.all([
                c.symbol(),
                c.name(),
                c.decimals(),
              ]);
              const tm: TokenMeta = {
                address: addr,
                chainId,
                symbol: String(symbol),
                name: String(name),
                decimals: Number(decimalsRaw),
                logoURI: `/tokens/${chainId}/${addr}.png`,
              };
              metaMap.set(addr, tm);
              try {
                window.localStorage.setItem(
                  `krchange:tokenmeta:${chainId}:${addr}`,
                  JSON.stringify(tm)
                );
              } catch {}
            } catch {
              // leave missing
            }
          })
        );
      }

      // Fetch reserves and LP supply/ownership for each pair
      const pairAbi = [
        "function getReserves() view returns (uint112,uint112,uint32)",
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
      ];
      const enrichedPairs: EnrichedPair[] = await Promise.all(
        pairsRaw.map(async (p) => {
          let reserve0: bigint | null = null;
          let reserve1: bigint | null = null;
          let totalSupply: bigint | null = null;
          let burnedPct: number | null = null;
          let userLpBalance: bigint | null = null;
          let userLpPct: number | null = null;
          try {
            const pair = new Contract(p.pairAddress, pairAbi, provider);
            const [r, ts, zeroBal, deadBal, userBal] = await Promise.all([
              pair.getReserves(),
              pair.totalSupply(),
              pair.balanceOf("0x0000000000000000000000000000000000000000"),
              pair.balanceOf("0x000000000000000000000000000000000000dEaD"),
              account ? pair.balanceOf(account) : Promise.resolve(BigInt(0)),
            ]);
            reserve0 = BigInt(r[0]);
            reserve1 = BigInt(r[1]);
            totalSupply = BigInt(ts);
            const burned = BigInt(zeroBal) + BigInt(deadBal);
            if (totalSupply > BigInt(0)) {
              const pct = Number((burned * BigInt(1_000_000)) / totalSupply) / 10_000; // 2 decimals
              burnedPct = isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
            } else {
              burnedPct = 0;
            }
            if (account && totalSupply > BigInt(0)) {
              userLpBalance = BigInt(userBal);
              const pct = Number((userLpBalance * BigInt(1_000_000)) / totalSupply) / 10_000; // 2 decimals
              userLpPct = isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
            }
          } catch {}
          return {
            ...p,
            token0Meta: metaMap.get(p.token0.toLowerCase()) || null,
            token1Meta: metaMap.get(p.token1.toLowerCase()) || null,
            reserve0,
            reserve1,
            totalSupply,
            burnedPct,
            userLpBalance,
            userLpPct,
          };
        })
      );

      setEnriched(enrichedPairs);
    })();
  }, [chainId, pairsRaw, tokenlistMap, account]);

  const [explorerBase, setExplorerBase] = useState<string>("");
  useEffect(() => {
    (async () => {
      if (!chainId) return;
      const chain = await resolveChain(chainId);
      setExplorerBase(chain?.explorerUrl || "");
    })();
  }, [chainId]);

  const formatAmount = (amt: bigint | null, decimals: number | undefined): string => {
    if (!amt || !decimals && decimals !== 0) return "—";
    try {
      const n = Number(amt) / Math.pow(10, decimals);
      if (!isFinite(n)) return "—";
      if (n === 0) return "0";
      if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
      return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
    } catch {
      return "—";
    }
  };

  const formatPercent = (pct: number | null): string => {
    if (pct === null || !isFinite(pct)) return "—";
    return `${pct.toFixed(2)}%`;
  };

  const truncate = (s: string | undefined | null, len: number): string => {
    const str = (s || "").toString();
    if (str.length <= len) return str;
    return str.slice(0, len - 1) + "…";
  };

  const numToPlainString = (n: number, maxDecimals = 8): string => {
    if (!isFinite(n)) return "";
    const fixed = n.toFixed(Math.min(12, Math.max(0, maxDecimals)));
    return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  };

  function decimalToBigInt(amountStr: string, decimals: number): bigint | null {
    if (!amountStr) return null;
    const parts = amountStr.split(".");
    const intPart = parts[0] || "0";
    const fracPartRaw = parts[1] || "";
    const frac = fracPartRaw.slice(0, decimals).padEnd(decimals, "0");
    const whole = (intPart + frac).replace(/^0+/, "");
    try {
      return BigInt(whole === "" ? "0" : whole);
    } catch {
      return null;
    }
  }

  const displayedPairs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let filtered = enriched;
    if (q.length > 0) {
      const slashIdx = q.indexOf("/");
      filtered = enriched.filter((p) => {
        const t0 = p.token0Meta;
        const t1 = p.token1Meta;
        const t0Sym = (t0?.symbol || "").toLowerCase();
        const t0Name = (t0?.name || "").toLowerCase();
        const t1Sym = (t1?.symbol || "").toLowerCase();
        const t1Name = (t1?.name || "").toLowerCase();
        if (slashIdx >= 0) {
          const left = q.slice(0, slashIdx).trim();
          const right = q.slice(slashIdx + 1).trim();
          if (!left || !right) return false;
          const leftMatchesT0 = t0Sym.includes(left) || t0Name.includes(left);
          const rightMatchesT1 = t1Sym.includes(right) || t1Name.includes(right);
          return leftMatchesT0 && rightMatchesT1;
        }
        return (
          t0Sym.includes(q) ||
          t0Name.includes(q) ||
          t1Sym.includes(q) ||
          t1Name.includes(q)
        );
      });
    }

    // Partition into listed vs custom (any token not in tokenlist)
    const listed: typeof enriched = [];
    const custom: typeof enriched = [];
    for (const p of filtered) {
      const inList0 = tokenlistMap.has(p.token0.toLowerCase());
      const inList1 = tokenlistMap.has(p.token1.toLowerCase());
      if (inList0 && inList1) listed.push(p); else custom.push(p);
    }

    const cmpWithDir = (a: number | null, b: number | null, dir: 1 | -1): number => {
      if (a === null && b === null) return 0;
      if (a === null) return 1; // nulls last
      if (b === null) return -1;
      return (a - b) * dir;
    };

    const sortListed = (arr: typeof enriched) => {
      const primaryKey = sortKey ?? "userLpPct";
      const primaryDir: 1 | -1 = (sortKey ? (sortDir === "asc" ? 1 : -1) : -1);
      const secondaryDir: 1 | -1 = -1; // always desc for tie-break
      const aVal = (p: EnrichedPair, k: "userLpPct" | "burnedPct") => (k === "userLpPct" ? p.userLpPct : p.burnedPct);
      arr.sort((a, b) => {
        const pri = cmpWithDir(aVal(a, primaryKey), aVal(b, primaryKey), primaryDir);
        if (pri !== 0) return pri;
        const secKey = primaryKey === "userLpPct" ? "burnedPct" : "userLpPct";
        const sec = cmpWithDir(aVal(a, secKey), aVal(b, secKey), secondaryDir);
        if (sec !== 0) return sec;
        // Stable-ish fallback by symbol to avoid jitter
        const aSym = (a.token0Meta?.symbol || "") + (a.token1Meta?.symbol || "");
        const bSym = (b.token0Meta?.symbol || "") + (b.token1Meta?.symbol || "");
        return aSym.localeCompare(bSym);
      });
      return arr;
    };

    const sortCustom = (arr: typeof enriched) => {
      // Keep custom at bottom but can still sort within group for consistency
      if (!sortKey) {
        arr.sort((a, b) => cmpWithDir(a.userLpPct, b.userLpPct, -1) || cmpWithDir(a.burnedPct, b.burnedPct, -1));
        return arr;
      }
      const dir: 1 | -1 = sortDir === "asc" ? 1 : -1;
      if (sortKey === "userLpPct") arr.sort((a, b) => cmpWithDir(a.userLpPct, b.userLpPct, dir));
      if (sortKey === "burnedPct") arr.sort((a, b) => cmpWithDir(a.burnedPct, b.burnedPct, dir));
      return arr;
    };

    const listedSorted = sortListed([...listed]);
    const customSorted = sortCustom([...custom]);
    return [...listedSorted, ...customSorted];
  }, [enriched, searchQuery, sortKey, sortDir, tokenlistMap]);

  const toggleSort = (key: Exclude<SortKey, null>) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const ensureAllowance = async (
    tokenAddr: string,
    owner: string,
    spender: string,
    amountBn: bigint,
    provider: ContractRunner | null | undefined,
    onSubmitted?: () => void
  ) => {
    const { Contract, MaxUint256 } = await import("ethers");
    const erc20Abi = [
      "function allowance(address,address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
    ];
    const c = new Contract(tokenAddr, erc20Abi, provider);
    const current: bigint = await c.allowance(owner, spender);
    if (current >= amountBn) return;
    let infinite = true;
    try {
      const raw = window.localStorage.getItem("krchange:infiniteApprovals");
      if (raw !== null) infinite = raw === "true";
    } catch {}
    const approveAmount = infinite ? MaxUint256 : amountBn;
    const tx = await c.approve(spender, approveAmount);
    try { onSubmitted?.(); } catch {}
    await tx.wait?.();
  };

  const onRemoveLiquidity = async (p: EnrichedPair) => {
    if (!chainId || !account) return;
    if (!p.totalSupply || p.totalSupply === BigInt(0) || p.userLpBalance === null) return;
    try {
      setTxBusyFor(p.pairAddress);
      setTxErrorFor((prev) => ({ ...prev, [p.pairAddress]: "" }));
      const chain = await resolveChain(chainId);
      if (!chain?.contracts.router) throw new Error("Missing router");
      const { BrowserProvider, Contract } = await import("ethers");
      const eth = (window as unknown as { ethereum?: unknown }).ethereum as unknown as { request?: (args: { method: string }) => Promise<unknown> } | undefined;
      if (!eth) throw new Error("Wallet not found");
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const owner = await signer.getAddress();

      const pct = Math.max(0, Math.min(100, removePctByPair[p.pairAddress] ?? 0));
      const liquidity = (p.userLpBalance * BigInt(Math.floor(pct * 100))) / BigInt(100 * 100);
      if (liquidity === BigInt(0)) throw new Error("Nothing to remove");

      // Expected amounts
      const amount0 = (liquidity * (p.reserve0 ?? BigInt(0))) / p.totalSupply;
      const amount1 = (liquidity * (p.reserve1 ?? BigInt(0))) / p.totalSupply;
      const bips = Math.floor(Math.max(0, Math.min(100, slippagePct)) * 100);
      const amount0Min = (amount0 * BigInt(10000 - bips)) / BigInt(10000);
      const amount1Min = (amount1 * BigInt(10000 - bips)) / BigInt(10000);

      // Approve LP token
      await ensureAllowance(
        p.pairAddress,
        owner,
        chain.contracts.router,
        liquidity,
        signer,
        () => {}
      );

      const routerAbi = [
        "function removeLiquidity(address,address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)",
      ];
      const router = new Contract(chain.contracts.router, routerAbi, signer);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const tx = await router.removeLiquidity(
        p.token0,
        p.token1,
        liquidity,
        amount0Min,
        amount1Min,
        owner,
        deadline
      );
      await tx.wait?.();
      try {
        window.dispatchEvent(new Event("krchange:balance-possibly-changed"));
      } catch {}
      try {
        if (chainId) await fetchPairs(chainId);
      } catch {}
    } catch (err) {
      const anyErr = err as unknown as { message?: string };
      setTxErrorFor((prev) => ({ ...prev, [p.pairAddress]: anyErr?.message || "Transaction failed" }));
    } finally {
      setTxBusyFor(null);
    }
  };

  const onBurnLiquidity = async (p: EnrichedPair) => {
    if (!chainId || !account) return;
    if (!p.userLpBalance) return;
    try {
      setTxBusyFor(p.pairAddress);
      setTxErrorFor((prev) => ({ ...prev, [p.pairAddress]: "" }));
      const { BrowserProvider, Contract } = await import("ethers");
      const eth = (window as unknown as { ethereum?: unknown }).ethereum as unknown as { request?: (args: { method: string }) => Promise<unknown> } | undefined;
      if (!eth) throw new Error("Wallet not found");
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();

      const pct = Math.max(0, Math.min(100, removePctByPair[p.pairAddress] ?? 0));
      const amount = (p.userLpBalance * BigInt(Math.floor(pct * 100))) / BigInt(100 * 100);
      if (amount === BigInt(0)) throw new Error("Nothing to burn");

      const erc20Abi = [
        "function transfer(address,uint256) returns (bool)",
      ];
      const lp = new Contract(p.pairAddress, erc20Abi, signer);
      const DEAD = "0x000000000000000000000000000000000000dEaD";
      const tx = await lp.transfer(DEAD, amount);
      await tx.wait?.();
      try {
        window.dispatchEvent(new Event("krchange:balance-possibly-changed"));
      } catch {}
      try {
        if (chainId) await fetchPairs(chainId);
      } catch {}
    } catch (err) {
      const anyErr = err as unknown as { message?: string };
      setTxErrorFor((prev) => ({ ...prev, [p.pairAddress]: anyErr?.message || "Transaction failed" }));
    } finally {
      setTxBusyFor(null);
    }
  };

  const onAddLiquidity = async (p: EnrichedPair) => {
    if (!chainId || !account) return;
    const t0d = p.token0Meta?.decimals ?? 18;
    const t1d = p.token1Meta?.decimals ?? 18;
    const a0s = addAmt0ByPair[p.pairAddress] || "";
    const a1s = addAmt1ByPair[p.pairAddress] || "";
    const a0 = decimalToBigInt(a0s, t0d);
    const a1 = decimalToBigInt(a1s, t1d);
    if (!a0 || !a1) return;
    try {
      setTxBusyFor(p.pairAddress);
      setTxErrorFor((prev) => ({ ...prev, [p.pairAddress]: "" }));
      const chain = await resolveChain(chainId);
      if (!chain?.contracts.router) throw new Error("Missing router");
      const { BrowserProvider, Contract } = await import("ethers");
      const eth = (window as unknown as { ethereum?: unknown }).ethereum as unknown as { request?: (args: { method: string }) => Promise<unknown> } | undefined;
      if (!eth) throw new Error("Wallet not found");
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const owner = await signer.getAddress();

      const bips = Math.floor(Math.max(0, Math.min(100, slippagePct)) * 100);
      const amount0Min = (a0 * BigInt(10000 - bips)) / BigInt(10000);
      const amount1Min = (a1 * BigInt(10000 - bips)) / BigInt(10000);

      // Approvals for tokens
      await ensureAllowance(p.token0, owner, chain.contracts.router, a0, signer, () => {});
      await ensureAllowance(p.token1, owner, chain.contracts.router, a1, signer, () => {});

      const routerAbi = [
        "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
      ];
      const router = new Contract(chain.contracts.router, routerAbi, signer);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const tx = await router.addLiquidity(
        p.token0,
        p.token1,
        a0,
        a1,
        amount0Min,
        amount1Min,
        owner,
        deadline
      );
      await tx.wait?.();
      try {
        window.dispatchEvent(new Event("krchange:balance-possibly-changed"));
      } catch {}
      try {
        if (chainId) await fetchPairs(chainId);
      } catch {}
    } catch (err) {
      const anyErr = err as unknown as { message?: string };
      setTxErrorFor((prev) => ({ ...prev, [p.pairAddress]: anyErr?.message || "Transaction failed" }));
    } finally {
      setTxBusyFor(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Liquidity</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/liquidity/create"
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90 active:opacity-100"
            aria-label="Create Pair"
          >
            Create Pair
          </Link>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div className="text-sm text-muted-foreground">Network: {chainId ?? "..."}</div>
          <div className="w-full sm:w-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-72 h-9 px-3 rounded-md border border-border bg-background"
              placeholder="Search pairs (e.g. USDC/FCN)"
              aria-label="Search pairs"
            />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2">Pair</th>
                  <th className="py-2 hidden sm:table-cell">Liquidity</th>
                  <th className="py-2 hidden md:table-cell">
                    <button
                      className="inline-flex items-center gap-1 underline cursor-pointer select-none"
                      onClick={() => toggleSort("burnedPct")}
                      aria-label="Sort by percent burned"
                    >
                      % Burned{sortKey === "burnedPct" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th className="py-2">
                    <button
                      className="inline-flex items-center gap-1 underline cursor-pointer select-none"
                      onClick={() => toggleSort("userLpPct")}
                      aria-label="Sort by your LP percent"
                    >
                      Your LP{sortKey === "userLpPct" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th className="py-2 hidden lg:table-cell">Explorer</th>
                </tr>
              </thead>
              <tbody>
                {enriched.length > 0 && displayedPairs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">No pairs match your search.</td>
                  </tr>
                )}
                {enriched.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">No pairs found.</td>
                  </tr>
                )}
                {displayedPairs.map((p) => {
                  const t0 = p.token0Meta;
                  const t1 = p.token1Meta;
                  const logo0 = t0?.logoURI || (chainId ? `/tokens/${chainId}/${p.token0.toLowerCase()}.png` : undefined);
                  const logo1 = t1?.logoURI || (chainId ? `/tokens/${chainId}/${p.token1.toLowerCase()}.png` : undefined);
                  const isExpanded = expandedPair === p.pairAddress;
                  const mode = manageModeByPair[p.pairAddress] || "remove";
                  const removePct = removePctByPair[p.pairAddress] ?? 0;
                  const hasLp = !!(p.userLpBalance && p.userLpBalance > BigInt(0));
                  const liquidityToBurn = p.userLpBalance ? (p.userLpBalance * BigInt(Math.floor(removePct * 100))) / BigInt(100 * 100) : BigInt(0);
                  const exp0 = p.totalSupply && p.totalSupply > BigInt(0) ? (liquidityToBurn * (p.reserve0 ?? BigInt(0))) / p.totalSupply : BigInt(0);
                  const exp1 = p.totalSupply && p.totalSupply > BigInt(0) ? (liquidityToBurn * (p.reserve1 ?? BigInt(0))) / p.totalSupply : BigInt(0);
                  const addAmt0 = addAmt0ByPair[p.pairAddress] || "";
                  const addAmt1 = addAmt1ByPair[p.pairAddress] || "";
                  return (
                    <Fragment key={`rowgroup-${p.pairAddress}`}>
                  <tr key={p.pairAddress} className="border-b border-border/50">
                    <td className="py-2">
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                              <TokenLogo symbol={t0?.symbol} size={24} logoURI={logo0} address={p.token0} chainId={chainId ?? undefined} className="border border-border bg-secondary" />
                              <TokenLogo symbol={t1?.symbol} size={24} logoURI={logo1} address={p.token1} chainId={chainId ?? undefined} className="border border-border bg-secondary" />
                            </div>
                            <div className="flex flex-col">
                              <div className="font-medium">{truncate(t0?.symbol || "Token A", 7)} / {truncate(t1?.symbol || "Token B", 7)}</div>
                              <div className="text-xs text-muted-foreground">{truncate(t0?.name || "—", 15)} / {truncate(t1?.name || "—", 15)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 align-top hidden sm:table-cell">
                          <div className="flex flex-col">
                            <div>{formatAmount(p.reserve0, t0?.decimals)} {t0?.symbol || ""}</div>
                            <div>{formatAmount(p.reserve1, t1?.decimals)} {t1?.symbol || ""}</div>
                          </div>
                        </td>
                        <td className="py-2 align-top whitespace-nowrap hidden md:table-cell">{formatPercent(p.burnedPct)}</td>
                        <td className="py-2 align-top">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatPercent(p.userLpPct)}</span>
                            <div className="flex items-center gap-1">
                              <button
                                className={`h-6 w-6 grid place-items-center rounded border border-border text-xs ${isExpanded && mode === "add" ? "bg-secondary" : "hover:bg-secondary"}`}
                                onClick={() => { setExpandedPair(isExpanded && mode === "add" ? null : p.pairAddress); setManageModeByPair((prev) => ({ ...prev, [p.pairAddress]: "add" })); }}
                                aria-label="Add LP inline"
                                title="Add liquidity"
                              >+</button>
                              {hasLp && (
                                <>
                                  <button
                                    className={`h-6 w-6 grid place-items-center rounded border border-border text-xs ${isExpanded && mode === "remove" ? "bg-secondary" : "hover:bg-secondary"}`}
                                    onClick={() => { setExpandedPair(isExpanded && mode === "remove" ? null : p.pairAddress); setManageModeByPair((prev) => ({ ...prev, [p.pairAddress]: "remove" })); }}
                                    aria-label="Remove LP inline"
                                    title="Remove liquidity"
                                  >−</button>
                                  <button
                                    className={`h-6 w-6 grid place-items-center rounded border border-border text-xs ${isExpanded && mode === "burn" ? "bg-secondary" : "hover:bg-secondary"}`}
                                    onClick={() => { setExpandedPair(isExpanded && mode === "burn" ? null : p.pairAddress); setManageModeByPair((prev) => ({ ...prev, [p.pairAddress]: "burn" as const })); }}
                                    aria-label="Burn LP inline"
                                    title="Burn LP (irreversible)"
                                  >
                                    <Flame size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 align-top hidden lg:table-cell">
                          <div className="flex flex-wrap gap-2 text-xs">
                            <a className="underline hover:no-underline" href={explorerBase ? `${explorerBase}/address/${p.token0}` : "#"} target="_blank" rel="noreferrer">{truncate(t0?.symbol || "Token A", 7)}</a>
                            <a className="underline hover:no-underline" href={explorerBase ? `${explorerBase}/address/${p.token1}` : "#"} target="_blank" rel="noreferrer">{truncate(t1?.symbol || "Token B", 7)}</a>
                            <a className="underline hover:no-underline" href={explorerBase ? `${explorerBase}/address/${p.pairAddress}` : "#"} target="_blank" rel="noreferrer">Pair</a>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border/50">
                          <td colSpan={5} className="py-3 px-3 sm:px-4 bg-secondary/30">
                            {mode === "remove" ? (
                              <div className="relative space-y-2">
                                <button
                                  className="absolute right-0 top-[-5px] h-7 w-7 grid place-items-center rounded-md hover:bg-secondary"
                                  aria-label="Settings"
                                  onClick={() => setSettingsOpenFor((cur) => (cur === p.pairAddress ? null : p.pairAddress))}
                                >
                                  <Settings size={14} />
                                </button>
                                <SteelSlider
                                  label="Remove %"
                                  value={removePct}
                                  onChange={(v) => setRemovePctByPair((prev) => ({ ...prev, [p.pairAddress]: v }))}
                                />
                                {settingsOpenFor === p.pairAddress && (
                                  <SettingsPopover slippagePct={slippagePct} onSlippageChange={(n) => setSlippagePct(n)} />
                                )}
                                <div className="text-xs text-muted-foreground">Expected: {formatAmount(exp0, t0?.decimals)} {t0?.symbol} + {formatAmount(exp1, t1?.decimals)} {t1?.symbol}</div>
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    disabled={!account || txBusyFor === p.pairAddress || removePct <= 0}
                                    onClick={() => onRemoveLiquidity(p)}
                                    className={`h-9 px-4 rounded-md font-medium ${!account || txBusyFor === p.pairAddress || removePct <= 0 ? "bg-primary text-primary-foreground opacity-70 cursor-not-allowed" : "bg-primary text-primary-foreground hover:opacity-90"}`}
                                  >
                                    {txBusyFor === p.pairAddress ? "Processing..." : "Remove Liquidity"}
                                  </button>
                                  {txErrorFor[p.pairAddress] && (
                                    <div className="text-xs text-[var(--danger)] break-words">{txErrorFor[p.pairAddress]}</div>
                                  )}
                                </div>
                              </div>
                            ) : mode === "add" ? (
                              <div className="relative space-y-2">
                                <button
                                  className="absolute right-0 top-[-5px] h-7 w-7 grid place-items-center rounded-md hover:bg-secondary"
                                  aria-label="Settings"
                                  onClick={() => setSettingsOpenFor((cur) => (cur === p.pairAddress ? null : p.pairAddress))}
                                >
                                  <Settings size={14} />
                                </button>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                                  <TokenAmountSelector
                                    chainId={chainId}
                                    account={account}
                                    tokens={t0 ? [{ symbol: t0.symbol, name: t0.name, address: p.token0, decimals: t0.decimals, chainId: chainId!, logoURI: t0.logoURI || (chainId ? `/tokens/${chainId}/${p.token0.toLowerCase()}.png` : undefined) }] : []}
                                    selected={t0 ? { symbol: t0.symbol, name: t0.name, address: p.token0, decimals: t0.decimals, chainId: chainId!, logoURI: t0.logoURI || (chainId ? `/tokens/${chainId}/${p.token0.toLowerCase()}.png` : undefined) } : null}
                                    onSelect={() => {}}
                                    amount={addAmt0}
                                    onAmountChange={(v) => {
                                      setAddAmt0ByPair((prev) => ({ ...prev, [p.pairAddress]: v }));
                                      // ratio-calc other side when reserves available
                                      if (p.reserve0 && p.reserve1 && t0?.decimals !== undefined && t1?.decimals !== undefined) {
                                        const n = Number(v);
                                        if (isFinite(n)) {
                                          const r0 = Number(p.reserve0);
                                          const r1 = Number(p.reserve1);
                                          if (r0 > 0 && r1 > 0) {
                                            const implied = (n * (r1 / (10 ** (t1.decimals)))) / (r0 / (10 ** (t0.decimals)));
                                            setAddAmt1ByPair((prev) => ({ ...prev, [p.pairAddress]: numToPlainString(implied, 8) }));
                                          }
                                        }
                                      }
                                    }}
                                    label={t0?.symbol || "Token A"}
                                    onAddCustomToken={() => {}}
                                  />
                                  <TokenAmountSelector
                                    chainId={chainId}
                                    account={account}
                                    tokens={t1 ? [{ symbol: t1.symbol, name: t1.name, address: p.token1, decimals: t1.decimals, chainId: chainId!, logoURI: t1.logoURI || (chainId ? `/tokens/${chainId}/${p.token1.toLowerCase()}.png` : undefined) }] : []}
                                    selected={t1 ? { symbol: t1.symbol, name: t1.name, address: p.token1, decimals: t1.decimals, chainId: chainId!, logoURI: t1.logoURI || (chainId ? `/tokens/${chainId}/${p.token1.toLowerCase()}.png` : undefined) } : null}
                                    onSelect={() => {}}
                                    amount={addAmt1}
                                    onAmountChange={(v) => {
                                      setAddAmt1ByPair((prev) => ({ ...prev, [p.pairAddress]: v }));
                                      if (p.reserve0 && p.reserve1 && t0?.decimals !== undefined && t1?.decimals !== undefined) {
                                        const n = Number(v);
                                        if (isFinite(n)) {
                                          const r0 = Number(p.reserve0);
                                          const r1 = Number(p.reserve1);
                                          if (r0 > 0 && r1 > 0) {
                                            const implied = (n * (r0 / (10 ** (t0.decimals)))) / (r1 / (10 ** (t1.decimals)));
                                            setAddAmt0ByPair((prev) => ({ ...prev, [p.pairAddress]: numToPlainString(implied, 8) }));
                                          }
                                        }
                                      }
                                    }}
                                    label={t1?.symbol || "Token B"}
                                    onAddCustomToken={() => {}}
                                  />
                                </div>
                                {settingsOpenFor === p.pairAddress && (
                                  <SettingsPopover slippagePct={slippagePct} onSlippageChange={(n) => setSlippagePct(n)} />
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    disabled={!account || txBusyFor === p.pairAddress || !addAmt0 || !addAmt1}
                                    onClick={() => onAddLiquidity(p)}
                                    className={`h-9 px-4 rounded-md font-medium ${!account || txBusyFor === p.pairAddress || !addAmt0 || !addAmt1 ? "bg-primary text-primary-foreground opacity-70 cursor-not-allowed" : "bg-primary text-primary-foreground hover:opacity-90"}`}
                                  >
                                    {txBusyFor === p.pairAddress ? "Processing..." : "Add Liquidity"}
                                  </button>
                                  {txErrorFor[p.pairAddress] && (
                                    <div className="text-xs text-[var(--danger)] break-words">{txErrorFor[p.pairAddress]}</div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <SteelSlider
                                  label="Burn %"
                                  value={removePct}
                                  onChange={(v) => setRemovePctByPair((prev) => ({ ...prev, [p.pairAddress]: v }))}
                                  accent="danger"
                                />
                                <div className="text-xs text-[var(--danger)]">Warning: Burning LP is irreversible and permanently sends tokens to the dead address.</div>
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    disabled={!account || txBusyFor === p.pairAddress || removePct <= 0}
                                    onClick={() => onBurnLiquidity(p)}
                                    className={`h-9 px-4 rounded-md font-medium ${!account || txBusyFor === p.pairAddress || removePct <= 0 ? "bg-primary text-primary-foreground opacity-70 cursor-not-allowed" : "bg-primary text-primary-foreground hover:opacity-90"}`}
                                  >
                                    {txBusyFor === p.pairAddress ? "Processing..." : "Burn LP"}
                                  </button>
                                  {txErrorFor[p.pairAddress] && (
                                    <div className="text-xs text-[var(--danger)] break-words">{txErrorFor[p.pairAddress]}</div>
                                  )}
                                </div>
                              </div>
                            )}
                    </td>
                  </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


