"use client";

import * as React from "react";
import { useApp, type ViewKey } from "./store";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
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
  QrCode,
  Gift,
  LifeBuoy,
  UserCog,
  BarChart3,
  Globe,
  Plane,
  Link as LinkIcon,
  CalendarClock,
  Scale,
  Ticket,
  HelpCircle,
  Award,
  LogOut,
  Send,
  Plus,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";

// All 28 navigation targets, grouped for the command palette.
// Order matches the sidebar "Financial" then "Account" groups.
const NAV_ITEMS: { key: ViewKey; label: string; icon: LucideIcon; keywords?: string }[] = [
  { key: "dashboard", label: "Home", icon: LayoutDashboard, keywords: "dashboard overview" },
  { key: "wallet", label: "Wallet", icon: Wallet, keywords: "balance fund topup" },
  { key: "transfer", label: "Transfer", icon: ArrowLeftRight, keywords: "send money" },
  { key: "qr", label: "QR Pay", icon: QrCode, keywords: "scan code" },
  { key: "airtime", label: "Airtime & Data", icon: Smartphone, keywords: "recharge bundle" },
  { key: "bills", label: "Pay Bills", icon: Receipt, keywords: "electricity utility dstv" },
  { key: "multi-currency", label: "Multi-Currency Wallets", icon: Globe, keywords: "usd eur ghs forex" },
  { key: "intl-transfers", label: "International Transfers", icon: Plane, keywords: "wise swift abroad" },
  { key: "mobile-money", label: "Mobile Money", icon: Smartphone, keywords: "momo mpesa airtel" },
  { key: "payment-links", label: "Payment Links", icon: LinkIcon, keywords: "request invoice" },
  { key: "cards", label: "Virtual Cards", icon: CreditCard, keywords: "card visa pan" },
  { key: "savings", label: "Savings", icon: PiggyBank, keywords: "goals stash" },
  { key: "investments", label: "Investments", icon: TrendingUp, keywords: "invest returns" },
  { key: "scheduled-payments", label: "Scheduled Payments", icon: CalendarClock, keywords: "recurring auto" },
  { key: "history", label: "Transactions", icon: History, keywords: "history statement" },
  { key: "analytics", label: "Analytics", icon: BarChart3, keywords: "insights charts" },
  { key: "kyc", label: "KYC & Limits", icon: ShieldCheck, keywords: "verify nin bvn tier" },
  { key: "beneficiaries", label: "Beneficiaries", icon: Users, keywords: "recipients saved" },
  { key: "rewards", label: "Rewards", icon: Gift, keywords: "points referral" },
  { key: "achievements", label: "Achievements", icon: Award, keywords: "badges streak" },
  { key: "vouchers", label: "Vouchers", icon: Ticket, keywords: "gift promo code" },
  { key: "disputes", label: "Disputes", icon: Scale, keywords: "complaint chargeback" },
  { key: "help-center", label: "Help Center", icon: HelpCircle, keywords: "faq docs guide" },
  { key: "security", label: "Security", icon: ShieldCheck, keywords: "2fa pin devices sessions" },
  { key: "settings", label: "Settings", icon: Settings, keywords: "profile preferences" },
  { key: "support", label: "Help & Support", icon: LifeBuoy, keywords: "contact chat ticket" },
];

