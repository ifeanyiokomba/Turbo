// Turbopay constants — app-level enum equivalents (SQLite has no native enums)

export const UserRole = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: "ACTIVE",
  FROZEN: "FROZEN",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const KycStatus = {
  UNVERIFIED: "UNVERIFIED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const WalletStatus = {
  ACTIVE: "ACTIVE",
  FROZEN: "FROZEN",
} as const;

export const EntryType = {
  DEBIT: "DEBIT",
  CREDIT: "CREDIT",
} as const;

export const RefType = {
  FUNDING: "FUNDING",
  TRANSFER: "TRANSFER",
  AIRTIME: "AIRTIME",
  DATA: "DATA",
  BILL: "BILL",
  REVERSAL: "REVERSAL",
  FEE: "FEE",
  CARD_FUND: "CARD_FUND",
  CARD_WITHDRAW: "CARD_WITHDRAW",
  REWARD: "REWARD",
  REFERRAL: "REFERRAL",
  SAVINGS: "SAVINGS",
  INVESTMENT: "INVESTMENT",
  CELO_DEPOSIT: "CELO_DEPOSIT",
  CELO_WITHDRAW: "CELO_WITHDRAW",
  CELO_PAYMENT: "CELO_PAYMENT",
} as const;

export const TxType = {
  FUNDING: "FUNDING",
  TRANSFER: "TRANSFER",
  AIRTIME: "AIRTIME",
  DATA: "DATA",
  BILL: "BILL",
  CARD_FUND: "CARD_FUND",
  CARD_WITHDRAW: "CARD_WITHDRAW",
  REWARD: "REWARD",
  REFERRAL: "REFERRAL",
  SAVINGS_DEPOSIT: "SAVINGS_DEPOSIT",
  SAVINGS_WITHDRAW: "SAVINGS_WITHDRAW",
  INVESTMENT: "INVESTMENT",
  CELO_DEPOSIT: "CELO_DEPOSIT",
  CELO_WITHDRAW: "CELO_WITHDRAW",
  CELO_PAYMENT: "CELO_PAYMENT",
} as const;

export const TxDirection = {
  CREDIT: "CREDIT",
  DEBIT: "DEBIT",
} as const;

export const TxStatus = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  REVERSED: "REVERSED",
} as const;

export const TxState = {
  INITIATED: "INITIATED",
  PIN_VERIFIED: "PIN_VERIFIED",
  SETTLED: "SETTLED",
  REVERSED: "REVERSED",
} as const;

export const KYC_TIER_LIMITS: Record<
  number,
  {
    label: string;
    singleTxLimitKobo: number;
    dailyLimitKobo: number;
    maxBalanceKobo: number;
  }
> = {
  1: {
    label: "Starter",
    singleTxLimitKobo: 5_000_000,
    dailyLimitKobo: 15_000_000,
    maxBalanceKobo: 30_000_000,
  },
  2: {
    label: "Verified",
    singleTxLimitKobo: 50_000_000,
    dailyLimitKobo: 200_000_000,
    maxBalanceKobo: 500_000_000,
  },
  3: {
    label: "Premium",
    singleTxLimitKobo: 500_000_000,
    dailyLimitKobo: 2_000_000_000,
    maxBalanceKobo: Number.MAX_SAFE_INTEGER,
  },
};

export const NETWORKS = [
  { id: "MTN", name: "MTN", color: "#FFCC00", textColor: "#000" },
  { id: "GLO", name: "Glo", color: "#00B04C", textColor: "#fff" },
  { id: "AIRTEL", name: "Airtel", color: "#E40000", textColor: "#fff" },
  { id: "NMOBILE", name: "9mobile", color: "#006A4E", textColor: "#fff" },
] as const;

export const BILL_CATEGORIES = [
  { id: "ELECTRICITY", name: "Electricity", icon: "Zap", color: "#F59E0B" },
  { id: "INTERNET", name: "Internet", icon: "Wifi", color: "#0EA5E9" },
  { id: "CABLE", name: "Cable TV", icon: "Tv", color: "#8B5CF6" },
  { id: "WATER", name: "Water", icon: "Droplets", color: "#06B6D4" },
  { id: "EDUCATION", name: "Education", icon: "GraduationCap", color: "#F97316" },
  { id: "INSURANCE", name: "Insurance", icon: "ShieldCheck", color: "#10B981" },
  { id: "GOVERNMENT", name: "Government", icon: "Landmark", color: "#64748B" },
  { id: "BETTING", name: "Betting", icon: "Flame", color: "#EF4444" },
] as const;

export const STORAGE_KEYS = {
  LOCALE: "tp_locale",
  THEME: "tp_theme",
  BENEFICIARIES: "tp_beneficiaries",
} as const;
