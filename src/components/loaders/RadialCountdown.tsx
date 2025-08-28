"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  isActive: boolean;
  size?: number; // px
  stroke?: number; // px
  className?: string;
  ariaLabel?: string;
  resetKey?: unknown; // change to restart the countdown
};

// Maps elapsed seconds to progress [0, 0.99]
function mapElapsedToProgress(seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds <= 15) {
    return Math.min(0.75, (seconds / 15) * 0.75);
  }
  if (seconds <= 35) {
    const t = seconds - 15;
    return 0.75 + Math.min(0.2, (t / 20) * 0.2);
  }
  if (seconds <= 95) {
    const t = seconds - 35;
    // Cap at 95% so the user never sees full completion before confirmation
    return 0.95; // hold at 95% after reaching it
  }
  return 0.95;
}

export default function RadialCountdown({ isActive, size = 18, stroke = 2, className, ariaLabel, resetKey }: Props) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      // Pause but keep the current progress displayed; do not reset
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    startRef.current = performance.now();
    setProgress(0);
    const tick = () => {
      if (!startRef.current) return;
      const now = performance.now();
      const elapsedSec = (now - startRef.current) / 1000;
      setProgress(mapElapsedToProgress(elapsedSec));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isActive, resetKey]);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * progress;
  const remaining = Math.max(0.0001, c - dash); // leave tiny tail for 0

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={ariaLabel || "Pending confirmation"}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="oklch(1 0 0 / 9%)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${remaining}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="text-[var(--primary)]"
      />
    </svg>
  );
}


