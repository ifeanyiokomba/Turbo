"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp, type ViewKey } from "./store";
import { Logo, Wordmark } from "./logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PinDialogProvider } from "./parts/pin-dialog";
import { ViewTransition } from "./view-transition";
import AiSupport from "./ai-support";
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
  Sparkles,
  LifeBuoy,
  Gift,
  UserCog,
  Plus,
  QrCode,
  Globe,
  Plane,
  Link as LinkIcon,
  CalendarClock,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

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
      { key: "cards", label: "Virtual Cards", icon: CreditCard },
      { key: "savings", label: "Savings", icon: PiggyBank },
      { key: "investments", label: "Investments", icon: TrendingUp },
      { key: "scheduled-payments", label: "Scheduled", icon: CalendarClock },
      { key: "history", label: "Transactions", icon: History },
    ],
  },
  {
    group: "Account",
    items: [
      { key: "kyc", label: "KYC & Limits", icon: ShieldCheck },
      { key: "beneficiaries", label: "Beneficiaries", icon: Users },
      { key: "rewards", label: "Rewards", icon: Gift },
      { key: "security", label: "Security", icon: ShieldCheck },
      { key: "settings", label: "Settings", icon: Settings },
      { key: "support", label: "Help & Support", icon: LifeBuoy },
    ],
  },
];

// Countries where Mobile Money is supported (matches CountryConfig.paymentMethods includes "MOBILE_MONEY")
const MOBILE_MONEY_COUNTRIES = new Set(["KE", "GH", "UG", "TZ", "RW"]);

const ADMIN_NAV: { group: string; items: { key: ViewKey; label: string; icon: any }[] }[] = [
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
};

export function AppShell({ user }: { user: NonNullable<ReturnType<typeof useApp.getState>["user"]> }) {
  const router = useRouter();
  const { view, setView, sidebarOpen, setSidebarOpen } = useApp();
  const { theme, setTheme } = useTheme();
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  const [notifications, setNotifications] = React.useState<any[]>([]);

  const loadNotifs = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnread(data.unread ?? 0);
      }
    } catch {}
  }, []);

  // Initial load + 30s polling for the unread badge
  React.useEffect(() => {
    loadNotifs();
    const id = setInterval(loadNotifs, 30_000);
    return () => clearInterval(id);
  }, [loadNotifs]);

  // When the panel is opened, mark all as read after a 1s delay
  // so the user actually sees the unread items first.
  React.useEffect(() => {
    if (!notifOpen) return;
    if (unread === 0) return;
    const id = setTimeout(async () => {
      try {
        await fetch("/api/notifications", { method: "PATCH" });
        setUnread(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch {}
    }, 1_000);
    return () => clearTimeout(id);
  }, [notifOpen, unread]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    useApp.getState().logoutClient();
    toast.success("Signed out");
    router.refresh();
  }

  const CurrentView = Views[view];
  const initials = user.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const navGroups = user.role === "ADMIN" ? [...USER_NAV, ...ADMIN_NAV] : USER_NAV;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <Logo size={30} />
        <Wordmark size={18} />
      </div>
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.group} className="mb-5">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.group}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                if (item.cond && !item.cond(user)) return null;
                const active = view === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setView(item.key)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-4.5 w-4.5" />
                    {item.label}
                    {item.key === "kyc" && user.kycStatus !== "VERIFIED" && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t p-3">
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Turbopay MFB</p>
          <p className="mt-0.5">Licensed partners · NDPR-aware</p>
        </div>
      </div>
    </div>
  );

  return (
    <PinDialogProvider>
      <div className="flex min-h-screen bg-background">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-sidebar lg:block">
          {sidebarContent}
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            {sidebarContent}
          </SheetContent>
        </Sheet>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 tp-glass">
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
            <h2 className="hidden text-lg font-semibold sm:block">{VIEW_TITLES[view]}</h2>
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" className="gap-1.5" onClick={() => setView("wallet")}>
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Fund wallet</span>
              </Button>
              <button
                onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) loadNotifs(); }}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
              >
                <Bell className="h-4.5 w-4.5" />
                {unread > 0 && (
                  <span className="tp-pulse-dot absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-[0_0_8px_1px_oklch(0.62_0.22_25/0.7)]">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
              >
                {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
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

          {/* Notifications panel */}
          {notifOpen && (
            <div className="absolute right-4 top-16 z-40 w-80 rounded-xl border bg-popover shadow-xl">
              <div className="flex items-center justify-between border-b p-3">
                <p className="text-sm font-semibold">Notifications</p>
                <button onClick={() => setNotifOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
              </div>
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className={`border-b p-3 ${n.read ? "opacity-60" : ""}`}>
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Main content */}
          <main className="flex-1 px-4 py-6 pb-24 lg:pb-6">
            <ViewTransition viewKey={view}>
              <div className="mx-auto max-w-6xl">
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
            className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t bg-background/95 tp-glass lg:hidden"
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
    </PinDialogProvider>
  );
}