// Quick action items — these resolve to specific views with a clear intent.
const QUICK_ACTIONS: {
  label: string;
  hint: string;
  icon: LucideIcon;
  view: ViewKey;
  keywords: string;
}[] = [
  { label: "Send money", hint: "Transfer to a beneficiary", icon: Send, view: "transfer", keywords: "transfer pay send" },
  { label: "Buy airtime", hint: "Top up airtime or data", icon: Smartphone, view: "airtime", keywords: "recharge data bundle" },
  { label: "Pay bills", hint: "Electricity, cable, water", icon: Receipt, view: "bills", keywords: "utility dstv payment" },
  { label: "Fund wallet", hint: "Add money to wallet", icon: Plus, view: "wallet", keywords: "deposit topup" },
  { label: "Create card", hint: "Issue a new virtual card", icon: CreditCard, view: "cards", keywords: "visa card issue" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const setView = useApp((s) => s.setView);
  const user = useApp((s) => s.user);

  const go = React.useCallback(
    (v: ViewKey) => {
      setView(v);
      onOpenChange(false);
    },
    [setView, onOpenChange],
  );

  const handleLogout = React.useCallback(async () => {
    onOpenChange(false);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* swallow — we log out client-side regardless */
    }
    useApp.getState().logoutClient();
    // Force a refresh so server components re-evaluate the session.
    if (typeof window !== "undefined") window.location.reload();
  }, [onOpenChange]);

  // Admin-only navigation entry — appended conditionally.
  const navItems = React.useMemo(() => {
    if (user?.role === "ADMIN") {
      return [
        ...NAV_ITEMS,
        { key: "admin" as ViewKey, label: "Admin Console", icon: UserCog, keywords: "admin dashboard console" },
      ];
    }
    return NAV_ITEMS;
  }, [user?.role]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Turbopay command palette"
      description="Search views, quick actions, and account settings."
      className="max-w-2xl rounded-2xl p-0"
      showCloseButton={false}
    >
      <CommandInput placeholder="Type a command or search…" autoFocus />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick actions */}
        <CommandGroup heading="Quick actions">
          {QUICK_ACTIONS.map((a) => (
            <CommandItem
              key={a.label}
              value={`${a.label} ${a.keywords} ${a.hint}`}
              onSelect={() => go(a.view)}
              className="group rounded-lg data-[selected=true]:bg-emerald-500/10 data-[selected=true]:text-emerald-700 dark:data-[selected=true]:text-emerald-300"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors group-data-[selected=true]:bg-emerald-500/20">
                <a.icon className="h-4 w-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium leading-tight">{a.label}</span>
                <span className="truncate text-[11px] text-muted-foreground">{a.hint}</span>
              </div>
              <CornerDownLeft className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Navigate — all views */}
        <CommandGroup heading="Navigate">
          {navItems.map((n) => (
            <CommandItem
              key={n.key}
              value={`${n.label} ${n.keywords ?? ""}`}
              onSelect={() => go(n.key)}
              className="group rounded-lg data-[selected=true]:bg-emerald-500/10 data-[selected=true]:text-emerald-700 dark:data-[selected=true]:text-emerald-300"
            >
              <n.icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-data-[selected=true]:text-emerald-600 dark:group-data-[selected=true]:text-emerald-300" />
              <span className="text-sm">{n.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Account */}
        <CommandGroup heading="Account">
          <CommandItem
            value="settings preferences profile"
            onSelect={() => go("settings")}
            className="group rounded-lg data-[selected=true]:bg-emerald-500/10 data-[selected=true]:text-emerald-700 dark:data-[selected=true]:text-emerald-300"
          >
            <Settings className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-data-[selected=true]:text-emerald-600 dark:group-data-[selected=true]:text-emerald-300" />
            <span className="text-sm">Settings</span>
          </CommandItem>
          <CommandItem
            value="security 2fa pin sessions devices"
            onSelect={() => go("security")}
            className="group rounded-lg data-[selected=true]:bg-emerald-500/10 data-[selected=true]:text-emerald-700 dark:data-[selected=true]:text-emerald-300"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-data-[selected=true]:text-emerald-600 dark:group-data-[selected=true]:text-emerald-300" />
            <span className="text-sm">Security</span>
          </CommandItem>
          <CommandItem
            value="kyc verify nin bvn limits tier"
            onSelect={() => go("kyc")}
            className="group rounded-lg data-[selected=true]:bg-emerald-500/10 data-[selected=true]:text-emerald-700 dark:data-[selected=true]:text-emerald-300"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-data-[selected=true]:text-emerald-600 dark:group-data-[selected=true]:text-emerald-300" />
            <span className="text-sm">KYC &amp; Limits</span>
          </CommandItem>
          <CommandItem
            value="logout signout sign out exit"
            onSelect={handleLogout}
            className="group rounded-lg data-[selected=true]:bg-red-500/10 data-[selected=true]:text-red-600 dark:data-[selected=true]:text-red-400"
          >
            <LogOut className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-data-[selected=true]:text-red-600 dark:group-data-[selected=true]:text-red-400" />
            <span className="text-sm">Logout</span>
          </CommandItem>
        </CommandGroup>

        {/* Footer hint bar — keyboard shortcut legend */}
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-background px-1 font-mono text-[10px] shadow-sm">
                <ArrowUp className="h-2.5 w-2.5" />
              </kbd>
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-background px-1 font-mono text-[10px] shadow-sm">
                <ArrowDown className="h-2.5 w-2.5" />
              </kbd>
              <span className="ml-1">Navigate</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-background px-1 font-mono text-[10px] shadow-sm">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </kbd>
              <span className="ml-1">Select</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="inline-flex h-5 items-center justify-center rounded border bg-background px-1.5 font-mono text-[10px] shadow-sm">
                esc
              </kbd>
              <span className="ml-1">Close</span>
            </span>
          </div>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] shadow-sm">⌘</kbd>
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] shadow-sm">K</kbd>
            <span className="ml-1">to toggle</span>
          </span>
        </div>
      </CommandList>
    </CommandDialog>
  );
}
