"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Sparkline from "@/components/charts/Sparkline";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

export type TokenRow = {
  address: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  tvl: number;
  holders: number;
  spark: number[];
  logo?: string;
  logoURI?: string;
};

type Props = { tokens: TokenRow[] };

const columns: { key: keyof TokenRow | "spark"; label: string; className?: string }[] = [
  { key: "name", label: "Token", className: "w-[220px]" },
  { key: "price", label: "Price" },
  { key: "change24h", label: "24h Change" },
  { key: "volume24h", label: "Volume" },
  { key: "tvl", label: "TVL" },
  { key: "holders", label: "Holders" },
  { key: "spark", label: "7d" },
];

export default function TokenTable({ tokens }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<keyof TokenRow>("tvl");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return tokens.filter((t) =>
      t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q)
    );
  }, [tokens, query]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });
  }, [filtered, sortKey, sortAsc]);

  const onSort = (key: keyof TokenRow) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          aria-label="Search tokens"
          placeholder="Search tokens..."
          className="w-full md:w-80 h-9 px-3 rounded-md bg-secondary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              {columns.map((c) => (
                <th key={c.key as string} className={`py-2 font-medium ${c.className || ""}`}>
                  {c.key !== "spark" ? (
                    <button
                      className="hover:text-foreground"
                      onClick={() => onSort(c.key as keyof TokenRow)}
                      aria-label={`Sort by ${c.label}`}
                    >
                      {c.label}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.address} className="border-b border-border/50 hover:bg-secondary/40">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    {t.logo || t.logoURI ? (
                      <Image src={(t.logo || t.logoURI) as string} alt={t.symbol} width={20} height={20} className="rounded-full" />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-muted" />
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium">{t.symbol}</span>
                      <span className="text-xs text-muted-foreground">{t.name}</span>
                    </div>
                  </div>
                </td>
                <td>{formatCurrency(t.price)}</td>
                <td className={t.change24h >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                  {formatPercent(t.change24h / 100)}
                </td>
                <td>{formatCurrency(t.volume24h)}</td>
                <td>{formatCurrency(t.tvl)}</td>
                <td>{formatNumber(t.holders)}</td>
                <td className="text-primary">
                  <Sparkline data={t.spark} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


