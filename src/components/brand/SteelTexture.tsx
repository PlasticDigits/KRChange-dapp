"use client";

import { useEffect, useRef } from "react";

export default function SteelTexture() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const onMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      const nx = (e.clientX / innerWidth) * 2 - 1; // -1..1
      const ny = (e.clientY / innerHeight) * 2 - 1; // -1..1
      // expand movement range (~5x) while keeping damping the same
      targetX = nx * 90;
      targetY = ny * 90;
      if (!raf) tick();
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      el.style.setProperty("--lx", `${currentX}px`);
      el.style.setProperty("--ly", `${currentY}px`);
      // move grid dots at ~1% of the lighting offset (very subtle)
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty("--dx", `${currentX * 0.01}px`);
      rootStyle.setProperty("--dy", `${currentY * 0.01}px`);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty("--dx", "0px");
      rootStyle.setProperty("--dy", "0px");
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Group all non-lighting layers and move them with dx/dy (5% of lighting) */}
      <div className="absolute inset-0" style={{ transform: "translate3d(var(--dx, 0px), var(--dy, 0px), 0)" }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url(/textures/heavy-distressed-steel.png)",
            backgroundSize: "500px 500px",
            backgroundRepeat: "repeat",
            opacity: 0.05,
            mixBlendMode: "overlay",
            filter: "saturate(0.6) contrast(1.05) brightness(0.9)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(60deg, oklch(0 0 0 / 0.16) 0%, transparent 55%, oklch(1 0 0 / 0.14) 98%)",
            mixBlendMode: "overlay",
            opacity: 0.32,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120rem 90rem at 50% 120%, oklch(0 0 0 / 0.10), transparent 62%), radial-gradient(90rem 60rem at 110% -10%, oklch(1 0 0 / 0.08), transparent 62%)",
            mixBlendMode: "overlay",
            opacity: 0.35,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(30deg, transparent 35%, oklch(1 0 0 / 0.10) 65%), linear-gradient(-25deg, oklch(0 0 0 / 0.08), transparent 55%)",
            mixBlendMode: "overlay",
            opacity: 0.28,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            /* smooth center mask to reduce grain and guide focus */
            background:
              "radial-gradient(60rem 60rem at 50% 50%, oklch(1 0 0 / 0.06), transparent 65%)",
            mixBlendMode: "overlay",
            opacity: 0.22,
          }}
        />
      </div>
      {/* Mouse-reactive light sweep; layer is larger than viewport to avoid edge artifacts */}
      <div
        className="absolute"
        style={{
          top: "-25vh",
          left: "-25vw",
          width: "150vw",
          height: "150vh",
          transform: "translate3d(var(--lx, 0px), var(--ly, 0px), 0)",
          background:
            "linear-gradient(60deg, oklch(1 0 0 / 0.10), transparent 55%, oklch(0 0 0 / 0.08)), radial-gradient(60rem 40rem at 70% 30%, oklch(1 0 0 / 0.06), transparent 60%)",
          mixBlendMode: "overlay",
          opacity: 0.22,
        }}
      />
    </div>
  );
}


