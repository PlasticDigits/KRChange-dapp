"use client";

import { useEffect, useRef } from "react";

type BackgroundFXProps = {
  className?: string;
};

/*
  BackgroundFX renders a few blurred radial gradients that subtly move with the cursor
  to create a soft parallax. The opacity is restrained to avoid muddiness.
*/
export default function BackgroundFX({ className }: BackgroundFXProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let t = 0;

    const onMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      const nx = (e.clientX / innerWidth) * 2 - 1; // -1..1
      const ny = (e.clientY / innerHeight) * 2 - 1; // -1..1
      targetX = nx * 18; // slightly stronger parallax
      targetY = ny * 18;
      if (!raf) tick();
    };

    const tick = () => {
      // idle drift for metallic ambience
      t += 0.003;
      const driftX = Math.sin(t) * 4;
      const driftY = Math.cos(t * 0.8) * 3;

      currentX += (targetX - currentX) * 0.1;
      currentY += (targetY - currentY) * 0.1;
      el.style.setProperty("--px", `${currentX + driftX}px`);
      el.style.setProperty("--py", `${currentY + driftY}px`);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={[
        "pointer-events-none fixed inset-0 z-0 overflow-hidden parallax-layer",
        className ?? "",
      ].join(" ")}
    >
      {/* Upper left teal glow */}
      <div
        className="absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full blur-3xl opacity-[0.2]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 65%, transparent), transparent 70%)",
          transform: "translate3d(calc(var(--px) * 0.6), calc(var(--py) * 0.6), 0)",
        }}
      />

      {/* Right side accent glow (teal) */}
      <div
        className="absolute top-1/4 -right-56 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-[0.16]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--chart-2) 65%, transparent), transparent 70%)",
          transform: "translate3d(calc(var(--px) * -0.3), calc(var(--py) * 0.2), 0)",
        }}
      />

      {/* Bottom center soft wash (teal-cyan, no purple) */}
      <div
        className="absolute -bottom-56 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full blur-3xl opacity-[0.14]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--chart-1) 55%, transparent), transparent 70%)",
          transform: "translate3d(calc(var(--px) * 0.15), calc(var(--py) * -0.25), 0)",
        }}
      />
    </div>
  );
}


