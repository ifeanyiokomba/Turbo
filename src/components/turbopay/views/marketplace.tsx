"use client";

import * as React from "react";
import { useApp } from "../store";
import { usePin } from "../parts/pin-dialog";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Store,
  Search,
  Star,
  BadgeCheck,
  MapPin,
  Phone,
  Mail,
  Globe,
  RefreshCw,
  ArrowRight,
  ShoppingBag,
  UtensilsCrossed,
  Car,
  Zap,
  Clapperboard,
  HeartPulse,
  GraduationCap,
  Plane,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { naira } from "@/lib/money";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Merchant {
  id: string;
  name: string;
  category: string;
  description: string;
  logoUrl: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  rating: number;
  reviewCount: number;
  verified: boolean;
  featured: boolean;
  status: string;
}

interface CategoryInfo {
  key: string;
  label: string;
  count: number;
}

/* ------------------------------------------------------------------ */
/* Category metadata                                                   */
/* ------------------------------------------------------------------ */

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  SHOPPING: { label: "Shopping", icon: ShoppingBag, tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  FOOD: { label: "Food", icon: UtensilsCrossed, tint: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  TRANSPORT: { label: "Transport", icon: Car, tint: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  UTILITIES: { label: "Utilities", icon: Zap, tint: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  ENTERTAINMENT: { label: "Entertainment", icon: Clapperboard, tint: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400" },
  HEALTH: { label: "Health", icon: HeartPulse, tint: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  EDUCATION: { label: "Education", icon: GraduationCap, tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  TRAVEL: { label: "Travel", icon: Plane, tint: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
};

function categoryMeta(key: string) {
  return CATEGORY_META[key] ?? { label: key, icon: Store, tint: "bg-muted text-muted-foreground" };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("");
}

function Stars({ value }: { value: number }) {
  // Show 5 stars with fractional fill via opacity on the last star.
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full;
        const isHalf = i === full && half;
        return (
          <Star
            key={i}
            className={`h-3 w-3 ${
              filled || isHalf
                ? "fill-amber-400 text-amber-400"
                : "fill-muted text-muted-foreground/40"
            }`}
            style={isHalf ? { clipPath: "inset(0 50% 0 0)" } : undefined}
          />
        );
      })}
    </div>
  );
}

function merchantHue(name: string): string {
  // Deterministic brand-ish gradient per merchant (emerald→amber palette).
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const palettes = [
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-emerald-600 to-emerald-800",
    "from-amber-400 to-amber-600",
    "from-teal-500 to-emerald-600",
    "from-orange-500 to-amber-600",
    "from-green-500 to-emerald-700",
    "from-yellow-500 to-amber-600",
  ];
  return palettes[hash % palettes.length];
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export default function MarketplaceView() {
  const { setView } = useApp();
  const pin = usePin();

  const [merchants, setMerchants] = React.useState<Merchant[]>([]);
  const [categories, setCategories] = React.useState<CategoryInfo[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<string>("ALL");

  // Detail + Pay dialogs
  const [detail, setDetail] = React.useState<Merchant | null>(null);
  const [detailSimilar, setDetailSimilar] = React.useState<Merchant[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [payTarget, setPayTarget] = React.useState<Merchant | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [payNote, setPayNote] = React.useState("");
  const [paying, setPaying] = React.useState(false);

  // Debounce search input
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "ALL") params.set("category", activeCategory);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/marketplace?${params.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setMerchants(json.merchants ?? []);
        setCategories(json.categories ?? []);
        setTotal(json.total ?? 0);
      } else {
        toast.error("Could not load marketplace");
      }
    } finally {
      setLoading(false);
    }
  }, [activeCategory, debouncedSearch]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function openDetail(m: Merchant) {
    setDetail(m);
    setDetailSimilar([]);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/marketplace/${m.id}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setDetail(json.merchant ?? m);
        setDetailSimilar(json.similar ?? []);
      }
    } finally {
      setDetailLoading(false);
    }
  }

  function openPay(m: Merchant) {
    setPayTarget(m);
    setPayAmount("");
    setPayNote("");
  }

  async function confirmPay() {
    if (!payTarget) return;
    const amountMinor = Math.round(Number(payAmount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    let pinValue = "";
    try {
      pinValue = await pin.request({
        title: `Pay ${payTarget.name}`,
        description: `${naira(amountMinor)} to ${payTarget.name}`,
      });
    } catch {
      return;
    }
    if (!pinValue) {
      toast.error("PIN is required");
      return;
    }

    setPaying(true);
    try {
      const res = await fetch(`/api/marketplace/${payTarget.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor,
          note: payNote.trim(),
          pin: pinValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Payment failed");
        return;
      }
      toast.success(`Paid ${naira(amountMinor)} to ${payTarget.name}`, {
        description: `Ref ${json.reference}`,
      });
      setPayTarget(null);
      setView("history");
    } finally {
      setPaying(false);
    }
  }

  const featured = React.useMemo(() => merchants.filter((m) => m.featured).slice(0, 8), [merchants]);
  const showEmptyState = !loading && merchants.length === 0;

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="Marketplace"
        subtitle="Discover verified merchants and pay them instantly from your Turbopay wallet."
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Hero search */}
      <Card className="relative overflow-hidden border-0 p-0">
        <div
          className="absolute inset-0 -z-0"
          style={{
            background:
              "linear-gradient(135deg, #047857 0%, #10b981 45%, #f59e0b 130%)",
          }}
          aria-hidden
        />
        <div className="relative z-10 flex flex-col gap-3 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-semibold tracking-wide uppercase">Pay anyone, anywhere</span>
          </div>
          <h2 className="max-w-2xl text-2xl font-bold text-white sm:text-3xl">
            Search 20+ verified merchants to pay in seconds.
          </h2>
          <div className="relative mt-1 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-100/80" />
            <Input
              placeholder="Search merchants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 border-0 bg-white/95 pl-9 text-sm shadow-lg placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-white"
            />
          </div>
        </div>
      </Card>

      {/* Category chips */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <CategoryChip
          label="All"
          count={total}
          active={activeCategory === "ALL"}
          onClick={() => setActiveCategory("ALL")}
          icon={Store}
        />
        {categories.map((c) => {
          const meta = categoryMeta(c.key);
          return (
            <CategoryChip
              key={c.key}
              label={meta.label}
              count={c.count}
              active={activeCategory === c.key}
              onClick={() => setActiveCategory(c.key)}
              icon={meta.icon}
            />
          );
        })}
      </div>

      {/* Featured carousel */}
      {!search && activeCategory === "ALL" && featured.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-amber-500" /> Featured merchants
            </h3>
            <span className="text-xs text-muted-foreground">Swipe →</span>
          </div>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 w-64 shrink-0 rounded-2xl" />
                ))
              : featured.map((m) => (
                  <FeaturedCard key={m.id} m={m} onPay={() => openPay(m)} onOpen={() => openDetail(m)} />
                ))}
          </div>
        </section>
      )}

      {/* Merchant grid */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {activeCategory === "ALL" ? "All merchants" : categoryMeta(activeCategory).label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {merchants.length} found
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-52 w-full rounded-2xl" />
            ))}
          </div>
        ) : showEmptyState ? (
          <EmptyState
            icon={Search}
            title="No merchants match your search"
            description={search ? `Try a different keyword or category.` : `Try a different category or come back later.`}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setActiveCategory("ALL");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {merchants.map((m) => (
              <MerchantCard
                key={m.id}
                m={m}
                onPay={() => openPay(m)}
                onOpen={() => openDetail(m)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Quick-pay dialog */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pay {payTarget?.name}</DialogTitle>
            <DialogDescription>
              {payTarget?.verified && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified merchant
                </span>
              )}{" "}
              Enter an amount and we&apos;ll debit your wallet instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="mkt-amount">Amount (₦)</Label>
              <Input
                id="mkt-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mkt-note">Note (optional)</Label>
              <Textarea
                id="mkt-note"
                rows={2}
                placeholder="e.g. Order #1234, Invoice ref..."
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[1000, 2500, 5000, 10000].map((amt) => (
                <Button
                  key={amt}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPayAmount(String(amt))}
                >
                  ₦{amt.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={confirmPay} disabled={paying} className="gap-1.5">
              {paying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Pay now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merchant detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${merchantHue(
                      detail.name,
                    )} text-xl font-bold text-white shadow-md`}
                  >
                    {initials(detail.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                      <span className="truncate">{detail.name}</span>
                      {detail.verified && (
                        <BadgeCheck className="h-4 w-4 text-emerald-500" aria-label="Verified" />
                      )}
                    </DialogTitle>
                    <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`gap-1 text-[10px] ${categoryMeta(detail.category).tint}`}>
                        {React.createElement(categoryMeta(detail.category).icon, { className: "h-3 w-3" })}
                        {categoryMeta(detail.category).label}
                      </Badge>
                      <span className="flex items-center gap-1 text-amber-500">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {detail.rating.toFixed(1)} ({detail.reviewCount.toLocaleString()} reviews)
                      </span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <p className="text-sm leading-relaxed text-muted-foreground">{detail.description}</p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {detail.address && (
                    <InfoRow icon={MapPin} label="Address" value={detail.address} />
                  )}
                  {detail.phone && (
                    <InfoRow icon={Phone} label="Phone" value={detail.phone} />
                  )}
                  {detail.email && (
                    <InfoRow icon={Mail} label="Email" value={detail.email} />
                  )}
                  {detail.website && (
                    <InfoRow icon={Globe} label="Website" value={detail.website} />
                  )}
                </div>

                {detailLoading ? (
                  <Skeleton className="h-16 w-full rounded-xl" />
                ) : detailSimilar.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Similar merchants
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {detailSimilar.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => openDetail(s)}
                          className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                        >
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${merchantHue(
                              s.name,
                            )} text-[10px] font-bold text-white`}
                          >
                            {initials(s.name)}
                          </span>
                          {s.name}
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
                <Button
                  onClick={() => {
                    setDetail(null);
                    openPay(detail);
                  }}
                  className="gap-1.5"
                >
                  <ArrowRight className="h-4 w-4" /> Pay merchant
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function CategoryChip({
  label,
  count,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all ${
        active
          ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
          : "border-border bg-card text-muted-foreground hover:border-emerald-400/50 hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span
        className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${
          active ? "bg-white/20" : "bg-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function FeaturedCard({
  m,
  onPay,
  onOpen,
}: {
  m: Merchant;
  onPay: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className="group relative flex w-64 shrink-0 cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: "linear-gradient(90deg, #10b981, #f59e0b)" }}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${merchantHue(
            m.name,
          )} text-base font-bold text-white shadow`}
        >
          {initials(m.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate text-sm font-semibold">{m.name}</p>
            {m.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="font-medium text-foreground">{m.rating.toFixed(1)}</span>
            <span>·</span>
            <span>{m.reviewCount.toLocaleString()} reviews</span>
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>
      <div className="mt-4 flex items-center justify-between">
        <Badge variant="outline" className={`text-[10px] ${categoryMeta(m.category).tint}`}>
          {categoryMeta(m.category).label}
        </Badge>
        <Button
          size="sm"
          variant="default"
          onClick={(e) => {
            e.stopPropagation();
            onPay();
          }}
          className="gap-1"
        >
          Visit <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function MerchantCard({
  m,
  onPay,
  onOpen,
}: {
  m: Merchant;
  onPay: () => void;
  onOpen: () => void;
}) {
  return (
    <Card
      role="article"
      className="group flex flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onOpen}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${merchantHue(
            m.name,
          )} text-base font-bold text-white shadow transition-transform group-hover:scale-105`}
          aria-label={`View ${m.name} details`}
        >
          {initials(m.name)}
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="block w-full text-left">
            <p className="truncate text-sm font-semibold hover:text-emerald-600 dark:hover:text-emerald-400">
              {m.name}
            </p>
          </button>
          <div className="mt-1 flex items-center gap-1.5">
            <Stars value={m.rating} />
            <span className="text-[11px] text-muted-foreground">
              {m.rating.toFixed(1)} ({m.reviewCount.toLocaleString()})
            </span>
            {m.verified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" aria-label="Verified" />}
          </div>
        </div>
      </div>

      <p className="line-clamp-2 text-xs text-muted-foreground">{m.description}</p>

      <div className="mt-auto flex items-center justify-between gap-2">
        <Badge variant="outline" className={`gap-1 text-[10px] ${categoryMeta(m.category).tint}`}>
          {React.createElement(categoryMeta(m.category).icon, { className: "h-3 w-3" })}
          {categoryMeta(m.category).label}
        </Badge>
        <Button size="sm" onClick={onPay} className="gap-1">
          Pay <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl border bg-muted/30 px-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-medium">{value}</p>
      </div>
    </div>
  );
}

// Re-exported for type-only consumers (keeps tree-shaking happy)
export type { Merchant };
