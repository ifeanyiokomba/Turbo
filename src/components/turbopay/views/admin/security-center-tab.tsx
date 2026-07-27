"use client";

// Admin tab — Security Center (TurboPay technical security posture)
//
// Surfaces the platform's runtime security posture:
//   1. Posture Dashboard     — 15 runtime checks + grade + summary cards
//   2. Security Headers      — OWASP header inventory + live header test
//   3. Threat Protection     — 10 attack-class cards (XSS, SQLi, CSRF, …)
//   4. Input Sanitization    — live sanitizer tester + reference table
//   5. Cookie Security       — TurboPay cookie inventory with attributes
//
// All runtime data is fetched from GET /api/admin/security-audit with
// cache: "no-store". The sanitizer tester imports the pure sanitizers from
// @/lib/security/sanitize (no crypto/Node deps — safe for the client).
//
// Color system: emerald (PASS), amber (WARN), rose (FAIL), slate (info).
// No indigo or blue-as-primary colors anywhere.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Lock,
  Key,
  Eye,
  Bug,
  Cookie,
  FileCode,
  Zap,
  Fingerprint,
  Scan,
  Globe,
  Server,
  Loader2,
  ChevronDown,
  ChevronUp,
  Terminal,
  Network,
  Clock,
  ShieldBan,
  type LucideIcon,
} from "lucide-react";
import {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUrl,
  detectSqlInjection,
  detectXss,
} from "@/lib/security/sanitize";

// ============================================================================
// Types — mirror the API contract at /api/admin/security-audit
// ============================================================================

type Status = "PASS" | "WARN" | "FAIL";

interface SecurityCheck {
  check: string;
  status: Status;
  message: string;
  details?: Record<string, unknown>;
}

interface SecurityPosture {
  checks: SecurityCheck[];
  summary: { pass: number; warn: number; fail: number; total: number };
  generatedAt: string;
  environment: string;
}

// ============================================================================
// Status tones — emerald (PASS), amber (WARN), rose (FAIL), slate (info)
// Tailwind needs literal class names to include them in the build, so every
// variant is spelled out inline.
// ============================================================================

interface StatusTone {
  /** Left-border color for check cards. */
  borderL: string;
  /** Full border color for badges / pills. */
  border: string;
  /** Subtle tinted background. */
  bg: string;
  /** Strong foreground text color. */
  text: string;
  /** Badge background + text combo. */
  badge: string;
  /** Icon component to render for this status. */
  icon: LucideIcon;
  /** Solid bar / progress fill color. */
  bar: string;
}

const STATUS_TONES: Record<Status, StatusTone> = {
  PASS: {
    borderL: "border-l-emerald-500",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    icon: CheckCircle2,
    bar: "bg-emerald-500",
  },
  WARN: {
    borderL: "border-l-amber-500",
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    icon: AlertTriangle,
    bar: "bg-amber-500",
  },
  FAIL: {
    borderL: "border-l-rose-500",
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    icon: XCircle,
    bar: "bg-rose-500",
  },
};

function toneFor(status: Status): StatusTone {
  return STATUS_TONES[status] ?? STATUS_TONES.PASS;
}

// ============================================================================
// Security headers — the OWASP set applied by src/middleware.ts
// ============================================================================

interface HeaderInfo {
  name: string;
  purpose: string;
  /** Truncated sample value (used in the inspector table). */
  sampleValue: string;
}

const SECURITY_HEADERS: HeaderInfo[] = [
  {
    name: "Content-Security-Policy",
    purpose: "Mitigates XSS by restricting script/style/asset sources.",
    sampleValue:
      "default-src 'self'; script-src 'self' 'nonce-{nonce}' 'strict-dynamic'; frame-ancestors 'none'; object-src 'none'…",
  },
  {
    name: "Strict-Transport-Security",
    purpose: "Forces HTTPS for 2 years, covers subdomains, preloaded.",
    sampleValue: "max-age=63072000; includeSubDomains; preload",
  },
  {
    name: "X-Frame-Options",
    purpose: "Blocks clickjacking — page cannot be framed.",
    sampleValue: "DENY",
  },
  {
    name: "X-Content-Type-Options",
    purpose: "Stops MIME-type sniffing — content-type is authoritative.",
    sampleValue: "nosniff",
  },
  {
    name: "Referrer-Policy",
    purpose: "Limits Referer header leakage to same-origin only.",
    sampleValue: "strict-origin-when-cross-origin",
  },
  {
    name: "Permissions-Policy",
    purpose: "Locks down powerful browser APIs (camera, mic, geo).",
    sampleValue: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    name: "Cross-Origin-Opener-Policy",
    purpose: "Isolates browsing context — blocks cross-origin window refs.",
    sampleValue: "same-origin",
  },
  {
    name: "Cross-Origin-Resource-Policy",
    purpose: "Restricts which origins may fetch this resource.",
    sampleValue: "same-origin",
  },
  {
    name: "Cross-Origin-Embedder-Policy",
    purpose: "Requires CORP/CORS on every cross-origin subresource.",
    sampleValue: "require-corp",
  },
  {
    name: "X-XSS-Protection",
    purpose: "Legacy XSS auditor for older browsers (IE/old Edge).",
    sampleValue: "1; mode=block",
  },
];

