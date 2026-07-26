"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp, type ViewKey } from "./store";
import { Logo, Wordmark } from "./logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PinDialogProvider } from "./parts/pin-dialog";
import { CountrySwitcher } from "./parts/country-switcher";
import { ViewTransition } from "./view-transition";
import AiSupport from "./ai-support";
import { useSessionTimeout } from "./parts/use-session-timeout";
import { OnboardingOverlay } from "./onboarding-overlay";
import { CommandPalette } from "./command-palette";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Smartphone,
  Receipt,
  History,
  CreditCard,
  PiggyBank,
  TrendingUp,
  ShieldCheck,
  Users,
  Settings,
  Bell,
  Sun,
  Moon,
  Menu,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  LifeBuoy,
  Gift,
  UserCog,
  BarChart3,
  Plus,
  QrCode,
  Globe,
  Plane,
  Link as LinkIcon,
  Link2,
  CalendarClock,
  Clock,
  AlertTriangle,
  Scale,
  Ticket,
  HelpCircle,
  ArrowUpRight,
  ShieldAlert,
  BadgeCheck,
  Info,
  CheckCheck,
  Inbox,
  Award,
  Search,
  Store,
  Repeat,
  Zap,
  Crown,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { timeAgo } from "@/lib/money";
import { cn } from "@/lib/utils";
// MiniPay runtime detection disabled — standalone mode. Celo foundation kept dormant.
// import { isMiniPay, getMiniPayAddress } from "@/lib/minipay";
// import { useAutoConnect } from "@/hooks/use-auto-connect";

const USER_NAV: { group: string; items: { key: ViewKey; label: string; icon: any; cond?: (user: { country: string }) => boolean }[] }[] = [
  {
    group: "Financial",
    items: [
      { key: "dashboard", label: "Home", icon: LayoutDashboard },
      { key: "wallet", label: "Wallet", icon: Wallet },
      { key: "transfer", label: "Transfer", icon: ArrowLeftRight },
      { key: "qr", label: "QR Pay", icon: QrCode },
      { key: "airtime", label: "Airtime & Data", icon: Smartphone },
      { key: "bills", label: "Pay Bills", icon: Receipt },
      { key: "multi-currency", label: "Multi-Currency", icon: Globe },
      { key: "intl-transfers", label: "International", icon: Plane },
      { key: "mobile-money", label: "Mobile Money", icon: Smartphone, cond: (u) => MOBILE_MONEY_COUNTRIES.has(u.country) },
      { key: "payment-links", label: "Payment Links", icon: LinkIcon },
      { key: "marketplace", label: "Marketplace", icon: Store },
      { key: "merchant-dashboard", label: "Merchant Dashboard", icon: Crown },
      { key: "subscriptions", label: "Subscriptions", icon: Repeat },
      { key: "cards", label: "Virtual Cards", icon: CreditCard },
      { key: "savings", label: "Savings", icon: PiggyBank },
      { key: "investments", label: "Investments", icon: TrendingUp },
      { key: "scheduled-payments", label: "Scheduled", icon: CalendarClock },
      { key: "history", label: "Transactions", icon: History },
      { key: "analytics", label: "Analytics", icon: BarChart3 },
      { key: "wallet-insights", label: "Insights", icon: TrendingUp },
    ],
  },
  {
    group: "Account",
    items: [
      { key: "kyc", label: "KYC & Limits", icon: ShieldCheck },
      { key: "beneficiaries", label: "Beneficiaries", icon: Users },
      { key: "rewards", label: "Rewards", icon: Gift },
      { key: "achievements", label: "Achievements", icon: Award },
      { key: "vouchers", label: "Vouchers", icon: Ticket },
      { key: "disputes", label: "Disputes", icon: Scale },
      { key: "help-center", label: "Help Center", icon: HelpCircle },
      { key: "security", label: "Security", icon: ShieldCheck },
      { key: "settings", label: "Settings", icon: Settings },
      { key: "support", label: "Help & Support", icon: LifeBuoy },
    ],
  },
];

// Countries where Mobile Money is supported (matches CountryConfig.paymentMethods includes "MOBILE_MONEY")
const MOBILE_MONEY_COUNTRIES = new Set(["KE", "GH", "UG", "TZ", "RW"]);

