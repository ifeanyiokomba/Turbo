// GET /api/help — knowledge base catalog (static content).
//
// Returns categories with their articles. Each article carries helpful and
// unhelpful counts (static defaults; the client updates these locally after
// the user votes — no DB persistence for the catalog itself).
//
// This route requires an authenticated user, but content is identical for
// every user. Anonymous feedback from the "Was this helpful?" prompt is
// applied in-memory on the client only.

import { NextRequest } from "next/server";
import {
  json,
  handleError,
  requireUser,
  audit,
  getClientIp,
} from "@/lib/api";

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  helpful: number;
  unhelpful: number;
}

export interface HelpCategory {
  id: string;
  label: string;
  description: string;
}

const CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    description: "Set up your account and make your first transaction",
  },
  {
    id: "wallet-funding",
    label: "Wallet & Funding",
    description: "Add money, withdraw, and manage your balance",
  },
  {
    id: "transfers",
    label: "Transfers",
    description: "Send money to banks, wallets, and beneficiaries",
  },
  {
    id: "bills-payments",
    label: "Bills & Payments",
    description: "Pay utility bills, cable, and subscriptions",
  },
  {
    id: "cards",
    label: "Cards",
    description: "Virtual card creation, funding, and security",
  },
  {
    id: "security",
    label: "Security",
    description: "Protect your account, PIN, and devices",
  },
  {
    id: "account",
    label: "Account",
    description: "Profile, KYC, limits, and verification",
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    description: "Solve common errors and stuck payments",
  },
];

