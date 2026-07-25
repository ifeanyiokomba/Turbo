"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { useApp } from "../store";
import { usePin } from "../parts/pin-dialog";
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
  Link as LinkIcon,
  Plus,
  Copy,
  Check,
  Share2,
  Trash2,
  RefreshCw,
  QrCode,
  Eye,
  Ban,
  CheckCircle2,
  ExternalLink,
  Tag,
} from "lucide-react";
import { formatMoney, timeAgo } from "@/lib/money";
import { toast } from "sonner";

interface PaymentLink {
  id: string;
  slug: string;
  title: string;
  amountMinor: number;
  currency: string;
  maxUses: number;
  usesCount: number;
  expiresAt: string | null;
  status: string;
  createdAt: string;
}

interface PaymentLinkPayment {
  id: string;
  amountMinor: number;
  currency: string;
  payerEmail: string | null;
  payerName: string | null;
  status: string;
  reference: string;
  createdAt: string;
}

const LINK_CURRENCIES = [
  { code: "NGN", flag: "🇳🇬" },
  { code: "USD", flag: "🇺🇸" },
  { code: "KES", flag: "🇰🇪" },
  { code: "GHS", flag: "🇬🇭" },
];

export default function PaymentLinksView() {
  const { user } = useApp();
  const { request: requestPin } = usePin();
  const [links, setLinks] = React.useState<PaymentLink[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    title: "",
    amountInput: "",
    currency: "NGN",
    maxUses: "0",
    expiresAt: "",
  });
  const [creating, setCreating] = React.useState(false);

  const [shareLink, setShareLink] = React.useState<PaymentLink | null>(null);
  const [paymentsFor, setPaymentsFor] = React.useState<PaymentLink | null>(null);
  const [payments, setPayments] = React.useState<PaymentLinkPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = React.useState(false);

  const [copiedSlug, setCopiedSlug] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payment-links", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setLinks(json.links ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function createLink() {
    if (form.title.trim().length < 3) {
      toast.error("Title must be at least 3 characters");
      return;
    }
    setCreating(true);
    try {
      const amountInput = form.amountInput.trim();
      const amountMinor = amountInput === "" ? 0 : Math.round(Number(amountInput) * 100);
      const res = await fetch("/api/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          amountMinor,
          currency: form.currency,
          maxUses: Number(form.maxUses) || 0,
          expiresAt: form.expiresAt || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not create link");
        return;
      }
      toast.success("Payment link created");
      setCreateOpen(false);
      setForm({ title: "", amountInput: "", currency: "NGN", maxUses: "0", expiresAt: "" });
      load();
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(link: PaymentLink) {
    const next = link.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    setLinks((arr) => arr.map((l) => l.id === link.id ? { ...l, status: next } : l));
    try {
      const res = await fetch(`/api/payment-links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next === "ACTIVE" ? "Link enabled" : "Link disabled");
    } catch {
      setLinks((arr) => arr.map((l) => l.id === link.id ? { ...l, status: link.status } : l));
      toast.error("Could not update link");
    }
  }

  async function deleteLink(link: PaymentLink) {
    const prev = links;
    setLinks((arr) => arr.filter((l) => l.id !== link.id));
    try {
      const res = await fetch(`/api/payment-links/${link.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Link deleted");
    } catch {
      setLinks(prev);
      toast.error("Could not delete link");
    }
  }

  async function copySlug(link: PaymentLink) {
    try {
      await navigator.clipboard.writeText(link.slug);
      setCopiedSlug(link.slug);
      toast.success("Reference copied");
      setTimeout(() => setCopiedSlug(null), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function shareLink_native(link: PaymentLink) {
    const text = `Pay me on Turbopay: ${link.title}${link.amountMinor ? ` — ${formatMoney(link.amountMinor, link.currency)}` : ""} (ref: ${link.slug})`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: "Turbopay payment link", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success("Share text copied");
    } catch {
      // user cancelled
    }
  }

  async function viewPayments(link: PaymentLink) {
    setPaymentsFor(link);
    setPaymentsLoading(true);
    try {
      const res = await fetch(`/api/payment-links/${link.id}/payments`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setPayments(json.payments ?? []);
      }
    } finally {
      setPaymentsLoading(false);
    }
  }

  function buildSharePayload(link: PaymentLink): string {
    return JSON.stringify({
      type: "turbopay-link",
      slug: link.slug,
      title: link.title,
      amountMinor: link.amountMinor || 0,
      currency: link.currency,
      merchant: user?.fullName ?? "",
    });
  }

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="Payment Links"
        subtitle="Create shareable links to accept payments from anyone, anywhere."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> New link
            </Button>
          </>
        }
      />

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold">Your payment links</p>
          <Badge variant="secondary">{links.length} links</Badge>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : links.length === 0 ? (
          <EmptyState
            icon={LinkIcon}
            title="No payment links yet"
            description="Create your first link to start accepting payments from customers or friends."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Create link
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {links.map((link) => {
              const expired = link.expiresAt && new Date(link.expiresAt) < new Date();
              const exhausted = link.maxUses > 0 && link.usesCount >= link.maxUses;
              const active = link.status === "ACTIVE" && !expired && !exhausted;
              return (
                <div
                  key={link.id}
                  className="rounded-2xl border p-4 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{link.title}</p>
                        <Badge
                          variant={active ? "secondary" : "outline"}
                          className={`shrink-0 text-[10px] ${
                            active
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {active ? "Active" : expired ? "Expired" : exhausted ? "Exhausted" : link.status}
                        </Badge>
                      </div>
                      <button
                        onClick={() => copySlug(link)}
                        className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        {link.slug}
                        {copiedSlug === link.slug ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {link.amountMinor > 0
                          ? `${formatMoney(link.amountMinor, link.currency)}`
                          : "Any amount"}
                        {" · "}
                        {link.usesCount}{link.maxUses > 0 ? `/${link.maxUses}` : ""} uses
                        {link.expiresAt && ` · expires ${timeAgo(link.expiresAt)}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setShareLink(link)}>
                      <QrCode className="h-3.5 w-3.5" /> Share / QR
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => viewPayments(link)}>
                      <Eye className="h-3.5 w-3.5" /> Payments ({link.usesCount})
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => toggleStatus(link)}>
                      {link.status === "ACTIVE" ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {link.status === "ACTIVE" ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => deleteLink(link)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create payment link</DialogTitle>
            <DialogDescription>
              Share this link to collect payments. Leave amount blank to let payers choose.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="pl-title">Title</Label>
              <Input
                id="pl-title"
                placeholder="e.g. Web design invoice #1042"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pl-amount">Amount (0 = any)</Label>
                <Input
                  id="pl-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.amountInput}
                  onChange={(e) => setForm((f) => ({ ...f, amountInput: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="mr-2">{c.flag}</span>{c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pl-max">Max uses (0 = ∞)</Label>
                <Input
                  id="pl-max"
                  inputMode="numeric"
                  placeholder="0"
                  value={form.maxUses}
                  onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value.replace(/[^\d]/g, "") }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-expiry">Expiry date</Label>
                <Input
                  id="pl-expiry"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createLink} disabled={creating} className="gap-1.5">
              {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share / QR dialog */}
      <Dialog open={!!shareLink} onOpenChange={(o) => !o && setShareLink(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share payment link</DialogTitle>
            <DialogDescription>
              Send this reference to anyone. They can pay directly from their Turbopay wallet.
            </DialogDescription>
          </DialogHeader>
          {shareLink && (
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center text-center">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="rounded-xl bg-white p-3 shadow-sm">
                    <QRCodeSVG
                      value={buildSharePayload(shareLink)}
                      size={180}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#0d6348"
                    />
                  </div>
                </div>
                <p className="mt-3 text-sm font-semibold">{shareLink.title}</p>
                <p className="text-xs text-muted-foreground">
                  {shareLink.amountMinor > 0
                    ? formatMoney(shareLink.amountMinor, shareLink.currency)
                    : "Any amount"}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Reference</p>
                <button
                  onClick={() => copySlug(shareLink)}
                  className="mt-1 flex w-full items-center justify-between gap-2 font-mono text-sm font-semibold"
                >
                  <span>{shareLink.slug}</span>
                  {copiedSlug === shareLink.slug ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              <Button className="w-full gap-1.5" onClick={() => shareLink_native(shareLink)}>
                <Share2 className="h-4 w-4" /> Share link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payments dialog */}
      <Dialog open={!!paymentsFor} onOpenChange={(o) => !o && setPaymentsFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payments — {paymentsFor?.title}</DialogTitle>
            <DialogDescription>
              Recent payments received against this link.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {paymentsLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
              </div>
            ) : payments.length === 0 ? (
              <EmptyState
                icon={Tag}
                title="No payments yet"
                description="Share your link to start receiving payments."
              />
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto scrollbar-thin">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.payerName ?? p.payerEmail ?? "Anonymous payer"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.reference} · {timeAgo(p.createdAt)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(p.amountMinor, p.currency)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
