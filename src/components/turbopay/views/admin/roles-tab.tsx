"use client";

// Admin tab — Roles & Permissions (RBAC explorer).
//
// Shows the 10 declared admin roles with their permission counts, lets the
// admin click a role to see the full permission grid (grouped by category),
// and highlights the current user's role + their effective permissions.
//
// The role/permission catalog is imported directly from the pure-data
// modules `@/lib/turbocore/rbac/roles` and `@/lib/turbocore/rbac/permissions`
// (no server round-trip needed — they're just constants).

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Crown,
  Lock,
  Search,
  RefreshCw,
  UserCog,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../store";
import {
  ALL_ROLES,
  ROLE_META,
  ROLE_PERMISSIONS,
  Roles,
  type Role,
} from "@/lib/turbocore/rbac/roles";
import {
  PERMISSION_CATEGORIES,
  Permissions,
  TOTAL_PERMISSIONS,
  type Permission,
} from "@/lib/turbocore/rbac/permissions";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Returns the permission list for a role string (handles legacy "ADMIN"). */
function permissionsForRole(role: string): Permission[] {
  if (role === "ADMIN") return Object.values(Permissions);
  return ROLE_PERMISSIONS[role as Role] ?? [];
}

/** Friendly label for unknown/raw role strings (e.g. legacy "USER" / "ADMIN"). */
function roleLabel(role: string): string {
  if (role in ROLE_META) return ROLE_META[role as Role].label;
  if (role === "ADMIN") return "Administrator (legacy)";
  if (role === "USER") return "Standard user";
  return role;
}

/** Returns the count of permissions granted to `role`. */
function permissionCount(role: string): number {
  return permissionsForRole(role).length;
}

/** Tone class for a role's accent color (falls back to slate for unknown). */
function roleTone(role: string): string {
  if (role in ROLE_META) return ROLE_META[role as Role].tone;
  return "bg-slate-500/15 text-slate-600 dark:text-slate-300";
}

// ─── Component ────────────────────────────────────────────────────────