const ARTICLES: HelpArticle[] = [
  // ===== Getting Started (4) =====
  {
    id: "gs-create-account",
    title: "How to create your Turbopay account",
    category: "getting-started",
    helpful: 248,
    unhelpful: 6,
    content:
      "Open the Turbopay app or visit turbopay.app and tap Sign up. You'll need a valid phone number, an email address, and a strong password. We'll send a 6-digit OTP to your phone — enter it within 5 minutes to verify. After that, set your transaction PIN (4 digits) and you're ready to fund your wallet.\n\nIf your phone number is already registered, use the 'Forgot password' option on the login screen to recover access.",
  },
  {
    id: "gs-first-funding",
    title: "Making your first wallet funding",
    category: "getting-started",
    helpful: 192,
    unhelpful: 4,
    content:
      "Once your account is set up, head to Wallet → Add money. The fastest method is bank transfer to your assigned virtual account number — funds settle instantly and there are no fees. You can also fund with a debit card (small fee may apply) or via USSD.\n\nYour virtual account number is unique to your wallet and never changes, so you can save it as a beneficiary in your bank app for one-tap funding.",
  },
  {
    id: "gs-first-transfer",
    title: "Sending your first transfer",
    category: "getting-started",
    helpful: 167,
    unhelpful: 9,
    content:
      "Tap Transfer on your home screen and choose 'To bank account' or 'To Turbopay user'. Enter the recipient's account number or @username, the amount, an optional note, then confirm with your 4-digit PIN. Transfers to other Turbopay users settle instantly and are free. Bank transfers typically arrive within seconds.\n\nYou can save frequent recipients as beneficiaries for faster repeat transfers.",
  },
  {
    id: "gs-tour",
    title: "A 60-second tour of the dashboard",
    category: "getting-started",
    helpful: 134,
    unhelpful: 5,
    content:
      "Your dashboard shows your available balance, quick actions (Fund, Transfer, Pay bills, QR), recent transactions, and your spending insights. Tap the balance to expand it; tap any transaction to view its receipt. The sidebar on desktop (or hamburger menu on mobile) gives you access to all Turbopay features.\n\nCustomize which quick actions appear first under Settings → Quick actions.",
  },

  // ===== Wallet & Funding (4) =====
  {
    id: "wf-fund-methods",
    title: "All the ways to fund your wallet",
    category: "wallet-funding",
    helpful: 305,
    unhelpful: 8,
    content:
      "Turbopay supports four funding methods:\n\n1. Bank transfer to your virtual account number — instant, free, available 24/7.\n2. Debit card — Visa, Mastercard, Verve. Settles in under 1 minute; a small processor fee may apply.\n3. USSD — dial the code shown on the Fund screen from the phone number registered to your account.\n4. Receive from another Turbopay user — instant and free.\n\nAll methods credit your wallet in kobo (1 NGN = 100 kobo) and the balance updates immediately.",
  },
  {
    id: "wf-withdraw",
    title: "How to withdraw to your bank account",
    category: "wallet-funding",
    helpful: 224,
    unhelpful: 12,
    content:
      "To withdraw, go to Wallet → Transfer → To bank account. Enter the recipient bank details (or pick a saved beneficiary), the amount, and confirm with your PIN. Withdrawals to most Nigerian banks arrive within seconds, though first-time recipients may take a few minutes for bank-side validation.\n\nDaily withdrawal limits depend on your KYC tier — see the Account → KYC & Limits view for your current caps.",
  },
  {
    id: "wf-min-max",
    title: "Minimum and maximum wallet balances",
    category: "wallet-funding",
    helpful: 88,
    unhelpful: 3,
    content:
      "There's no minimum balance — you can keep your wallet at ₦0.00. The maximum balance is determined by your KYC tier:\n\n• Tier 1 (Starter): ₦200,000 max balance\n• Tier 2 (Verified): ₦2,000,000 max balance\n• Tier 3 (Premium): ₦20,000,000 max balance\n\nIf you need to hold more, upgrade your KYC tier under KYC & Limits.",
  },
  {
    id: "wf-stuck-funding",
    title: "What to do when funding doesn't arrive",
    category: "wallet-funding",
    helpful: 156,
    unhelpful: 14,
    content:
      "If your funding hasn't arrived after 10 minutes:\n\n1. Double-check the reference number — sometimes a typo in the account number sends the money elsewhere.\n2. Check Transactions → All to see if the payment shows as 'pending' — funds may be in bank-side review.\n3. If still missing after 30 minutes, raise a ticket under Help & Support with the reference number from your bank's transfer receipt.\n\nCard-funded deposits occasionally need manual reconciliation — contact support with your card's last 4 digits.",
  },

  // ===== Transfers (4) =====
  {
    id: "tr-bank-transfer",
    title: "How bank transfers work",
    category: "transfers",
    helpful: 287,
    unhelpful: 11,
    content:
      "Bank transfers in Turbopay use NIP (Nigeria Instant Payment) for instant settlement on most Nigerian banks. The recipient's name must match their bank account name exactly — otherwise the transfer will be flagged for review and may take up to 24 hours to clear.\n\nTo avoid delays, always verify the recipient's account number using the 'Resolve account' feature before confirming a transfer.",
  },
  {
    id: "tr-turbopay-to-turbopay",
    title: "Free transfers between Turbopay users",
    category: "transfers",
    helpful: 412,
    unhelpful: 4,
    content:
      "Transfers between two Turbopay accounts are always free and always instant — regardless of the amount, day, or time. Just enter the recipient's @username (or their phone number if they're saved as a beneficiary).\n\nThere's no limit on the number of Turbopay-to-Turbopay transfers you can make per day, making this perfect for splitting bills, paying back friends, or sending allowance to family.",
  },
  {
    id: "tr-fees",
    title: "Understanding transfer fees",
    category: "transfers",
    helpful: 198,
    unhelpful: 22,
    content:
      "Turbopay-to-Turbopay transfers are always free.\n\nBank transfers carry a small fee that depends on the amount:\n• Below ₦5,000: ₦25 flat fee\n• ₦5,000 – ₦50,000: ₦50 flat fee\n• Above ₦50,000: 0.75% of the amount (capped at ₦1,000)\n\nFees are clearly displayed before you confirm a transfer. International transfers have separate fee schedules — see International Transfers.",
  },
  {
    id: "tr-scheduled",
    title: "Scheduling transfers for later",
    category: "transfers",
    helpful: 142,
    unhelpful: 9,
    content:
      "Under Scheduled Payments, you can set up a transfer to execute at a future date or on a recurring schedule (daily, weekly, or monthly). The funds are reserved in your wallet at the time you schedule the transfer, so make sure you have sufficient balance.\n\nYou can edit or cancel a scheduled transfer up to 24 hours before its scheduled time. After that window, the transfer will execute automatically.",
  },

  // ===== Bills & Payments (3) =====
  {
    id: "bp-billers",
    title: "List of supported billers",
    category: "bills-payments",
    helpful: 256,
    unhelpful: 7,
    content:
      "Turbopay supports 80+ billers across electricity (IKEDC, EKEDC, AEDC, IBEDC, PHED, Kaduna, KEDCO, JED, Abuja, Yola), water (Lagos Water, ABWC, FCT Water), cable (DSTV, GOtv, Startimes), internet (Spectranet, Smile, Swift), betting (Bet9ja, Sportybet, Bangbet), and education (WAEC, JAMB, school fees).\n\nNew billers are added every month — check the Bills screen for the current list.",
  },
  {
    id: "bp-recurring",
    title: "Setting up recurring bill payments",
    category: "bills-payments",
    helpful: 124,
    unhelpful: 4,
    content:
      "After paying a bill once, you'll see a 'Save biller' option — tap it to save the biller and your account number for one-tap payment next time. You can also enable 'Auto-pay' to schedule the biller for recurring payment (weekly or monthly).\n\nAuto-pay uses your default wallet balance and will alert you if the balance is insufficient before the scheduled date.",
  },
  {
    id: "bp-failed-bill",
    title: "Why did my bill payment fail?",
    category: "bills-payments",
    helpful: 187,
    unhelpful: 21,
    content:
      "Bill payments usually fail for one of three reasons:\n\n1. Incorrect biller account number — verify the account number format on your biller's website before paying.\n2. Insufficient wallet balance — fund your wallet and retry.\n3. Biller service downtime — try again later.\n\nFailed payments are auto-refunded to your wallet within 30 minutes. If the refund doesn't arrive, raise a ticket with your transaction reference and your money will be refunded in 1–2 business days.",
  },

  // ===== Cards (3) =====
  {
    id: "card-create",
    title: "Creating and using a virtual card",
    category: "cards",
    helpful: 218,
    unhelpful: 11,
    content:
      "Virtual cards are issued instantly by our partner bank. To create one, go to Cards → New card, choose a nickname, and fund it from your wallet. The card comes with a 16-digit PAN, expiry, and CVV that you can reveal on demand (each reveal is audit-logged for your security).\n\nThe card works on any Visa-accepting online merchant worldwide — perfect for subscriptions, international shopping, and ad spend.",
  },
  {
    id: "card-fees",
    title: "Virtual card fees and limits",
    category: "cards",
    helpful: 167,
    unhelpful: 8,
    content:
      "Card creation is free. A ₦250 card setup fee may apply for premium cards (multi-currency or USD-denominated). Funding and withdrawing from a card is free up to ₦50,000 per day; larger amounts attract a 0.5% fee.\n\nEach card has a spending limit of ₦1,000,000/day by default. Need a higher limit? Contact support to enable the high-roller tier (₦5,000,000/day).",
  },
  {
    id: "card-freeze",
    title: "Freezing or terminating a card",
    category: "cards",
    helpful: 198,
    unhelpful: 5,
    content:
      "If you suspect your card has been compromised, freeze it immediately under Cards → Card → Freeze. The card will be declined on all new transactions while frozen; existing subscriptions may still attempt to charge.\n\nTo permanently destroy a card, use Terminate — this is irreversible. Any remaining balance on the card is returned to your wallet within 1 minute of termination.",
  },

  // ===== Security (3) =====
  {
    id: "sec-pin",
    title: "Setting and resetting your transaction PIN",
    category: "security",
    helpful: 312,
    unhelpful: 7,
    content:
      "Your transaction PIN is a 4-digit code required for every transfer, bill payment, and card funding. Set it during signup. To change it later, go to Settings → Transaction PIN → Change PIN — you'll need your current PIN.\n\nIf you've forgotten your PIN, use 'Forgot PIN' under the same menu — you'll be asked to verify your identity via BVN and a one-time OTP before you can set a new PIN.",
  },
  {
    id: "sec-2fa",
    title: "Enabling two-factor authentication",
    category: "security",
    helpful: 142,
    unhelpful: 4,
    content:
      "Two-factor authentication (2FA) adds an extra layer of security to your login. Under Security → 2FA, you can enable either SMS-based 2FA or an authenticator app (Google Authenticator, Authy, or 1Password).\n\nWe strongly recommend the authenticator app option — it works without phone signal and is resistant to SIM-swap attacks. Backup your recovery codes somewhere safe before enabling.",
  },
  {
    id: "sec-devices",
    title: "Managing your active sessions and devices",
    category: "security",
    helpful: 189,
    unhelpful: 6,
    content:
      "Under Security → Active sessions you'll see every device that's currently signed into your Turbopay account. Each entry shows the device name, location (city/country), IP, and last activity timestamp.\n\nIf you don't recognize a session, tap 'Revoke' to immediately sign out that device. Use 'Sign out everywhere' to revoke all sessions at once — useful if your phone is lost or stolen.",
  },

  // ===== Account (3) =====
  {
    id: "acc-kyc-tiers",
    title: "KYC tiers and their limits",
    category: "account",
    helpful: 423,
    unhelpful: 11,
    content:
      "Turbopay uses three KYC tiers:\n\n• Tier 1 (Starter) — phone number verified. Limits: ₦50,000 per transaction, ₦200,000 daily, ₦200,000 max wallet balance.\n• Tier 2 (Verified) — NIN added. Limits: ₦500,000 per transaction, ₦2,000,000 daily, ₦2,000,000 max wallet balance.\n• Tier 3 (Premium) — BVN linked and biometric verification. Limits: ₦5,000,000 per transaction, ₦20,000,000 daily, ₦20,000,000 max wallet balance.\n\nUpgrade anytime under KYC & Limits.",
  },
  {
    id: "acc-edit-profile",
    title: "Editing your profile information",
    category: "account",
    helpful: 98,
    unhelpful: 3,
    content:
      "Under Settings → Profile you can update your full name, email address, and avatar. Phone number changes require OTP verification on both the old and new numbers — start the flow under Settings → Phone number → Change.\n\nYour @username can be changed once every 90 days. Username changes are audit-logged and broadcast to anyone who has you saved as a beneficiary.",
  },
  {
    id: "acc-close",
    title: "Closing your Turbopay account",
    category: "account",
    helpful: 67,
    unhelpful: 9,
    content:
      "To close your account: withdraw or transfer out any remaining balance, then contact support with a closure request. We'll verify your identity and process the closure within 5 business days.\n\nAccount closures are irreversible — once closed, you cannot reuse the same phone number or BVN to open a new Turbopay account for 12 months. Please export any statements you need before requesting closure.",
  },

  // ===== Troubleshooting (3) =====
  {
    id: "ts-stuck-txn",
    title: "What to do when a transaction is stuck",
    category: "troubleshooting",
    helpful: 234,
    unhelpful: 18,
    content:
      "A 'stuck' transaction is usually one that's been debited from your wallet but hasn't reflected on the recipient's end. Most resolve automatically within 5 minutes as the bank-side retry kicks in.\n\nIf 30 minutes have passed and the transaction is still pending: open the transaction → 'Raise dispute'. Our ops team will investigate and either complete the transfer or refund your wallet within 24 hours.",
  },
  {
    id: "ts-login-issues",
    title: "Can't log in to my account",
    category: "troubleshooting",
    helpful: 178,
    unhelpful: 12,
    content:
      "If you can't log in:\n\n1. Confirm your phone number is correct (no country code prefix).\n2. Use 'Forgot password' if you've forgotten your password.\n3. Check that you have a stable internet connection.\n4. Make sure you're not using a VPN — some VPN IPs are blocked at the firewall.\n5. If you've recently changed your phone, you may need to verify via OTP before logging in from a new device.\n\nStill stuck? Raise a ticket under Help & Support.",
  },
  {
    id: "ts-app-not-loading",
    title: "The app is slow or won't load",
    category: "troubleshooting",
    helpful: 142,
    unhelpful: 9,
    content:
      "If the Turbopay app is slow or shows a blank screen:\n\n1. Check your internet connection (try loading another website).\n2. Force-close the app and reopen it.\n3. Clear the app cache from your phone's settings.\n4. Update to the latest version from your app store.\n5. Check our status page at status.turbopay.app for ongoing incidents.\n\nIf the issue persists, try signing out and signing back in — this refreshes your session token and clears most loading issues.",
  },
];

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    await audit({
      userId: user.id,
      action: "HELP_CENTER_VIEWED",
      category: "USER",
      ip: getClientIp(req),
      metadata: { articleCount: ARTICLES.length },
    });
    return json({ categories: CATEGORIES, articles: ARTICLES });
  } catch (e) {
    return handleError(e);
  }
}
