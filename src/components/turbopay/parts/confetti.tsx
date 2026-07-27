"use client";

import * as React from "react";
import { toast } from "sonner";

interface ConfettiProps {
  /** When true, fires the confetti burst. */
  trigger: boolean;
  /** Number of confetti pieces to render. Defaults to 50. */
  count?: number;
}

// On-brand palette: emerald, amber, gold, white.
const COLORS = [
  "oklch(0.62 0.14 162)", // emerald
  "oklch(0.72 0.15 162)", // emerald light
  "oklch(0.80 0.13 75)", // amber
  "oklch(0.85 0.13 80)", // gold
  "oklch(0.95 0.05 85)", // cream
  "oklch(1 0 0)", // white
];

interface Piece {
  id: number;
  left: number; // vw position (0–100)
  color: string;
  duration: number; // 2–4s
  delay: number; // 0–0.5s
  rotation: number; // initial rotation deg
  drift: number; // horizontal drift in vw (negative = left)
  size: number; // 8–14px square-ish
}

function buildPieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const size = 8 + Math.random() * 6; // 8–14px
    return {
      id: i,
      left: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      duration: 2 + Math.random() * 2, // 2–4s
      delay: Math.random() * 0.5, // 0–0.5s
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 18, // -9..+9 vw
      size,
    };
  });
}

/**
 * Pure-CSS confetti burst. Renders a fixed full-viewport layer above all UI.
 *
 * - Fires when `trigger` flips to true.
 * - Pieces are rectangles (8–14px) with random color/rotation/duration.
 * - Falls using the `tp-confetti-fall` keyframe (defined in globals.css).
 * - Auto-cleans after 3s.
 * - Respects prefers-reduced-motion — shows a sonner toast instead.
 */
export function Confetti({ trigger, count = 50 }: ConfettiProps) {
  const [pieces, setPieces] = React.useState<Piece[]>([]);

  React.useEffect(() => {
    if (!trigger) return;

    // Respect users who prefer reduced motion.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      toast.success("Transaction successful", {
        description: "Your money is on its way.",
        icon: "🎉",
      });
      return;
    }

    const next = buildPieces(count);
    setPieces(next);

    // Auto-cleanup — animation completes within ~4.5s (max duration + max delay).
    // We use 3s as the burst visibility window for a snappy feel.
    const t = setTimeout(() => setPieces([]), 3000);
    return () => clearTimeout(t);
  }, [trigger, count]);

  if (pieces.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="tp-confetti-piece"
          style={{
            left: `${p.left}vw`,
            width: `${p.size}px`,
            height: `${p.size * 1.5}px`,
            background: p.color,
            transform: `rotate(${p.rotation}deg)`,
            // CSS custom props consumed by the keyframe in globals.css.
            ["--tp-confetti-drift" as any]: `${p.drift}vw`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export default Confetti;
