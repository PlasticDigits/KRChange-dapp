"use client";

import CleanNumberInput from "@/components/inputs/CleanNumberInput";
import { useEffect, useState } from "react";
import { getInfiniteApprovals, setInfiniteApprovals, setSlippagePct } from "@/lib/settings";

type Props = {
  slippagePct: number;
  onSlippageChange: (next: number) => void;
};

export default function SettingsPopover({ slippagePct, onSlippageChange }: Props) {
  const [infiniteApprovalsLocal, setInfiniteApprovalsLocal] = useState<boolean>(true);

  useEffect(() => {
    try {
      setInfiniteApprovalsLocal(getInfiniteApprovals());
    } catch {
      setInfiniteApprovalsLocal(true);
    }
  }, []);

  const onToggleInfinite = (next: boolean) => {
    setInfiniteApprovalsLocal(next);
    setInfiniteApprovals(next);
  };

  return (
    <div className="absolute right-3 top-12 z-20 w-56 p-3 rounded-md border border-border bg-popover space-y-3">
      <div>
        <div className="text-xs text-muted-foreground">Slippage</div>
        <div className="flex items-center gap-2 mt-1">
          <CleanNumberInput
            value={String(slippagePct)}
            onValueChange={(v) => {
              const n = Number(v || 0);
              onSlippageChange(n);
              setSlippagePct(n);
            }}
            min={0}
            max={100}
            step={0.1}
            ariaLabel="Slippage percent"
            className="h-8 w-24 px-2 rounded-md bg-secondary text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-sm"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={infiniteApprovalsLocal}
          onChange={(e) => onToggleInfinite(e.target.checked)}
        />
        <span className="text-sm">Infinite Approvals</span>
      </label>
    </div>
  );
}


