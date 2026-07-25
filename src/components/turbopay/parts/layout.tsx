"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "./animated-number";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "default" | "success" | "warning" | "danger";

const TONE_ICON_BG: Record<Tone, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
};

// Subtle background gradient per tone — very light, only visible on hover.
const TONE_GRADIENT: Record<Tone, string> = {
  default:
    "linear-gradient(135deg, color-mix(in oklch, var(--primary) 6%, transparent) 0%, transparent 60%)",
  success:
    "linear-gradient(135deg, color-mix(in oklch, var(--success) 8%, transparent) 0%, transparent 60%)",
  warning:
    "linear-gradient(135deg, color-mix(in oklch, var(--warning) 8%, transparent) 0%, transparent 60%)",
  danger:
    "linear-gradient(135deg, color-mix(in oklch, var(--destructive) 8%, transparent) 0%, transparent 60%)",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  animated = false,
  numericValue,
  format,
  duration,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  hint?: string;
  /** When true (and numericValue + format are provided), render the value with AnimatedNumber. */
  animated?: boolean;
  numericValue?: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const canAnimate =
    animated && typeof numericValue === "number" && typeof format === "function";
  return (
    <Card
      className="tp-card-hover tp-card-gradient relative overflow-hidden p-5"
      style={{ backgroundImage: TONE_GRADIENT[tone] }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONE_ICON_BG[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">
        {canAnimate ? (
          <AnimatedNumber value={numericValue as number} format={format} duration={duration ?? 800} />
        ) : (
          value
        )}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state SVG illustrations — rendered when `illustration` is set */
/* ------------------------------------------------------------------ */

type IllustrationName = "empty-wallet" | "no-transactions" | "no-data";

export function EmptyStateIllustration({
  name,
  className = "",
}: {
  name: IllustrationName;
  className?: string;
}) {
  // Shared 96×80 viewBox; emerald+amber brand palette only.
  const EM = "#10b981";
  const EM_DARK = "#047857";
  const AM = "#f59e0b";
  const SLATE = "#94a3b8";

  if (name === "empty-wallet") {
    return (
      <svg viewBox="0 0 96 80" fill="none" className={className} aria-hidden>
        {/* coin glow */}
        <circle cx="58" cy="34" r="20" fill={EM} opacity="0.10" />
        {/* wallet body */}
        <rect x="14" y="24" width="56" height="38" rx="8" fill="white" stroke={EM_DARK} strokeWidth="2" />
        <rect x="14" y="24" width="56" height="10" rx="8" fill={EM} opacity="0.18" />
        {/* flap */}
        <path d="M14 30 H60 a8 8 0 0 1 8 8 v0 H14 Z" fill={EM} opacity="0.25" />
        {/* coin slot empty */}
        <rect x="48" y="42" width="22" height="9" rx="4.5" fill={SLATE} opacity="0.18" />
        {/* floating coins */}
        <circle cx="72" cy="22" r="6" fill={AM} />
        <text x="72" y="25" textAnchor="middle" fontSize="7" fontWeight="700" fill="white">₦</text>
        <circle cx="82" cy="40" r="4" fill={EM} />
        <circle cx="22" cy="18" r="3" fill={AM} opacity="0.7" />
      </svg>
    );
  }
  if (name === "no-transactions") {
    return (
      <svg viewBox="0 0 96 80" fill="none" className={className} aria-hidden>
        {/* receipt */}
        <path
          d="M30 18 H58 a4 4 0 0 1 4 4 V62 l-5 -3 -5 3 -5 -3 -5 3 -5 -3 -5 3 V22 a4 4 0 0 1 4 -4 Z"
          fill="white"
          stroke={EM_DARK}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* lines */}
        <rect x="36" y="30" width="20" height="3" rx="1.5" fill={EM} opacity="0.35" />
        <rect x="36" y="38" width="14" height="3" rx="1.5" fill={SLATE} opacity="0.3" />
        <rect x="36" y="46" width="20" height="3" rx="1.5" fill={EM} opacity="0.35" />
        <rect x="36" y="54" width="10" height="3" rx="1.5" fill={AM} opacity="0.6" />
        {/* magnifier */}
        <circle cx="68" cy="46" r="9" fill="white" stroke={AM} strokeWidth="2.5" />
        <line x1="74" y1="52" x2="82" y2="60" stroke={AM} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  // no-data default — empty inbox / database
  return (
    <svg viewBox="0 0 96 80" fill="none" className={className} aria-hidden>
      {/* database stack */}
      <ellipse cx="48" cy="24" rx="22" ry="7" fill="white" stroke={EM_DARK} strokeWidth="2" />
      <path d="M26 24 V40 a22 7 0 0 0 44 0 V24" fill="white" stroke={EM_DARK} strokeWidth="2" />
      <ellipse cx="48" cy="24" rx="22" ry="7" fill={EM} opacity="0.12" />
      {/* second layer */}
      <path d="M26 40 V56 a22 7 0 0 0 44 0 V40" fill="white" stroke={EM_DARK} strokeWidth="2" />
      <path d="M26 40 a22 7 0 0 0 44 0" stroke={EM} strokeWidth="1.5" opacity="0.4" />
      {/* spark */}
      <circle cx="74" cy="20" r="4" fill={AM} />
      <circle cx="20" cy="48" r="3" fill={AM} opacity="0.7" />
    </svg>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  illustration,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  illustration?: IllustrationName;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
      {illustration ? (
        <EmptyStateIllustration name={illustration} className="h-20 w-24" />
      ) : Icon ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <p className="mt-4 font-medium">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
