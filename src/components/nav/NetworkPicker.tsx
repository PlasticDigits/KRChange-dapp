"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getPublicConfig, getDefaultNetworkId } from "@/lib/chain";

export default function NetworkPicker() {
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [networks, setNetworks] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const cfg = await getPublicConfig();
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("networkId") : null;
      const id = stored ? Number(stored) : await getDefaultNetworkId();
      setNetworkId(id);
      setNetworks(
        Object.entries(cfg.networks).map(([k, v]) => ({ id: Number(k), name: v.name }))
      );
    })();
  }, []);

  return (
    <div className="hidden md:flex items-center gap-2">
      <label htmlFor="network" className="sr-only">Network</label>
      <div className="relative">
        <select
          id="network"
          className="h-9 pl-3 pr-8 rounded-md bg-secondary text-sm appearance-none cursor-pointer"
          value={networkId ?? 0}
          onChange={(e) => {
            const id = Number(e.target.value);
            setNetworkId(id);
            try {
              window.localStorage.setItem("networkId", String(id));
            } catch {}
            window.dispatchEvent(new CustomEvent("krchange:network-changed", { detail: { chainId: id } }));
          }}
        >
          {networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}


