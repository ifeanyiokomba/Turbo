"use client";

import * as React from "react";

/**
 * AnimatedNumber — animates a numeric value from previous→next using
 * requestAnimationFrame with an ease-out curve. Renders the formatted
 * string. Falls back instantly to the target value when reduced-motion
 * is requested, or when the duration is 0.
 */
export function AnimatedNumber({
  value,
  duration = 800,
  format,
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const formatter = format ?? ((n: number) => Math.round(n).toLocaleString());
  const [display, setDisplay] = React.useState<number>(value);
  const fromRef = React.useRef<number>(value);
  const rafRef = React.useRef<number | null>(null);
  const startRef = React.useRef<number>(0);

  // Respect prefers-reduced-motion
  const prefersReduced = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  React.useEffect(() => {
    // Cancel any in-flight animation
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // No-op when value unchanged
    if (value === display) return;

    // Skip animation for reduced motion or zero duration
    if (prefersReduced || duration <= 0) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    fromRef.current = display;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setDisplay(value);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration, prefersReduced]);

  return <span className={className}>{formatter(display)}</span>;
}
