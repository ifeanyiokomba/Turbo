"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  UserPlus,
  Star,
  Trash2,
  Send,
  Search,
  RefreshCw,
  CheckCircle2,
  Landmark,
  ArrowLeftRight,
} from "lucide-react";
import { UNIQUE_BANKS } from "@/lib/banks";
import { toast } from "sonner";

interface Beneficiary {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string;
  bankCode: string | null;
  type: string;
  isFavorite: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function BeneficiariesView() {
  const { setView } = useApp();
  const [list, setList] = React.useState<Beneficiary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");

  const [addOpen, setAddOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    accountNumber: "",
    bankCode: "",
    bankName: "",
    type: "BANK" as "BANK" | "TURBOPAY",
  });

  const [toDelete, setToDelete] = React.useState<Beneficiary | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/beneficiaries", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setList(json.beneficiaries ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setForm({
      name: "",
      accountNumber: "",
      bankCode: "",
      bankName: "",
      type: "BANK",
    });
  }

  async function addBeneficiary() {
    if (!form.name.trim()) {
      toast.error("Enter beneficiary name");
      return;
    }
    if (!form.accountNumber.trim()) {
      toast.error("Enter account number");
      return;
    }
    if (form.type === "BANK" && !form.bankCode) {
      toast.error("Select a bank");
      return;
    }
    setSaving(true);
    try {
      const bank = UNIQUE_BANKS.find((b) => b.code === form.bankCode);
      const res = await fetch("/api/beneficiaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          accountNumber: form.accountNumber.trim(),
          bankName: form.type === "TURBOPAY" ? "Turbopay MFB" : bank?.name ?? "",
          bankCode: form.type === "TURBOPAY" ? "000" : form.bankCode,
          type: form.type,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not save beneficiary");
        return;
      }
      toast.success("Beneficiary added");
      setAddOpen(false);
      resetForm();
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleFavorite(b: Beneficiary) {
    const next = !b.isFavorite;
    setList((arr) =>
      arr.map((x) => (x.id === b.id ? { ...x, isFavorite: next } : x)),
    );
    try {
      await fetch(`/api/beneficiaries/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      });
    } catch {
      setList((arr) =>
        arr.map((x) => (x.id === b.id ? { ...x, isFavorite: !next } : x)),
      );
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const prev = list;
    setList((arr) => arr.filter((x) => x.id !== toDelete.id));
    setToDelete(null);
    try {
      const res = await fetch(`/api/beneficiaries/${toDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Beneficiary removed");
    } catch {
      setList(prev);
      toast.error("Could not delete beneficiary");
    }
  }

  function sendTo(b: Beneficiary) {
    // Persist prefill via setView("transfer"); transfer view loads beneficiaries itself
    setView("transfer");
    // Best-effort: store the chosen id so transfer view can prefill on mount
    try {
      sessionStorage.setItem("tp_prefill_beneficiary", b.id);
    } catch {}
  }

  const filtered = list.filter((b) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      b.name.toLowerCase().includes(q) ||
      b.accountNumber.includes(q) ||
      b.bankName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="Beneficiaries"
        subtitle="Manage your saved recipients for faster transfers."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="gap-1.5"
            >
              <UserPlus className="h-4 w-4" /> Add beneficiary
            </Button>
          </>
        }
      />

      <Card className="p-5">
        {/* Search */}
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, account or bank"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary" className="gap-1">
            {filtered.length} saved
          </Badge>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title={query ? "No matches" : "No beneficiaries yet"}
            description={
              query
                ? "Try a different search term."
                : "Add your first beneficiary to send money faster."
            }
            action={
              !query && (
                <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
                  <UserPlus className="h-4 w-4" /> Add beneficiary
                </Button>
              )
            }
          />
        ) : (
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
            {filtered.map((b) => (
              <div
                key={b.id}
                className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/40"
              >
                <button
                  onClick={() => toggleFavorite(b)}
                  className="shrink-0 p-1"
                  title={b.isFavorite ? "Unfavorite" : "Favorite"}
                >
                  <Star
                    className={`h-4 w-4 ${
                      b.isFavorite
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {b.type === "TURBOPAY" ? (
                    <ArrowLeftRight className="h-4 w-4" />
                  ) : (
                    <Landmark className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.accountNumber} · {b.bankName}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {b.type === "TURBOPAY" ? "Turbopay" : "Bank"}
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0 gap-1.5"
                  onClick={() => sendTo(b)}
                >
                  <Send className="h-3.5 w-3.5" /> Send
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setToDelete(b)}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add beneficiary dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add beneficiary</DialogTitle>
            <DialogDescription>
              Save a recipient so you can send to them in seconds.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Beneficiary type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      type: "BANK",
                      bankCode: "",
                      bankName: "",
                    }))
                  }
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                    form.type === "BANK"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Landmark className="h-4 w-4" /> Bank
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      type: "TURBOPAY",
                      bankCode: "000",
                      bankName: "Turbopay MFB",
                    }))
                  }
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                    form.type === "TURBOPAY"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <ArrowLeftRight className="h-4 w-4" /> Turbopay
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ben-name">Name</Label>
              <Input
                id="ben-name"
                placeholder="e.g. John Doe"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {form.type === "BANK" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ben-bank">Bank</Label>
                  <Select
                    value={form.bankCode}
                    onValueChange={(v) => {
                      const bank = UNIQUE_BANKS.find((b) => b.code === v);
                      setForm((f) => ({
                        ...f,
                        bankCode: v,
                        bankName: bank?.name ?? "",
                      }));
                    }}
                  >
                    <SelectTrigger id="ben-bank" className="w-full">
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {UNIQUE_BANKS.map((b) => (
                        <SelectItem key={b.code + b.name} value={b.code}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ben-acc">Account number</Label>
                  <Input
                    id="ben-acc"
                    inputMode="numeric"
                    placeholder="0123456789"
                    value={form.accountNumber}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        accountNumber: e.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="ben-acc-tp">Turbopay account / username</Label>
                <Input
                  id="ben-acc-tp"
                  placeholder="@username or account number"
                  value={form.accountNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, accountNumber: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Tip: resolve the recipient on the Transfer screen first to verify their name.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addBeneficiary} disabled={saving} className="gap-1.5">
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Save beneficiary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove beneficiary?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.name} ({toDelete?.accountNumber}) will be permanently removed.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4" /> Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
