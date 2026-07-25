"use client";

import * as React from "react";

export function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  const id = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-label="Turbopay logo"
    >
      <defs>
        <linearGradient id={`tp-grad-${id}`} x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="oklch(0.62 0.16 162)" />
          <stop offset="100%" stopColor="oklch(0.40 0.10 162)" />
        </linearGradient>
        <linearGradient id={`tp-bolt-${id}`} x1="20" y1="8" x2="28" y2="40">
          <stop offset="0%" stopColor="oklch(0.90 0.14 85)" />
          <stop offset="100%" stopColor="oklch(0.72 0.15 70)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#tp-grad-${id})`} />
      {/* speed lines */}
      <g opacity="0.45" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 18 H13" />
        <path d="M4 26 H11" />
        <path d="M6 34 H13" />
      </g>
      {/* lightning bolt T */}
      <path
        d="M26 9 L16 26 H23 L21 39 L33 21 H25 L27 9 Z"
        fill={`url(#tp-bolt-${id})`}
        className="tp-bolt-glow"
      />
    </svg>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span
      className="font-bold tracking-tight"
      style={{ fontSize: size, fontFamily: "var(--font-geist-sans)" }}
    >
      Turbo<span className="text-primary">pay</span>
    </span>
  );
}
