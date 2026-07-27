"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewKey =
  | "dashboard"
  | "wallet"
  | "transfer"
  | "airtime"
  | "bills"
  | "history"
  | "cards"
  | "savings"
  | "investments"
  | "kyc"
  | "beneficiaries"
  | "qr"
  | "settings"
  | "security"
  | "rewards"
  | "support"
  | "admin"
  | "multi-currency"
  | "intl-transfers"
  | "mobile-money"
  | "payment-links"
  | "scheduled-payments"
  | "analytics"
  | "disputes"
  | "vouchers"
  | "help-center"
  | "achievements"
  | "marketplace"
  | "subscriptions"
  | "wallet-insights"
  | "minipay-wallet"
  | "onchain-history"
  | "celo-bridge"
  | "merchant-dashboard";

export interface AppUser {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  country: string;
  role: "USER" | "ADMIN";
  kycTier: number;
  kycStatus: string;
  status: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  hasPin: boolean;
}

interface AppState {
  user: AppUser | null;
  view: ViewKey;
  sidebarOpen: boolean;
  loading: boolean;
  minipayMode: boolean;
  celoAddress: string | null;
  setUser: (u: AppUser | null) => void;
  setView: (v: ViewKey) => void;
  setSidebarOpen: (open: boolean) => void;
  setLoading: (l: boolean) => void;
  setMinipayMode: (v: boolean) => void;
  setCeloAddress: (a: string | null) => void;
  logoutClient: () => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      view: "dashboard",
      sidebarOpen: false,
      loading: true,
      minipayMode: false,
      celoAddress: null,
      setUser: (u) => set({ user: u }),
      setView: (v) => set({ view: v, sidebarOpen: false }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setLoading: (l) => set({ loading: l }),
      setMinipayMode: (v) => set({ minipayMode: v }),
      setCeloAddress: (a) => set({ celoAddress: a }),
      logoutClient: () =>
        set({ user: null, view: "dashboard", minipayMode: false, celoAddress: null }),
    }),
    {
      name: "tp_app",
      partialize: (s) => ({ view: s.view }) as AppState,
    }
  )
);
