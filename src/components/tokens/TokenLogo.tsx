"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { HelpCircle } from "lucide-react";

type Props = {
  address?: string | null;
  chainId?: number | null;
  symbol?: string;
  size?: number;
  className?: string;
  logoURI?: string | null;
  rounded?: boolean;
  isListed?: boolean;
};

type TokenListEntry = { address: string; chainId?: number };

let tokenListCache: { addrSet: Set<string>; addrChainSet: Set<string> } | null = null;

async function ensureTokenListCache(): Promise<{ addrSet: Set<string>; addrChainSet: Set<string> }> {
  if (tokenListCache) return tokenListCache;
  try {
    const res = await fetch("/tokenlist.json", { cache: "force-cache" });
    const data = await res.json();
    const addrSet = new Set<string>();
    const addrChainSet = new Set<string>();
    const items = Array.isArray(data?.tokens) ? (data.tokens as TokenListEntry[]) : [];
    for (const t of items) {
      const addr = String(t.address || "").toLowerCase();
      if (!addr) continue;
      addrSet.add(addr);
      if (typeof t.chainId === "number") addrChainSet.add(`${t.chainId}:${addr}`);
    }
    tokenListCache = { addrSet, addrChainSet };
    return tokenListCache;
  } catch {
    const empty = { addrSet: new Set<string>(), addrChainSet: new Set<string>() };
    tokenListCache = empty;
    return empty;
  }
}

export default function TokenLogo({ address, chainId, symbol, size = 20, className, logoURI, rounded = true, isListed }: Props) {
  const [listed, setListed] = useState<boolean>(Boolean(isListed));
  const [imgOk, setImgOk] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (typeof isListed === "boolean") {
        if (active) setListed(isListed);
        return;
      }
      const addrLower = (address || "").toLowerCase();
      if (!addrLower) {
        if (active) setListed(false);
        return;
      }
      const cache = await ensureTokenListCache();
      const hit = typeof chainId === "number"
        ? cache.addrChainSet.has(`${chainId}:${addrLower}`)
        : cache.addrSet.has(addrLower);
      if (active) setListed(hit);
    })();
    return () => { active = false; };
  }, [address, chainId, isListed]);

  const content = useMemo(() => {
    if (listed && logoURI && imgOk) {
      return (
        <Image
          src={logoURI}
          alt={symbol || "Token"}
          width={size}
          height={size}
          onError={() => setImgOk(false)}
          className={rounded ? "rounded-full" : ""}
        />
      );
    }
    const iconSize = Math.max(12, size - 8);
    return (
      <HelpCircle size={iconSize} className="text-muted-foreground" aria-label={symbol ? `${symbol} (unlisted)` : "Unlisted token"} />
    );
  }, [listed, logoURI, symbol, size, rounded, imgOk]);

  return (
    <div
      className={`inline-flex items-center justify-center ${rounded ? "rounded-full" : ""} ${className || ""}`}
      style={{ width: size, height: size }}
      aria-hidden={!symbol}
      title={symbol || undefined}
    >
      {content}
    </div>
  );
}


