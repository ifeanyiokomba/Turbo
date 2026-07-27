"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Tag,
  Code2,
  BarChart3,
  Palette,
  Upload,
  Layers,
  Sparkles,
  TrendingUp,
  Users,
  DollarSign,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { formatMoney, naira, nairaCompact, timeAgo } from "@/lib/money";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

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
  metadataJSON?: string;
  analytics?: LinkAnalytics;
}

interface LinkAnalytics {
  views: number;
  paymentAttempts: number;
  successfulPayments: number;
  conversionRate: number;
  totalCollectedMinor: number;
  currency: string;
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

interface DetailedAnalytics {
  link: {
    id: string;
    slug: string;
    title: string;
    amountMinor: number;
    currency: string;
    status: string;
    usesCount: number;
    customization: {
      description: string | null;
      successUrl: string | null;
      cancelUrl: string | null;
      themeColor: string;
      logoUrl: string | null;
      allowCustomAmount: boolean;
    };
  };
  analytics: LinkAnalytics & { failedPayments: number };
  recentPayments: PaymentLinkPayment[];
}

const LINK_CURRENCIES = [
  { code: "NGN", flag: "🇳🇬" },
  { code: "USD", flag: "🇺🇸" },
  { code: "KES", flag: "🇰🇪" },
  { code: "GHS", flag: "🇬🇭" },
];

const THEME_COLORS = [
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Rose", value: "#ef4444" },
  { name: "Pink", value: "#ec4899" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Orange", value: "#f97316" },
];

interface FormState {
  title: string;
  description: string;
  amountInput: string;
  currency: string;
  maxUses: string;
  expiresAt: string;
  successUrl: string;
  cancelUrl: string;
  themeColor: string;
  logoUrl: string;
  allowCustomAmount: boolean;
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export default function PaymentLinksView() {
  const { user } = useApp();
  const [links, setLinks] = React.useState<PaymentLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [withAnalytics] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>({
    title: "",
    description: "",
    amountInput: "",
    currency: "NGN",
    maxUses: "0",
    expiresAt: "",
    successUrl: "",
    cancelUrl: "",
    themeColor: "#10b981",
    logoUrl: "",
    allowCustomAmount: true,
  });
  const [creating, setCreating] = React.useState(false);

  const [shareLink, setShareLink] = React.useState<PaymentLink | null>(null);
  const [analyticsFor, setAnalyticsFor] = React.useState<PaymentLink | null>(null);
  const [detailedAnalytics, setDetailedAnalytics] = React.useState<DetailedAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);
  const [embedFor, setEmbedFor] = React.useState<PaymentLink | null>(null);
  const [previewLink, setPreviewLink] = React.useState<PaymentLink | null>(null);
  const [paymentsFor, setPaymentsFor] = React.useState<PaymentLink | null>(null);
  const [payments, setPayments] = React.useState<PaymentLinkPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = React.useState(false);

  const [copiedSlug, setCopiedSlug] = React.useState<string | null>(null);
  const [copiedEmbed, setCopiedEmbed] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payment-links${withAnalytics ? "?analytics=true" : ""}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setLinks(json.links ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [withAnalytics]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function trackView(link: PaymentLink) {
    try {
      await fetch(`/api/payment-links/${link.id}/view`, { method: "POST" });
    } catch {
      // best-effort
    }
  }

  async function createLink(overrides?: Partial<FormState>): Promise<PaymentLink | null> {
    const f: FormState = { ...form, ...overrides };
    if (f.title.trim().length < 3) {
      toast.error("Title must be at least 3 characters");
      return null;
    }
    const amountInput = f.amountInput.trim();
    const amountMinor = amountInput === "" ? 0 : Math.round(Number(amountInput) * 100);
    const res = await fetch("/api/payment-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: f.title.trim(),
        amountMinor,
        currency: f.currency,
        maxUses: Number(f.maxUses) || 0,
        expiresAt: f.expiresAt || undefined,
        description: f.description.trim() || undefined,
        successUrl: f.successUrl.trim() || undefined,
        cancelUrl: f.cancelUrl.trim() || undefined,
        themeColor: f.themeColor,
        logoUrl: f.logoUrl.trim() || undefined,
        allowCustomAmount: f.allowCustomAmount || amountMinor === 0,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json?.error ?? "Could not create link");
      return null;
    }
    return json.link as PaymentLink;
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const link = await createLink();
      if (link) {
        toast.success("Payment link created");
        setCreateOpen(false);
        setForm({
          title: "",
          description: "",
          amountInput: "",
          currency: "NGN",
          maxUses: "0",
          expiresAt: "",
          successUrl: "",
          cancelUrl: "",
          themeColor: "#10b981",
          logoUrl: "",
          allowCustomAmount: true,
        });
        load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleBulkCreate(items: Array<Partial<FormState>>) {
    if (items.length === 0) {
      toast.error("Add at least one link to bulk-create");
      return;
    }
    let ok = 0;
    let failed = 0;
    for (const item of items) {
      const link = await createLink(item);
      if (link) ok++;
      else failed++;
    }
    if (ok > 0) toast.success(`Created ${ok} link${ok === 1 ? "" : "s"}`);
    if (failed > 0) toast.error(`${failed} link${failed === 1 ? "" : "s"} failed`);
    if (ok > 0) {
      setBulkOpen(false);
      load();
    }
  }

  async function toggleStatus(link: PaymentLink) {
    const next = link.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    setLinks((arr) => arr.map((l) => (l.id === link.id ? { ...l, status: next } : l)));
    try {
      const res = await fetch(`/api/payment-links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next === "ACTIVE" ? "Link enabled" : "Link disabled");
    } catch {
      setLinks((arr) => arr.map((l) => (l.id === link.id ? { ...l, status: link.status } : l)));
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

  async function copyEmbed(link: PaymentLink) {
    const code = buildEmbedCode(link);
    try {
      await navigator.clipboard.writeText(code);
      setCopiedEmbed(true);
      toast.success("Embed code copied");
      setTimeout(() => setCopiedEmbed(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function shareLinkNative(link: PaymentLink) {
    const text = `Pay me on Turbopay: ${link.title}${link.amountMinor ? ` — ${formatMoney(link.amountMinor, link.currency)}` : ""} (ref: ${link.slug})`;
    try {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share) {
        await nav.share({ title: "Turbopay payment link", text });
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

  async function viewAnalytics(link: PaymentLink) {
    setAnalyticsFor(link);
    setDetailedAnalytics(null);
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/payment-links/${link.id}/analytics`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setDetailedAnalytics(json as DetailedAnalytics);
      }
    } finally {
      setAnalyticsLoading(false);
    }
  }

  function openShare(link: PaymentLink) {
    setShareLink(link);
    trackView(link);
  }
  function openPreview(link: PaymentLink) {
    setPreviewLink(link);
    trackView(link);
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

  function buildEmbedCode(link: PaymentLink): string {
    const url = `https://turbopay.app/pay/${link.slug}`;
    return `<!-- Turbopay payment button — ${link.title} -->
<a href="${url}" target="_blank" rel="noopener"
   style="display:inline-flex;align-items:center;gap:8px;
          background:#10b981;color:#fff;padding:12px 20px;
          border-radius:10px;font-family:system-ui,sans-serif;
          font-weight:600;text-decoration:none;font-size:14px;">
  Pay ${link.amountMinor ? formatMoney(link.amountMinor, link.currency) : link.title}
</a>`;
  }

  function getMeta(link: PaymentLink): Record<string, unknown> {
    if (!link.metadataJSON) return {};
    try {
      const v = JSON.parse(link.metadataJSON);
      return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  const totals = React.useMemo(() => {
    let views = 0,
      payments = 0,
      collected = 0,
      conversion = 0;
    for (const l of links) {
      if (l.analytics) {
        views += l.analytics.views;
        payments += l.analytics.successfulPayments;
        collected += l.analytics.totalCollectedMinor;
      }
    }
    conversion = views > 0 ? (payments / views) * 100 : 0;
    return { views, payments, collected, conversion: Number(conversion.toFixed(1)) };
  }, [links]);

  return (
    <div className="tp-fade-rise space-y-6">
      <PageHeader
        title="Payment Links"
        subtitle="Create shareable links to accept payments from anyone, anywhere."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkOpen(true)}
              className="gap-1.5"
            >
              <Layers className="h-4 w-4" /> Bulk
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> New link
            </Button>
          </>
        }
      />

      {links.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total views"
            value={String(totals.views)}
            hint="Across all links"
            icon={Eye}
            tone="emerald"
          />
          <StatTile
            label="Successful payments"
            value={String(totals.payments)}
            hint="All links"
            icon={CheckCircle2}
            tone="emerald"
          />
          <StatTile
            label="Conversion rate"
            value={`${totals.conversion}%`}
            hint="Payments / views"
            icon={TrendingUp}
            tone="amber"
          />
          <StatTile
            label="Total collected"
            value={nairaCompact(totals.collected)}
            hint="All currencies converted"
            icon={DollarSign}
            tone="emerald"
          />
        </div>
      )}

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold">Your payment links</p>
          <Badge variant="secondary">{links.length} links</Badge>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
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
              const meta = getMeta(link);
              const expired = link.expiresAt && new Date(link.expiresAt) < new Date();
              const exhausted = link.maxUses > 0 && link.usesCount >= link.maxUses;
              const active = link.status === "ACTIVE" && !expired && !exhausted;
              const themeColor = (meta.themeColor as string) ?? "#10b981";
              const a = link.analytics;
              return (
                <div
                  key={link.id}
                  className="rounded-2xl border p-4 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: themeColor }}
                    >
                      {link.title.slice(0, 2).toUpperCase()}
                    </div>
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
                          {active
                            ? "Active"
                            : expired
                              ? "Expired"
                              : exhausted
                                ? "Exhausted"
                                : link.status}
                        </Badge>
                      </div>
                      <button
                        onClick={() => copySlug(link)}
                        className="text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1.5 font-mono text-xs"
                      >
                        {link.slug}
                        {copiedSlug === link.slug ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                      <p className="text-muted-foreground mt-2 text-xs">
                        {link.amountMinor > 0
                          ? formatMoney(link.amountMinor, link.currency)
                          : "Any amount"}
                        {" · "}
                        {link.usesCount}
                        {link.maxUses > 0 ? `/${link.maxUses}` : ""} uses
                        {link.expiresAt && ` · expires ${timeAgo(link.expiresAt)}`}
                      </p>

                      {a && (
                        <div className="bg-muted/20 mt-3 grid grid-cols-4 gap-1 rounded-xl border p-2 text-center">
                          <div>
                            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                              Views
                            </p>
                            <p className="text-sm font-semibold tabular-nums">{a.views}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                              Pays
                            </p>
                            <p className="text-sm font-semibold tabular-nums">
                              {a.successfulPayments}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                              Conv.
                            </p>
                            <p className="text-sm font-semibold tabular-nums">
                              {a.conversionRate}%
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                              Total
                            </p>
                            <p className="text-sm font-semibold tabular-nums">
                              {nairaCompact(a.totalCollectedMinor)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5"
                      onClick={() => openShare(link)}
                    >
                      <QrCode className="h-3.5 w-3.5" /> Share
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => openPreview(link)}
                    >
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => viewAnalytics(link)}
                    >
                      <BarChart3 className="h-3.5 w-3.5" /> Analytics
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => setEmbedFor(link)}
                    >
                      <Code2 className="h-3.5 w-3.5" /> Embed
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => toggleStatus(link)}
                    >
                      {link.status === "ACTIVE" ? (
                        <Ban className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {link.status === "ACTIVE" ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive gap-1.5"
                      onClick={() => deleteLink(link)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ============ Create dialog with customization ============ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create payment link</DialogTitle>
            <DialogDescription>
              Customize the look and behavior of your payment page.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details" className="gap-1.5 text-xs">
                <Tag className="h-3.5 w-3.5" /> Details
              </TabsTrigger>
              <TabsTrigger value="customize" className="gap-1.5 text-xs">
                <Palette className="h-3.5 w-3.5" /> Customize
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="pl-title">Title</Label>
                <Input
                  id="pl-title"
                  placeholder="e.g. Web design invoice #1042"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-desc">Description (optional)</Label>
                <Textarea
                  id="pl-desc"
                  placeholder="What is this payment for?"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  maxLength={280}
                  rows={2}
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
                  <Select
                    value={form.currency}
                    onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINK_CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="mr-2">{c.flag}</span>
                          {c.code}
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
                    onChange={(e) =>
                      setForm((f) => ({ ...f, maxUses: e.target.value.replace(/[^\d]/g, "") }))
                    }
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
              <label className="flex items-center gap-2.5 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.allowCustomAmount}
                  onChange={(e) => setForm((f) => ({ ...f, allowCustomAmount: e.target.checked }))}
                  className="border-input h-4 w-4 rounded"
                />
                <div>
                  <p className="font-medium">Allow customer to choose amount</p>
                  <p className="text-muted-foreground text-xs">
                    If checked, payers can override the amount.
                  </p>
                </div>
              </label>
            </TabsContent>

            <TabsContent value="customize" className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label>Theme color</Label>
                <div className="flex flex-wrap gap-2">
                  {THEME_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, themeColor: c.value }))}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                        form.themeColor === c.value
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.value }}
                      aria-label={c.name}
                      title={c.name}
                    >
                      {form.themeColor === c.value && <Check className="h-4 w-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-logo">Logo URL (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="pl-logo"
                    placeholder="https://your-logo.png"
                    value={form.logoUrl}
                    onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => toast.info("Logo upload coming soon — paste a URL for now.")}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Or we&apos;ll use the first 2 letters of your title as a logo.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-success">Success URL (optional)</Label>
                <Input
                  id="pl-success"
                  placeholder="https://yoursite.com/thanks"
                  value={form.successUrl}
                  onChange={(e) => setForm((f) => ({ ...f, successUrl: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-cancel">Cancel URL (optional)</Label>
                <Input
                  id="pl-cancel"
                  placeholder="https://yoursite.com/cancel"
                  value={form.cancelUrl}
                  onChange={(e) => setForm((f) => ({ ...f, cancelUrl: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Live preview</Label>
                <LinkPreviewCard
                  title={form.title || "Untitled link"}
                  amountMinor={form.amountInput ? Math.round(Number(form.amountInput) * 100) : 0}
                  currency={form.currency}
                  themeColor={form.themeColor}
                  logoUrl={form.logoUrl || null}
                  description={form.description || null}
                  merchantName={user?.fullName ?? "Turbopay merchant"}
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
              {creating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkCreateDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onBulkCreate={handleBulkCreate}
        defaultCurrency={form.currency}
        defaultTheme={form.themeColor}
      />

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
                <p className="text-muted-foreground text-xs">
                  {shareLink.amountMinor > 0
                    ? formatMoney(shareLink.amountMinor, shareLink.currency)
                    : "Any amount"}
                </p>
              </div>
              <div className="bg-muted/30 rounded-xl border p-3">
                <p className="text-muted-foreground text-xs">Reference</p>
                <button
                  onClick={() => copySlug(shareLink)}
                  className="mt-1 flex w-full items-center justify-between gap-2 font-mono text-sm font-semibold"
                >
                  <span>{shareLink.slug}</span>
                  {copiedSlug === shareLink.slug ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="text-muted-foreground h-4 w-4" />
                  )}
                </button>
              </div>
              <Button className="w-full gap-1.5" onClick={() => shareLinkNative(shareLink)}>
                <Share2 className="h-4 w-4" /> Share link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewLink} onOpenChange={(o) => !o && setPreviewLink(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="text-primary h-5 w-5" /> Payment page preview
            </DialogTitle>
            <DialogDescription>
              This is what your customers will see when they open the link.
            </DialogDescription>
          </DialogHeader>
          {previewLink && (
            <LinkPreviewCard
              title={previewLink.title}
              amountMinor={previewLink.amountMinor}
              currency={previewLink.currency}
              themeColor={(getMeta(previewLink).themeColor as string) ?? "#10b981"}
              logoUrl={(getMeta(previewLink).logoUrl as string) ?? null}
              description={(getMeta(previewLink).description as string) ?? null}
              merchantName={user?.fullName ?? "Turbopay merchant"}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!analyticsFor} onOpenChange={(o) => !o && setAnalyticsFor(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="text-primary h-5 w-5" /> Analytics
            </DialogTitle>
            <DialogDescription>{analyticsFor?.title}</DialogDescription>
          </DialogHeader>
          {analyticsLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : detailedAnalytics ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <AnalyticsTile
                  label="Views"
                  value={String(detailedAnalytics.analytics.views)}
                  icon={Eye}
                />
                <AnalyticsTile
                  label="Attempts"
                  value={String(detailedAnalytics.analytics.paymentAttempts)}
                  icon={Users}
                />
                <AnalyticsTile
                  label="Paid"
                  value={String(detailedAnalytics.analytics.successfulPayments)}
                  icon={CheckCircle2}
                />
                <AnalyticsTile
                  label="Failed"
                  value={String(detailedAnalytics.analytics.failedPayments)}
                  icon={AlertTriangle}
                />
              </div>
              <div className="bg-muted/30 rounded-xl border p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Conversion rate</span>
                  <span className="font-semibold tabular-nums">
                    {detailedAnalytics.analytics.conversionRate}%
                  </span>
                </div>
                <Progress
                  className="mt-2 h-2"
                  value={Math.min(100, detailedAnalytics.analytics.conversionRate)}
                />
              </div>
              <div className="rounded-xl border bg-emerald-500/5 p-4">
                <p className="text-muted-foreground text-xs">Total collected</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                  {formatMoney(
                    detailedAnalytics.analytics.totalCollectedMinor,
                    detailedAnalytics.analytics.currency
                  )}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                  Recent payments
                </p>
                {detailedAnalytics.recentPayments.length === 0 ? (
                  <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-xs">
                    No payments yet.
                  </p>
                ) : (
                  <ul className="scrollbar-thin max-h-60 space-y-2 overflow-y-auto pr-1">
                    {detailedAnalytics.recentPayments.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            p.status === "SUCCESS"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {p.status === "SUCCESS" ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <AlertTriangle className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {p.payerName ?? p.payerEmail ?? "Anonymous"}
                          </p>
                          <p className="text-muted-foreground truncate text-[11px]">
                            {timeAgo(p.createdAt)}
                          </p>
                        </div>
                        <p className="text-xs font-semibold tabular-nums">
                          {formatMoney(p.amountMinor, p.currency)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <EmptyState icon={BarChart3} title="No analytics available" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!embedFor} onOpenChange={(o) => !o && setEmbedFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="text-primary h-5 w-5" /> Embed code
            </DialogTitle>
            <DialogDescription>
              Copy this snippet and paste it into your website&apos;s HTML.
            </DialogDescription>
          </DialogHeader>
          {embedFor && (
            <div className="space-y-3 py-2">
              <pre className="bg-muted/30 scrollbar-thin max-h-64 overflow-auto rounded-xl border p-3 text-[11px] leading-relaxed">
                <code>{buildEmbedCode(embedFor)}</code>
              </pre>
              <Button className="w-full gap-1.5" onClick={() => copyEmbed(embedFor)}>
                {copiedEmbed ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy embed code
              </Button>
              <p className="text-muted-foreground text-xs">
                The button opens the Turbopay payment page in a new tab.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentsFor} onOpenChange={(o) => !o && setPaymentsFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payments — {paymentsFor?.title}</DialogTitle>
            <DialogDescription>Recent payments received against this link.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {paymentsLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : payments.length === 0 ? (
              <EmptyState
                icon={Tag}
                title="No payments yet"
                description="Share your link to start receiving payments."
              />
            ) : (
              <div className="scrollbar-thin max-h-96 space-y-2 overflow-y-auto">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.payerName ?? p.payerEmail ?? "Anonymous payer"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {p.reference} · {timeAgo(p.createdAt)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
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

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "amber";
}) {
  const bg =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return (
    <Card className="tp-card-hover p-5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2.5 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
    </Card>
  );
}

function AnalyticsTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-muted/30 rounded-xl border p-3 text-center">
      <Icon className="text-muted-foreground mx-auto h-4 w-4" />
      <p className="mt-1.5 text-lg font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</p>
    </div>
  );
}

function LinkPreviewCard({
  title,
  amountMinor,
  currency,
  themeColor,
  logoUrl,
  description,
  merchantName,
}: {
  title: string;
  amountMinor: number;
  currency: string;
  themeColor: string;
  logoUrl: string | null;
  description: string | null;
  merchantName: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      <div
        className="p-5 text-white"
        style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}dd)` }}
      >
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={title} className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-sm font-bold">
              {title.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-white/80 uppercase">
              Pay {merchantName}
            </p>
            <p className="text-sm font-bold">{title}</p>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-5">
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
        <div className="bg-muted/30 rounded-xl border p-3">
          <p className="text-muted-foreground text-[10px] tracking-wide uppercase">Amount</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums">
            {amountMinor > 0 ? formatMoney(amountMinor, currency) : "Customer chooses"}
          </p>
        </div>
        <Button
          className="w-full gap-1.5"
          style={{ backgroundColor: themeColor, borderColor: themeColor }}
        >
          <Sparkles className="h-4 w-4" /> Pay{" "}
          {amountMinor > 0 ? formatMoney(amountMinor, currency) : "now"}
        </Button>
        <p className="text-muted-foreground text-center text-[11px]">
          Secured by Turbopay · NDPR-aware
        </p>
      </div>
    </div>
  );
}

function BulkCreateDialog({
  open,
  onOpenChange,
  onBulkCreate,
  defaultCurrency,
  defaultTheme,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onBulkCreate: (items: Array<Partial<FormState>>) => void;
  defaultCurrency: string;
  defaultTheme: string;
}) {
  const [rows, setRows] = React.useState<
    Array<{
      title: string;
      amountInput: string;
      currency: string;
      themeColor: string;
    }>
  >([{ title: "", amountInput: "", currency: defaultCurrency, themeColor: defaultTheme }]);
  const [csvOpen, setCsvOpen] = React.useState(false);
  const [csvText, setCsvText] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  function addRow() {
    setRows((r) => [
      ...r,
      { title: "", amountInput: "", currency: defaultCurrency, themeColor: defaultTheme },
    ]);
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function parseCsv() {
    const lines = csvText.trim().split(/\r?\n/);
    const items: typeof rows = [];
    for (const line of lines) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length < 1) continue;
      const title = parts[0];
      if (!title) continue;
      items.push({
        title,
        amountInput: parts[1] ?? "",
        currency: parts[2] || defaultCurrency,
        themeColor: parts[3] || defaultTheme,
      });
    }
    if (items.length === 0) {
      toast.error("No valid rows found");
      return;
    }
    setRows(items);
    setCsvOpen(false);
    toast.success(`Parsed ${items.length} rows from CSV`);
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const valid = rows.filter((r) => r.title.trim().length >= 3);
      if (valid.length === 0) {
        toast.error("Add at least one row with a valid title (min 3 chars)");
        return;
      }
      onBulkCreate(valid);
      setRows([
        { title: "", amountInput: "", currency: defaultCurrency, themeColor: defaultTheme },
      ]);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="text-primary h-5 w-5" /> Bulk create payment links
          </DialogTitle>
          <DialogDescription>
            Add multiple links at once. Fill the form, or paste CSV with format:
            title,amount,currency,themeColor
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {rows.length} row{rows.length === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setCsvOpen(!csvOpen)}
              >
                <Upload className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" /> Add row
              </Button>
            </div>
          </div>

          {csvOpen && (
            <div className="bg-muted/30 space-y-2 rounded-xl border p-3">
              <Label htmlFor="csv-text">Paste CSV</Label>
              <Textarea
                id="csv-text"
                placeholder={"Invoice #1,5000,NGN,#10b981\nInvoice #2,10000,NGN,#f59e0b"}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={4}
                className="font-mono text-xs"
              />
              <Button size="sm" onClick={parseCsv}>
                Parse CSV
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border p-2">
                <span className="text-muted-foreground w-6 text-center text-xs font-semibold">
                  {i + 1}
                </span>
                <Input
                  placeholder="Title"
                  value={row.title}
                  onChange={(e) =>
                    setRows((r) =>
                      r.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x))
                    )
                  }
                  className="text-sm"
                />
                <Input
                  inputMode="decimal"
                  placeholder="Amount"
                  value={row.amountInput}
                  onChange={(e) =>
                    setRows((r) =>
                      r.map((x, idx) => (idx === i ? { ...x, amountInput: e.target.value } : x))
                    )
                  }
                  className="w-24 text-sm"
                />
                <Select
                  value={row.currency}
                  onValueChange={(v) =>
                    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, currency: v } : x)))
                  }
                >
                  <SelectTrigger className="w-20 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => removeRow(i)}
                  className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                  aria-label="Remove row"
                  disabled={rows.length === 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
            {creating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}
            Create {rows.filter((r) => r.title.trim().length >= 3).length} links
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