const ADMIN_NAV: { group: string; items: { key: ViewKey; label: string; icon: any; cond?: (user: { country: string }) => boolean }[] }[] = [
  {
    group: "Overview",
    items: [{ key: "admin", label: "Admin Console", icon: UserCog }],
  },
];

const BOTTOM_NAV: { key: ViewKey; label: string; icon: any }[] = [
  { key: "dashboard", label: "Home", icon: LayoutDashboard },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "transfer", label: "Send", icon: ArrowLeftRight },
  { key: "bills", label: "Bills", icon: Receipt },
  { key: "history", label: "History", icon: History },
];

// Lazy view registry
const Views: Record<ViewKey, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: React.lazy(() => import("./views/dashboard")),
  wallet: React.lazy(() => import("./views/wallet")),
  transfer: React.lazy(() => import("./views/transfer")),
  qr: React.lazy(() => import("./views/qr")),
  airtime: React.lazy(() => import("./views/airtime")),
  bills: React.lazy(() => import("./views/bills")),
  history: React.lazy(() => import("./views/history")),
  cards: React.lazy(() => import("./views/cards")),
  savings: React.lazy(() => import("./views/savings")),
  investments: React.lazy(() => import("./views/investments")),
  kyc: React.lazy(() => import("./views/kyc")),
  beneficiaries: React.lazy(() => import("./views/beneficiaries")),
  settings: React.lazy(() => import("./views/settings")),
  security: React.lazy(() => import("./views/security")),
  rewards: React.lazy(() => import("./views/rewards")),
  support: React.lazy(() => import("./views/support")),
  admin: React.lazy(() => import("./views/admin")),
  "multi-currency": React.lazy(() => import("./views/multi-currency")),
  "intl-transfers": React.lazy(() => import("./views/intl-transfers")),
  "mobile-money": React.lazy(() => import("./views/mobile-money")),
  "payment-links": React.lazy(() => import("./views/payment-links")),
  "scheduled-payments": React.lazy(() => import("./views/scheduled-payments")),
  analytics: React.lazy(() => import("./views/analytics")),
  disputes: React.lazy(() => import("./views/disputes")),
  vouchers: React.lazy(() => import("./views/vouchers")),
  "help-center": React.lazy(() => import("./views/help-center")),
  achievements: React.lazy(() => import("./views/achievements")),
  marketplace: React.lazy(() => import("./views/marketplace")),
  "merchant-dashboard": React.lazy(() => import("./views/merchant-dashboard")),
  subscriptions: React.lazy(() => import("./views/subscriptions")),
  "wallet-insights": React.lazy(() => import("./views/wallet-insights")),
  "minipay-wallet": React.lazy(() => import("./views/minipay-wallet")),
  "onchain-history": React.lazy(() => import("./views/onchain-history")),
  "celo-bridge": React.lazy(() => import("./views/celo-bridge")),
};

const VIEW_TITLES: Record<ViewKey, string> = {
  dashboard: "Dashboard",
  wallet: "Wallet",
  transfer: "Transfer",
  qr: "QR Pay",
  airtime: "Airtime & Data",
  bills: "Pay Bills",
  history: "Transactions",
  cards: "Virtual Cards",
  savings: "Savings",
  investments: "Investments",
  kyc: "KYC & Limits",
  beneficiaries: "Beneficiaries",
  settings: "Settings",
  security: "Security",
  rewards: "Rewards",
  support: "Help & Support",
  admin: "Admin Console",
  "multi-currency": "Multi-Currency Wallets",
  "intl-transfers": "International Transfers",
  "mobile-money": "Mobile Money",
  "payment-links": "Payment Links",
  "scheduled-payments": "Scheduled Payments",
  analytics: "Analytics",
  disputes: "Disputes",
  vouchers: "Vouchers",
  "help-center": "Help Center",
  achievements: "Achievements",
  marketplace: "Marketplace",
  "merchant-dashboard": "Merchant Dashboard",
  subscriptions: "Subscriptions",
  "wallet-insights": "Wallet Insights",
  "minipay-wallet": "MiniPay Wallet",
  "onchain-history": "On-Chain History",
  "celo-bridge": "cUSD Bridge",
};

