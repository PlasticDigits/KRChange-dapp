export type BasicToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
};

// Common placeholder used by many apps to represent the native coin
export const NATIVE_TOKEN_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export function isNativeAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

export function isNativeToken(t: Pick<BasicToken, "address">): boolean {
  return isNativeAddress(t.address);
}

export function findWrappedNative(
  tokens: BasicToken[],
  symbol = "WKAS"
): BasicToken | null {
  const hit = tokens.find(
    (t) => (t.symbol || "").toLowerCase() === symbol.toLowerCase()
  );
  return hit || null;
}

export function buildNativeToken(params: {
  chainId: number;
  currencySymbol: string;
  currencyDecimals: number;
  logoURI?: string;
}): BasicToken {
  return {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: params.currencySymbol,
    name: params.currencySymbol,
    decimals: params.currencyDecimals,
    chainId: params.chainId,
    logoURI: params.logoURI,
  };
}

export function normalizeToWrappedIfNative<T extends BasicToken>(
  token: T,
  wrapped: BasicToken | null
): T | BasicToken {
  if (!isNativeToken(token)) return token;
  return wrapped || token; // fallback to token if wrapped not found
}