// ============================================================================
// Threat protections — every attack class TurboPay defends against
// ============================================================================

interface ThreatProtection {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  patternCount?: number;
  patternLabel?: string;
  status: Status;
  statusLabel: string;
}

const THREAT_PROTECTIONS: ThreatProtection[] = [
  {
    id: "xss",
    title: "XSS Prevention",
    description:
      "React auto-escaping + nonce-based CSP + input sanitization strip 20 known XSS patterns (scripts, event handlers, javascript: URIs).",
    icon: Bug,
    patternCount: 20,
    patternLabel: "XSS patterns blocked",
    status: "PASS",
    statusLabel: "Triple-layered defense",
  },
  {
    id: "sqli",
    title: "SQL Injection",
    description:
      "Prisma ORM parameterizes every query (no $queryRaw) + 12-pattern input sanitizer catches tautologies, UNION SELECT, DROP, xp_cmdshell.",
    icon: Server,
    patternCount: 12,
    patternLabel: "SQLi patterns detected",
    status: "PASS",
    statusLabel: "Parameterized + sanitized",
  },
  {
    id: "csrf",
    title: "CSRF",
    description:
      "Double-submit cookie pattern on every POST/PUT/PATCH/DELETE. Token sent in X-CSRF-Token header, validated against tp_csrf cookie.",
    icon: Key,
    status: "PASS",
    statusLabel: "All state-changing routes",
  },
  {
    id: "path-traversal",
    title: "Path Traversal",
    description:
      "Blocks ../, ..\\, %2e%2e, %2f, %5c sequences + strips null bytes that could truncate validation paths.",
    icon: FileCode,
    patternCount: 4,
    patternLabel: "patterns blocked",
    status: "PASS",
    statusLabel: "Null-byte stripped",
  },
  {
    id: "clickjacking",
    title: "Clickjacking",
    description:
      "X-Frame-Options: DENY + CSP frame-ancestors: 'none' — the page cannot be embedded in any frame, anywhere.",
    icon: Lock,
    status: "PASS",
    statusLabel: "Frame denied",
  },
  {
    id: "mime-sniffing",
    title: "MIME Sniffing",
    description:
      "X-Content-Type-Options: nosniff — browsers must honor the declared Content-Type and never sniff a response as executable.",
    icon: Scan,
    status: "PASS",
    statusLabel: "nosniff enforced",
  },
  {
    id: "downgrade",
    title: "Downgrade Attacks",
    description:
      "HSTS with 2-year max-age + includeSubDomains + preload. Once visited over HTTPS, the browser refuses HTTP for the domain.",
    icon: ShieldBan,
    status: "PASS",
    statusLabel: "2-year preload",
  },
  {
    id: "prototype-pollution",
    title: "Prototype Pollution",
    description:
      "sanitizeObject() strips __proto__, constructor, and prototype keys before they can reach Object.assign or merge utilities.",
    icon: Fingerprint,
    status: "PASS",
    statusLabel: "Keys stripped",
  },
  {
    id: "homoglyph",
    title: "Homoglyph Attacks",
    description:
      "Unicode normalization (NFKC) collapses lookalike Cyrillic/Greek characters into their ASCII equivalents before validation.",
    icon: Globe,
    status: "PASS",
    statusLabel: "NFKC normalized",
  },
  {
    id: "timing",
    title: "Timing Attacks",
    description:
      "CSRF token comparison uses Node's timingSafeEqual — constant-time, immune to side-channel timing analysis.",
    icon: Zap,
    status: "PASS",
    statusLabel: "Constant-time compare",
  },
];

// ============================================================================
// Cookies — TurboPay's session/security cookie inventory
// ============================================================================

interface CookieInfo {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  maxAge: string;
  purpose: string;
}

const COOKIES: CookieInfo[] = [
  {
    name: "tp_session",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: "30 min (sliding)",
    purpose: "Short-lived JWT session token — refreshed on activity.",
  },
  {
    name: "tp_refresh",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: "30 days",
    purpose: "Opaque refresh token used to mint new session JWTs.",
  },
  {
    name: "tp_csrf",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
    maxAge: "24 hours",
    purpose:
      "CSRF double-submit token. NOT HttpOnly — must be readable by JS so it can be sent in the X-CSRF-Token header.",
  },
  {
    name: "tp_oauth_state",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: "10 min",
    purpose: "OAuth2 state parameter — prevents login-flow CSRF.",
  },
];

