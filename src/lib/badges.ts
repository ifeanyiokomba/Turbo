// Turbopay badge metadata — shared between the API (criteria lookup) and the
// achievements UI (icon/name/description/color rendering). All keys must match
// the UserBadge.badgeKey values written by /api/badges/route.ts.

export type BadgeKey =
  | "FIRST_FUNDING"
  | "FIRST_TRANSFER"
  | "FIRST_AIRTIME"
  | "FIRST_BILL"
  | "FIRST_CARD"
  | "FIRST_SAVINGS"
  | "FIRST_INVESTMENT"
  | "KYC_VERIFIED"
  | "PIN_SET"
  | "SAVVY_SAVER"
  | "BIG_SPENDER"
  | "EARLY_BIRD"
  | "REFERRAL_PRO"
  | "SECURE_USER";

export interface BadgeMeta {
  key: BadgeKey;
  name: string;
  description: string;
  /** Lucide icon component name (resolved on the client via the ICONS map). */
  icon: string;
  /** Tailwind color token used for earned badges (emerald | amber | violet | sky | rose). */
  color: "emerald" | "amber" | "violet" | "sky" | "rose";
}

export const BADGES: Record<BadgeKey, BadgeMeta> = {
  FIRST_FUNDING: {
    key: "FIRST_FUNDING",
    name: "First Funding",
    description: "Funded your wallet for the first time",
    icon: "Wallet",
    color: "emerald",
  },
  FIRST_TRANSFER: {
    key: "FIRST_TRANSFER",
    name: "First Transfer",
    description: "Sent your first transfer",
    icon: "Send",
    color: "emerald",
  },
  FIRST_AIRTIME: {
    key: "FIRST_AIRTIME",
    name: "First Airtime",
    description: "Bought your first airtime or data bundle",
    icon: "Smartphone",
    color: "amber",
  },
  FIRST_BILL: {
    key: "FIRST_BILL",
    name: "First Bill",
    description: "Paid your first bill on Turbopay",
    icon: "Receipt",
    color: "violet",
  },
  FIRST_CARD: {
    key: "FIRST_CARD",
    name: "First Card",
    description: "Created your first virtual card",
    icon: "CreditCard",
    color: "sky",
  },
  FIRST_SAVINGS: {
    key: "FIRST_SAVINGS",
    name: "First Savings",
    description: "Made your first savings deposit",
    icon: "PiggyBank",
    color: "rose",
  },
  FIRST_INVESTMENT: {
    key: "FIRST_INVESTMENT",
    name: "First Investment",
    description: "Started your first investment",
    icon: "TrendingUp",
    color: "emerald",
  },
  KYC_VERIFIED: {
    key: "KYC_VERIFIED",
    name: "Verified",
    description: "Completed KYC verification",
    icon: "BadgeCheck",
    color: "emerald",
  },
  PIN_SET: {
    key: "PIN_SET",
    name: "Secured",
    description: "Set your transaction PIN",
    icon: "Lock",
    color: "amber",
  },
  SAVVY_SAVER: {
    key: "SAVVY_SAVER",
    name: "Savvy Saver",
    description: "Saved ₦100,000+ in total",
    icon: "Coins",
    color: "emerald",
  },
  BIG_SPENDER: {
    key: "BIG_SPENDER",
    name: "Big Spender",
    description: "Spent ₦500,000+ in the last 30 days",
    icon: "ShoppingBag",
    color: "amber",
  },
  EARLY_BIRD: {
    key: "EARLY_BIRD",
    name: "Early Bird",
    description: "Joined Turbopay early on",
    icon: "Bird",
    color: "sky",
  },
  REFERRAL_PRO: {
    key: "REFERRAL_PRO",
    name: "Referral Pro",
    description: "Referred 3+ friends to Turbopay",
    icon: "Gift",
    color: "violet",
  },
  SECURE_USER: {
    key: "SECURE_USER",
    name: "Secure User",
    description: "Reached KYC tier 2 or higher",
    icon: "ShieldCheck",
    color: "emerald",
  },
};

// Stable display order (milestones first, then behavioural, then status).
export const BADGE_ORDER: BadgeKey[] = [
  "FIRST_FUNDING",
  "FIRST_TRANSFER",
  "FIRST_AIRTIME",
  "FIRST_BILL",
  "FIRST_CARD",
  "FIRST_SAVINGS",
  "FIRST_INVESTMENT",
  "PIN_SET",
  "KYC_VERIFIED",
  "SECURE_USER",
  "SAVVY_SAVER",
  "BIG_SPENDER",
  "REFERRAL_PRO",
  "EARLY_BIRD",
];

export const BADGE_TOTAL = BADGE_ORDER.length;

/** Color → tailwind class fragments for earned badges. */
export const BADGE_COLOR_CLASSES: Record<
  BadgeMeta["color"],
  {
    grad: string; // gradient bg for the icon tile
    ring: string; // ring border color
    text: string; // text color
    glow: string; // box-shadow glow
    chip: string; // small chip bg
  }
> = {
  emerald: {
    grad: "from-emerald-500/25 to-emerald-600/5 text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
    glow: "shadow-[0_0_24px_-4px_oklch(0.72_0.14_162/0.45)]",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  amber: {
    grad: "from-amber-500/25 to-orange-500/5 text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
    glow: "shadow-[0_0_24px_-4px_oklch(0.80_0.13_75/0.45)]",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  violet: {
    grad: "from-violet-500/25 to-violet-600/5 text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/30",
    text: "text-violet-600 dark:text-violet-400",
    glow: "shadow-[0_0_24px_-4px_oklch(0.65_0.18_303/0.45)]",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  sky: {
    grad: "from-sky-500/25 to-sky-600/5 text-sky-600 dark:text-sky-400",
    ring: "ring-sky-500/30",
    text: "text-sky-600 dark:text-sky-400",
    glow: "shadow-[0_0_24px_-4px_oklch(0.65_0.18_250/0.45)]",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  rose: {
    grad: "from-rose-500/25 to-rose-600/5 text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
    glow: "shadow-[0_0_24px_-4px_oklch(0.65_0.18_18/0.45)]",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};
