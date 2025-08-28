export type ChainContracts = {
  factory: `0x${string}`;
  router: `0x${string}`;
  ammZapV1?: `0x${string}`;
};

export type ChainConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  currency: { symbol: string; decimals: number };
  contracts: ChainContracts;
  routingBases?: string[];
};

export type PublicConfig = {
  defaultNetworkId: number;
  networks: Record<string, Omit<ChainConfig, "chainId">>;
};

let cachedConfig: PublicConfig | null = null;

export async function getPublicConfig(): Promise<PublicConfig> {
  if (cachedConfig) return cachedConfig;
  const res = await fetch("/config.json", { cache: "no-store" });
  const json = (await res.json()) as PublicConfig;
  cachedConfig = json;
  return json;
}

export async function getDefaultNetworkId(): Promise<number> {
  try {
    const cfg = await getPublicConfig();
    return cfg.defaultNetworkId;
  } catch {
    return 167012;
  }
}

export async function getEffectiveNetworkId(): Promise<number> {
  try {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("networkId");
      if (stored) return Number(stored);
    }
  } catch {
    // ignore storage errors
  }
  return getDefaultNetworkId();
}

export async function resolveChain(
  chainId: number
): Promise<ChainConfig | null> {
  try {
    const cfg = await getPublicConfig();
    const entry = cfg.networks[String(chainId)];
    if (!entry) return null;
    return { chainId, ...entry } as ChainConfig;
  } catch {
    return null;
  }
}
