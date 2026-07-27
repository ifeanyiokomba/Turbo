"use client";

// Team management tab for the Admin Console.
// Lists all TeamMembers with role/status badges, invited/last-login dates,
// and activate/deactivate actions. Includes an "Invite member" dialog.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  Loader2,
  Mail,
  User as UserIcon,
  ShieldCheck,
  CheckCircle2,
  CircleSlash,
  Clock,
  Trash2,
  RefreshCw,
  Users,
} from "lucide-react";
import { formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";
import { EmptyState } from "../../parts/layout";

interface TeamMember {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  invitedAt: string;
  activatedAt: string | null;
  deactivatedAt: string | null;
  lastLoginAt: string | null;
}

const ROLE_TONE: Record<string, string> = {
  ADMIN: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  COMPLIANCE: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  SUPPORT: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  FINANCE: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  PENDING: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DEACTIVATED: "bg-muted text-muted-foreground",
};

export default function TeamTab() {
  const [members, setMembers] = React.useState<TeamMember[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<TeamMember | null>(null);

  // Invite form
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [role, setRole] = React.useState<"ADMIN" | "COMPLIANCE" | "SUPPORT" | "FINANCE">("SUPPORT");
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/team", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load team members");
        return;
      }
      const data = await res.json();
      setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function openInvite() {
    setEmail("");
    setFullName("");
    setRole("SUPPORT");
    setInviteOpen(true);
  }

  async function submitInvite() {
    if (!email.trim() || !fullName.trim()) {
      toast.error("Email and full name are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to invite member");
        return;
      }
      toast.success(`Invite sent to ${data.member.email}`);
      setInviteOpen(false);
      load();
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(member: TeamMember, status: "ACTIVE" | "DEACTIVATED") {
    setBusy(member.id);
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update member");
        return;
      }
      toast.success(
        status === "ACTIVE" ? `${member.fullName} activated` : `${member.fullName} deactivated`
      );
      load();
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(member: TeamMember) {
    setBusy(member.id);
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to remove member");
        return;
      }
      toast.success(`${member.fullName} removed`);
      setConfirmDelete(null);
      load();
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Team members</h2>
            <p className="text-muted-foreground text-xs">
              Manage who has access to the Turbopay admin console.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={openInvite} className="gap-1.5">
              <UserPlus className="h-4 w-4" /> Invite member
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        {loading && !members ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : members && members.length > 0 ? (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left text-xs">
                    <th className="pr-2 pb-2 font-medium">Member</th>
                    <th className="pr-2 pb-2 font-medium">Email</th>
                    <th className="pr-2 pb-2 font-medium">Role</th>
                    <th className="pr-2 pb-2 font-medium">Status</th>
                    <th className="pr-2 pb-2 font-medium">Invited</th>
                    <th className="pr-2 pb-2 font-medium">Last login</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/40 border-t transition-colors">
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-2">
                          <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold">
                            {m.fullName
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()}
                          </div>
                          <span className="font-medium">{m.fullName}</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground py-3 pr-2 text-xs">{m.email}</td>
                      <td className="py-3 pr-2">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${ROLE_TONE[m.role] ?? ""}`}
                        >
                          {m.role}
                        </Badge>
                      </td>
                      <td className="py-3 pr-2">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${STATUS_TONE[m.status] ?? ""}`}
                        >
                          {m.status}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground py-3 pr-2 text-xs">
                        {formatDate(m.invitedAt)}
                      </td>
                      <td className="text-muted-foreground py-3 pr-2 text-xs">
                        {m.lastLoginAt ? timeAgo(m.lastLoginAt) : "Never"}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {m.status !== "ACTIVE" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === m.id}
                              onClick={() => updateStatus(m, "ACTIVE")}
                              className="h-7 gap-1 px-2 text-xs"
                            >
                              {busy === m.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              Activate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === m.id}
                              onClick={() => updateStatus(m, "DEACTIVATED")}
                              className="h-7 gap-1 px-2 text-xs"
                            >
                              {busy === m.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CircleSlash className="h-3 w-3" />
                              )}
                              Deactivate
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === m.id}
                            onClick={() => setConfirmDelete(m)}
                            className="h-7 px-2 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
                            aria-label={`Remove ${m.fullName}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {members.map((m) => (
                <div key={m.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold">
                        {m.fullName
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m.fullName}</p>
                        <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className={`text-[10px] ${ROLE_TONE[m.role] ?? ""}`}>
                      {m.role}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${STATUS_TONE[m.status] ?? ""}`}
                    >
                      {m.status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      Invited {formatDate(m.invitedAt)}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {m.status !== "ACTIVE" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === m.id}
                        onClick={() => updateStatus(m, "ACTIVE")}
                        className="h-8 flex-1 gap-1.5 text-xs"
                      >
                        {busy === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Activate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === m.id}
                        onClick={() => updateStatus(m, "DEACTIVATED")}
                        className="h-8 flex-1 gap-1.5 text-xs"
                      >
                        {busy === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CircleSlash className="h-3.5 w-3.5" />
                        )}
                        Deactivate
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === m.id}
                      onClick={() => setConfirmDelete(m)}
                      className="h-8 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={Users}
            title="No team members yet"
            description="Invite your first team member to give them access to the admin console."
          />
        )}
      </Card>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(o) => !submitting && setInviteOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="text-primary h-5 w-5" />
              Invite team member
            </DialogTitle>
            <DialogDescription>
              They&apos;ll receive an email invitation with onboarding instructions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Full name</Label>
              <div className="relative">
                <UserIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="inv-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ada Lovelace"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <div className="relative">
                <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="inv-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ada@turbopay.ng"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-role">Role</Label>
              <Select value={role} onValueChange={(v: typeof role) => setRole(v)}>
                <SelectTrigger id="inv-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" /> Admin — full access
                    </span>
                  </SelectItem>
                  <SelectItem value="COMPLIANCE">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-amber-500" /> Compliance — KYC/AML
                    </span>
                  </SelectItem>
                  <SelectItem value="SUPPORT">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-sky-500" /> Support — customers
                    </span>
                  </SelectItem>
                  <SelectItem value="FINANCE">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-violet-500" /> Finance — settlements
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg p-3 text-xs">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                New members start with <span className="font-medium">PENDING</span> status. Activate
                them once they&apos;ve completed onboarding.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitInvite} disabled={submitting} className="gap-1.5">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !busy && !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Remove team member?
            </DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="text-foreground font-medium">{confirmDelete?.fullName}</span> (
              {confirmDelete?.email}) from the team. They will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={!!busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && removeMember(confirmDelete)}
              disabled={!!busy}
              className="gap-1.5"
            >
              {busy === confirmDelete?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
