export const SETTINGS_KEYS = {
  slippagePct: "krchange:slippagePct",
  infiniteApprovals: "krchange:infiniteApprovals",
} as const;

export const SETTINGS_EVENTS = {
  slippageUpdated: "krchange:slippage-updated",
  infiniteApprovalsUpdated: "krchange:infinite-approvals-updated",
} as const;

export function getSlippagePct(): number {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEYS.slippagePct);
    if (raw === null) return 3; // default
    const n = Number(raw);
    return Number.isFinite(n) ? n : 3;
  } catch {
    return 3;
  }
}

export function setSlippagePct(value: number): void {
  const v = Number.isFinite(value) ? value : 0;
  try {
    window.localStorage.setItem(SETTINGS_KEYS.slippagePct, String(v));
    window.dispatchEvent(new Event(SETTINGS_EVENTS.slippageUpdated));
  } catch {}
}

export function getInfiniteApprovals(): boolean {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEYS.infiniteApprovals);
    if (raw === null) return true; // default enabled
    return raw === "true";
  } catch {
    return true;
  }
}

export function setInfiniteApprovals(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      SETTINGS_KEYS.infiniteApprovals,
      String(!!enabled)
    );
    window.dispatchEvent(new Event(SETTINGS_EVENTS.infiniteApprovalsUpdated));
  } catch {}
}