// ============================================================================
// Sanitizers — reference table
// ============================================================================

interface SanitizerInfo {
  name: string;
  purpose: string;
  options: string;
}

const SANITIZERS: SanitizerInfo[] = [
  {
    name: "sanitizeString",
    purpose:
      "Trims, strips HTML tags, removes XSS + path traversal patterns, null bytes, NFKC normalizes, truncates.",
    options: "maxLength, allowBasicHtml, required",
  },
  {
    name: "sanitizeEmail",
    purpose:
      "sanitizeString + RFC 5322 simplified regex validation. Returns lowercased email or throws.",
    options: "(none)",
  },
  {
    name: "sanitizePhone",
    purpose:
      "sanitizeString + strips non-digits (preserves leading +). Validates 7–20 chars. E.164-ish output.",
    options: "(none)",
  },
  {
    name: "sanitizeUrl",
    purpose:
      "sanitizeString + URL parser. Blocks javascript: and data: schemes. Only https/http allowed.",
    options: "allowedSchemes (default https, http)",
  },
  {
    name: "sanitizeId",
    purpose: "sanitizeString + validates [A-Za-z0-9_-]+ format. Optional prefix check (e.g. usr_).",
    options: "prefix",
  },
  {
    name: "sanitizeObject",
    purpose:
      "Recursively sanitizes every string value in an object/array. Strips __proto__/constructor/prototype keys.",
    options: "maxLength",
  },
];

// ============================================================================
// Live-tester sanitizer registry
// ============================================================================

type SanitizerKey = "sanitizeString" | "sanitizeEmail" | "sanitizePhone" | "sanitizeUrl";

const SANITIZER_OPTIONS: { key: SanitizerKey; label: string }[] = [
  { key: "sanitizeString", label: "sanitizeString — general text" },
  { key: "sanitizeEmail", label: "sanitizeEmail — RFC 5322" },
  { key: "sanitizePhone", label: "sanitizePhone — E.164-ish" },
  { key: "sanitizeUrl", label: "sanitizeUrl — https/http only" },
];

const SLATE_TONE: StatusTone = {
  borderL: "border-l-slate-500",
  border: "border-slate-500/40",
  bg: "bg-slate-500/10",
  text: "text-slate-600 dark:text-slate-300",
  badge: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  icon: ShieldCheck,
  bar: "bg-slate-500",
};

// ============================================================================
// Grade computation
// ============================================================================

interface Grade {
  letter: string;
  tone: StatusTone;
  description: string;
}

function computeGrade(summary: { pass: number; warn: number; fail: number }): Grade {
  if (summary.fail >= 3) {
    return {
      letter: "F",
      tone: STATUS_TONES.FAIL,
      description: "Critical — 3 or more checks failing. Take immediate action.",
    };
  }
  if (summary.fail >= 1) {
    return {
      letter: "C",
      tone: STATUS_TONES.FAIL,
      description: "Needs attention — at least one failing check.",
    };
  }
  if (summary.warn === 0) {
    return {
      letter: "A+",
      tone: STATUS_TONES.PASS,
      description: "Excellent — every check passing, zero warnings.",
    };
  }
  if (summary.warn <= 2) {
    return {
      letter: "A",
      tone: STATUS_TONES.PASS,
      description: "Strong — 0 failures, only minor warnings.",
    };
  }
  if (summary.warn <= 5) {
    return {
      letter: "B",
      tone: STATUS_TONES.WARN,
      description: "Good — 0 failures, but several warnings worth addressing.",
    };
  }
  return {
    letter: "C",
    tone: STATUS_TONES.WARN,
    description: "Acceptable — many warnings, address when possible.",
  };
}

// ============================================================================
// Sub-tab definition
// ============================================================================

type SubTab = "posture" | "headers" | "threats" | "sanitizers" | "cookies";

interface SubTabDef {
  id: SubTab;
  label: string;
  icon: LucideIcon;
  description: string;
}

const SUB_TABS: SubTabDef[] = [
  {
    id: "posture",
    label: "Posture",
    icon: ShieldCheck,
    description: "Live runtime audit — 15 checks + overall grade.",
  },
  {
    id: "headers",
    label: "Headers",
    icon: FileCode,
    description: "OWASP security headers applied by middleware.",
  },
  {
    id: "threats",
    label: "Threats",
    icon: ShieldAlert,
    description: "Attack-class defenses — XSS, SQLi, CSRF, more.",
  },
  {
    id: "sanitizers",
    label: "Sanitizers",
    icon: Bug,
    description: "Live input sanitizer tester + reference.",
  },
  {
    id: "cookies",
    label: "Cookies",
    icon: Cookie,
    description: "Session, refresh, CSRF, OAuth cookies.",
  },
];

