"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };

function isElementClickable(element: Element | null): boolean {
  let el: Element | null = element;
  while (el && el !== document.body) {
    if (
      el instanceof HTMLElement &&
      (
        el.matches(
          [
            "a",
            "button",
            "[role=button]",
            "[data-clickable]",
            "input[type=button]",
            "input[type=submit]",
            "summary",
          ].join(",")
        ) ||
        el.tabIndex >= 0
      )
    ) {
      return true;
    }
    if (el instanceof HTMLElement) {
      const cursor = window.getComputedStyle(el).cursor;
      if (cursor === "pointer") return true;
    }
    el = el.parentElement;
  }
  return false;
}

export default function CustomCursor() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dotRefs = useRef<HTMLDivElement[]>([]);
  const mouseRef = useRef<Point>({ x: -100, y: -100 });
  const positionsRef = useRef<Point[]>([]);
  const clickableRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const clickFlashUntilRef = useRef<number>(0);
  const isPressedRef = useRef<boolean>(false);
  const [enabled, setEnabled] = useState(false);

  const prefersReducedMotion = useMemo(
    () => (typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false),
    []
  );
  const pointerIsFine = useMemo(
    () => (typeof window !== "undefined" ? window.matchMedia("(pointer: fine)").matches : false),
    []
  );

  const DOT_COUNT = prefersReducedMotion ? 1 : 12;

  useEffect(() => {
    if (!pointerIsFine) return; // Skip on touch devices
    setEnabled(true);
    document.body.classList.add("custom-cursor-active");

    // Initialize trailing positions
    positionsRef.current = Array.from({ length: DOT_COUNT }, () => ({ x: -100, y: -100 }));

    const handlePointerMove = (e: PointerEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      clickableRef.current = isElementClickable(e.target as Element);
    };

    const handlePointerDown = () => {
      containerRef.current?.classList.add("cursor-pressed");
      isPressedRef.current = true;
      // Snap the entire trail to the current mouse position for an instant start
      const { x, y } = mouseRef.current;
      positionsRef.current = positionsRef.current.map(() => ({ x, y }));
    };
    const handlePointerUp = () => {
      containerRef.current?.classList.remove("cursor-pressed");
      isPressedRef.current = false;
      // brief decay after release
      clickFlashUntilRef.current = performance.now() + 40;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const animate = () => {
      const positions = positionsRef.current;
      const mouse = mouseRef.current;
      const clickable = clickableRef.current;
      const pressed = isPressedRef.current;
      const now = performance.now();

      // Update CSS var for color only when needed
      const container = containerRef.current;
      if (container) {
        // Colors: teal default, pink on hover, yellow while pressed (and brief decay after release)
        const teal = "oklch(0.78 0.15 190)";
        const pink = "oklch(0.82 0.22 340)";
        const yellow = "oklch(0.92 0.12 95)";
        const activeColor = pressed ? yellow : (now < clickFlashUntilRef.current ? yellow : (clickable ? pink : teal));
        container.style.setProperty("--cursor-color", activeColor);
        container.style.setProperty("--cursor-shadow", activeColor);
        // Glow intensity: strongest while pressed, medium during decay, default otherwise
        if (pressed) {
          container.style.setProperty("--cursor-blur-head", "36px");
          container.style.setProperty("--cursor-blur-tail", "22px");
          container.style.setProperty("--cursor-glow-head", "80%");
          container.style.setProperty("--cursor-glow-tail", "55%");
        } else if (now < clickFlashUntilRef.current) {
          container.style.setProperty("--cursor-blur-head", "28px");
          container.style.setProperty("--cursor-blur-tail", "18px");
          container.style.setProperty("--cursor-glow-head", "70%");
          container.style.setProperty("--cursor-glow-tail", "45%");
        } else {
          container.style.setProperty("--cursor-blur-head", "22px");
          container.style.setProperty("--cursor-blur-tail", "14px");
          container.style.setProperty("--cursor-glow-head", "65%");
          container.style.setProperty("--cursor-glow-tail", "40%");
        }
      }

      // Head dot moves fast; tail follows tightly (extra boost while pressed)
      const headFollow = prefersReducedMotion ? 1 : (pressed ? 0.9 : 0.65);
      const tailFollowBase = prefersReducedMotion ? 1 : (pressed ? 0.7 : 0.6);

      positions[0] = {
        x: lerp(positions[0].x, mouse.x, headFollow),
        y: lerp(positions[0].y, mouse.y, headFollow),
      };
      for (let i = 1; i < positions.length; i++) {
        // Pack later dots closer by increasing follow factor per index
        const tf = Math.min(0.94, tailFollowBase + i * 0.055);
        positions[i] = {
          x: lerp(positions[i].x, positions[i - 1].x, tf),
          y: lerp(positions[i].y, positions[i - 1].y, tf),
        };
      }

      // Paint
      for (let i = 0; i < dotRefs.current.length; i++) {
        const dot = dotRefs.current[i];
        const p = positions[i];
        if (!dot || !p) continue;
        const translate = `translate3d(${p.x - dot.offsetWidth / 2}px, ${p.y - dot.offsetHeight / 2}px, 0)`;
        dot.style.transform = translate;
        // Quicker falloff to form a dense comet tail
        const opacity = Math.max(0.18, 1 - i / (DOT_COUNT * 0.6));
        dot.style.opacity = String(opacity);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("custom-cursor-active");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DOT_COUNT, pointerIsFine, prefersReducedMotion]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
      aria-hidden
    >
      {Array.from({ length: DOT_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) dotRefs.current[i] = el;
          }}
          className="absolute rounded-full will-change-transform"
          style={{
            width: i === 0 ? 10 : Math.max(2, 7 - i),
            height: i === 0 ? 10 : Math.max(2, 7 - i),
            background: "var(--cursor-color, var(--primary))",
            boxShadow:
              i === 0
                ? "0 0 var(--cursor-blur-head, 22px) color-mix(in oklab, var(--cursor-shadow, var(--primary)) var(--cursor-glow-head, 65%), transparent)"
                : "0 0 var(--cursor-blur-tail, 14px) color-mix(in oklab, var(--cursor-shadow, var(--primary)) var(--cursor-glow-tail, 40%), transparent)",
            borderRadius: 9999,
            transition: "background-color 100ms ease, transform 16ms linear, box-shadow 100ms ease",
          }}
        />
      ))}
    </div>
  );
}


