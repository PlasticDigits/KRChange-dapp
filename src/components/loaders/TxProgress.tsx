"use client";

import RadialCountdown from "@/components/loaders/RadialCountdown";

type Props = {
  pending: boolean; // true only while awaiting on-chain confirmation for a submitted tx
  label: string; // e.g., "Approve USDT" or "Add liquidity"
  step: number;
  total: number;
  resetKey?: unknown; // change when a new tx is submitted
};

export default function TxProgress({ pending, label, step, total, resetKey }: Props) {
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-2">
      {pending && (
        <RadialCountdown isActive={pending} resetKey={resetKey} ariaLabel="Transaction pending" />
      )}
      <span>
        Step {step} of {total}: {label}...
      </span>
    </div>
  );
}