// ============================================================================
// Main component
// ============================================================================

export default function SecurityCenterTab() {
  const [data, setData] = React.useState<SecurityPosture | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [subTab, setSubTab] = React.useState<SubTab>("posture");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/security-audit", {
        cache: "no-store",
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(
          (e && typeof e === "object" && "error" in e ? String(e.error) : "") ||
            `HTTP ${res.status}`
        );
      }
      setData((await res.json()) as SecurityPosture);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Failed to load security posture: ${e.message}`
          : "Failed to load security posture"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const grade = React.useMemo(() => (data ? computeGrade(data.summary) : null), [data]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Security Center</h2>
            <p className="text-muted-foreground text-xs">
              Technical security posture · CSP · CSRF · XSS · Headers
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <Badge
              variant="outline"
              className={
                data.environment === "production"
                  ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/40 text-amber-600 dark:text-amber-400"
              }
            >
              <Globe className="h-3 w-3" />
              {data.environment}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Sub-tab switcher (state-based, not the shadcn Tabs component) */}
      <SubTabBar active={subTab} onChange={setSubTab} />

      <Separator />

      {/* Sub-tab content */}
      {loading && !data ? (
        <SecuritySkeleton />
      ) : data ? (
        <>
          {subTab === "posture" && (
            <PostureDashboardTab data={data} grade={grade} onRefresh={load} refreshing={loading} />
          )}
          {subTab === "headers" && <HeadersInspectorTab />}
          {subTab === "threats" && <ThreatProtectionTab />}
          {subTab === "sanitizers" && <SanitizersTab />}
          {subTab === "cookies" && <CookieSecurityTab />}
        </>
      ) : null}
    </div>
  );
}

// ============================================================================
// Sub-tab bar
// ============================================================================

function SubTabBar({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  return (
    <div className="flex w-full gap-1.5 overflow-x-auto pb-1">
      {SUB_TABS.map((t) => {
        const isActive = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={isActive}
            title={t.description}
            className={`inline-flex min-w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function SecuritySkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 1. Posture Dashboard sub-tab
// ============================================================================

