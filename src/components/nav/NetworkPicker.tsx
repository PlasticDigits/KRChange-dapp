"use client";

import { useEffect, useState } from "react";
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
      <select
        id="network"
        className="h-9 px-2 rounded-md bg-secondary text-sm"
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
    </div>
  );
}


