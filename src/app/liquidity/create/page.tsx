"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getEffectiveNetworkId, resolveChain } from "@/lib/chain";
import { Settings } from "lucide-react";
import type { ContractRunner, Eip1193Provider } from "ethers";
import TokenAmountSelector from "@/components/inputs/TokenAmountSelector";
import TxProgress from "@/components/loaders/TxProgress";
import { isNativeToken, NATIVE_TOKEN_ADDRESS, findWrappedNative } from "@/lib/tokens";
import SettingsPopover from "@/components/settings/SettingsPopover";
import { getSlippagePct, SETTINGS_EVENTS } from "@/lib/settings";

type Token = { symbol: string; name: string; address: string; decimals: number; chainId: number; logoURI?: string };

type PairState = {
  loading: boolean;
  exists: boolean | null;
  pairAddress: string | null;
  token0: string | null;
  token1: string | null;
  reserve0: bigint | null;
  reserve1: bigint | null;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const CUSTOM_TOKEN_KEY_NS = "krchange:customTokens"; // per-chain storage key `${ns}:${chainId}`

function storageKeyForChain(chainId: number) {
  return `${CUSTOM_TOKEN_KEY_NS}:${chainId}`;
}

function formatAmount(value: string | number, maxDecimals = 8) {
  if (value === "" || value === undefined || value === null) return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!isFinite(n)) return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

export default function LiquidityCreatePairPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [tokenA, setTokenA] = useState<Token | null>(null);
  const [tokenB, setTokenB] = useState<Token | null>(null);
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [pair, setPair] = useState<PairState>({ loading: false, exists: null, pairAddress: null, token0: null, token1: null, reserve0: null, reserve1: null });
  const [slippagePct, setSlippagePct] = useState<number>(0.5);
  const [txBusy, setTxBusy] = useState<boolean>(false);
  const [txStage, setTxStage] = useState<null | { step: number; total: number; label: string; pending: boolean }>(null);
  const [txError, setTxError] = useState<string>("");
  const [txCountdownKey, setTxCountdownKey] = useState<number>(0);
  const [account, setAccount] = useState<string | null>(null);
  const [allowanceA, setAllowanceA] = useState<bigint | null>(null);
  const [allowanceB, setAllowanceB] = useState<bigint | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Treat KAS (native) and WKAS (wrapped) as the same logical asset for UI selection purposes
  const areEffectivelySameToken = useCallback((x: Token | null, y: Token | null): boolean => {
    if (!x || !y) return false;
    if (x.address.toLowerCase() === y.address.toLowerCase()) return true;
    const wrapped = findWrappedNative(tokens, "WKAS");
    const isXKasFamily = isNativeToken(x) || (!!wrapped && x.address.toLowerCase() === wrapped.address.toLowerCase());
    const isYKasFamily = isNativeToken(y) || (!!wrapped && y.address.toLowerCase() === wrapped.address.toLowerCase());
    return isXKasFamily && isYKasFamily;
  }, [tokens]);

  // Load token list and custom tokens, and handle chain changes
  useEffect(() => {
    (async () => {
      const id = await getEffectiveNetworkId();
      setChainId(id);
    })();

    const onChanged = (e: Event) => {
      const ce = e as CustomEvent<{ chainId: number }>;
      const id = ce?.detail?.chainId;
      if (typeof id === "number") setChainId(id);
    };
    window.addEventListener("krchange:network-changed", onChanged);
    return () => window.removeEventListener("krchange:network-changed", onChanged);
  }, []);

  // Load global slippage and listen for updates
  useEffect(() => {
    setSlippagePct(getSlippagePct());
    const onSync = () => setSlippagePct(getSlippagePct());
    window.addEventListener(SETTINGS_EVENTS.slippageUpdated, onSync);
    return () => window.removeEventListener(SETTINGS_EVENTS.slippageUpdated, onSync);
  }, []);

  const loadTokensForChain = useCallback(async (id: number) => {
    try {
      const res = await fetch("/tokenlist.json", { cache: "no-store" });
      const j = await res.json();
      const base: Token[] = (j.tokens || []).filter((t: Token) => t.chainId === id);
      const wrapped = findWrappedNative(base, "WKAS");
      const kas = {
        address: NATIVE_TOKEN_ADDRESS,
        symbol: "KAS",
        name: "KAS",
        decimals: 18,
        chainId: id,
        logoURI: wrapped?.logoURI,
      } as Token;
      const withNative = base.some((t) => t.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) ? base : [kas, ...base];
      let custom: Token[] = [];
      try {
        const raw = window.localStorage.getItem(storageKeyForChain(id));
        if (raw) custom = JSON.parse(raw);
      } catch {
        // ignore
      }
      const merged = [...withNative, ...custom];
      setTokens(merged);
      if (merged.length >= 2) {
        setTokenA(merged[0]);
        setTokenB(merged[1]);
      } else {
        setTokenA(null);
        setTokenB(null);
      }
    } catch {
      setTokens([]);
      setTokenA(null);
      setTokenB(null);
    }
  }, []);

  useEffect(() => {
    if (!chainId) return;
    loadTokensForChain(chainId);
  }, [chainId, loadTokensForChain]);

  // Track connected account for allowance checks
  useEffect(() => {
    const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
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
    (eth as { on?: (ev: string, fn: (accts: unknown) => void) => void }).on?.("accountsChanged", onAccountsChanged);
    return () => (eth as { removeListener?: (ev: string, fn: (accts: unknown) => void) => void }).removeListener?.("accountsChanged", onAccountsChanged);
  }, []);

  const onAddCustomToken = useCallback((tok: Token) => {
    if (!chainId) return;
    const key = storageKeyForChain(chainId);
    let list: Token[] = [];
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) list = JSON.parse(raw);
    } catch {}
    const exists = list.some((t) => t.address.toLowerCase() === tok.address.toLowerCase());
    const combined = exists ? list : [...list, tok];
    try {
      window.localStorage.setItem(key, JSON.stringify(combined));
    } catch {}
    setTokens((prev) => {
      const already = prev.some((t) => t.address.toLowerCase() === tok.address.toLowerCase());
      return already ? prev : [...prev, tok];
    });
  }, [chainId]);

  // Pair detection and reserves
  const refreshPairInfo = useCallback(async () => {
    if (!chainId || !tokenA || !tokenB) {
      setPair({ loading: false, exists: null, pairAddress: null, token0: null, token1: null, reserve0: null, reserve1: null });
      return;
    }
    if (tokenA.address.toLowerCase() === tokenB.address.toLowerCase()) {
      setPair({ loading: false, exists: null, pairAddress: null, token0: null, token1: null, reserve0: null, reserve1: null });
      return;
    }
    // If both selections are effectively KAS/WKAS, treat as invalid pair to avoid identical-address runtime errors
    const wrapped = findWrappedNative(tokens, "WKAS");
    const aKasFamily = isNativeToken(tokenA) || (!!wrapped && tokenA.address.toLowerCase() === wrapped.address.toLowerCase());
    const bKasFamily = isNativeToken(tokenB) || (!!wrapped && tokenB.address.toLowerCase() === wrapped.address.toLowerCase());
    if (aKasFamily && bKasFamily) {
      setPair({ loading: false, exists: null, pairAddress: null, token0: null, token1: null, reserve0: null, reserve1: null });
      return;
    }
    setPair((p) => ({ ...p, loading: true }));
    try {
      const chain = await resolveChain(chainId);
      if (!chain?.contracts.factory) throw new Error("Missing factory");
      const { JsonRpcProvider, Contract } = await import("ethers");
      const provider = new JsonRpcProvider(chain.rpcUrl);
      const factoryAbi = ["function getPair(address,address) view returns (address)"];
      const factory = new Contract(chain.contracts.factory, factoryAbi, provider);
      let addrA = tokenA.address;
      let addrB = tokenB.address;
      if (isNativeToken(tokenA) || isNativeToken(tokenB)) {
        try {
          const routerAbi = ["function WETH() view returns (address)"];
          const router = new Contract(chain.contracts.router, routerAbi, provider);
          const weth: string = await router.WETH();
          if (isNativeToken(tokenA)) addrA = weth;
          if (isNativeToken(tokenB)) addrB = weth;
        } catch {}
      }
      const pairAddress: string = await factory.getPair(addrA, addrB);
      if (!pairAddress || pairAddress === ZERO_ADDRESS) {
        setPair({ loading: false, exists: false, pairAddress: null, token0: null, token1: null, reserve0: null, reserve1: null });
        return;
      }
      const pairAbi = [
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function getReserves() view returns (uint112,uint112,uint32)",
      ];
      const pairC = new Contract(pairAddress, pairAbi, provider);
      const [t0, t1, reserves] = await Promise.all([pairC.token0(), pairC.token1(), pairC.getReserves()]);
      const reserve0 = BigInt(reserves[0]);
      const reserve1 = BigInt(reserves[1]);
      setPair({ loading: false, exists: true, pairAddress, token0: t0, token1: t1, reserve0, reserve1 });
    } catch {
      setPair({ loading: false, exists: null, pairAddress: null, token0: null, token1: null, reserve0: null, reserve1: null });
    }
  }, [chainId, tokenA, tokenB, tokens]);

  useEffect(() => {
    void refreshPairInfo();
  }, [refreshPairInfo]);

  // Compute derived price if pair exists
  const priceBPerA = useMemo(() => {
    if (!pair.exists || !tokenA || !tokenB || pair.reserve0 === null || pair.reserve1 === null || !pair.token0 || !pair.token1) return null;
    const decA = tokenA.decimals;
    const decB = tokenB.decimals;
    const r0 = Number(pair.reserve0);
    const r1 = Number(pair.reserve1);
    if (r0 === 0 || r1 === 0) return null;
    // Normalize: if tokenA == token0, priceBPerA = (r1/10^decB) / (r0/10^decA)
    const scaleA = 10 ** decA;
    const scaleB = 10 ** decB;
    if (tokenA.address.toLowerCase() === pair.token0!.toLowerCase()) {
      return (r1 / scaleB) / (r0 / scaleA);
    } else {
      // tokenA is token1 -> priceBPerA = (r0/10^decB) / (r1/10^decA) but careful: B refers to other selected token
      // When A is token1, B is token0 in reserves context
      return (r0 / scaleB) / (r1 / scaleA);
    }
  }, [pair, tokenA, tokenB]);

  // Link amounts when pair exists
  const onChangeAmountA = (v: string) => {
    setAmountA(v);
    if (pair.exists && priceBPerA && v) {
      const n = Number(v);
      if (isFinite(n)) setAmountB((n * priceBPerA).toString());
    }
  };
  const onChangeAmountB = (v: string) => {
    setAmountB(v);
    if (pair.exists && priceBPerA && v) {
      const n = Number(v);
      if (isFinite(n) && priceBPerA !== 0) setAmountA((n / priceBPerA).toString());
    }
  };

  const validSelection = useMemo(() => {
    if (!tokenA || !tokenB) return false;
    if (tokenA.address.toLowerCase() === tokenB.address.toLowerCase()) return false;
    const wrapped = findWrappedNative(tokens, "WKAS");
    const aKasFamily = isNativeToken(tokenA) || (!!wrapped && tokenA.address.toLowerCase() === wrapped.address.toLowerCase());
    const bKasFamily = isNativeToken(tokenB) || (!!wrapped && tokenB.address.toLowerCase() === wrapped.address.toLowerCase());
    if (aKasFamily && bKasFamily) return false;
    return true;
  }, [tokenA, tokenB, tokens]);

  const canSubmit = useMemo(() => {
    if (!validSelection || !chainId) return false;
    const a = Number(amountA);
    const b = Number(amountB);
    if (!isFinite(a) || !isFinite(b)) return false;
    if (a <= 0 || b <= 0) return false;
    return true;
  }, [validSelection, chainId, amountA, amountB]);

  // Utility: decimal string to BigInt with token decimals
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

  // Refresh allowances from chain
  const refreshAllowances = useCallback(async () => {
    if (!chainId || !account || !tokenA || !tokenB) {
      setAllowanceA(null);
      setAllowanceB(null);
      return;
    }
    try {
      const chain = await resolveChain(chainId);
      if (!chain?.contracts.router) return;
      const { JsonRpcProvider, Contract } = await import("ethers");
      const provider = new JsonRpcProvider(chain.rpcUrl);
      const abi = ["function allowance(address,address) view returns (uint256)"];

      // Token A allowance
      if (isNativeToken(tokenA)) {
        setAllowanceA(null);
      } else {
        try {
          const a = new Contract(tokenA.address, abi, provider);
          const alA = await a.allowance(account, chain.contracts.router);
          setAllowanceA(BigInt(alA));
        } catch {
          setAllowanceA(null);
        }
      }

      // Token B allowance
      if (isNativeToken(tokenB)) {
        setAllowanceB(null);
      } else {
        try {
          const b = new Contract(tokenB.address, abi, provider);
          const alB = await b.allowance(account, chain.contracts.router);
          setAllowanceB(BigInt(alB));
        } catch {
          setAllowanceB(null);
        }
      }
    } catch {
      setAllowanceA(null);
      setAllowanceB(null);
    }
  }, [chainId, account, tokenA, tokenB]);

  useEffect(() => {
    void refreshAllowances();
  }, [refreshAllowances]);

  const desiredAmountA = useMemo(() => (tokenA ? decimalToBigInt(amountA, tokenA.decimals) : null), [amountA, tokenA]);
  const desiredAmountB = useMemo(() => (tokenB ? decimalToBigInt(amountB, tokenB.decimals) : null), [amountB, tokenB]);

  const needsApprovalA = useMemo(() => {
    if (!desiredAmountA || allowanceA === null) return false;
    return allowanceA < desiredAmountA;
  }, [desiredAmountA, allowanceA]);

  const needsApprovalB = useMemo(() => {
    if (!desiredAmountB || allowanceB === null) return false;
    return allowanceB < desiredAmountB;
  }, [desiredAmountB, allowanceB]);

  const actionLabel = useMemo(() => {
    if (txBusy) return "Processing...";
    if (!pair.exists) return needsApprovalA || needsApprovalB ? "Approve & Create Pair" : "Create Pair & Add Liquidity";
    return needsApprovalA || needsApprovalB ? "Approve & Add Liquidity" : "Add Liquidity";
  }, [txBusy, pair.exists, needsApprovalA, needsApprovalB]);

  const ensureAllowance = useCallback(async (tokenAddr: string, owner: string, spender: string, amount: bigint, provider: ContractRunner, onSubmitted?: () => void) => {
    const { Contract, MaxUint256 } = await import("ethers");
    const erc20Abi = [
      "function allowance(address,address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
      "function decimals() view returns (uint8)",
    ];
    const c = new Contract(tokenAddr, erc20Abi, provider);
    const current: bigint = await c.allowance(owner, spender);
    if (current >= amount) return;
    let infinite = true;
    try {
      const raw = window.localStorage.getItem("krchange:infiniteApprovals");
      if (raw !== null) infinite = raw === "true";
    } catch {}
    const approveAmount = infinite ? MaxUint256 : amount;
    const tx = await c.approve(spender, approveAmount);
    try { onSubmitted?.(); } catch {}
    await tx.wait?.();
  }, []);

  const onAddLiquidity = useCallback(async () => {
    if (!canSubmit || !tokenA || !tokenB || !chainId) return;
    try {
      setTxBusy(true);
      setTxError("");
      setTxStage(null);
      const chain = await resolveChain(chainId);
      if (!chain?.contracts.router) throw new Error("Missing router");
      const { BrowserProvider, Contract, parseUnits } = await import("ethers");
      const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
      if (!eth) throw new Error("Wallet not found");
      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();

      const amtA = parseUnits(amountA, tokenA.decimals);
      const amtB = parseUnits(amountB, tokenB.decimals);
      const sl = Math.max(0, Math.min(100, slippagePct));
      const amountAMin = (amtA * BigInt(Math.floor((10000 - sl * 100) /* bips */))) / BigInt(10000);
      const amountBMin = (amtB * BigInt(Math.floor((10000 - sl * 100)))) / BigInt(10000);

      const totalSteps = (needsApprovalA ? 1 : 0) + (needsApprovalB ? 1 : 0) + 1; // +1 for addLiquidity
      let step = 0;
      const advance = (label: string) => {
        step += 1;
        // Stage announced; not pending until submission happens
        setTxStage({ step, total: totalSteps, label, pending: false });
      };

      if (needsApprovalA && !isNativeToken(tokenA)) {
        advance(`Approve ${tokenA.symbol}`);
        await ensureAllowance(
          tokenA.address,
          account,
          chain.contracts.router,
          amtA,
          signer,
          () => {
            setTxCountdownKey(Date.now());
            setTxStage({ step, total: totalSteps, label: `Approve ${tokenA.symbol}`, pending: true });
          }
        );
      }
      if (needsApprovalB && !isNativeToken(tokenB)) {
        advance(`Approve ${tokenB.symbol}`);
        await ensureAllowance(
          tokenB.address,
          account,
          chain.contracts.router,
          amtB,
          signer,
          () => {
            setTxCountdownKey(Date.now());
            setTxStage({ step, total: totalSteps, label: `Approve ${tokenB.symbol}`, pending: true });
          }
        );
      }

      const routerAbi = [
        "function WETH() view returns (address)",
        "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
        "function addLiquidityETH(address,uint256,uint256,uint256,address,uint256) payable returns (uint256,uint256,uint256)",
      ];
      const router = new Contract(chain.contracts.router, routerAbi, signer);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      advance("Add liquidity");
      let tx;
      if (isNativeToken(tokenA) && !isNativeToken(tokenB)) {
        tx = await router.addLiquidityETH(
          tokenB.address,
          amtB,
          amountBMin,
          amountAMin,
          account,
          deadline,
          { value: amtA }
        );
      } else if (!isNativeToken(tokenA) && isNativeToken(tokenB)) {
        tx = await router.addLiquidityETH(
          tokenA.address,
          amtA,
          amountAMin,
          amountBMin,
          account,
          deadline,
          { value: amtB }
        );
      } else {
        tx = await router.addLiquidity(
          tokenA.address,
          tokenB.address,
          amtA,
          amtB,
          amountAMin,
          amountBMin,
          account,
          deadline
        );
      }
      try {
        setTxCountdownKey(Date.now());
        setTxStage({ step, total: totalSteps, label: "Add liquidity", pending: true });
      } catch {}
      await tx.wait?.();
      // Refresh pair info after success
      await refreshPairInfo();
      await refreshAllowances();
      try {
        window.dispatchEvent(new Event("krchange:balance-possibly-changed"));
      } catch {}
      setTxStage(null);
    } catch (err) {
      const anyErr = err as unknown as { message?: string; shortMessage?: string; cause?: { message?: string }; info?: { error?: { message?: string } } };
      const msg = anyErr?.shortMessage || anyErr?.info?.error?.message || anyErr?.cause?.message || anyErr?.message || "Transaction failed";
      setTxError(msg);
      setTxStage(null);
    } finally {
      setTxBusy(false);
    }
  }, [canSubmit, tokenA, tokenB, chainId, amountA, amountB, slippagePct, ensureAllowance, refreshPairInfo, refreshAllowances, needsApprovalA, needsApprovalB]);

  return (
    <div className="max-w-xl mx-auto">
      <div className="card p-4 space-y-4 relative">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Create Pair</h1>
          <button
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-secondary"
            aria-label="Settings"
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <Settings size={16} />
          </button>
        </div>

        {settingsOpen && (
          <SettingsPopover slippagePct={slippagePct} onSlippageChange={(n) => setSlippagePct(n)} />
        )}

        <div className="space-y-3">
          <TokenAmountSelector
            chainId={chainId}
            tokens={tokens}
            selected={tokenA}
            onSelect={(t) => {
              if (tokenB && areEffectivelySameToken(t, tokenB)) {
                setTokenB(tokenA);
              }
              setTokenA(t);
              setAmountA("");
              setAmountB("");
            }}
            amount={amountA}
            onAmountChange={(v) => onChangeAmountA(v)}
            label="Token A"
            onAddCustomToken={onAddCustomToken}
          />

          <TokenAmountSelector
            chainId={chainId}
            tokens={tokens}
            selected={tokenB}
            onSelect={(t) => {
              if (tokenA && areEffectivelySameToken(tokenA, t)) {
                setTokenA(tokenB);
              }
              setTokenB(t);
              setAmountA("");
              setAmountB("");
            }}
            amount={amountB}
            onAmountChange={(v) => onChangeAmountB(v)}
            label="Token B"
            onAddCustomToken={onAddCustomToken}
          />
        </div>

        {pair.loading && (
          <div className="text-xs text-muted-foreground">Checking existing pair...</div>
        )}

        {!pair.loading && pair.exists === true && priceBPerA !== null && tokenA && tokenB && (
          <div className="text-xs text-muted-foreground">
            Current price: 1 {tokenA.symbol} ≈ {formatAmount(priceBPerA)} {tokenB.symbol}
          </div>
        )}

        {!pair.loading && pair.exists === false && (
          <div className="text-xs text-muted-foreground">
            You are creating a new pool. Set the initial price by providing both token amounts.
          </div>
        )}

        

        <button
          disabled={!canSubmit || txBusy}
          onClick={onAddLiquidity}
          className={`w-full h-10 rounded-md font-medium transition-opacity ${
            !canSubmit || txBusy ? "bg-primary text-primary-foreground opacity-70 cursor-not-allowed" : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          {actionLabel}
        </button>

        {txBusy && txStage && (
          <TxProgress pending={txStage.pending} label={txStage.label} step={txStage.step} total={txStage.total} resetKey={txCountdownKey} />
        )}
        {!txBusy && txError && (
          <div className="text-xs text-[var(--danger)] break-words">
            {txError}
          </div>
        )}

        {/* Token selection handled by TokenAmountSelector components */}
      </div>
    </div>
  );
}

