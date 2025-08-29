"use client";

import { useMemo } from "react";

type Props = {
  label: string;
  value: number; // 0..100
  onChange: (next: number) => void;
  accent?: "primary" | "danger";
  className?: string;
};

// A themed percentage slider matching the Cyber Steel aesthetic from STYLE_GUIDE.md.
// - Thick, low-contrast rail with subtle metallic sheen
// - Neon-teal or danger accent for the progress track and thumb glow
// - Compact layout with label and live percent display
export default function SteelSlider({ label, value, onChange, accent = "primary", className }: Props) {
  const clAccent = useMemo(() => (accent === "danger" ? "[--slider-accent:var(--danger)]" : "[--slider-accent:var(--primary)]"), [accent]);

  return (
    <div className={`w-full ${className || ""}`}>
      <div className="flex items-center justify-between mb-2 pr-8">
        <label className={`text-sm ${accent === "danger" ? "text-[var(--danger)]" : ""}`}>{label}</label>
        <div className="text-sm tabular-nums">{Math.max(0, Math.min(100, value)).toFixed(0)}%</div>
      </div>
      <div className={`steel-slider relative h-6 ${clAccent}`}>
        {/* Rail */}
        <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-[color-mix(in_oklab,var(--muted)_80%,black_20%)]/60 border border-border overflow-hidden">
          {/* Progress with subtle sheen */}
          <div
            className="h-full bg-[color-mix(in_oklab,var(--slider-accent)_40%,var(--muted)_60%)]/70"
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
          <div
            className="pointer-events-none absolute inset-0 ambient-sheen rounded-full"
            aria-hidden
          />
        </div>

        {/* Native input for accessibility/keyboard support; styled to be invisible */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="appearance-none absolute inset-0 w-full bg-transparent cursor-pointer"
        />

        {/* Thumb visual */}
        <div
          className="pointer-events-none absolute -top-1 h-8 w-8 rounded-full grid place-items-center"
          style={{ left: `calc(${Math.max(0, Math.min(100, value))}% - 16px)` }}
        >
          <div className="h-3.5 w-3.5 rounded-full bg-[var(--slider-accent)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--slider-accent)_25%,transparent)]" />
        </div>
      </div>
    </div>
  );
}