function PostureDashboardTab({
  data,
  grade,
  onRefresh,
  refreshing,
}: {
  data: SecurityPosture;
  grade: Grade | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { summary } = data;

  const lastScanned = React.useMemo(() => {
    try {
      return new Date(data.generatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      });
    } catch {
      return data.generatedAt;
    }
  }, [data.generatedAt]);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Passing"
          value={summary.pass}
          hint={`of ${summary.total} checks`}
          tone={STATUS_TONES.PASS}
        />
        <SummaryCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Warnings"
          value={summary.warn}
          hint="non-blocking"
          tone={STATUS_TONES.WARN}
        />
        <SummaryCard
          icon={<XCircle className="h-5 w-5" />}
          label="Failing"
          value={summary.fail}
          hint={summary.fail === 0 ? "all clear" : "needs attention"}
          tone={STATUS_TONES.FAIL}
        />
        <SummaryCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Total Checks"
          value={summary.total}
          hint={data.environment}
          tone={SLATE_TONE}
        />
      </div>

      {/* Grade + meta */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {grade && (
              <div
                className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl border-2 ${grade.tone.border} ${grade.tone.bg}`}
              >
                <span className={`text-3xl font-black tracking-tighter ${grade.tone.text}`}>
                  {grade.letter}
                </span>
                <span className="text-muted-foreground text-[9px] font-semibold tracking-widest uppercase">
                  Grade
                </span>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                Overall Security Grade
              </p>
              <p className="text-base font-semibold tracking-tight sm:text-lg">
                {grade?.description ?? "Calculating…"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  <Clock className="h-3 w-3" />
                  Last scanned: {lastScanned}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    data.environment === "production"
                      ? "border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-400"
                      : "border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
                  }
                >
                  <Globe className="h-3 w-3" />
                  {data.environment}
                </Badge>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="shrink-0"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Re-run audit
          </Button>
        </div>
        {/* Grade rubric */}
        <div className="bg-muted/30 border-t p-4">
          <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
            Grade Rubric
          </p>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <GradePill letter="A+" tone={STATUS_TONES.PASS} desc="0 fail / 0 warn" />
            <GradePill letter="A" tone={STATUS_TONES.PASS} desc="0 fail / ≤2 warn" />
            <GradePill letter="B" tone={STATUS_TONES.WARN} desc="0 fail / ≤5 warn" />
            <GradePill letter="C" tone={STATUS_TONES.FAIL} desc="1+ fail" />
            <GradePill letter="F" tone={STATUS_TONES.FAIL} desc="3+ fail" />
          </div>
        </div>
      </Card>

      {/* Full check list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scan className="text-primary h-4 w-4" />
            <h3 className="text-sm font-semibold">Runtime Checks</h3>
            <Badge variant="secondary" className="text-[10px]">
              {data.checks.length} total
            </Badge>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.checks.map((c, i) => (
            <CheckCard key={`${c.check}-${i}`} check={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GradePill({ letter, tone, desc }: { letter: string; tone: StatusTone; desc: string }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${tone.border} ${tone.bg}`}
    >
      <span className={`text-xs font-bold ${tone.text}`}>{letter}</span>
      <span className="text-muted-foreground text-[10px]">{desc}</span>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  tone: StatusTone;
}) {
  return (
    <Card className={`border-l-4 p-4 ${tone.borderL}`}>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
    </Card>
  );
}

function CheckCard({ check }: { check: SecurityCheck }) {
  const [expanded, setExpanded] = React.useState(false);
  const tone = toneFor(check.status);
  const Icon = tone.icon;

  const detailRows = React.useMemo(() => {
    if (!check.details) return [];
    return Object.entries(check.details).map(([k, v]) => ({
      key: k,
      value: Array.isArray(v)
        ? v.join(", ")
        : typeof v === "object" && v !== null
          ? JSON.stringify(v)
          : String(v),
    }));
  }, [check.details]);

  return (
    <Card className={`overflow-hidden border-l-4 p-0 ${tone.borderL}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">{check.check}</p>
              <Badge variant="outline" className={`text-[10px] ${tone.badge}`}>
                {check.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{check.message}</p>
          </div>
        </div>

        {detailRows.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px] font-medium transition-colors"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Hide details" : `Details (${detailRows.length})`}
            </button>
            {expanded && (
              <div className="bg-muted/30 mt-2 space-y-1 rounded-lg border p-3">
                {detailRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2"
                  >
                    <code className="text-muted-foreground shrink-0 font-mono text-[11px]">
                      {row.key}:
                    </code>
                    <code className="text-foreground font-mono text-[11px] break-all">
                      {row.value}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// 2. Security Headers Inspector sub-tab
// ============================================================================

interface LiveHeader {
  name: string;
  value: string;
}

function HeadersInspectorTab() {
  const [liveHeaders, setLiveHeaders] = React.useState<LiveHeader[] | null>(null);
  const [testing, setTesting] = React.useState(false);

  const testLive = React.useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/security-audit", { cache: "no-store" });
      const collected: LiveHeader[] = [];
      res.headers.forEach((value, name) => {
        collected.push({ name, value });
      });
      collected.sort((a, b) => a.name.localeCompare(b.name));
      setLiveHeaders(collected);
      toast.success(
        `Captured ${collected.length} response headers from /api/admin/security-audit.`
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? `Live header test failed: ${e.message}` : "Live header test failed"
      );
    } finally {
      setTesting(false);
    }
  }, []);

  const liveHeaderMap = React.useMemo(() => {
    const map = new Map<string, string>();
    if (liveHeaders) {
      for (const h of liveHeaders) map.set(h.name.toLowerCase(), h.value);
    }
    return map;
  }, [liveHeaders]);

  return (
    <div className="space-y-4">
      <SubTabHeader
        icon={<FileCode className="h-5 w-5" />}
        title="Security Headers Inspector"
        description="OWASP-recommended response headers applied by src/middleware.ts on every route."
        stats={[
          { label: "Headers", value: SECURITY_HEADERS.length },
          { label: "Source", value: "middleware.ts" },
        ]}
      />

      {/* Header inventory table */}
      <Card className="p-0">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0 z-10">
              <tr className="text-left text-xs">
                <th className="px-3 py-2 font-medium">Header</th>
                <th className="px-3 py-2 font-medium">Value (truncated)</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {SECURITY_HEADERS.map((h) => {
                const live = liveHeaderMap.get(h.name.toLowerCase());
                return (
                  <tr key={h.name} className="hover:bg-muted/30 border-t">
                    <td className="px-3 py-2 align-top">
                      <code className="text-foreground font-mono text-xs font-semibold">
                        {h.name}
                      </code>
                    </td>
                    <td className="text-muted-foreground max-w-[24rem] px-3 py-2 align-top">
                      <code className="block truncate font-mono text-[11px]">
                        {live ?? h.sampleValue}
                      </code>
                    </td>
                    <td className="text-muted-foreground max-w-[20rem] px-3 py-2 align-top text-xs">
                      {h.purpose}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {live ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Verified live
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Configured
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Live header test */}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Network className="text-primary h-5 w-5" />
            <h3 className="text-sm font-semibold">Live Header Test</h3>
          </div>
          <Button variant="outline" size="sm" onClick={testLive} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Test Live Headers
          </Button>
        </div>
        <p className="text-muted-foreground mb-4 text-xs">
          Performs a real <code className="font-mono">fetch()</code> to{" "}
          <code className="font-mono">/api/admin/security-audit</code> and lists every response
          header the browser can see — including the CSP, HSTS, and other security headers injected
          by middleware.
        </p>

        {liveHeaders ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {liveHeaders.length} headers captured
              </Badge>
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-3 w-3" />
                Live
              </Badge>
            </div>
            <ScrollArea className="max-h-96 rounded-lg border">
              <div className="divide-y">
                {liveHeaders.map((h) => (
                  <div
                    key={h.name}
                    className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
                  >
                    <code className="text-foreground shrink-0 font-mono text-xs font-semibold sm:w-64">
                      {h.name}
                    </code>
                    <code className="text-muted-foreground font-mono text-[11px] break-all">
                      {h.value}
                    </code>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-6 text-xs">
            <Terminal className="h-4 w-4" />
            Click <span className="font-semibold">Test Live Headers</span> to fetch the actual
            response headers.
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// 3. Threat Protection sub-tab
// ============================================================================

function ThreatProtectionTab() {
  const totalPatterns = React.useMemo(
    () => THREAT_PROTECTIONS.reduce((acc, t) => acc + (t.patternCount ?? 0), 0),
    []
  );

  return (
    <div className="space-y-4">
      <SubTabHeader
        icon={<ShieldAlert className="h-5 w-5" />}
        title="Threat Protection"
        description="Every attack class TurboPay defends against, with the defense pattern and detection coverage."
        stats={[
          { label: "Layers", value: THREAT_PROTECTIONS.length },
          { label: "Patterns", value: totalPatterns },
          { label: "Status", value: "ALL PASS" },
        ]}
      />

      {/* Defense-in-depth banner */}
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                Defense in Depth
              </p>
              <p className="text-base font-semibold tracking-tight sm:text-lg">
                No single point of security failure.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Each attack class is defended at multiple layers — input sanitization, framework
                safety, ORM parameterization, HTTP headers, and runtime checks.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          >
            {THREAT_PROTECTIONS.length} layers active
          </Badge>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {THREAT_PROTECTIONS.map((t) => {
          const tone = toneFor(t.status);
          const Icon = t.icon;
          return (
            <Card key={t.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <Badge variant="outline" className={`text-[10px] ${tone.badge}`}>
                  <CheckCircle2 className="h-3 w-3" />
                  {t.status}
                </Badge>
              </div>
              <p className="mt-3 text-sm font-semibold tracking-tight">{t.title}</p>
              <p className="text-muted-foreground mt-1 flex-1 text-xs leading-relaxed">
                {t.description}
              </p>
              <Separator className="my-3" />
              <div className="flex flex-wrap items-center gap-2">
                {t.patternCount !== undefined && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t.patternCount} {t.patternLabel}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className="border-slate-500/40 text-[10px] text-slate-600 dark:text-slate-300"
                >
                  {t.statusLabel}
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 4. Input Sanitization sub-tab — live tester + reference
// ============================================================================

interface SanitizeResult {
  ok: boolean;
  output: string;
  error?: string;
  detectedXss: boolean;
  detectedSqli: boolean;
  inputLength: number;
  outputLength: number;
}

function runSanitizer(key: SanitizerKey, input: string): SanitizeResult {
  const inputLength = input.length;
  const detectedXss = detectXss(input);
  const detectedSqli = detectSqlInjection(input);
  try {
    let output: string;
    switch (key) {
      case "sanitizeString":
        output =
          (sanitizeString(input, { maxLength: 1000 }) as any).sanitized ??
          (sanitizeString(input, { maxLength: 1000 }) as any);
        break;
      case "sanitizeEmail":
        output = (sanitizeEmail(input) as any).sanitized ?? (sanitizeEmail(input) as any);
        break;
      case "sanitizePhone":
        output = (sanitizePhone(input) as any).sanitized ?? (sanitizePhone(input) as any);
        break;
      case "sanitizeUrl":
        output = (sanitizeUrl(input) as any).sanitized ?? (sanitizeUrl(input) as any);
        break;
      default:
        output = "";
    }
    return {
      ok: true,
      output,
      detectedXss,
      detectedSqli,
      inputLength,
      outputLength: output.length,
    };
  } catch (e) {
    return {
      ok: false,
      output: "",
      error: e instanceof Error ? e.message : String(e),
      detectedXss,
      detectedSqli,
      inputLength,
      outputLength: 0,
    };
  }
}

const SANITIZER_PRESETS: { label: string; value: string }[] = [
  { label: "XSS — script tag", value: "<script>alert('xss')</script>Hello John" },
  { label: "XSS — event handler", value: "<img src=x onerror=alert(1)> avatar" },
  { label: "SQLi — tautology", value: "' OR 1=1 --" },
  { label: "SQLi — DROP TABLE", value: "1; DROP TABLE users; --" },
  { label: "Path traversal", value: "../../etc/passwd" },
  { label: "Email — valid", value: "  John.Doe@Example.com  " },
  { label: "Phone — messy", value: "+1 (555) 123-4567 ext 89" },
  { label: "URL — javascript scheme", value: "javascript:alert(document.cookie)" },
];

function SanitizersTab() {
  const [input, setInput] = React.useState("<script>alert('xss')</script>Hello John");
  const [sanitizer, setSanitizer] = React.useState<SanitizerKey>("sanitizeString");
  const [result, setResult] = React.useState<SanitizeResult | null>(null);

  const onSanitize = React.useCallback(() => {
    setResult(runSanitizer(sanitizer, input));
  }, [sanitizer, input]);

  // Auto-run on first mount (and whenever the input/sanitizer changes) so the
  // user always sees a fresh output without manually clicking Sanitize.
  React.useEffect(() => {
    setResult(runSanitizer(sanitizer, input));
  }, [sanitizer, input]);

  return (
    <div className="space-y-4">
      <SubTabHeader
        icon={<Bug className="h-5 w-5" />}
        title="Input Sanitization"
        description="Every user-supplied string is sanitized before it touches the DB, ledger, or provider APIs. Try it live."
        stats={[
          { label: "Sanitizers", value: SANITIZERS.length },
          { label: "XSS patterns", value: 20 },
          { label: "SQLi patterns", value: 12 },
        ]}
      />

      {/* Live tester */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="text-primary h-5 w-5" />
            <h3 className="text-sm font-semibold">Live Sanitizer Tester</h3>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            Client-side · pure functions
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Input */}
          <div className="space-y-2">
            <Label htmlFor="san-input" className="text-xs">
              Input
            </Label>
            <Textarea
              id="san-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={5}
              className="font-mono text-xs"
              placeholder="Type or paste suspicious input…"
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[180px] flex-1">
                <Select value={sanitizer} onValueChange={(v) => setSanitizer(v as SanitizerKey)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a sanitizer" />
                  </SelectTrigger>
                  <SelectContent>
                    {SANITIZER_OPTIONS.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={onSanitize} size="sm">
                <Zap className="h-4 w-4" />
                Sanitize
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SANITIZER_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setInput(p.value);
                    setResult(runSanitizer(sanitizer, p.value));
                  }}
                  className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-2 py-1 text-[10px] transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Output */}
          <div className="space-y-2">
            <Label className="text-xs">Output</Label>
            <div className="bg-muted/30 min-h-[8rem] rounded-md border p-3">
              {result ? (
                result.ok ? (
                  <code className="text-foreground block font-mono text-xs break-all">
                    {result.output || "(empty string)"}
                  </code>
                ) : (
                  <div className="flex items-start gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <div>
                      <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                        Sanitizer rejected the input
                      </p>
                      <code className="text-muted-foreground mt-1 block font-mono text-[11px] break-all">
                        {result.error}
                      </code>
                    </div>
                  </div>
                )
              ) : (
                <p className="text-muted-foreground text-xs">
                  Click <span className="font-semibold">Sanitize</span> to run.
                </p>
              )}
            </div>

            {result && (
              <div className="grid grid-cols-2 gap-2">
                <DetectionBadge label="XSS detected" detected={result.detectedXss} />
                <DetectionBadge label="SQLi detected" detected={result.detectedSqli} />
              </div>
            )}
            {result && result.ok && (
              <div className="text-muted-foreground flex items-center justify-between text-[10px]">
                <span>Input: {result.inputLength} chars</span>
                <span>→</span>
                <span>Output: {result.outputLength} chars</span>
                <span>·</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  Δ {result.inputLength - result.outputLength} stripped
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Reference table */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileCode className="text-primary h-5 w-5" />
          <h3 className="text-sm font-semibold">Sanitizer Reference</h3>
          <Badge variant="secondary" className="ml-auto text-[10px]">
            src/lib/security/sanitize.ts
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs">
                <th className="px-3 py-2 font-medium">Function</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Options</th>
              </tr>
            </thead>
            <tbody>
              {SANITIZERS.map((s) => (
                <tr key={s.name} className="hover:bg-muted/30 border-t">
                  <td className="px-3 py-2 align-top">
                    <code className="text-foreground font-mono text-xs font-semibold">
                      {s.name}
                    </code>
                  </td>
                  <td className="text-muted-foreground max-w-[28rem] px-3 py-2 align-top text-xs">
                    {s.purpose}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
                      {s.options}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DetectionBadge({ label, detected }: { label: string; detected: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-md border px-2 py-1.5 ${
        detected ? "border-rose-500/40 bg-rose-500/10" : "border-emerald-500/40 bg-emerald-500/10"
      }`}
    >
      <span
        className={`text-[11px] font-medium ${
          detected ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {label}
      </span>
      {detected ? (
        <XCircle className="h-3.5 w-3.5 text-rose-500" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      )}
    </div>
  );
}

// ============================================================================
// 5. Cookie Security sub-tab
// ============================================================================

function CookieSecurityTab() {
  const httpOnlyCount = React.useMemo(() => COOKIES.filter((c) => c.httpOnly).length, []);
  const secureCount = React.useMemo(() => COOKIES.filter((c) => c.secure).length, []);

  return (
    <div className="space-y-4">
      <SubTabHeader
        icon={<Cookie className="h-5 w-5" />}
        title="Cookie Security"
        description="Every cookie TurboPay sets, with its security attributes and purpose."
        stats={[
          { label: "Cookies", value: COOKIES.length },
          { label: "HttpOnly", value: httpOnlyCount },
          { label: "Secure", value: secureCount },
        ]}
      />

      {/* Defense banner */}
      <Card className="border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
              Why tp_csrf is not HttpOnly
            </p>
            <p className="text-sm font-semibold tracking-tight">
              The CSRF cookie must be readable by JavaScript.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              The double-submit pattern requires the client to read the token from the cookie and
              echo it in the <code className="font-mono">X-CSRF-Token</code> header on
              POST/PUT/DELETE requests. Session and refresh tokens, by contrast, are HttpOnly —
              JavaScript can never read them.
            </p>
          </div>
        </div>
      </Card>

      {/* Cookies table */}
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs">
                <th className="px-3 py-2 font-medium">Cookie</th>
                <th className="px-3 py-2 font-medium">HttpOnly</th>
                <th className="px-3 py-2 font-medium">Secure</th>
                <th className="px-3 py-2 font-medium">SameSite</th>
                <th className="px-3 py-2 font-medium">Max-Age</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((c) => (
                <tr key={c.name} className="hover:bg-muted/30 border-t">
                  <td className="px-3 py-2 align-top">
                    <code className="text-foreground font-mono text-xs font-semibold">
                      {c.name}
                    </code>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <BoolPill value={c.httpOnly} tone="emerald" />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <BoolPill value={c.secure} tone="emerald" />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Badge
                      variant="outline"
                      className="border-slate-500/40 text-[10px] text-slate-600 dark:text-slate-300"
                    >
                      {c.sameSite}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-3 py-2 align-top text-xs">{c.maxAge}</td>
                  <td className="text-muted-foreground max-w-[24rem] px-3 py-2 align-top text-xs">
                    {c.purpose}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Cookie attribute reference */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="text-primary h-5 w-5" />
          <h3 className="text-sm font-semibold">Attribute Reference</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AttrRef
            name="HttpOnly"
            description="Cookie is invisible to document.cookie — immune to XSS theft."
          />
          <AttrRef
            name="Secure"
            description="Cookie is only sent over HTTPS — never leaks on plain HTTP."
          />
          <AttrRef
            name="SameSite=Lax"
            description="Cookie is sent on top-level navigations, but blocked on cross-site POSTs (CSRF defense)."
          />
          <AttrRef
            name="Max-Age"
            description="Cookie lifetime in seconds. Short-lived sessions limit window of compromise."
          />
          <AttrRef
            name="Path=/"
            description="Cookie is sent on every path — broadest valid scope."
          />
          <AttrRef
            name="Domain"
            description="Omitted — cookie is host-only, never sent to subdomains."
          />
        </div>
      </Card>
    </div>
  );
}

function BoolPill({ value, tone }: { value: boolean; tone: "emerald" | "amber" | "rose" }) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  if (!value) {
    return (
      <Badge
        variant="outline"
        className="border-slate-500/40 text-[10px] text-slate-500 dark:text-slate-400"
      >
        No
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`text-[10px] ${toneClass}`}>
      <CheckCircle2 className="h-3 w-3" />
      Yes
    </Badge>
  );
}

function AttrRef({ name, description }: { name: string; description: string }) {
  return (
    <div className="bg-muted/30 rounded-lg border p-3">
      <code className="text-foreground font-mono text-xs font-semibold">{name}</code>
      <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">{description}</p>
    </div>
  );
}

// ============================================================================
// Shared sub-tab header
// ============================================================================

function SubTabHeader({
  icon,
  title,
  description,
  stats,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  stats: { label: string; value: number | string }[];
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            <p className="text-muted-foreground text-xs">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {stats.map((s) => (
            <div key={s.label} className="text-right">
              <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                {s.label}
              </p>
              <p className="text-lg font-bold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
