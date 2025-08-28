"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import CleanNumberInput from "@/components/inputs/CleanNumberInput";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { resolveChain } from "@/lib/chain";
import type { Eip1193Provider } from "ethers";

export type SelectableToken = { symbol: string; name: string; address: string; decimals: number; chainId: number; logoURI?: string };

type Props = {
  chainId: number | null;
  account?: string | null;
  tokens: SelectableToken[];
  selected: SelectableToken | null;
  onSelect: (t: SelectableToken) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  label: string;
  onAddCustomToken: (t: SelectableToken) => void;
  amountReadOnly?: boolean;
  placeholder?: string;
};

type CachedBalances = Record<string, { value: string; ts: number }>;

const BAL_CACHE_NS = "krchange:balances"; // `${ns}:${chainId}:${account}` -> CachedBalances
const CUSTOM_TOKEN_KEY_NS = "krchange:customTokens"; // for local custom tokens per chain

function makeBalanceKey(chainId: number, account: string) {
  return `${BAL_CACHE_NS}:${chainId}:${account.toLowerCase()}`;
}

function getCachedBalances(chainId: number, account: string): CachedBalances {
  try {
    const raw = window.localStorage.getItem(makeBalanceKey(chainId, account));
    return raw ? (JSON.parse(raw) as CachedBalances) : {};
  } catch {
    return {};
  }
}

function setCachedBalance(chainId: number, account: string, tokenAddr: string, value: string) {
  try {
    const key = makeBalanceKey(chainId, account);
    const current = getCachedBalances(chainId, account);
    current[tokenAddr.toLowerCase()] = { value, ts: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(current));
  } catch {}
}