// Set of valid view keys — used to resolve notification actionUrl → setView.
const VALID_VIEW_KEYS = new Set<string>([
  "dashboard", "wallet", "transfer", "airtime", "bills", "history", "cards",
  "savings", "investments", "kyc", "beneficiaries", "qr", "settings", "security",
  "rewards", "support", "admin", "multi-currency", "intl-transfers", "mobile-money",
  "payment-links", "scheduled-payments", "analytics", "disputes", "vouchers", "help-center",
  "achievements", "marketplace", "subscriptions", "wallet-insights",
  "minipay-wallet", "onchain-history", "celo-bridge", "merchant-dashboard",
]);

// MiniPay-only nav items — appended to the Financial group when minipayMode is true.
const MINIPAY_NAV_ITEMS: { key: ViewKey; label: string; icon: any; cond?: (user: { country: string }) => boolean }[] = [
  { key: "minipay-wallet", label: "MiniPay Wallet", icon: Wallet },
  { key: "onchain-history", label: "On-Chain History", icon: Link2 },
  { key: "celo-bridge", label: "cUSD Bridge", icon: ArrowLeftRight },
];

type NotifFilter = "all" | "unread" | "important";

type AppNotification = {
  id: string;
  type: string; // TRANSACTION | SECURITY | KYC | REWARD | SYSTEM
  title: string;
  body: string;
  priority: string; // LOW | NORMAL | HIGH
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
};

