"use client";

import * as React from "react";
import { useApp, type ViewKey } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShieldCheck,
  Shield,
  ShieldAlert,
  Lock,
  Mail,
  KeyRound,
  Smartphone,
  Monitor,
  MapPin,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  LogIn,
  LogOut,
  RefreshCw,
  Clock,
  AlertTriangle,
  Fingerprint,
} from "lucide-react";
import { timeAgo, formatDate } from "@/lib/money";
import { toast } from "sonner";

interface SessionInfo {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  isCurrent: boolean;
}

interface AuditEvent {
  id: string;
  action: string;
  category: string;
  severity: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  metadata: string | null;
}

interface Checklist {
  hasPin: boolean;
  emailVerified: boolean;
  kycVerified: boolean;
}

interface SecurityData {
  sessions: SessionInfo[];
  events: AuditEvent[];
  checklist: Checklist;
}

function parseUA(ua: string | null | undefined): { device: string; browser: string } {
  if (!ua) return { device: "Unknown device", browser: "" };
  const device = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
    ? "Android"
    : /Mac/.test(ua)
    ? "Mac"
    : /Windows/.test(ua)
    ? "Windows PC"
    : /Linux/.test(ua)
    ? "Linux"
    : "Device";
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /Chrome/.test(ua)
    ? "Chrome"
    : /Firefox/.test(ua)
    ? "Firefox"
    : /Safari/.test(ua)
    ? "Safari"
    : "Browser";
  return { device, browser };
}