export default function TokenAmountSelector({ chainId, account: accountProp, tokens, selected, onSelect, amount, onAmountChange, label, onAddCustomToken, amountReadOnly, placeholder }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState<string | null>(accountProp ?? null);
  const [balances, setBalances] = useState<Record<string, string>>({}); // address -> display string
  const [importAddr, setImportAddr] = useState("");
  const [importMeta, setImportMeta] = useState<null | { name: string; symbol: string; decimals: number; address: string }>(null);
  const [importError, setImportError] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const observersRef = useRef<IntersectionObserver | null>(null);

  // Keep account from wallet if not provided
  useEffect(() => {
    if (accountProp) {
      setAccount(accountProp);
      return;
    }
    (async () => {
      try {
        const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
        if (!eth || !eth.request) return;
        const accts = (await eth.request({ method: "eth_accounts" })) as unknown as string[];
        if (accts && accts.length > 0) setAccount(accts[0]);
      } catch {}
    })();
  }, [accountProp]);

  // Load cached balances immediately when opening or when token changes
  useEffect(() => {
    if (!pickerOpen || !chainId || !account) return;
    const cached = getCachedBalances(chainId, account);
    const map: Record<string, string> = {};
    for (const t of tokens) {
      const hit = cached[t.address.toLowerCase()];
      if (hit) map[t.address.toLowerCase()] = hit.value;
    }
    setBalances(map);
  }, [pickerOpen, chainId, account, tokens]);

  // Also refresh selected token balance lazily on mount/selection
  useEffect(() => {
    if (!chainId || !account || !selected) return;
    const cached = getCachedBalances(chainId, account);
    const hit = cached[selected.address.toLowerCase()];
    if (hit) setBalances((b) => ({ ...b, [selected.address.toLowerCase()]: hit.value }));
    // Soft refresh in background
    void fetchAndCacheBalance(selected);
  }, [chainId, account, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q);
  }, [tokens, search]);

  const fetchAndCacheBalance = useCallback(async (t: SelectableToken) => {
    if (!chainId || !account) return;
    try {
      const chain = await resolveChain(chainId);
      if (!chain) return;
      const { JsonRpcProvider, Contract, formatUnits } = await import("ethers");
      const provider = new JsonRpcProvider(chain.rpcUrl);
      const abi = ["function balanceOf(address) view returns (uint256)"];
      const c = new Contract(t.address, abi, provider);
      const raw: bigint = await c.balanceOf(account);
      const display = formatUnits(raw, t.decimals);
      setCachedBalance(chainId, account, t.address, display);
      setBalances((b) => ({ ...b, [t.address.toLowerCase()]: display }));
    } catch {
      // ignore
    }
  }, [chainId, account]);

  // Lazy-load balances while scrolling the picker list via IntersectionObserver
  useEffect(() => {
    if (!pickerOpen) return;
    if (!chainId || !account) return;
    if (!listRef.current) return;
    observersRef.current?.disconnect();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const addr = (entry.target as HTMLElement).dataset["addr"];
          const decimalsAttr = (entry.target as HTMLElement).dataset["dec"];
          if (!addr || !decimalsAttr) continue;
          const token = tokens.find((x) => x.address.toLowerCase() === addr.toLowerCase());
          if (token) void fetchAndCacheBalance(token);
        }
      }
    }, { root: listRef.current, threshold: 0.1 });
    observersRef.current = observer;
    const rows = listRef.current.querySelectorAll("[data-addr]");
    rows.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pickerOpen, chainId, account, tokens, fetchAndCacheBalance]);

  const onOutsideClick = useCallback((e: MouseEvent) => {
    if (!dialogRef.current) return;
    if (!dialogRef.current.contains(e.target as Node)) setPickerOpen(false);
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [pickerOpen, onOutsideClick]);

  const isHexAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

  const loadCustomToken = useCallback(async () => {
    setImportError("");
    setImportMeta(null);
    if (!chainId) {
      setImportError("No network selected");
      return;
    }
    const addr = importAddr.trim();
    if (!isHexAddress(addr)) {
      setImportError("Invalid token address");
      return;
    }
    try {
      const chain = await resolveChain(chainId);
      if (!chain) throw new Error("Chain not found");
      const { JsonRpcProvider, Contract } = await import("ethers");
      const provider = new JsonRpcProvider(chain.rpcUrl);
      const erc20Abi = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ];
      const c = new Contract(addr, erc20Abi, provider);
      const [name, symbol, decimals] = await Promise.all([c.name(), c.symbol(), c.decimals()]);
      setImportMeta({ name, symbol, decimals: Number(decimals), address: addr });
    } catch {
      setImportError("Failed to load token metadata");
    }
  }, [chainId, importAddr]);

  const confirmAddCustom = useCallback(() => {
    if (!importMeta || !chainId) return;
    onAddCustomToken({
      address: importMeta.address,
      name: importMeta.name,
      symbol: importMeta.symbol,
      decimals: importMeta.decimals,
      chainId,
    });
    setImportMeta(null);
    setImportAddr("");
  }, [importMeta, chainId, onAddCustomToken]);

  const selectedBalance = useMemo(() => {
    if (!selected) return "";
    const v = balances[selected.address.toLowerCase()];
    return v ? v : "";
  }, [balances, selected]);

  // Listen for global balance change notifications (e.g., after swaps/liquidity events)
  useEffect(() => {
    const onPossibleChange = () => {
      if (!selected) return;
      void fetchAndCacheBalance(selected);
    };
    window.addEventListener("krchange:balance-possibly-changed", onPossibleChange as EventListener);
    return () => window.removeEventListener("krchange:balance-possibly-changed", onPossibleChange as EventListener);
  }, [selected, fetchAndCacheBalance]);

  const preventBadKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const bad = ["e", "E", "+", "-"];
    if (bad.includes(e.key)) e.preventDefault();
  };

  const sanitizeDecimal = (value: string) => {
    let v = value.replace(/[^0-9.]/g, "");
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
    }
    return v;
  };

  const onInputChange = (v: string) => {
    onAmountChange(sanitizeDecimal(v));
  };

  const hasBalance = !!(selected && selectedBalance);
  const setPercent = (pct: number) => {
    if (!hasBalance || !selected) return;
    const bal = parseFloat(selectedBalance);
    if (!isFinite(bal)) return;
    const val = (bal * pct).toString();
    onAmountChange(sanitizeDecimal(val));
  };

  const computedStep = useMemo(() => {
    const bal = parseFloat(selectedBalance);
    if (!isFinite(bal)) return 0.01; // default when no balance
    const onePct = bal * 0.01;
    if (onePct <= 0) return 0.01;
    const exp = Math.floor(Math.log10(onePct));
    const lower = Math.pow(10, exp);
    const upper = Math.pow(10, exp + 1);
    const pick = (onePct - lower) <= (upper - onePct) ? lower : upper;
    return Math.max(0.01, pick);
  }, [selectedBalance]);

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <button
          className="inline-flex items-center gap-1 h-9 rounded-md px-3 bg-secondary text-sm hover:bg-secondary/80"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
        >
          {selected?.logoURI && (
            <Image src={selected.logoURI} alt={selected.symbol} width={16} height={16} className="rounded-full" />
          )}
          {selected?.symbol || "Select"}
          <ChevronDown size={14} />
        </button>
        {amountReadOnly ? (
          <input
            type="text"
            inputMode="decimal"
            placeholder={placeholder || "0.0"}
            value={amount}
            onKeyDown={preventBadKeys}
            readOnly
            className="flex-1 h-9 px-3 rounded-md bg-secondary text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        ) : (
          <CleanNumberInput
            value={amount}
            onValueChange={(v) => onInputChange(v)}
            placeholder={placeholder || "0.0"}
            step={computedStep}
            min={0}
            ariaLabel={`${label} amount`}
            className="flex-1 h-9 px-3 rounded-md bg-secondary text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        )}
      </div>
      {selected && account && chainId && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Balance: {selectedBalance ? `${selectedBalance} ${selected.symbol}` : "--"}</div>
          <div className="flex items-center gap-1">
            <button className="h-6 px-2 rounded-md bg-secondary text-xs hover:bg-secondary/80" onClick={() => setPercent(0.25)} disabled={!hasBalance} aria-label="Use 25% of balance">25%</button>
            <button className="h-6 px-2 rounded-md bg-secondary text-xs hover:bg-secondary/80" onClick={() => setPercent(0.5)} disabled={!hasBalance} aria-label="Use 50% of balance">50%</button>
            <button className="h-6 px-2 rounded-md bg-secondary text-xs hover:bg-secondary/80" onClick={() => setPercent(1)} disabled={!hasBalance} aria-label="Use 100% of balance">100%</button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div role="dialog" aria-modal className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPickerOpen(false)} />
          <div className="relative card w-full max-w-sm p-4 brand-glow-sm" ref={dialogRef}>
            <div className="text-sm font-medium mb-2">Select token</div>
            <input
              placeholder="Search by name, symbol, or address"
              className="w-full h-9 px-3 rounded-md bg-secondary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary mb-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tokens"
            />
            <div className="space-y-1 max-h-56 overflow-auto" ref={listRef}>
              {filtered.map((t) => (
                <button
                  key={`${t.chainId}:${t.address}`}
                  data-addr={t.address}
                  data-dec={t.decimals}
                  className={`w-full text-left px-3 py-2 rounded-md hover:bg-secondary flex items-center gap-2 ${
                    selected?.address?.toLowerCase() === t.address.toLowerCase() ? "bg-secondary" : ""
                  }`}
                  onClick={() => {
                    onSelect(t);
                    setPickerOpen(false);
                    setSearch("");
                  }}
                >
                  {t.logoURI ? (
                    <Image src={t.logoURI} alt={t.symbol} width={20} height={20} className="rounded-full" />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-muted" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{t.symbol}</div>
                    <div className="text-xs text-muted-foreground">{t.name}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {balances[t.address.toLowerCase()] ? balances[t.address.toLowerCase()] : "--"}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-3 border-t border-border pt-3 space-y-2">
              <div className="text-xs font-medium">Import custom token</div>
              <div className="flex items-center gap-2">
                <input
                  placeholder="0x..."
                  className="flex-1 h-9 px-3 rounded-md bg-secondary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  value={importAddr}
                  onChange={(e) => setImportAddr(e.target.value)}
                  aria-label="Custom token address"
                />
                <button
                  className="h-9 px-3 rounded-md bg-secondary text-sm hover:bg-secondary/80"
                  onClick={loadCustomToken}
                >
                  Load
                </button>
              </div>
              {importError && (
                <div className="text-xs text-[var(--danger)]">{importError}</div>
              )}
              {importMeta && (
                <div className="p-3 rounded-md border border-border bg-popover">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-400 mt-0.5" />
                    <div className="text-xs text-muted-foreground">
                      Custom tokens are not verified by KRChange — add at your own risk.
                    </div>
                  </div>
                  <div className="mt-2 text-sm">
                    <div className="font-medium">{importMeta.symbol} · {importMeta.name}</div>
                    <div className="text-xs text-muted-foreground break-all">{importMeta.address}</div>
                    <div className="text-xs text-muted-foreground">Decimals: {importMeta.decimals}</div>
                  </div>
                  <button
                    className="mt-3 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
                    onClick={confirmAddCustom}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


