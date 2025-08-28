"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TokenAmountSelector from "@/components/inputs/TokenAmountSelector";
import CleanNumberInput from "@/components/inputs/CleanNumberInput";
import TxProgress from "@/components/loaders/TxProgress";
import { getEffectiveNetworkId, resolveChain, getPublicConfig } from "@/lib/chain";
import { findBestRoute, findBestRouteForExactOut } from "@/lib/routing";
import type { ContractRunner, Eip1193Provider } from "ethers";
import { Settings } from "lucide-react";

type Token = { symbol: string; name: string; address: string; decimals: number; chainId: number; logoURI?: string };

export default function SwapPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [exactOutMode, setExactOutMode] = useState(false);
  const [slippagePct, setSlippagePct] = useState<number>(3);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [allowanceFrom, setAllowanceFrom] = useState<bigint | null>(null);
  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState("");
  const [txStage, setTxStage] = useState<null | { step: number; total: number; label: string; pending: boolean }>(null);
  const [txCountdownKey, setTxCountdownKey] = useState<number>(0);
  const [quoteOut, setQuoteOut] = useState<bigint | null>(null); // for exact-in
  const [quoteDisplay, setQuoteDisplay] = useState("");
  const [bestPath, setBestPath] = useState<string[] | null>(null);
  const [quoteInRequired, setQuoteInRequired] = useState<bigint | null>(null); // for exact-out
  const [quoteInDisplay, setQuoteInDisplay] = useState("");
  const [factoryFeeBips, setFactoryFeeBips] = useState<number>(0);
  const effectiveToleranceBips = useMemo(() => {
    const hops = (bestPath?.length ?? 2) - 1;
    const user = Math.floor(Math.max(0, Math.min(100, slippagePct)) * 100);
    const fees = Math.max(0, factoryFeeBips) * Math.max(1, hops);
    return Math.min(10000, user + fees);
  }, [slippagePct, factoryFeeBips, bestPath]);

  const bestRouteSymbols = useMemo(() => {
    if (!bestPath || bestPath.length === 0) return "";
    const map = new Map(tokens.map((t) => [t.address.toLowerCase(), t.symbol] as const));
    return bestPath
      .map((addr) => map.get(addr.toLowerCase()) || `${addr.slice(0, 4)}…${addr.slice(-4)}`)
      .join(" → ");
  }, [bestPath, tokens]);

  const filtered = useMemo(() => {
    if (!chainId) return tokens;
    return tokens.filter((t) => t.chainId === chainId);
  }, [tokens, chainId]);

  useEffect(() => {
    fetch("/tokenlist.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTokens(j.tokens || []))
      .catch(() => setTokens([]));

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

  // Persist slippage between sessions and across pages
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("krchange:slippagePct");
      if (raw !== null) {
        const n = Number(raw);
        if (Number.isFinite(n)) setSlippagePct(n);
      }
    } catch {}
    const onSync = () => {
      try {
        const raw = window.localStorage.getItem("krchange:slippagePct");
        if (raw !== null) {
          const n = Number(raw);
          if (Number.isFinite(n)) setSlippagePct(n);
        }
      } catch {}
    };
    window.addEventListener("krchange:slippage-updated", onSync);
    return () => window.removeEventListener("krchange:slippage-updated", onSync);
  }, []);

  // Load factory trading fee bips
  useEffect(() => {
    (async () => {
      try {
        if (!chainId) return;
        const chain = await resolveChain(chainId);
        if (!chain?.contracts.factory) return;
        const { JsonRpcProvider, Contract } = await import("ethers");
        const provider = new JsonRpcProvider(chain.rpcUrl);
        const abi = [
          "function feeRateBips() view returns (uint256)",
        ];
        const c = new Contract(chain.contracts.factory, abi, provider);
        const raw = await c.feeRateBips();
        const num = Number(raw);
        setFactoryFeeBips(Number.isFinite(num) ? num : 0);
      } catch {
        setFactoryFeeBips(0);
      }
    })();
  }, [chainId]);

  // Track connected account
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

  useEffect(() => {
    if (filtered.length >= 2) {
      setFromToken(filtered[0]);
      setToToken(filtered[1]);
    } else {
      setFromToken(null);
      setToToken(null);
    }
  }, [filtered]);

  // Format helpers
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

  const canSubmit = useMemo(() => {
    if (!fromToken || !toToken || !chainId) return false;
    if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) return false;
    if (exactOutMode) {
      const b = Number(amountOut);
      if (!isFinite(b) || b <= 0) return false;
    } else {
      const a = Number(amountIn);
      if (!isFinite(a) || a <= 0) return false;
    }
    return true;
  }, [fromToken, toToken, chainId, amountIn, amountOut, exactOutMode]);

  // Quote based on mode
  const refreshRouting = useCallback(async () => {
    setBestPath(null);
    setQuoteOut(null);
    setQuoteDisplay("");
    setQuoteInRequired(null);
    setQuoteInDisplay("");
    if (!fromToken || !toToken || !chainId) return;
    const cfg = await getPublicConfig();
    const bases = (cfg.networks[String(chainId)] as { routingBases?: string[] } | undefined)?.routingBases || ["WKAS", "USDT", "USDC"];
    const { parseUnits, formatUnits } = await import("ethers");
    try {
      if (exactOutMode) {
        const n = Number(amountOut);
        if (!isFinite(n) || n <= 0) return;
        const desiredOut = parseUnits(amountOut, toToken.decimals);
        const { path, amountIn } = await findBestRouteForExactOut(chainId, tokens.filter((t) => t.chainId === chainId), fromToken, toToken, desiredOut, bases);
        if (path && amountIn) {
          setBestPath(path);
          setQuoteInRequired(amountIn);
          setQuoteInDisplay(formatUnits(amountIn, fromToken.decimals));
          // Also set input field to show computed requirement
          setAmountIn(formatUnits(amountIn, fromToken.decimals));
        }
      } else {
        const n = Number(amountIn);
        if (!isFinite(n) || n <= 0) return;
        const amtIn = parseUnits(amountIn, fromToken.decimals);
        const { path, amountOut } = await findBestRoute(chainId, tokens.filter((t) => t.chainId === chainId), fromToken, toToken, amtIn, bases);
        if (path && amountOut) {
          setBestPath(path);
          setQuoteOut(amountOut);
          setQuoteDisplay(formatUnits(amountOut, toToken.decimals));
          // Also clear any output manual value
          setAmountOut("");
        }
      }
    } catch {
    }
  }, [fromToken, toToken, chainId, tokens, amountIn, amountOut, exactOutMode]);

  useEffect(() => {
    void refreshRouting();
  }, [refreshRouting]);

  // Allowance check for fromToken
  const refreshAllowance = useCallback(async () => {
    if (!chainId || !account || !fromToken) {
      setAllowanceFrom(null);
      return;
    }
    try {
      const chain = await resolveChain(chainId);
      if (!chain?.contracts.router) return;
      const { JsonRpcProvider, Contract } = await import("ethers");
      const provider = new JsonRpcProvider(chain.rpcUrl);
      const abi = ["function allowance(address,address) view returns (uint256)"];
      const c = new Contract(fromToken.address, abi, provider);
      const al = await c.allowance(account, chain.contracts.router);
      setAllowanceFrom(BigInt(al));
    } catch {
      setAllowanceFrom(null);
    }
  }, [chainId, account, fromToken]);

  useEffect(() => {
    void refreshAllowance();
  }, [refreshAllowance]);

  const desiredAmountIn = useMemo(() => {
    if (!fromToken) return null;
    if (exactOutMode) {
      if (!quoteInRequired) return null;
      // add tolerance to allowance need
      const bips = BigInt(effectiveToleranceBips);
      return (quoteInRequired * (BigInt(10000) + bips)) / BigInt(10000);
    }
    return decimalToBigInt(amountIn, fromToken.decimals);
  }, [fromToken, exactOutMode, quoteInRequired, effectiveToleranceBips, amountIn]);
  const needsApproval = useMemo(() => {
    if (!desiredAmountIn || allowanceFrom === null) return false;
    return allowanceFrom < desiredAmountIn;
  }, [desiredAmountIn, allowanceFrom]);

  const ensureAllowance = useCallback(async (tokenAddr: string, owner: string, spender: string, amountBn: bigint, provider: ContractRunner, onSubmitted?: () => void) => {
    const { Contract } = await import("ethers");
    const erc20Abi = [
      "function allowance(address,address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
    ];
    const c = new Contract(tokenAddr, erc20Abi, provider);
    const current: bigint = await c.allowance(owner, spender);
    if (current >= amountBn) return;
    const tx = await c.approve(spender, amountBn);
    try { onSubmitted?.(); } catch {}
    await tx.wait?.();
  }, []);

  const onSwap = useCallback(async () => {
    if (!canSubmit || !fromToken || !toToken || !chainId) return;
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
      const acct = await signer.getAddress();

      const totalBips = effectiveToleranceBips;

      const totalSteps = (needsApproval ? 1 : 0) + 1; // +1 for swap
      let step = 0;
      const announce = (label: string) => {
        step += 1;
        setTxStage({ step, total: totalSteps, label, pending: false });
      };

      if (needsApproval && desiredAmountIn) {
        announce(`Approve ${fromToken.symbol}`);
        await ensureAllowance(fromToken.address, acct, chain.contracts.router, desiredAmountIn, signer, () => {
          setTxCountdownKey(Date.now());
          setTxStage({ step, total: totalSteps, label: `Approve ${fromToken.symbol}`, pending: true });
        });
      }

      announce("Swap tokens");
      const routerAbiExactIn = [
        "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
      ];
      const routerAbiExactOut = [
        "function swapTokensForExactTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
      ];
      const path = bestPath ?? [fromToken.address, toToken.address];
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      let tx;
      if (exactOutMode) {
        if (!amountOut) throw new Error("Missing output amount");
        const desiredOut = parseUnits(amountOut, toToken.decimals);
        const router = new Contract(chain.contracts.router, routerAbiExactOut, signer);
        const amountInMax = desiredAmountIn ?? quoteInRequired ?? BigInt(0);
        tx = await router.swapTokensForExactTokens(
          desiredOut,
          amountInMax,
          path,
          acct,
          deadline
        );
      } else {
        const amtIn = parseUnits(amountIn, fromToken.decimals);
        // Compute minOut from quote when available
        let amountOutMin = BigInt(0);
        if (quoteOut && quoteOut > BigInt(0)) {
          const bips = BigInt(Math.min(10000, Math.max(0, totalBips))); // cap at 100%
          amountOutMin = (quoteOut * (BigInt(10000) - bips)) / BigInt(10000);
        }
        const router = new Contract(chain.contracts.router, routerAbiExactIn, signer);
        tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          amtIn,
          amountOutMin,
          path,
          acct,
          deadline
        );
      }
      try {
        setTxCountdownKey(Date.now());
        setTxStage({ step, total: totalSteps, label: "Swap tokens", pending: true });
      } catch {}
      await tx.wait?.();
      try {
        window.dispatchEvent(new Event("krchange:balance-possibly-changed"));
      } catch {}
      setTxStage(null);
      // refresh allowance after swap in case it decreased to zero
      await refreshAllowance();
    } catch (err) {
      const anyErr = err as unknown as { message?: string; shortMessage?: string; cause?: { message?: string }; info?: { error?: { message?: string } } };
      const msg = anyErr?.shortMessage || anyErr?.info?.error?.message || anyErr?.cause?.message || anyErr?.message || "Transaction failed";
      setTxError(msg);
      setTxStage(null);
    } finally {
      setTxBusy(false);
    }
  }, [canSubmit, fromToken, toToken, chainId, amountIn, amountOut, ensureAllowance, needsApproval, refreshAllowance, quoteOut, bestPath, effectiveToleranceBips, exactOutMode, quoteInRequired, desiredAmountIn]);

  return (
    <div className="max-w-lg mx-auto">
      <div className="card p-4 space-y-4 relative">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Swap</h1>
          <button
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-secondary"
            aria-label="Settings"
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <Settings size={16} />
          </button>
        </div>

        {settingsOpen && (
          <div className="absolute right-3 top-12 z-20 w-48 p-3 rounded-md border border-border bg-popover space-y-2">
            <div className="text-xs text-muted-foreground">Slippage</div>
            <div className="flex items-center gap-2">
              <CleanNumberInput
                value={String(slippagePct)}
                onValueChange={(v) => {
                  const n = Number(v || 0);
                  setSlippagePct(n);
                  try {
                    window.localStorage.setItem("krchange:slippagePct", String(n));
                    window.dispatchEvent(new Event("krchange:slippage-updated"));
                  } catch {}
                }}
                min={0}
                max={100}
                step={0.1}
                ariaLabel="Slippage percent"
                className="h-8 w-20 px-2 rounded-md bg-secondary text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-sm"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        )}
        <TokenAmountSelector
          chainId={chainId}
          tokens={filtered}
          selected={fromToken}
          onSelect={(t) => {
            if (toToken && toToken.address.toLowerCase() === t.address.toLowerCase()) {
              setToToken(fromToken);
            }
            setFromToken(t);
            setAmountIn("");
          }}
          amount={amountIn}
          onAmountChange={(v) => { setExactOutMode(false); setAmountIn(v); }}
          label="From"
          onAddCustomToken={(tok) => setTokens((prev) => (prev.some((x) => x.address.toLowerCase() === tok.address.toLowerCase()) ? prev : [...prev, tok]))}
        />

        <TokenAmountSelector
          chainId={chainId}
          tokens={filtered}
          selected={toToken}
          onSelect={(t) => {
            if (fromToken && fromToken.address.toLowerCase() === t.address.toLowerCase()) {
              setFromToken(toToken);
            }
            setToToken(t);
          }}
          amount={exactOutMode ? amountOut : quoteDisplay}
          onAmountChange={(v) => { setExactOutMode(true); setAmountOut(v); }}
          placeholder={exactOutMode ? "0.0" : "Calculated"}
          label="To"
          onAddCustomToken={(tok) => setTokens((prev) => (prev.some((x) => x.address.toLowerCase() === tok.address.toLowerCase()) ? prev : [...prev, tok]))}
        />

        <button
          disabled={!canSubmit || txBusy || (exactOutMode ? !quoteInRequired || quoteInRequired === BigInt(0) : !quoteOut || quoteOut === BigInt(0))}
          onClick={onSwap}
          className={`w-full h-10 rounded-md font-medium transition-opacity ${
            !canSubmit || txBusy || !quoteOut || quoteOut === BigInt(0) ? "bg-primary text-primary-foreground opacity-70 cursor-not-allowed" : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          {txBusy ? (needsApproval ? "Processing..." : "Processing...") : needsApproval ? `Approve & Swap` : `Swap`}
        </button>

        <div className="text-xs text-muted-foreground">{exactOutMode ? `Required: ${quoteInDisplay ? `~${quoteInDisplay} ${fromToken?.symbol}` : "—"}` : `Expected: ${quoteDisplay ? `~${quoteDisplay} ${toToken?.symbol}` : "—"}`}</div>
        <div className="text-xs text-muted-foreground">Route: {bestPath && bestPath.length > 0 ? bestRouteSymbols : "—"}</div>

        {txStage && (
          <TxProgress pending={!!txStage.pending && txBusy} label={txStage.label} step={txStage.step} total={txStage.total} resetKey={txCountdownKey} />
        )}
        {!txBusy && txError && (
          <div className="text-xs text-[var(--danger)] break-words">{txError}</div>
        )}
        {!txBusy && (!quoteOut || quoteOut === BigInt(0)) && canSubmit && (
          <div className="text-xs text-[var(--danger)]">Insufficient output</div>
        )}
        {effectiveToleranceBips > 5000 && (
          <div className="text-xs text-amber-400">Warning: Effective slippage/fees exceed 50% for this route.</div>
        )}
      </div>

      {/* Token pickers handled by TokenAmountSelector */}
    </div>
  );
}


