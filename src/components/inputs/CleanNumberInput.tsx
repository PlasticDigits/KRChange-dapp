"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /**
   * Optional min/max clamping applied on blur. Only applied if both are finite numbers.
   */
  min?: number;
  max?: number;
  /** Amount to increment/decrement with wheel/arrow keys. Defaults to 1. */
  step?: number;
};

/**
 * A clean, cross-browser numeric text input that:
 * - Prevents exponent signs and +/-
 * - Allows a single decimal separator
 * - Hides native number spinners consistently
 */
export default function CleanNumberInput({ value, onValueChange, placeholder, className, disabled, ariaLabel, min, max, step = 1 }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const holdingRef = useRef(false);
  const valueRef = useRef<string>(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const preventBadKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const bad = ["e", "E", "+", "-"];
    if (bad.includes(e.key)) e.preventDefault();
  };

  const sanitizeDecimal = (raw: string) => {
    let v = raw.replace(/[^0-9.]/g, "");
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
    }
    return v;
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange(sanitizeDecimal(e.target.value));
  };

  const onBlur = () => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const hasMin = typeof min === "number" && Number.isFinite(min);
    const hasMax = typeof max === "number" && Number.isFinite(max);
    if (!hasMin && !hasMax) return;
    const clamped = hasMin || hasMax ? Math.min(hasMax ? max! : n, Math.max(hasMin ? min! : n, n)) : n;
    if (clamped !== n) onValueChange(String(clamped));
  };

  const decimalsFromStep = (() => {
    if (!Number.isFinite(step)) return 0;
    const s = step.toString();
    const i = s.indexOf(".");
    return i === -1 ? 0 : s.length - i - 1;
  })();

  const clamp = (n: number) => {
    const hasMin = typeof min === "number" && Number.isFinite(min);
    const hasMax = typeof max === "number" && Number.isFinite(max);
    if (hasMin) n = Math.max(min!, n);
    if (hasMax) n = Math.min(max!, n);
    return n;
  };

  const applyDelta = (direction: 1 | -1) => {
    const current = Number(valueRef.current || 0);
    const scale = Math.pow(10, decimalsFromStep);
    const next = clamp((Math.round(current * scale) + direction * Math.round(step * scale)) / scale);
    const fixed = next.toFixed(decimalsFromStep);
    // trim trailing zeros
    const cleaned = fixed.replace(/\.0+$/g, "").replace(/\.(?=\D|$)/, "");
    onValueChange(cleaned);
  };

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      if (!Number.isFinite(step)) return;
      applyDelta(e.deltaY < 0 ? 1 : -1);
    };
    const inputEl = inputRef.current;
    const controlsEl = controlsRef.current;
    inputEl?.addEventListener("wheel", handler, { passive: false });
    controlsEl?.addEventListener("wheel", handler, { passive: false });
    return () => {
      inputEl?.removeEventListener("wheel", handler);
      controlsEl?.removeEventListener("wheel", handler);
    };
  }, [disabled, step, value, min, max]);

  // While the cursor is inside the control, allow arrow keys to adjust even if the input isn't focused
  useEffect(() => {
    if (!hovered || disabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        applyDelta(1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        applyDelta(-1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hovered, disabled, value, step, min, max]);


  const onKeyDownEnhanced: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    preventBadKeys(e);
    if (e.key === "ArrowUp") {
      e.preventDefault();
      applyDelta(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      applyDelta(-1);
    }
  };

  const tooltip = useMemo(() => "Scroll or use ↑/↓ to adjust", []);

  const repeatTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const clearRepeat = () => {
    if (repeatTimerRef.current) {
      window.clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    if (holdIntervalRef.current) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };
  useEffect(() => {
    const stop = () => clearRepeat();
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
      window.removeEventListener("pointerup", stop);
    };
  }, []);
  const startRepeat = (direction: 1 | -1) => {
    applyDelta(direction);
    clearRepeat();
    repeatTimerRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => {
        if (holdingRef.current) applyDelta(direction);
      }, 60);
    }, 300);
  };

  return (
    <div className="relative w-full" ref={wrapperRef} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDownEnhanced}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`w-full pr-7 placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className || ""}`}
      />
      <div ref={controlsRef} className={`absolute inset-y-0 right-1 flex flex-col justify-center py-1 ${disabled ? "pointer-events-none opacity-50" : ""}`} title={tooltip} aria-hidden>
        <button
          type="button"
          className="h-4 w-4 grid place-items-center rounded hover:bg-secondary text-muted-foreground"
          title={tooltip}
          onPointerDown={(e) => { e.preventDefault(); holdingRef.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); startRepeat(1); }}
          onPointerUp={(e) => { holdingRef.current = false; clearRepeat(); (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); }}
          onPointerCancel={() => { holdingRef.current = false; clearRepeat(); }}
          aria-label="Increment"
        >
          <ChevronUp size={12} />
        </button>
        <button
          type="button"
          className="mt-0.5 h-4 w-4 grid place-items-center rounded hover:bg-secondary text-muted-foreground"
          title={tooltip}
          onPointerDown={(e) => { e.preventDefault(); holdingRef.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); startRepeat(-1); }}
          onPointerUp={(e) => { holdingRef.current = false; clearRepeat(); (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); }}
          onPointerCancel={() => { holdingRef.current = false; clearRepeat(); }}
          aria-label="Decrement"
        >
          <ChevronDown size={12} />
        </button>
      </div>
    </div>
  );
}