export default function RolesTab() {
  const { user } = useApp();
  const currentRole: string = user?.role ?? "USER";

  // Selected role for the detail panel — defaults to the current user's role.
  // If the current role is "USER" (no admin permissions), fall back to
  // SUPER_ADMIN so the admin can still see what full access looks like.
  const initialSelected: Role =
    currentRole in ROLE_META ? (currentRole as Role) : Roles.SUPER_ADMIN;

  const [selected, setSelected] = React.useState<Role>(initialSelected);
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  function copyRole(role: Role) {
    navigator.clipboard
      .writeText(role)
      .then(() => toast.success(`Copied "${role}"`))
      .catch(() => toast.error("Clipboard not available"));
  }

  const selectedPerms = permissionsForRole(selected);
  const currentPerms = permissionsForRole(currentRole);
  const isCurrent = selected === currentRole;

  return (
    <div className="space-y-5">
      {/* ─── "Your role" hero card ───────────────────────────────────── */}
      <Card className="relative overflow-hidden border-emerald-500/20 p-6">
        <div
          className="absolute inset-0 opacity-100"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--primary) 8%, transparent) 0%, transparent 55%), radial-gradient(circle at 90% 10%, color-mix(in oklch, var(--warning) 10%, transparent) 0%, transparent 45%)",
          }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Your role</h2>
                <Badge className={roleTone(currentRole)} variant="secondary">
                  {currentRole === "SUPER_ADMIN" && <Crown className="mr-1 h-3 w-3" />}
                  {roleLabel(currentRole)}
                </Badge>
                {currentRole === "ADMIN" && (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                    legacy
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1 max-w-xl text-sm">
                {currentRole in ROLE_META
                  ? ROLE_META[currentRole as Role].description
                  : currentRole === "ADMIN"
                    ? "Legacy admin role — implicitly granted every permission. Consider migrating to a more specific role."
                    : "Your account does not have an admin role assigned. You are viewing this screen because the admin console is accessible to elevated roles only."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:text-right">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              Effective permissions
            </p>
            <p className="text-2xl font-bold tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">{currentPerms.length}</span>
              <span className="text-muted-foreground"> / {TOTAL_PERMISSIONS}</span>
            </p>
            <div className="bg-muted h-1.5 w-40 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-500 transition-all"
                style={{
                  width: `${(currentPerms.length / TOTAL_PERMISSIONS) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Role picker grid ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">All roles</h3>
          <p className="text-muted-foreground text-xs">
            {ALL_ROLES.length} declared admin roles · {TOTAL_PERMISSIONS} granular permissions
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles or permissions…"
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border pr-3 pl-8 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {ALL_ROLES.map((role) => {
          const meta = ROLE_META[role];
          const count = permissionCount(role);
          const pct = Math.round((count / TOTAL_PERMISSIONS) * 100);
          const isActive = role === selected;
          const isYou = role === currentRole;
          const matchesQuery =
            !query ||
            role.toLowerCase().includes(query.toLowerCase()) ||
            meta.label.toLowerCase().includes(query.toLowerCase()) ||
            meta.description.toLowerCase().includes(query.toLowerCase()) ||
            ROLE_PERMISSIONS[role].some((p) => p.toLowerCase().includes(query.toLowerCase()));
          if (!matchesQuery) return null;
          return (
            <button
              key={role}
              type="button"
              onClick={() => setSelected(role)}
              className={`group relative flex flex-col gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-md ${
                isActive
                  ? "border-emerald-500/40 bg-emerald-500/5 shadow-sm"
                  : "border-border bg-card hover:border-emerald-500/30"
              }`}
            >
              {/* "You" pill */}
              {isYou && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="h-2.5 w-2.5" /> You
                </span>
              )}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${meta.tone}`}
                >
                  {role === Roles.SUPER_ADMIN ? (
                    <Crown className="h-3.5 w-3.5" />
                  ) : (
                    <UserCog className="h-3.5 w-3.5" />
                  )}
                </span>
                <Badge variant="secondary" className={`text-[10px] ${meta.tone}`}>
                  {role}
                </Badge>
              </div>
              <div>
                <p className="text-sm leading-tight font-semibold">{meta.label}</p>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                  {meta.description}
                </p>
              </div>
              <div className="mt-auto">
                <div className="text-muted-foreground mb-1 flex items-center justify-between text-[10px]">
                  <span>
                    {count} of {TOTAL_PERMISSIONS}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full transition-all ${
                      role === Roles.SUPER_ADMIN
                        ? "bg-gradient-to-r from-amber-500 to-red-500"
                        : "bg-gradient-to-r from-emerald-500 to-amber-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── Selected role detail ───────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${ROLE_META[selected].tone}`}
            >
              {selected === Roles.SUPER_ADMIN ? (
                <Crown className="h-4 w-4" />
              ) : (
                <UserCog className="h-4 w-4" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">{ROLE_META[selected].label}</h3>
                <Badge variant="secondary" className={`text-[10px] ${ROLE_META[selected].tone}`}>
                  {selected}
                </Badge>
                {isCurrent && (
                  <Badge
                    variant="outline"
                    className="gap-1 text-[10px] text-emerald-600 dark:text-emerald-400"
                  >
                    <Sparkles className="h-2.5 w-2.5" /> Your role
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-0.5 max-w-xl text-xs">
                {ROLE_META[selected].description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-muted-foreground text-[10px] tracking-wide uppercase">Granted</p>
              <p className="text-lg font-bold tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {selectedPerms.length}
                </span>
                <span className="text-muted-foreground"> / {TOTAL_PERMISSIONS}</span>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyRole(selected)}
              className="gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" /> Copy role key
            </Button>
          </div>
        </div>

        {/* Permission grid, grouped by category */}
        <div className="divide-border divide-y">
          {PERMISSION_CATEGORIES.map((cat) => {
            const grantedInCat = cat.permissions.filter((p) => selectedPerms.includes(p));
            const allGranted = grantedInCat.length === cat.permissions.length;
            const noneGranted = grantedInCat.length === 0;
            return (
              <div key={cat.label} className="px-5 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold">{cat.label}</h4>
                    <p className="text-muted-foreground text-xs">{cat.description}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      allGranted
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : noneGranted
                          ? "border-muted bg-muted text-muted-foreground"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {grantedInCat.length} / {cat.permissions.length}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {cat.permissions.map((perm) => {
                    const granted = selectedPerms.includes(perm);
                    const matches = !query || perm.toLowerCase().includes(query.toLowerCase());
                    if (!matches) return null;
                    return (
                      <TooltipProvider key={perm} delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${
                                granted
                                  ? "text-foreground border-emerald-500/20 bg-emerald-500/5"
                                  : "border-border bg-muted/30 text-muted-foreground"
                              }`}
                            >
                              {granted ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              ) : (
                                <XCircle className="text-muted-foreground/40 h-3.5 w-3.5 shrink-0" />
                              )}
                              <code
                                className={`font-mono text-[11px] ${
                                  granted
                                    ? "text-foreground"
                                    : "text-muted-foreground/70 decoration-muted-foreground/30 line-through"
                                }`}
                              >
                                {perm}
                              </code>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="font-mono text-[11px]">{perm}</p>
                            <p className="mt-1 text-[11px] opacity-90">
                              {granted
                                ? `Granted to ${ROLE_META[selected].label}`
                                : `Not granted to ${ROLE_META[selected].label}`}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ─── Footer legend ──────────────────────────────────────────── */}
      <div className="border-border bg-muted/20 text-muted-foreground flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Granted
          </span>
          <span className="flex items-center gap-1.5">
            <XCircle className="text-muted-foreground/40 h-3.5 w-3.5" />
            Not granted
          </span>
          <span className="flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-amber-500" />
            Super Admin = all permissions
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            searchRef.current?.focus();
          }}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reset filter
        </Button>
      </div>
    </div>
  );
}