// Resolve an actionUrl like "/history?ref=TP-XXX" into a setView key, or null.
function resolveActionView(actionUrl: string | null): ViewKey | null {
  if (!actionUrl) return null;
  const clean = actionUrl.startsWith("/") ? actionUrl.slice(1) : actionUrl;
  const seg = clean.split(/[/?#]/)[0];
  if (seg && VALID_VIEW_KEYS.has(seg)) return seg as ViewKey;
  return null;
}

// Notification icon + tone by type.
function notifVisual(type: string): { Icon: any; tone: string } {
  switch (type) {
    case "TRANSACTION":
      return { Icon: ArrowUpRight, tone: "emerald" };
    case "SECURITY":
      return { Icon: ShieldAlert, tone: "red" };
    case "KYC":
      return { Icon: BadgeCheck, tone: "amber" };
    case "REWARD":
      return { Icon: Gift, tone: "emerald" };
    case "SYSTEM":
    default:
      return { Icon: Info, tone: "slate" };
  }
}

const TONE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

export function AppShell({ user }: { user: NonNullable<ReturnType<typeof useApp.getState>["user"]> }) {
  const router = useRouter();
  const { view, setView, sidebarOpen, setSidebarOpen } = useApp();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifFilter, setNotifFilter] = React.useState<NotifFilter>("all");
  const [unread, setUnread] = React.useState(0);
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = React.useState(false);
  const [markingAll, setMarkingAll] = React.useState(false);

  // MiniPay integration is dormant (standalone mode).
  // The Celo/wagmi foundation remains in the codebase for future blockchain features,
  // but runtime detection is disabled — the app runs as a standalone Turbopay wallet.
  // useAutoConnect(); // disabled — standalone mode
  // MiniPay detection effect removed — minipayMode stays false, MiniPay nav items hidden.

  // Command palette (Cmd+K / Ctrl+K)
  const [cmdOpen, setCmdOpen] = React.useState(false);

  // Sidebar collapse — persisted to localStorage so it survives reloads.
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("tp_sidebar_collapsed");
      if (stored === "true") setCollapsed(true);
    } catch {
      /* localStorage may be unavailable (private mode) — skip */
    }
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem("tp_sidebar_collapsed", String(collapsed));
    } catch {
      /* ignore quota / privacy errors */
    }
  }, [collapsed]);

  // Global Cmd+K / Ctrl+K keyboard shortcut to toggle the command palette.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  React.useEffect(() => setMounted(true), []);

  const loadNotifs = React.useCallback(async (filter: NotifFilter = "all") => {
    try {
      setLoadingNotifs(true);
      const res = await fetch(`/api/notifications?filter=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnread(data.unread ?? 0);
      }
    } catch {
    } finally {
      setLoadingNotifs(false);
    }
  }, []);

  // Initial load + 30s polling for the unread badge (lightweight: uses filter=all
  // but we only care about the unread count between opens).
  React.useEffect(() => {
    loadNotifs("all");
    const id = setInterval(() => {
      fetch("/api/notifications?filter=all")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setUnread(d.unread ?? 0);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [loadNotifs]);

  // Reload with current filter whenever the panel opens.
  React.useEffect(() => {
    if (notifOpen) loadNotifs(notifFilter);
  }, [notifOpen, notifFilter, loadNotifs]);

  async function handleMarkAllRead() {
    if (unread === 0) return;
    try {
      setMarkingAll(true);
      await fetch("/api/notifications", { method: "PATCH" });
      setUnread(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Couldn't mark all as read");
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleNotificationClick(n: AppNotification) {
    // Mark as read individually (fire-and-forget, optimistic local update).
    if (!n.read) {
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
      setUnread((u) => Math.max(0, u - 1));
      try {
        await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" });
      } catch {}
    }
    const targetView = resolveActionView(n.actionUrl);
    if (targetView) {
      setNotifOpen(false);
      setView(targetView);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    useApp.getState().logoutClient();
    toast.success("Signed out");
    router.refresh();
  }

  // Session timeout — auto-logout after 15 min inactivity (2-min warning).
  const handleTimeout = React.useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    useApp.getState().logoutClient();
    toast.info("You've been signed out due to inactivity", {
      description: "Please log in again to continue.",
    });
    router.refresh();
  }, [router]);

  const session = useSessionTimeout({
    inactivityMs: 15 * 60 * 1000,
    warningMs: 2 * 60 * 1000,
    onTimeout: handleTimeout,
    enabled: true,
  });

  const CurrentView = Views[view];
  const initials = user.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  // MiniPay nav items are dormant (standalone mode) — minipayMode is always false.
  const minipayMode = false;
  const celoAddress: string | null = null;
  // Compute nav groups — when minipayMode is on, inject the MiniPay nav items
  // into the Financial group so they appear in the sidebar.
  const navGroups = React.useMemo(() => {
    const baseNav = user.role === "ADMIN" ? [...USER_NAV, ...ADMIN_NAV] : USER_NAV;
    if (!minipayMode) return baseNav;
    return baseNav.map((g) =>
      g.group === "Financial"
        ? { ...g, items: [...g.items, ...MINIPAY_NAV_ITEMS] }
        : g,
    );
  }, [user.role]);

  const renderSidebarContent = (opts: { collapsed: boolean; onToggleCollapse?: () => void }) => {
    const { collapsed: c, onToggleCollapse } = opts;
    return (
      <div className="flex h-full flex-col">
        {/* Header — logo + collapse toggle (desktop only) */}
        <div className={cn("flex h-16 items-center gap-2 border-b", c ? "justify-center px-2" : "px-4")}>
          <Logo size={30} />
          {!c && <Wordmark size={18} />}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              aria-label={c ? "Expand sidebar" : "Collapse sidebar"}
              title={c ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground tp-btn-press",
                c ? "ml-0" : "ml-auto",
              )}
            >
              <ChevronLeft className={cn("h-4 w-4 transition-transform duration-300", c && "rotate-180")} />
            </button>
          )}
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3">
          {navGroups.map((group) => (
            <div key={group.group} className={cn(c ? "mb-3" : "mb-4")}>
              {!c && (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.group}
                </p>
              )}
              {c && <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden />}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  if (item.cond && !item.cond(user)) return null;
                  const active = view === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setView(item.key)}
                      title={c ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      data-active={active ? "true" : "false"}
                      className={cn(
                        "tp-nav-item flex w-full items-center rounded-lg text-sm font-medium",
                        c ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
                        active
                          ? ""
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4.5 w-4.5 shrink-0" />
                      {!c && <span className="truncate">{item.label}</span>}
                      {!c && item.key === "kyc" && user.kycStatus !== "VERIFIED" && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — licensed-by badge (or dot when collapsed) */}
        <div className="border-t p-2">
          {!c ? (
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Turbopay MFB</p>
              <p className="mt-0.5">Licensed partners · NDPR-aware</p>
            </div>
          ) : (
            <div className="flex justify-center py-1" title="Turbopay MFB · Licensed partners">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_1px_oklch(0.72_0.14_162/0.6)]" />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <PinDialogProvider>
      <div className="flex min-h-screen bg-background">
        {/* Desktop sidebar — collapses to icon-only (w-16) when `collapsed` is true */}
        <aside
          className={cn(
            "tp-sidebar-glow sticky top-0 hidden h-screen shrink-0 border-r bg-sidebar transition-all duration-300 lg:block",
            collapsed ? "w-16" : "w-64",
          )}
        >
          {renderSidebarContent({
            collapsed,
            onToggleCollapse: () => setCollapsed((v) => !v),
          })}
        </aside>

        {/* Mobile sidebar (always expanded — collapse toggle is desktop-only) */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            {renderSidebarContent({ collapsed: false })}
          </SheetContent>
        </Sheet>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="tp-header-glass sticky top-0 z-30 flex h-16 items-center gap-3 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <Logo size={26} />
              <Wordmark size={16} />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="hidden text-lg font-semibold sm:block">{VIEW_TITLES[view]}</h2>
              {minipayMode && (
                <span
                  title="Running inside MiniPay"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  <Zap className="h-3 w-3" /> MiniPay
                </span>
              )}
              {minipayMode && celoAddress && (
                <span
                  title={celoAddress}
                  className="hidden font-mono text-[10px] text-muted-foreground md:inline"
                >
                  {celoAddress.slice(0, 6)}…{celoAddress.slice(-4)}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {/* Command palette trigger — discoverable ⌘K hint (desktop only) */}
              <button
                onClick={() => setCmdOpen(true)}
                aria-label="Open command palette"
                title="Open command palette (⌘K)"
                className="hidden h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
                <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px] shadow-sm">⌘K</kbd>
              </button>
              <CountrySwitcher />
              <Button size="sm" className="gap-1.5" onClick={() => setView("wallet")}>
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Fund wallet</span>
              </Button>
              <button
                onClick={() => setNotifOpen(true)}
                aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted tp-btn-press"
              >
                <Bell className="h-4.5 w-4.5" />
                {unread > 0 && (
                  <span className="tp-badge-pulse absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
                className="tp-theme-toggle"
                data-theme={mounted && theme === "dark" ? "dark" : "light"}
              >
                <span className="tp-theme-toggle-icon"><Sun className="h-3.5 w-3.5" /></span>
                <span className="tp-theme-toggle-icon"><Moon className="h-3.5 w-3.5" /></span>
                <span className="tp-theme-toggle-thumb">
                  {mounted && theme === "dark" ? (
                    <Moon className="h-3.5 w-3.5" />
                  ) : (
                    <Sun className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted">
                    <Avatar className="h-8 w-8 border">
                      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                    <Badge variant="secondary" className="mt-1.5 gap-1 text-[10px]">
                      <ShieldCheck className="h-3 w-3" /> KYC Tier {user.kycTier}
                    </Badge>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setView("settings")}>
                    <Settings className="mr-2 h-4 w-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setView("security")}>
                    <ShieldCheck className="mr-2 h-4 w-4" /> Security
                  </DropdownMenuItem>
                  {user.role === "ADMIN" && (
                    <DropdownMenuItem onClick={() => setView("admin")}>
                      <UserCog className="mr-2 h-4 w-4" /> Admin Console
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Notifications slide-over panel */}
          <NotificationCenterPanel
            open={notifOpen}
            onOpenChange={setNotifOpen}
            notifications={notifications}
            loading={loadingNotifs}
            unread={unread}
            filter={notifFilter}
            onFilterChange={setNotifFilter}
            onMarkAllRead={handleMarkAllRead}
            markingAll={markingAll}
            onNotificationClick={handleNotificationClick}
          />

          {/* Main content */}
          <main className="flex-1 px-4 py-6 pb-24 lg:pb-6">
            <ViewTransition viewKey={view}>
              <div key={view} className="mx-auto max-w-6xl tp-view-enter">
                <React.Suspense
                  fallback={
                    <div className="flex h-64 items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
                    </div>
                  }
                >
                  <CurrentView />
                </React.Suspense>
              </div>
            </ViewTransition>
          </main>

          {/* Bottom nav (mobile) */}
          <nav
            aria-label="Primary navigation"
            className="tp-header-glass fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t bg-background/95 lg:hidden"
          >
            {BOTTOM_NAV.map((item) => {
              const active = view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-all duration-200 active:scale-95 ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {/* Active top-border indicator (2px emerald line) */}
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary transition-opacity duration-200 ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <item.icon
                    className={`h-5 w-5 transition-transform duration-200 ${
                      active ? "scale-[1.15]" : "scale-100"
                    }`}
                  />
                  <span>{item.label}</span>
                  {/* Emerald glow dot under the label (active only) */}
                  <span
                    aria-hidden
                    className={`absolute bottom-1 h-1.5 w-1.5 rounded-full bg-primary transition-all duration-200 ${
                      active
                        ? "scale-100 opacity-100 shadow-[0_0_8px_1px_oklch(0.72_0.14_162/0.7)]"
                        : "scale-0 opacity-0"
                    }`}
                  />
                </button>
              );
            })}
          </nav>
        </div>
      </div>
      <AiSupport />

      {/* Mobile floating action button (speed dial) */}
      <FabSpeedDial onPick={(v) => setView(v)} />

      {/* Session timeout warning dialog */}
      <SessionTimeoutDialog
        open={session.warning}
        secondsLeft={session.secondsLeft}
        onStay={session.staySignedIn}
        onSignOut={session.signOutNow}
      />

      {/* Guided onboarding overlay (shows after login until PIN + wallet + KYC complete) */}
      <OnboardingOverlay user={user} />

      {/* Command palette (Cmd+K / Ctrl+K) */}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </PinDialogProvider>
  );
}

// ============== Session Timeout Dialog ==============

function SessionTimeoutDialog({
  open,
  secondsLeft,
  onStay,
  onSignOut,
}: {
  open: boolean;
  secondsLeft: number;
  onStay: () => void;
  onSignOut: () => void;
}) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  // Countdown ring (SVG) — fraction of the 2-minute window remaining.
  const totalSeconds = 120;
  const fraction = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);

  // Amber/red transition when < 30s left
  const urgent = secondsLeft <= 30;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm gap-0 p-0" onPointerDownOutside={(e) => e.preventDefault()}>
        {/* Amber header band */}
        <div
          className={`flex flex-col items-center gap-3 rounded-t-lg px-6 pb-5 pt-7 text-center ${
            urgent
              ? "bg-gradient-to-b from-red-500/15 to-transparent"
              : "bg-gradient-to-b from-amber-500/15 to-transparent"
          }`}
        >
          <div className="relative flex h-20 w-20 items-center justify-center">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 96 96">
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-muted/30"
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className={urgent ? "text-red-500" : "text-amber-500"}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              {urgent ? (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              ) : (
                <Clock className="h-5 w-5 text-amber-500" />
              )}
              <span
                className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                  urgent ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {timeLabel}
              </span>
            </div>
          </div>

          <DialogHeader className="space-y-1.5 p-0">
            <DialogTitle className="text-base">
              Your session is about to expire
            </DialogTitle>
            <DialogDescription>
              You&apos;ve been inactive for a while. For your security, we&apos;ll sign you out
              automatically when the timer runs out.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-2 px-6 py-4">
          <Button onClick={onStay} className="w-full gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Stay signed in
          </Button>
          <Button
            variant="outline"
            onClick={onSignOut}
            className="w-full gap-1.5 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
          >
            <LogOut className="h-4 w-4" /> Sign out now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============== Notification Center Slide-over ==============

function NotificationCenterPanel({
  open,
  onOpenChange,
  notifications,
  loading,
  unread,
  filter,
  onFilterChange,
  onMarkAllRead,
  markingAll,
  onNotificationClick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  notifications: AppNotification[];
  loading: boolean;
  unread: number;
  filter: NotifFilter;
  onFilterChange: (f: NotifFilter) => void;
  onMarkAllRead: () => void;
  markingAll: boolean;
  onNotificationClick: (n: AppNotification) => void;
}) {
  const FILTERS: { key: NotifFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "important", label: "Important" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        {/* Header */}
        <SheetHeader className="gap-0 border-b p-0">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-base">Notifications</SheetTitle>
              {unread > 0 && (
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  {unread} new
                </Badge>
              )}
            </div>
            <button
              onClick={onMarkAllRead}
              disabled={unread === 0 || markingAll}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {markingAll ? "Marking…" : "Mark all read"}
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 px-5 pb-3">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => onFilterChange(f.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <NotificationListSkeleton />
          ) : notifications.length === 0 ? (
            <NotificationEmpty filter={filter} />
          ) : (
            <div className="tp-slide-in-right">
              {notifications.map((n) => {
                const { Icon, tone } = notifVisual(n.type);
                const targetView = resolveActionView(n.actionUrl);
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    data-unread={!n.read}
                    onClick={() => onNotificationClick(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onNotificationClick(n);
                      }
                    }}
                    className="tp-notification-item"
                  >
                    {/* Icon tile */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone] ?? TONE_CLASSES.slate}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight">
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </span>
                        {n.priority === "HIGH" && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Important
                          </span>
                        )}
                        {targetView && (
                          <span className="tp-link-underline text-[11px] font-medium text-primary">
                            View
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <SheetFooter className="border-t p-0">
          <button
            onClick={() => onOpenChange(false)}
            className="flex w-full items-center justify-center gap-1.5 px-5 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
          >
            View all
            <ChevronRight className="h-4 w-4" />
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function NotificationListSkeleton() {
  return (
    <div className="space-y-0 p-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b p-4">
          <div className="tp-skeleton-shimmer h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="tp-skeleton-shimmer h-3.5 w-3/4 rounded" />
            <div className="tp-skeleton-shimmer h-3 w-full rounded" />
            <div className="tp-skeleton-shimmer h-2.5 w-1/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationEmpty({ filter }: { filter: NotifFilter }) {
  const msg =
    filter === "unread"
      ? "You're all caught up"
      : filter === "important"
        ? "No important notifications"
        : "No notifications";
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Bell className="h-7 w-7 text-primary" />
        {/* Subtle ring around the bell illustration */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20"
        />
      </div>
      <div>
        <p className="text-sm font-semibold">{msg}</p>
        <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Inbox className="h-3 w-3" />
          New activity will appear here.
        </p>
      </div>
    </div>
  );
}

// ============== Mobile FAB Speed Dial ==============

const FAB_ACTIONS: { key: ViewKey; label: string; icon: any; tone: string }[] = [
  { key: "transfer", label: "Send", icon: ArrowLeftRight, tone: "bg-emerald-500" },
  { key: "airtime", label: "Airtime", icon: Smartphone, tone: "bg-amber-500" },
  { key: "bills", label: "Bills", icon: Receipt, tone: "bg-violet-500" },
  { key: "qr", label: "QR Pay", icon: QrCode, tone: "bg-sky-500" },
];

function FabSpeedDial({ onPick }: { onPick: (v: ViewKey) => void }) {
  const [open, setOpen] = React.useState(false);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function pick(v: ViewKey) {
    onPick(v);
    setOpen(false);
  }

  return (
    <div className="lg:hidden" aria-label="Quick actions">
      {/* Backdrop overlay — click to close */}
      {open && (
        <button
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-in fade-in-0 duration-150"
        />
      )}

      {/* Speed-dial stack (sits above the FAB; items stack upward) */}
      <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2.5">
        {FAB_ACTIONS.map((a, i) => {
          // Stagger from bottom to top: the last action (topmost) appears last.
          const delay = (FAB_ACTIONS.length - 1 - i) * 45;
          return (
            <div
              key={a.key}
              className={`flex items-center gap-2 transition-all duration-200 ${
                open
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-3 opacity-0"
              }`}
              style={{ transitionDelay: open ? `${delay}ms` : "0ms" }}
            >
              {/* Label pill */}
              <span
                className={`rounded-lg bg-popover/95 px-2.5 py-1 text-xs font-semibold shadow-md ring-1 ring-border transition-colors ${
                  open ? "scale-100" : "scale-90"
                }`}
              >
                {a.label}
              </span>
              {/* Round mini-button */}
              <button
                onClick={() => pick(a.key)}
                aria-label={a.label}
                className={`flex h-11 w-11 items-center justify-center rounded-full ${a.tone} text-white shadow-lg ring-2 ring-white/40 transition-transform active:scale-90`}
              >
                <a.icon className="h-5 w-5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Main FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        aria-expanded={open}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-white/50 transition-transform duration-300 active:scale-90 lg:hidden"
        style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
      >
        <Plus className="h-6 w-6" />
        {/* Pulsing ring when closed */}
        {!open && (
          <span
            aria-hidden
            className="absolute inset-0 animate-ping rounded-full bg-emerald-500/30"
            style={{ animationDuration: "2.5s" }}
          />
        )}
      </button>
    </div>
  );
}