function severityTone(s: string): { icon: React.ReactNode; color: string } {
  switch (s.toUpperCase()) {
    case "CRITICAL":
      return { icon: <ShieldAlert className="h-4 w-4" />, color: "text-red-600 dark:text-red-400 bg-red-500/10" };
    case "ERROR":
      return { icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-600 dark:text-red-400 bg-red-500/10" };
    case "WARN":
      return { icon: <AlertTriangle className="h-4 w-4" />, color: "text-amber-600 dark:text-amber-400 bg-amber-500/10" };
    default:
      return { icon: <Shield className="h-4 w-4" />, color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" };
  }
}

function actionIcon(action: string): React.ReactNode {
  const a = action.toUpperCase();
  if (a.includes("LOGIN") || a.includes("SESSION")) return <LogIn className="h-4 w-4" />;
  if (a.includes("LOGOUT") || a.includes("REVOK")) return <LogOut className="h-4 w-4" />;
  if (a.includes("PIN")) return <KeyRound className="h-4 w-4" />;
  if (a.includes("PASSWORD")) return <Lock className="h-4 w-4" />;
  if (a.includes("KYC")) return <ShieldCheck className="h-4 w-4" />;
  if (a.includes("AML")) return <ShieldAlert className="h-4 w-4" />;
  return <Clock className="h-4 w-4" />;
}

export default function SecurityView() {
  const { setView } = useApp();
  const [data, setData] = React.useState<SecurityData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [revokeTarget, setRevokeTarget] = React.useState<SessionInfo | null>(null);
  const [revoking, setRevoking] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/security", { cache: "no-store" });
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load security info.");
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/security/sessions/${revokeTarget.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Failed to revoke session");
        return;
      }
      toast.success("Session revoked");
      setRevokeTarget(null);
      await load();
    } catch {
      toast.error("Network error");
    } finally {
      setRevoking(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Security Center" subtitle="Protect your account and devices" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // Risk score (simple)
  const cl = data?.checklist ?? { hasPin: false, emailVerified: false, kycVerified: false };
  let score = 0;
  if (cl.hasPin) score += 35;
  if (cl.emailVerified) score += 25;
  if (cl.kycVerified) score += 40;
  const riskLabel = score >= 80 ? "Low risk" : score >= 50 ? "Medium risk" : "High risk";
  const riskTone =
    score >= 80
      ? { color: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
      : score >= 50
      ? { color: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
      : { color: "text-red-600 dark:text-red-400", bar: "bg-red-500", badge: "bg-red-500/10 text-red-600 dark:text-red-400" };

  const checklistItems: {
    label: string;
    done: boolean;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    cta?: { view: ViewKey; label: string };
  }[] = [
    {
      label: "Transaction PIN",
      done: cl.hasPin,
      desc: cl.hasPin ? "PIN is set" : "Set a 4-digit PIN to authorize transactions",
      icon: KeyRound,
      cta: cl.hasPin ? undefined : { view: "settings", label: "Set PIN" },
    },
    {
      label: "Email verified",
      done: cl.emailVerified,
      desc: cl.emailVerified ? "Email confirmed" : "Verify your email to secure your account",
      icon: Mail,
      cta: cl.emailVerified ? undefined : { view: "settings", label: "Update email" },
    },
    {
      label: "KYC verified",
      done: cl.kycVerified,
      desc: cl.kycVerified ? "Identity verified" : "Verify NIN or BVN to unlock higher limits",
      icon: ShieldCheck,
      cta: cl.kycVerified ? undefined : { view: "kyc", label: "Verify KYC" },
    },
    {
      label: "Multi-factor authentication",
      done: false,
      desc: "Coming soon — add an extra layer of security",
      icon: Fingerprint,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Security Center"
        subtitle="Protect your account and devices"
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left col */}
        <div className="space-y-5 lg:col-span-2">
          {/* Risk score */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Account risk score</h2>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className={`text-3xl font-bold tabular-nums ${riskTone.color}`}>{score}/100</p>
                <Badge variant="secondary" className={`mt-1 ${riskTone.badge}`}>
                  {riskLabel}
                </Badge>
              </div>
              <p className="max-w-xs text-xs text-muted-foreground">
                Based on PIN, email verification, and KYC status. Complete more items to lower your risk.
              </p>
            </div>
            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${riskTone.bar} transition-all`} style={{ width: `${score}%` }} />
            </div>
          </Card>

          {/* Checklist */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Security checklist</h2>
            </div>
            <div className="space-y-2">
              {checklistItems.map((it) => (
                <div
                  key={it.label}
                  className="flex items-center gap-3 rounded-xl border p-3"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${it.done ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                    {it.done ? <CheckCircle2 className="h-5 w-5" /> : <it.icon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{it.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{it.desc}</p>
                  </div>
                  {it.cta ? (
                    <Button size="sm" variant="outline" onClick={() => setView(it.cta!.view)}>
                      {it.cta.label}
                    </Button>
                  ) : it.label === "Multi-factor authentication" ? (
                    <Badge variant="outline" className="text-amber-600 dark:text-amber-400">Coming soon</Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Recent security events */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Recent security events</h2>
            </div>
            {data?.events && data.events.length > 0 ? (
              <ul className="max-h-96 overflow-y-auto pr-1 scrollbar-thin">
                {data.events.map((ev) => {
                  const tone = severityTone(ev.severity);
                  return (
                    <li
                      key={ev.id}
                      className="flex items-start gap-3 border-b py-3 last:border-b-0 last:pb-0"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.color}`}>
                        {actionIcon(ev.action)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{ev.action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {ev.ip ?? "unknown IP"} · {formatDate(ev.createdAt, true)}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${tone.color}`}>
                        {ev.severity}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={Clock}
                title="No recent events"
                description="Security events will appear here."
              />
            )}
          </Card>
        </div>

        {/* Right col */}
        <div className="space-y-5">
          {/* Active sessions */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Active sessions</h2>
            </div>
            {data?.sessions && data.sessions.length > 0 ? (
              <ul className="space-y-2">
                {data.sessions.map((s) => {
                  const { device, browser } = parseUA(s.userAgent);
                  return (
                    <li
                      key={s.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 ${
                        s.isCurrent ? "border-emerald-500/40 bg-emerald-500/5" : ""
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        {device === "iPhone" || device === "Android" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {device} · {browser}
                          {s.isCurrent && (
                            <Badge variant="secondary" className="ml-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              This device
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.ip ?? "unknown IP"} · {timeAgo(s.createdAt)}
                        </p>
                      </div>
                      {!s.isCurrent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                          onClick={() => setRevokeTarget(s)}
                          aria-label="Revoke session"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={Monitor}
                title="No active sessions"
                description="Your session list is empty."
              />
            )}
          </Card>

          {/* Quick links */}
          <Card className="p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Quick security tips</h2>
            </div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                Use a unique password you don&apos;t reuse elsewhere.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                Never share your PIN with anyone — including Turbopay staff.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                Review active sessions and revoke unfamiliar devices.
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                Turbopay will never ask for your password or PIN by phone or email.
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget ? (
                <>
                  The device <span className="font-medium">{parseUA(revokeTarget.userAgent).device}</span> at{" "}
                  <span className="font-medium">{revokeTarget.ip ?? "unknown IP"}</span> will be signed out immediately.
                </>
              ) : (
                "This device will be signed out."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              disabled={revoking}
              className="gap-1.5 bg-red-600 hover:bg-red-700"
            >
              {revoking && <Loader2 className="h-4 w-4 animate-spin" />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
