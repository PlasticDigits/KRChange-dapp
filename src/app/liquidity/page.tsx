"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getEffectiveNetworkId } from "@/lib/chain";
import { listPairsByChainId, type PairInfo } from "@/lib/ethers";

export default function LiquidityPage() {
  const [pairs, setPairs] = useState<PairInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [chainId, setChainId] = useState<number | null>(null);

  const load = async (id: number) => {
    setLoading(true);
    const res = await listPairsByChainId(id, 200);
    setPairs(res);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const id = await getEffectiveNetworkId();
      setChainId(id);
      await load(id);
    })();

    const onChanged = (e: any) => {
      const id = e?.detail?.chainId;
      if (typeof id === "number") {
        setChainId(id);
        load(id);
      }
    };
    window.addEventListener("krchange:network-changed", onChanged as any);
    return () => window.removeEventListener("krchange:network-changed", onChanged as any);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Liquidity</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/liquidity/add"
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90 active:opacity-100"
            aria-label="Add Liquidity"
          >
            Add Liquidity
          </Link>
          <Link
            href="/liquidity/create"
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-secondary text-sm font-medium transition-colors hover:bg-secondary/80"
            aria-label="Create Pair"
          >
            Create Pair
          </Link>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm text-muted-foreground mb-3">Network: {chainId ?? "..."}</div>
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
                  <th className="py-2">Pair Address</th>
                </tr>
              </thead>
              <tbody>
                {pairs.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-muted-foreground">No pairs found.</td>
                  </tr>
                )}
                {pairs.map((p) => (
                  <tr key={p.pairAddress} className="border-b border-border/50">
                    <td className="py-2">
                      <div className="font-medium">{p.token0} / {p.token1}</div>
                    </td>
                    <td className="py-2">{p.pairAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


