// TurboCore GCR — Master Capability Tree
//
// One registry. Every feature belongs somewhere. Nothing exists outside this
// tree.
//
// Structure:
//   Financial Domain (PAYMENTS)
//     ↓
//   Capability Group      (22 groups)
//     ↓
//   Capability            (~200 capabilities)
//     ↓
//   Feature               (per-capability)
//     ↓
//   Provider Implementation (mapped in provider-matrix.ts)
//
// Adding a new capability never touches routing, provider code, or the
// orchestrator. It only grows this file.

import type { Capability, CapabilityGroup } from "./types";

// ---------------------------------------------------------------------------
// Capability Groups (22 — the master tree from Chapter 7)
// ---------------------------------------------------------------------------

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    id: "collections",
    name: "Collections",
    description: "Money entering TurboCore.",
    domain: "PAYMENTS",
    icon: "ArrowDownToLine",
    order: 1,
    accent: "emerald",
  },
  {
    id: "disbursements",
    name: "Disbursements",
    description: "Money leaving TurboCore.",
    domain: "PAYMENTS",
    icon: "ArrowUpFromLine",
    order: 2,
    accent: "rose",
  },
  {
    id: "wallets",
    name: "Wallets",
    description: "Stored-value accounts — deposit, withdraw, freeze, escrow.",
    domain: "PAYMENTS",
    icon: "Wallet",
    order: 3,
    accent: "amber",
  },
  {
    id: "identity",
    name: "Identity",
    description: "Verification — email, phone, OTP, BVN, NIN, KYC, AML, liveness.",
    domain: "PAYMENTS",
    icon: "ShieldCheck",
    order: 4,
    accent: "violet",
  },
  {
    id: "fx",
    name: "FX",
    description: "Exchange rates, conversion, spread, multi-currency ledger.",
    domain: "PAYMENTS",
    icon: "ArrowLeftRight",
    order: 5,
    accent: "cyan",
  },
  {
    id: "merchant",
    name: "Merchant",
    description: "Checkout, hosted pages, payment links, split, marketplace.",
    domain: "PAYMENTS",
    icon: "Store",
    order: 6,
    accent: "orange",
  },
  {
    id: "cards",
    name: "Cards",
    description: "Tokenization, authorization, capture, void, refund, network tokens.",
    domain: "PAYMENTS",
    icon: "CreditCard",
    order: 7,
    accent: "blue",
  },
  {
    id: "mobile_money",
    name: "Mobile Money",
    description: "Africa's rails — STK push, request-to-pay, cash-in/out, agent.",
    domain: "PAYMENTS",
    icon: "Smartphone",
    order: 8,
    accent: "green",
  },
  {
    id: "virtual_accounts",
    name: "Virtual Accounts",
    description: "Permanent, temporary, dedicated, reserved, escrow accounts.",
    domain: "PAYMENTS",
    icon: "Landmark",
    order: 9,
    accent: "teal",
  },
  {
    id: "banking",
    name: "Banking",
    description: "Account verification, lookup, transfer, direct debit, open banking.",
    domain: "PAYMENTS",
    icon: "Building2",
    order: 10,
    accent: "indigo",
  },
  {
    id: "risk",
    name: "Risk",
    description: "Velocity, geo-blocking, device trust, fraud scoring, monitoring.",
    domain: "PAYMENTS",
    icon: "ShieldAlert",
    order: 11,
    accent: "red",
  },
  {
    id: "compliance",
    name: "Compliance",
    description: "AML, KYC, KYB, travel rule, PEP, sanctions, screening, reporting.",
    domain: "PAYMENTS",
    icon: "Scale",
    order: 12,
    accent: "fuchsia",
  },
  {
    id: "settlement",
    name: "Settlement",
    description: "Schedules, reports, fee calculation, revenue split, partner payout.",
    domain: "PAYMENTS",
    icon: "ReceiptText",
    order: 13,
    accent: "yellow",
  },
  {
    id: "analytics",
    name: "Analytics",
    description: "Revenue, volume, provider health, latency, dashboards.",
    domain: "PAYMENTS",
    icon: "BarChart3",
    order: 14,
    accent: "sky",
  },
  {
    id: "developer",
    name: "Developer",
    description: "REST, GraphQL, SDK, webhook, CLI, sandbox, replay, versioning.",
    domain: "PAYMENTS",
    icon: "Code2",
    order: 15,
    accent: "slate",
  },
  {
    id: "treasury",
    name: "Treasury",
    description: "Liquidity, sweep, reconciliation, inter-bank position management.",
    domain: "PAYMENTS",
    icon: "PiggyBank",
    order: 16,
    accent: "lime",
  },
  {
    id: "subscriptions",
    name: "Subscriptions",
    description: "Plans, trials, dunning, proration, lifecycle events.",
    domain: "PAYMENTS",
    icon: "Repeat",
    order: 17,
    accent: "purple",
  },
  {
    id: "invoices",
    name: "Invoices",
    description: "Issue, send, track, remind, write-off, line items, tax.",
    domain: "PAYMENTS",
    icon: "FileText",
    order: 18,
    accent: "pink",
  },
  {
    id: "qr",
    name: "QR",
    description: "Static, dynamic, merchant-presented, consumer-presented QR.",
    domain: "PAYMENTS",
    icon: "QrCode",
    order: 19,
    accent: "stone",
  },
  {
    id: "crypto",
    name: "Crypto",
    description: "On-chain collection/payout, address management, confirmations.",
    domain: "PAYMENTS",
    icon: "Bitcoin",
    order: 20,
    accent: "orange",
  },
  {
    id: "stablecoins",
    name: "Stablecoins",
    description: "USDC, USDT, cUSD — bridge, mint, redeem, transfer.",
    domain: "PAYMENTS",
    icon: "Coins",
    order: 21,
    accent: "emerald",
  },
  {
    id: "notifications",
    name: "Notifications",
    description: "Email, SMS, push, in-app, OTP delivery, template management.",
    domain: "PAYMENTS",
    icon: "Bell",
    order: 22,
    accent: "blue",
  },
];

// ---------------------------------------------------------------------------
// Capability catalogue (~200 capabilities)
// ---------------------------------------------------------------------------

const now = "2025-01-01T00:00:00.000Z";

function cap(
  partial: Omit<Capability, "createdAt" | "updatedAt" | "providers"> & {
    createdAt?: string;
    updatedAt?: string;
    providers?: string[];
  }
): Capability {
  // Per Chapter 7: "Providers are attached. Not embedded."
  // The catalogue never hardcodes provider names (AI Agent Rule #2).
  // The `providers` field is populated at runtime by getCapability()
  // from the provider-matrix. Here we default to [].
  return {
    ...partial,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    providers: partial.providers ?? [],
  } as Capability;
}

export const CAPABILITIES: Capability[] = [
  // =========================================================================
  // 1. COLLECTIONS
  // =========================================================================
  cap({
    id: "collections.cards",
    name: "Card Payments",
    description: "Collect payments from debit/credit cards — Visa, Mastercard, Verve.",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["NG", "KE", "GH", "ZA", "GB", "US"],
    currencies: ["NGN", "KES", "GHS", "ZAR", "USD", "GBP"],
    requiredKycTier: 1,
    supportsRecurring: true,
    supportsRefunds: true,
    supportsChargeback: true,
    supportsPartial: true,
    supportsSplit: true,
    features: [
      {
        slug: "tokenization",
        name: "Tokenization",
        description: "PAN → token vault storage.",
        mandatory: true,
      },
      {
        slug: "3ds",
        name: "3-D Secure",
        description: "SCA / 3DS 2.x authentication.",
        mandatory: true,
      },
      { slug: "avs", name: "AVS", description: "Address verification service." },
      { slug: "saved_cards", name: "Saved Cards", description: "Repeat card-on-file payments." },
    ],
    versions: [
      { version: "v1", label: "Basic Authorization", status: "DEPRECATED" },
      { version: "v2", label: "Tokenized + 3DS", status: "STABLE" },
      {
        version: "v3",
        label: "Network Tokens",
        status: "BETA",
        current: true,
        releaseNotes: "PAN-less network-tokenized authorizations.",
      },
    ],
    dependencies: [
      {
        capabilityId: "compliance.kyc",
        kind: "REQUIRES",
        reason: "PCI scope reduction requires verified merchant identity.",
      },
      {
        capabilityId: "risk.fraud_scoring",
        kind: "RECOMMENDS",
        reason: "Card-not-present fraud screening.",
      },
    ],
    certification: [
      {
        slug: "auth_success",
        name: "Successful Authorization",
        description: "Valid card authorizes successfully.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "auth_decline",
        name: "Declined Authorization",
        description: "Insufficient funds returns decline.",
        mandatory: true,
        category: "FAILURE_MODE",
      },
      {
        slug: "partial_refund",
        name: "Partial Refund",
        description: "Refund of less than the captured amount.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "duplicate_auth",
        name: "Duplicate Authorization",
        description: "Idempotency key prevents double-charge.",
        mandatory: true,
        category: "EDGE_CASE",
      },
      {
        slug: "pci_scope",
        name: "PCI Scope Validation",
        description: "No raw PAN logged or persisted.",
        mandatory: true,
        category: "COMPLIANCE",
      },
    ],
    documentation: {
      functional:
        "Authorizes a card payment, optionally captures immediately or holds for later capture.",
      businessRules: [
        "Merchant must be PCI-DSS compliant or use tokenization.",
        "3DS required for EEA transactions.",
      ],
      technicalContract:
        "POST /charge — {pan|token, amountMinor, currency, cvv, expMonth, expYear} → {authCode, rrn, status}",
      requiredPermissions: ["payments.collections.cards.charge"],
      complianceRequirements: ["PCI-DSS", "3DS 2.x", "PSD2 SCA (EEA)"],
      failureScenarios: ["Insufficient funds", "Card expired", "Do not honor", "Suspected fraud"],
      uxExpectations:
        "Card number entry with BIN detection, brand logo, expiry/CVV inline validation.",
    },
    tags: ["card", "visa", "mastercard", "verve", "3ds"],
  }),
  cap({
    id: "collections.bank_transfer",
    name: "Bank Transfer",
    description: "Customer initiates a transfer to a TurboCore-controlled account.",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["NG", "KE", "GH", "ZA"],
    currencies: ["NGN", "KES", "GHS", "ZAR"],
    requiredKycTier: 1,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: true,
    features: [
      {
        slug: "virtual_account",
        name: "Dedicated Virtual Account",
        description: "Per-customer account number.",
        mandatory: true,
      },
      { slug: "amount_lock", name: "Amount Lock", description: "Reject mismatched amounts." },
      {
        slug: "auto_reconcile",
        name: "Auto Reconciliation",
        description: "Match inbound transfer to reference.",
        mandatory: true,
      },
    ],
    versions: [
      { version: "v1", label: "Manual Reconcile", status: "DEPRECATED" },
      { version: "v2", label: "Auto Reconcile", status: "STABLE", current: true },
    ],
    dependencies: [
      {
        capabilityId: "virtual_accounts.permanent",
        kind: "REQUIRES",
        reason: "Inbound transfers land in a virtual account.",
      },
      { capabilityId: "banking.account_verification", kind: "RECOMMENDS" },
    ],
    certification: [
      {
        slug: "inbound_match",
        name: "Inbound Match",
        description: "Transfer with correct reference auto-reconciles.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "overpayment",
        name: "Overpayment Handling",
        description: "Excess amount flagged for review.",
        mandatory: true,
        category: "EDGE_CASE",
      },
      {
        slug: "underpayment",
        name: "Underpayment Handling",
        description: "Shortfall flagged, customer notified.",
        mandatory: true,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional: "Customer transfers to a virtual account; TurboCore reconciles the inbound.",
      businessRules: ["Reference must be unique.", "Stale references expire after 30 minutes."],
      technicalContract:
        "POST /transfer/inbound — {virtualAccount, amountMinor, originator} → {status: PENDING|SETTLED}",
      requiredPermissions: ["payments.collections.bank_transfer.receive"],
      complianceRequirements: ["AML screening on originator"],
      failureScenarios: ["Reference mismatch", "Originator sanctioned", "Bank downtime"],
      uxExpectations: "Display account number + bank + reference with copy-to-clipboard.",
    },
    tags: ["transfer", "bank", "reconcile"],
  }),
  cap({
    id: "collections.virtual_account",
    name: "Virtual Account Collection",
    description: "Generate a virtual account number that routes inbound to a wallet.",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["NG", "GH", "KE"],
    currencies: ["NGN", "GHS", "KES"],
    requiredKycTier: 1,
    supportsRecurring: true,
    supportsRefunds: true,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "dedicated",
        name: "Dedicated Account",
        description: "One account per customer.",
        mandatory: true,
      },
      { slug: "dynamic", name: "Dynamic Account", description: "Per-transaction account." },
      {
        slug: "reserved",
        name: "Reserved Account",
        description: "Account held for high-value merchant.",
      },
    ],
    versions: [{ version: "v1", label: "Static Account", status: "STABLE", current: true }],
    dependencies: [{ capabilityId: "virtual_accounts.permanent", kind: "REQUIRES" }],
    certification: [
      {
        slug: "account_uniqueness",
        name: "Account Uniqueness",
        description: "Two customers never share an account.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "inbound_credit",
        name: "Inbound Credit",
        description: "Transfer credits wallet within SLA.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
    ],
    documentation: {
      functional: "Provisions a unique bank account number per customer or per transaction.",
      businessRules: [
        "One account per customer by default.",
        "Merchant tier ≥ 2 unlocks dynamic accounts.",
      ],
      technicalContract: "POST /virtual-account — {customerId} → {accountNumber, bankCode}",
      requiredPermissions: ["payments.collections.virtual_account.create"],
      complianceRequirements: ["KYC on account holder"],
      failureScenarios: ["Bank pool exhausted", "Customer KYC incomplete"],
      uxExpectations: "Account details card with copy buttons + bank logo.",
    },
    tags: ["virtual", "account", "dedicated"],
  }),
  cap({
    id: "collections.ussd",
    name: "USSD Collection",
    description: "Customer dials a USSD code to authorize payment from their bank account.",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["NG"],
    currencies: ["NGN"],
    requiredKycTier: 1,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "ussd_code",
        name: "USSD Code Generation",
        description: "*737*000*1234567#",
        mandatory: true,
      },
      {
        slug: "session_poll",
        name: "Session Polling",
        description: "Poll for session completion.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Static USSD", status: "STABLE", current: true }],
    dependencies: [{ capabilityId: "banking.account_verification", kind: "RECOMMENDS" }],
    certification: [
      {
        slug: "code_valid",
        name: "USSD Code Valid",
        description: "Generated code is dialable.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "session_timeout",
        name: "Session Timeout",
        description: "Session expires after 5 minutes.",
        mandatory: true,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional:
        "Generates a per-transaction USSD string the customer dials to authorize the payment.",
      businessRules: [
        "USSD session valid for 5 minutes.",
        "Customer's bank must support the scheme.",
      ],
      technicalContract: "POST /ussd — {amountMinor, bankCode} → {ussdCode, sessionId}",
      requiredPermissions: ["payments.collections.ussd.create"],
      complianceRequirements: [],
      failureScenarios: ["Bank doesn't support USSD", "Session timeout", "Customer cancels"],
      uxExpectations: "Display USSD code prominently with 'Dial now' CTA.",
    },
    tags: ["ussd", "dial", "nigeria"],
  }),
  cap({
    id: "collections.qr",
    name: "QR Collection",
    description: "Merchant presents a QR code; customer scans to pay.",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["NG", "KE", "GH", "ZA"],
    currencies: ["NGN", "KES", "GHS", "ZAR"],
    requiredKycTier: 1,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      { slug: "static_qr", name: "Static QR", description: "Reusable merchant QR." },
      {
        slug: "dynamic_qr",
        name: "Dynamic QR",
        description: "Per-transaction QR with amount.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "NIP QR", status: "STABLE", current: true }],
    dependencies: [],
    certification: [
      {
        slug: "qr_scannable",
        name: "QR Scannable",
        description: "Generated QR decodes to a valid payload.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
    ],
    documentation: {
      functional:
        "Generates a QR payload that, when scanned, opens the customer's bank/wallet app pre-filled.",
      businessRules: ["QR expires after 5 minutes for dynamic mode."],
      technicalContract: "POST /qr — {amountMinor, merchantId} → {qrPayload, qrImageBase64}",
      requiredPermissions: ["payments.collections.qr.create"],
      complianceRequirements: [],
      failureScenarios: ["Customer app doesn't support scheme", "QR expired"],
      uxExpectations: "Large QR image with countdown timer + 'Scan to pay' label.",
    },
    tags: ["qr", "scan"],
  }),
  cap({
    id: "collections.payment_link",
    name: "Payment Links",
    description: "Generate a shareable URL that opens a hosted checkout page.",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["ALL"],
    currencies: ["ALL"],
    requiredKycTier: 1,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: true,
    supportsPartial: false,
    supportsSplit: true,
    features: [
      { slug: "simple_link", name: "Simple Link", description: "URL with fixed amount." },
      { slug: "open_amount", name: "Open Amount", description: "Customer enters amount." },
      { slug: "custom_branding", name: "Custom Branding", description: "Merchant logo + colours." },
      { slug: "embedded_checkout", name: "Embedded Checkout", description: "iframe embed." },
    ],
    versions: [
      { version: "v1", label: "Simple Link", status: "STABLE" },
      { version: "v2", label: "Custom Branding", status: "STABLE" },
      {
        version: "v3",
        label: "Embedded Checkout",
        status: "STABLE",
        current: true,
        releaseNotes: "Drop-in iframe with theme inheritance.",
      },
    ],
    dependencies: [{ capabilityId: "merchant.checkout", kind: "REQUIRES" }],
    certification: [
      {
        slug: "link_valid",
        name: "Link Valid",
        description: "URL opens checkout.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "link_expiry",
        name: "Link Expiry",
        description: "Expired link returns 410.",
        mandatory: true,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional: "Creates a hosted checkout URL that can be shared via SMS, email, or social.",
      businessRules: ["Links expire after 24 hours by default.", "Merchant can configure expiry."],
      technicalContract: "POST /payment-link — {amountMinor, currency, metadata} → {url, slug}",
      requiredPermissions: ["payments.collections.payment_link.create"],
      complianceRequirements: ["Merchant KYB"],
      failureScenarios: ["Link expired", "Merchant suspended", "Currency not supported"],
      uxExpectations: "Branded checkout page with multiple payment methods.",
    },
    tags: ["link", "checkout", "hosted"],
  }),
  cap({
    id: "collections.invoice",
    name: "Invoice Collection",
    description: "Issue an invoice with line items; customer pays via the invoice URL.",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["ALL"],
    currencies: ["ALL"],
    requiredKycTier: 1,
    supportsRecurring: true,
    supportsRefunds: true,
    supportsChargeback: false,
    supportsPartial: true,
    supportsSplit: false,
    features: [
      {
        slug: "line_items",
        name: "Line Items",
        description: "Multiple items with quantities.",
        mandatory: true,
      },
      { slug: "tax", name: "Tax Calculation", description: "VAT / sales tax." },
      { slug: "reminders", name: "Reminders", description: "Auto email reminders." },
      { slug: "write_off", name: "Write-off", description: "Mark uncollectable." },
    ],
    versions: [{ version: "v1", label: "Standard Invoice", status: "STABLE", current: true }],
    dependencies: [
      { capabilityId: "collections.payment_link", kind: "RECOMMENDS" },
      { capabilityId: "invoices.issue", kind: "REQUIRES" },
    ],
    certification: [
      {
        slug: "invoice_issue",
        name: "Invoice Issue",
        description: "Invoice created with unique number.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "partial_payment",
        name: "Partial Payment",
        description: "Invoice supports partial settlement.",
        mandatory: true,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional: "Issues an itemized invoice that the customer settles via any collection method.",
      businessRules: [
        "Invoice numbers are sequential per merchant.",
        "Overdue after merchant-configured terms.",
      ],
      technicalContract:
        "POST /invoice — {customerId, lineItems[]} → {invoiceNumber, url, totalMinor}",
      requiredPermissions: ["payments.collections.invoice.issue"],
      complianceRequirements: ["Tax registration where applicable"],
      failureScenarios: ["Customer disputes line item", "Currency mismatch"],
      uxExpectations: "PDF invoice with merchant branding + 'Pay now' button.",
    },
    tags: ["invoice", "billing"],
  }),
  cap({
    id: "collections.checkout",
    name: "Hosted Checkout",
    description: "Drop-in hosted checkout page that supports multiple payment methods.",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["ALL"],
    currencies: ["ALL"],
    requiredKycTier: 1,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: true,
    supportsPartial: false,
    supportsSplit: true,
    features: [
      {
        slug: "drop_in",
        name: "Drop-in iframe",
        description: "Embeddable checkout widget.",
        mandatory: true,
      },
      { slug: "redirect", name: "Redirect Flow", description: "Full-page redirect." },
      {
        slug: "method_picker",
        name: "Method Picker",
        description: "Customer chooses payment method.",
      },
    ],
    versions: [
      { version: "v1", label: "Redirect", status: "STABLE" },
      { version: "v2", label: "Drop-in iframe", status: "STABLE", current: true },
    ],
    dependencies: [{ capabilityId: "merchant.checkout", kind: "REQUIRES" }],
    certification: [
      {
        slug: "iframe_load",
        name: "iframe Loads",
        description: "Drop-in renders within 2s.",
        mandatory: true,
        category: "PERFORMANCE",
      },
    ],
    documentation: {
      functional:
        "Hosted, brandable checkout that presents all enabled payment methods to the customer.",
      businessRules: ["Merchant domain must be allow-listed.", "PCI-SAQ-A applies."],
      technicalContract:
        "POST /checkout/session — {amountMinor, currency, merchantId} → {sessionId, embedUrl}",
      requiredPermissions: ["payments.collections.checkout.create"],
      complianceRequirements: ["PCI-SAQ-A"],
      failureScenarios: ["Domain not allow-listed", "Merchant suspended"],
      uxExpectations: "Embedded widget with theme inheritance + payment method tabs.",
    },
    tags: ["checkout", "hosted", "drop-in"],
  }),
  cap({
    id: "collections.apple_pay",
    name: "Apple Pay",
    description: "Collect payments via Apple Pay on supported iOS devices.",
    groupId: "collections",
    direction: "INBOUND",
    status: "BETA",
    countries: ["NG", "ZA", "GB", "US"],
    currencies: ["NGN", "ZAR", "GBP", "USD"],
    requiredKycTier: 1,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: true,
    supportsPartial: true,
    supportsSplit: false,
    features: [
      {
        slug: "merchant_id",
        name: "Apple Merchant ID",
        description: "Registered merchant ID.",
        mandatory: true,
      },
      {
        slug: "domain_verification",
        name: "Domain Verification",
        description: "Apple-verified domain.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "BETA", current: true }],
    dependencies: [{ capabilityId: "collections.cards", kind: "REQUIRES" }],
    certification: [
      {
        slug: "domain_verified",
        name: "Domain Verified",
        description: "Domain passes Apple verification.",
        mandatory: true,
        category: "COMPLIANCE",
      },
    ],
    documentation: {
      functional: "Apple Pay token collected on iOS and decrypted/charged server-side.",
      businessRules: ["Requires Apple Merchant ID + domain verification.", "iOS 13+ only."],
      technicalContract: "POST /apple-pay/charge — {paymentToken} → {authCode, status}",
      requiredPermissions: ["payments.collections.apple_pay.charge"],
      complianceRequirements: ["Apple Pay merchant agreement", "PCI tokenization"],
      failureScenarios: ["Domain not verified", "Token expired", "Device not Apple"],
      uxExpectations: "Apple Pay sheet appears with merchant name + amount.",
    },
    tags: ["apple", "wallet", "ios"],
  }),
  cap({
    id: "collections.google_pay",
    name: "Google Pay",
    description: "Collect payments via Google Pay on supported Android devices.",
    groupId: "collections",
    direction: "INBOUND",
    status: "BETA",
    countries: ["NG", "ZA", "GB", "US"],
    currencies: ["NGN", "ZAR", "GBP", "USD"],
    requiredKycTier: 1,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: true,
    supportsPartial: true,
    supportsSplit: false,
    features: [
      { slug: "merchant_id", name: "Google Merchant ID", description: "Production merchant ID." },
      {
        slug: "gateway_token",
        name: "Gateway Token",
        description: "Token via payment gateway.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "BETA", current: true }],
    dependencies: [{ capabilityId: "collections.cards", kind: "REQUIRES" }],
    certification: [
      {
        slug: "gateway_integration",
        name: "Gateway Integration",
        description: "Gateway tokenization passes.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
    ],
    documentation: {
      functional: "Google Pay token collected on Android and charged server-side.",
      businessRules: ["Requires Google Pay API access.", "Android with Play Services."],
      technicalContract: "POST /google-pay/charge — {paymentData} → {authCode, status}",
      requiredPermissions: ["payments.collections.google_pay.charge"],
      complianceRequirements: ["Google Pay API terms"],
      failureScenarios: ["Device unsupported", "Token expired"],
      uxExpectations: "Google Pay sheet with amount + merchant.",
    },
    tags: ["google", "wallet", "android"],
  }),
  cap({
    id: "collections.mobile_money",
    name: "Mobile Money Collection",
    description: "Collect payments from mobile money wallets (M-Pesa, MTN, Airtel).",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["KE", "UG", "GH", "TZ", "RW", "CI", "ZM", "CM"],
    currencies: ["KES", "UGX", "GHS", "TZS", "RWF", "XOF", "ZMW", "XAF"],
    requiredKycTier: 1,
    supportsRecurring: true,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "stk_push",
        name: "STK Push",
        description: "Push USSD prompt to customer phone.",
        mandatory: true,
      },
      { slug: "request_to_pay", name: "Request To Pay", description: "RTP via MM API." },
      { slug: "qr_pay", name: "QR Pay", description: "Scan merchant QR to pay." },
    ],
    versions: [{ version: "v1", label: "STK Push", status: "STABLE", current: true }],
    dependencies: [{ capabilityId: "mobile_money.collection", kind: "REQUIRES" }],
    certification: [
      {
        slug: "stk_delivered",
        name: "STK Delivered",
        description: "Prompt reaches customer device.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "timeout",
        name: "Timeout Handling",
        description: "STK without response expires cleanly.",
        mandatory: true,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional: "Pushes a payment prompt to the customer's mobile money wallet.",
      businessRules: [
        "Customer phone must be registered with the MM provider.",
        "Prompt expires after 90 seconds.",
      ],
      technicalContract:
        "POST /mobile-money/collect — {msisdn, amountMinor} → {status, conversationId}",
      requiredPermissions: ["payments.collections.mobile_money.collect"],
      complianceRequirements: ["MM operator agreement"],
      failureScenarios: ["Phone unreachable", "Insufficient MM balance", "Customer cancels"],
      uxExpectations: "Status spinner + 'Check your phone for the prompt'.",
    },
    tags: ["mobile_money", "mpesa", "mtn", "airtel", "stk"],
  }),
  cap({
    id: "collections.stablecoins",
    name: "Stablecoin Collection",
    description: "Collect payments in USDC / USDT / cUSD on supported chains.",
    groupId: "collections",
    direction: "INBOUND",
    status: "BETA",
    countries: ["ALL"],
    currencies: ["USDC", "USDT", "CUSD"],
    requiredKycTier: 2,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: false,
    supportsPartial: true,
    supportsSplit: false,
    features: [
      {
        slug: "address_gen",
        name: "Address Generation",
        description: "Per-customer deposit address.",
        mandatory: true,
      },
      {
        slug: "confirmation",
        name: "Block Confirmation",
        description: "Wait for N confirmations.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "BETA", current: true }],
    dependencies: [
      {
        capabilityId: "stablecoins.bridge",
        kind: "REQUIRES",
        reason: "Stablecoin collection uses the bridge capability.",
      },
      {
        capabilityId: "compliance.aml",
        kind: "REQUIRES",
        reason: "Stablecoin collection requires AML screening.",
      },
      {
        capabilityId: "risk.fraud_scoring",
        kind: "RECOMMENDS",
        reason: "Fraud scoring on stablecoin deposits.",
      },
    ],
    certification: [
      {
        slug: "address_unique",
        name: "Address Uniqueness",
        description: "Each customer gets a unique address.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "confirmation_threshold",
        name: "Confirmation Threshold",
        description: "Credits only after N confirmations.",
        mandatory: true,
        category: "SECURITY",
      },
    ],
    documentation: {
      functional: "Generates a deposit address; credits wallet on confirmed on-chain transfer.",
      businessRules: [
        "Credit only after configurable confirmations.",
        "Address per chain per customer.",
      ],
      technicalContract:
        "POST /stablecoin/deposit — {chain, customerId} → {address, expectedConfirmationBlocks}",
      requiredPermissions: ["payments.collections.stablecoins.receive"],
      complianceRequirements: ["Travel Rule (FATF)", "Chain analytics"],
      failureScenarios: ["Reorg invalidates tx", "Address collision", "Wrong-chain deposit"],
      uxExpectations: "QR + address with chain badge + confirmation progress.",
    },
    tags: ["stablecoin", "usdc", "usdt", "cusd", "crypto"],
  }),
  cap({
    id: "collections.crypto",
    name: "Crypto Collection",
    description: "Accept native crypto (BTC, ETH, MATIC) with on-chain confirmation.",
    groupId: "collections",
    direction: "INBOUND",
    status: "EXPERIMENTAL",
    countries: ["ALL"],
    currencies: ["BTC", "ETH", "MATIC"],
    requiredKycTier: 3,
    supportsRecurring: false,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "hd_wallet",
        name: "HD Wallet",
        description: "Hierarchical deterministic address derivation.",
        mandatory: true,
      },
      {
        slug: "fee_estimation",
        name: "Fee Estimation",
        description: "Live network fee estimation.",
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "EXPERIMENTAL", current: true }],
    dependencies: [{ capabilityId: "crypto.onchain_collect", kind: "REQUIRES" }],
    certification: [
      {
        slug: "address_valid",
        name: "Address Valid",
        description: "Address passes checksum.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
    ],
    documentation: {
      functional: "Generates a per-customer HD address; credits on confirmation.",
      businessRules: ["Tier 3 KYC required.", "Credit only after 3 confirmations."],
      technicalContract: "POST /crypto/deposit — {chain, customerId} → {address}",
      requiredPermissions: ["payments.collections.crypto.receive"],
      complianceRequirements: ["Travel Rule", "Chain analytics"],
      failureScenarios: ["Reorg", "Low fee stuck tx"],
      uxExpectations: "Chain-aware QR + address + confirmation tracker.",
    },
    tags: ["crypto", "btc", "eth", "onchain"],
  }),
  cap({
    id: "collections.pos",
    name: "POS Collection",
    description: "Card-present payments via physical POS terminal.",
    groupId: "collections",
    direction: "INBOUND",
    status: "PLANNED",
    countries: ["NG", "KE", "GH"],
    currencies: ["NGN", "KES", "GHS"],
    requiredKycTier: 2,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: true,
    supportsPartial: true,
    supportsSplit: false,
    features: [
      { slug: "tap", name: "Contactless Tap", description: "NFC tap-to-pay." },
      { slug: "chip_pin", name: "Chip & PIN", description: "EMV chip + PIN.", mandatory: true },
    ],
    versions: [{ version: "v1", label: "Planned", status: "PLANNED", current: true }],
    dependencies: [{ capabilityId: "collections.cards", kind: "REQUIRES" }],
    certification: [],
    documentation: {
      functional: "Card-present payment via EMV terminal.",
      businessRules: ["Requires physical terminal.", "Merchant must be PCI-DSS validated."],
      technicalContract: "TBD",
      requiredPermissions: ["payments.collections.pos.charge"],
      complianceRequirements: ["PCI-DSS", "EMV L2"],
      failureScenarios: ["Terminal offline", "Card read fail"],
      uxExpectations: "Terminal display + receipt print.",
    },
    tags: ["pos", "terminal", "emv"],
  }),
  cap({
    id: "collections.samsung_pay",
    name: "Samsung Pay",
    description: "Collect payments via Samsung Pay on supported Samsung devices.",
    groupId: "collections",
    direction: "INBOUND",
    status: "BETA",
    countries: ["ZA", "GB", "US"],
    currencies: ["ZAR", "GBP", "USD"],
    requiredKycTier: 1,
    supportsRecurring: false,
    supportsRefunds: true,
    supportsChargeback: true,
    supportsPartial: true,
    supportsSplit: false,
    features: [
      {
        slug: "merchant_id",
        name: "Samsung Merchant ID",
        description: "Registered Samsung Pay merchant ID.",
        mandatory: true,
      },
      {
        slug: "device_verification",
        name: "Device Verification",
        description: "Samsung device attestation.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "BETA", current: true }],
    dependencies: [{ capabilityId: "collections.cards", kind: "REQUIRES" }],
    certification: [
      {
        slug: "device_verified",
        name: "Device Verified",
        description: "Samsung device passes attestation.",
        mandatory: true,
        category: "COMPLIANCE",
      },
      {
        slug: "token_charge",
        name: "Token Charge",
        description: "Samsung Pay token charges successfully.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
    ],
    documentation: {
      functional: "Samsung Pay token collected on Samsung devices and charged server-side.",
      businessRules: [
        "Requires Samsung Pay merchant registration.",
        "Samsung devices with Knox only.",
      ],
      technicalContract: "POST /samsung-pay/charge — {paymentToken} → {authCode, status}",
      requiredPermissions: ["payments.collections.samsung_pay.charge"],
      complianceRequirements: ["Samsung Pay merchant agreement", "PCI tokenization"],
      failureScenarios: ["Device not Samsung", "Token expired", "Merchant not registered"],
      uxExpectations: "Samsung Pay sheet appears with merchant name + amount.",
    },
    tags: ["samsung", "wallet", "android", "nfc"],
  }),
  cap({
    id: "collections.wallet_funding",
    name: "Wallet Funding",
    description: "Fund a TurboCore wallet from an external source (card, bank, mobile money).",
    groupId: "collections",
    direction: "INBOUND",
    status: "STABLE",
    countries: ["ALL"],
    currencies: ["ALL"],
    requiredKycTier: 1,
    supportsRecurring: true,
    supportsRefunds: true,
    supportsChargeback: false,
    supportsPartial: true,
    supportsSplit: false,
    features: [
      { slug: "card_funding", name: "Card Funding", description: "Fund via card payment." },
      {
        slug: "bank_funding",
        name: "Bank Funding",
        description: "Fund via bank transfer.",
        mandatory: true,
      },
      { slug: "mm_funding", name: "Mobile Money Funding", description: "Fund via mobile money." },
      {
        slug: "instant_credit",
        name: "Instant Credit",
        description: "Wallet credited before settlement.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
    dependencies: [{ capabilityId: "wallets.deposit", kind: "REQUIRES" }],
    certification: [
      {
        slug: "instant_credit",
        name: "Instant Credit",
        description: "Wallet credited within 2s.",
        mandatory: true,
        category: "PERFORMANCE",
      },
      {
        slug: "duplicate_prevention",
        name: "Duplicate Prevention",
        description: "Duplicate funding reference rejected.",
        mandatory: true,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional: "Funds a TurboCore wallet from any supported collection method.",
      businessRules: [
        "Funding limit per day per user.",
        "Instant credit with later settlement reconciliation.",
      ],
      technicalContract:
        "POST /wallet/fund — {source, amountMinor, currency} → {walletBalance, reference}",
      requiredPermissions: ["payments.collections.wallet_funding.create"],
      complianceRequirements: ["AML screening on source"],
      failureScenarios: ["Source declined", "Wallet frozen", "Limit exceeded"],
      uxExpectations: "Funding method picker + amount + instant confirmation.",
    },
    tags: ["wallet", "funding", "deposit", "topup"],
  }),
  cap({
    id: "collections.cash_deposit",
    name: "Cash Deposit",
    description: "Accept cash deposits via agent network or partner bank branches.",
    groupId: "collections",
    direction: "INBOUND",
    status: "BETA",
    countries: ["NG", "KE", "GH"],
    currencies: ["NGN", "KES", "GHS"],
    requiredKycTier: 1,
    supportsRecurring: false,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "agent_network",
        name: "Agent Network",
        description: "Cash deposit via authorized agent.",
        mandatory: true,
      },
      {
        slug: "branch_deposit",
        name: "Branch Deposit",
        description: "Cash deposit at partner bank branch.",
      },
      {
        slug: "receipt",
        name: "Receipt Generation",
        description: "Digital receipt for cash deposit.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "BETA", current: true }],
    dependencies: [{ capabilityId: "wallets.deposit", kind: "REQUIRES" }],
    certification: [
      {
        slug: "agent_verified",
        name: "Agent Verified",
        description: "Agent credentials validated.",
        mandatory: true,
        category: "SECURITY",
      },
      {
        slug: "amount_match",
        name: "Amount Match",
        description: "Deposited amount matches recorded amount.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
    ],
    documentation: {
      functional: "Customer deposits cash via agent or branch; wallet credited on confirmation.",
      businessRules: [
        "Agent must be authorized.",
        "Cash count verified before credit.",
        "Daily deposit limit per user.",
      ],
      technicalContract:
        "POST /cash/deposit — {agentId, amountMinor, customerRef} → {reference, receiptUrl}",
      requiredPermissions: ["payments.collections.cash_deposit.receive"],
      complianceRequirements: ["AML screening", "Agent KYB"],
      failureScenarios: ["Agent unauthorized", "Cash count mismatch", "Customer ref invalid"],
      uxExpectations: "Agent enters amount → customer confirms → receipt generated.",
    },
    tags: ["cash", "deposit", "agent", "branch"],
  }),

  // =========================================================================
  // 2. DISBURSEMENTS
  // =========================================================================
  cap({
    id: "disbursements.bank_transfer",
    name: "Bank Transfer Payout",
    description: "Send money to a bank account.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "STABLE",
    countries: ["NG", "KE", "GH", "ZA"],
    currencies: ["NGN", "KES", "GHS", "ZAR"],
    requiredKycTier: 2,
    supportsRecurring: true,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "name_verify",
        name: "Name Verification",
        description: "Validate beneficiary name before send.",
        mandatory: true,
      },
      { slug: "bulk", name: "Bulk Transfer", description: "Send to N beneficiaries in one call." },
      { slug: "schedule", name: "Scheduled Send", description: "Future-dated transfer." },
    ],
    versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
    dependencies: [
      { capabilityId: "banking.account_verification", kind: "REQUIRES" },
      { capabilityId: "compliance.aml", kind: "REQUIRES" },
    ],
    certification: [
      {
        slug: "name_match",
        name: "Name Match",
        description: "Beneficiary name validated.",
        mandatory: true,
        category: "COMPLIANCE",
      },
      {
        slug: "bulk_idempotency",
        name: "Bulk Idempotency",
        description: "Bulk transfer is idempotent.",
        mandatory: true,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional: "Credits a bank account via the local RTGS/ACH/NIP rail.",
      businessRules: ["Beneficiary name must match.", "Daily limit per merchant."],
      technicalContract:
        "POST /payout/bank — {accountNumber, bankCode, amountMinor} → {reference, status}",
      requiredPermissions: ["payments.disbursements.bank_transfer.send"],
      complianceRequirements: ["AML screening", "Beneficiary KYC"],
      failureScenarios: ["Invalid account", "Bank downtime", "AML hit"],
      uxExpectations: "Beneficiary picker + amount + fee preview + confirm.",
    },
    tags: ["payout", "transfer", "bank"],
  }),
  cap({
    id: "disbursements.wallet_transfer",
    name: "Wallet Transfer Payout",
    description: "Send money to another TurboCore wallet.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "STABLE",
    countries: ["ALL"],
    currencies: ["ALL"],
    requiredKycTier: 1,
    supportsRecurring: true,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "instant",
        name: "Instant Transfer",
        description: "Sub-second credit.",
        mandatory: true,
      },
      { slug: "free", name: "Free Transfer", description: "No fee intra-network." },
    ],
    versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
    dependencies: [{ capabilityId: "wallets.withdraw", kind: "REQUIRES" }],
    certification: [
      {
        slug: "instant_credit",
        name: "Instant Credit",
        description: "Beneficiary wallet credited < 1s.",
        mandatory: true,
        category: "PERFORMANCE",
      },
    ],
    documentation: {
      functional: "Transfers between two TurboCore wallets instantly and free.",
      businessRules: ["Both wallets must be active.", "Daily limit applies."],
      technicalContract: "POST /payout/wallet — {recipientId, amountMinor} → {reference, status}",
      requiredPermissions: ["payments.disbursements.wallet_transfer.send"],
      complianceRequirements: ["AML screening"],
      failureScenarios: ["Recipient frozen", "Insufficient funds"],
      uxExpectations: "Recipient picker + amount + instant confirmation.",
    },
    tags: ["payout", "wallet", "instant"],
  }),
  cap({
    id: "disbursements.mobile_money",
    name: "Mobile Money Payout",
    description: "Send money to a mobile money wallet.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "STABLE",
    countries: ["KE", "UG", "GH", "TZ", "RW"],
    currencies: ["KES", "UGX", "GHS", "TZS", "RWF"],
    requiredKycTier: 2,
    supportsRecurring: true,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      { slug: "b2c", name: "B2C", description: "Business to consumer payout.", mandatory: true },
      { slug: "bulk", name: "Bulk Payout", description: "Many recipients in one call." },
    ],
    versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
    dependencies: [{ capabilityId: "mobile_money.payout", kind: "REQUIRES" }],
    certification: [
      {
        slug: "wallet_credit",
        name: "Wallet Credit",
        description: "Funds reach MM wallet < 30s.",
        mandatory: true,
        category: "PERFORMANCE",
      },
    ],
    documentation: {
      functional: "Credits a mobile money wallet via the MM operator's B2C API.",
      businessRules: ["Recipient phone must be MM-registered.", "Daily cap per merchant."],
      technicalContract: "POST /payout/mobile-money — {msisdn, amountMinor} → {reference, status}",
      requiredPermissions: ["payments.disbursements.mobile_money.send"],
      complianceRequirements: ["AML screening"],
      failureScenarios: ["Wallet not registered", "Operator downtime"],
      uxExpectations: "Phone picker + amount + provider logo.",
    },
    tags: ["payout", "mobile_money", "b2c"],
  }),
  cap({
    id: "disbursements.international",
    name: "International Transfer",
    description: "Cross-border payout via correspondent banking / Wise rails.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "BETA",
    countries: ["NG", "KE", "GH", "ZA", "GB", "US"],
    currencies: ["USD", "EUR", "GBP", "NGN", "KES"],
    requiredKycTier: 3,
    supportsRecurring: false,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "fx_quote",
        name: "FX Quote",
        description: "Locked-in exchange rate.",
        mandatory: true,
      },
      { slug: "beneficiary", name: "Beneficiary Management", description: "Saved beneficiaries." },
      {
        slug: "purpose_code",
        name: "Purpose Code",
        description: "Regulatory purpose-of-payment code.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "BETA", current: true }],
    dependencies: [
      { capabilityId: "fx.quote", kind: "REQUIRES" },
      { capabilityId: "compliance.travel_rule", kind: "REQUIRES" },
      { capabilityId: "compliance.kyc", kind: "REQUIRES" },
    ],
    certification: [
      {
        slug: "fx_lock",
        name: "FX Lock",
        description: "Quote honored for 5 minutes.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "travel_rule",
        name: "Travel Rule",
        description: "Originator + beneficiary info captured.",
        mandatory: true,
        category: "COMPLIANCE",
      },
    ],
    documentation: {
      functional: "Cross-border payout with FX conversion and compliance screening.",
      businessRules: [
        "Tier 3 KYC required.",
        "FX quote locked for 5 minutes.",
        "Purpose code mandatory.",
      ],
      technicalContract:
        "POST /payout/intl — {beneficiary, amountMinor, sourceCurrency, targetCurrency, purposeCode} → {quote, reference}",
      requiredPermissions: ["payments.disbursements.international.send"],
      complianceRequirements: ["Travel Rule (FATF)", "AML", "OFAC sanctions"],
      failureScenarios: ["Sanctions hit", "Correspondent bank reject", "FX expired"],
      uxExpectations: "Beneficiary + amount + FX preview + compliance disclosure.",
    },
    tags: ["intl", "cross-border", "fx", "wise"],
  }),
  cap({
    id: "disbursements.bulk",
    name: "Bulk Payments",
    description: "Disburse to many beneficiaries in a single batch.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "STABLE",
    countries: ["ALL"],
    currencies: ["ALL"],
    requiredKycTier: 2,
    supportsRecurring: true,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: true,
    supportsSplit: false,
    features: [
      {
        slug: "csv_upload",
        name: "CSV Upload",
        description: "Bulk upload beneficiaries.",
        mandatory: true,
      },
      {
        slug: "validation",
        name: "Validation Pass",
        description: "Pre-flight validation.",
        mandatory: true,
      },
      {
        slug: "partial_complete",
        name: "Partial Complete",
        description: "Batch completes with per-row statuses.",
      },
    ],
    versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
    dependencies: [{ capabilityId: "disbursements.bank_transfer", kind: "REQUIRES" }],
    certification: [
      {
        slug: "row_idempotency",
        name: "Row Idempotency",
        description: "Each row processes exactly once.",
        mandatory: true,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional: "Uploads a CSV of beneficiaries; processes each row with per-row status.",
      businessRules: ["Max 10,000 rows per batch.", "Validation pass before execution."],
      technicalContract: "POST /payout/bulk — {csv} → {batchId, rowCount}",
      requiredPermissions: ["payments.disbursements.bulk.send"],
      complianceRequirements: ["AML screening per row"],
      failureScenarios: ["Validation fail", "Partial bank downtime"],
      uxExpectations: "CSV upload + validation report + live progress.",
    },
    tags: ["bulk", "batch", "payroll"],
  }),
  cap({
    id: "disbursements.payroll",
    name: "Payroll",
    description: "Scheduled salary disbursement with payslip generation.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "STABLE",
    countries: ["ALL"],
    currencies: ["ALL"],
    requiredKycTier: 2,
    supportsRecurring: true,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "schedule",
        name: "Schedule",
        description: "Cron-driven payroll run.",
        mandatory: true,
      },
      { slug: "payslip", name: "Payslip PDF", description: "Auto-generated payslip." },
      { slug: "tax", name: "Tax Withholding", description: "PAYE tax calculation." },
    ],
    versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
    dependencies: [
      { capabilityId: "disbursements.bulk", kind: "REQUIRES" },
      { capabilityId: "settlement.fee_calc", kind: "RECOMMENDS" },
    ],
    certification: [
      {
        slug: "schedule_fire",
        name: "Schedule Fire",
        description: "Cron triggers payroll on schedule.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
    ],
    documentation: {
      functional: "Scheduled salary disbursement with tax + payslip.",
      businessRules: ["Schedule configured per merchant.", "Tax rules per country."],
      technicalContract: "POST /payroll/run — {merchantId, scheduleId} → {runId, rowCount}",
      requiredPermissions: ["payments.disbursements.payroll.run"],
      complianceRequirements: ["PAYE tax"],
      failureScenarios: ["Schedule missed", "Tax rule change"],
      uxExpectations: "Payroll calendar + run history + payslip download.",
    },
    tags: ["payroll", "schedule", "salary"],
  }),
  cap({
    id: "disbursements.stablecoin",
    name: "Stablecoin Payout",
    description: "Disburse via stablecoin transfer on supported chains.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "BETA",
    countries: ["ALL"],
    currencies: ["USDC", "USDT", "CUSD"],
    requiredKycTier: 3,
    supportsRecurring: false,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      { slug: "address_book", name: "Address Book", description: "Saved recipient addresses." },
      {
        slug: "gas_oracle",
        name: "Gas Oracle",
        description: "Live gas estimation.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "BETA", current: true }],
    dependencies: [{ capabilityId: "stablecoins.bridge", kind: "REQUIRES" }],
    certification: [
      {
        slug: "address_valid",
        name: "Address Valid",
        description: "Recipient address validated.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
    ],
    documentation: {
      functional: "On-chain stablecoin transfer to a recipient address.",
      businessRules: ["Tier 3 KYC required.", "Gas paid by sender."],
      technicalContract: "POST /payout/stablecoin — {chain, address, amount} → {txHash}",
      requiredPermissions: ["payments.disbursements.stablecoin.send"],
      complianceRequirements: ["Travel Rule", "Chain analytics"],
      failureScenarios: ["Address invalid", "Gas spike", "Chain congestion"],
      uxExpectations: "Address + amount + gas preview + confirm.",
    },
    tags: ["stablecoin", "payout", "onchain"],
  }),
  cap({
    id: "disbursements.card_payout",
    name: "Card Payout",
    description: "Disburse funds directly to a card (push-to-card / OCT).",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "BETA",
    countries: ["NG", "ZA", "GB", "US"],
    currencies: ["NGN", "ZAR", "GBP", "USD"],
    requiredKycTier: 2,
    supportsRecurring: true,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "oct",
        name: "Original Credit Transaction",
        description: "Visa/Mastercard OCT push-to-card.",
        mandatory: true,
      },
      { slug: "fast_funds", name: "Fast Funds", description: "Instant push to eligible cards." },
      {
        slug: "card_verification",
        name: "Card Verification",
        description: "Pre-payout card validity check.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "BETA", current: true }],
    dependencies: [
      { capabilityId: "cards.tokenization", kind: "REQUIRES" },
      { capabilityId: "banking.account_verification", kind: "RECOMMENDS" },
    ],
    certification: [
      {
        slug: "card_valid",
        name: "Card Valid",
        description: "Recipient card passes pre-payout check.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "oct_success",
        name: "OCT Success",
        description: "OCT pushes funds to card.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "fast_funds_eligible",
        name: "Fast Funds Check",
        description: "Fast funds eligibility correctly determined.",
        mandatory: false,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional: "Pushes funds to a recipient's card via Visa/Mastercard OCT.",
      businessRules: [
        "Recipient card must support OCT.",
        "Tier 2 KYC required.",
        "Daily push limit per card.",
      ],
      technicalContract: "POST /payout/card — {cardToken, amountMinor} → {reference, status}",
      requiredPermissions: ["payments.disbursements.card_payout.send"],
      complianceRequirements: ["AML screening", "Card scheme OCT agreement"],
      failureScenarios: ["Card doesn't support OCT", "Issuer declined", "Limit exceeded"],
      uxExpectations: "Card number + amount + instant/next-day indicator.",
    },
    tags: ["card", "payout", "oct", "push-to-card"],
  }),
  cap({
    id: "disbursements.merchant_settlement",
    name: "Merchant Settlement",
    description: "Settle collected funds to a merchant's settlement account.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "STABLE",
    countries: ["ALL"],
    currencies: ["ALL"],
    requiredKycTier: 2,
    supportsRecurring: true,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: true,
    supportsSplit: true,
    features: [
      {
        slug: "schedule",
        name: "Settlement Schedule",
        description: "T+1, weekly, or instant settlement.",
        mandatory: true,
      },
      {
        slug: "reconciliation",
        name: "Reconciliation",
        description: "Auto-reconcile collected vs settled.",
        mandatory: true,
      },
      {
        slug: "split",
        name: "Split Settlement",
        description: "Split between multiple merchant accounts.",
      },
      {
        slug: "statement",
        name: "Settlement Statement",
        description: "Generate settlement statement.",
        mandatory: true,
      },
    ],
    versions: [
      { version: "v1", label: "T+1 Settlement", status: "STABLE" },
      {
        version: "v2",
        label: "Instant Settlement",
        status: "STABLE",
        current: true,
        releaseNotes: "Instant settlement with fee premium.",
      },
    ],
    dependencies: [
      { capabilityId: "settlement.schedule", kind: "REQUIRES" },
      { capabilityId: "settlement.fee_calc", kind: "REQUIRES" },
    ],
    certification: [
      {
        slug: "reconcile_match",
        name: "Reconciliation Match",
        description: "Settled amount matches collected minus fees.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "schedule_fire",
        name: "Schedule Fire",
        description: "Settlement fires on configured schedule.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "statement_generated",
        name: "Statement Generated",
        description: "Statement PDF generated per settlement.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
    ],
    documentation: {
      functional: "Settles collected funds to the merchant's settlement account per schedule.",
      businessRules: [
        "Settlement schedule per merchant (T+1, weekly, instant).",
        "Fees deducted before settlement.",
        "Minimum settlement amount.",
      ],
      technicalContract:
        "POST /settlement/merchant — {merchantId, scheduleId} → {settlementId, amountMinor, statementUrl}",
      requiredPermissions: ["payments.disbursements.merchant_settlement.run"],
      complianceRequirements: ["Merchant KYB", "Tax withholding where applicable"],
      failureScenarios: ["Bank downtime", "Reconciliation mismatch", "Merchant suspended"],
      uxExpectations: "Settlement dashboard with schedule + history + statement download.",
    },
    tags: ["settlement", "merchant", "payout", "reconcile"],
  }),
  cap({
    id: "disbursements.cash_pickup",
    name: "Cash Pickup",
    description: "Disburse funds to a cash pickup network for recipient collection.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "BETA",
    countries: ["NG", "KE", "GH"],
    currencies: ["NGN", "KES", "GHS"],
    requiredKycTier: 2,
    supportsRecurring: false,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "pickup_code",
        name: "Pickup Code",
        description: "Generate OTP for cash pickup.",
        mandatory: true,
      },
      {
        slug: "agent_network",
        name: "Agent Network",
        description: "Partner agent locations for pickup.",
        mandatory: true,
      },
      {
        slug: "expiry",
        name: "Expiry",
        description: "Pickup code expires after configurable window.",
        mandatory: true,
      },
    ],
    versions: [{ version: "v1", label: "Initial", status: "BETA", current: true }],
    dependencies: [],
    certification: [
      {
        slug: "code_unique",
        name: "Code Unique",
        description: "Pickup code is unique per disbursement.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "code_verified",
        name: "Code Verified",
        description: "Agent verifies code before cash release.",
        mandatory: true,
        category: "SECURITY",
      },
      {
        slug: "expiry_enforced",
        name: "Expiry Enforced",
        description: "Expired codes rejected.",
        mandatory: true,
        category: "EDGE_CASE",
      },
    ],
    documentation: {
      functional: "Generates a pickup code; recipient collects cash from an agent location.",
      businessRules: [
        "Pickup code valid for 24 hours.",
        "Recipient must present ID + code.",
        "Agent verifies via app.",
      ],
      technicalContract:
        "POST /payout/cash-pickup — {recipientName, recipientId, amountMinor} → {pickupCode, agentLocations[]}",
      requiredPermissions: ["payments.disbursements.cash_pickup.send"],
      complianceRequirements: ["AML screening", "Recipient KYC"],
      failureScenarios: ["Code expired", "Agent unavailable", "Recipient ID mismatch"],
      uxExpectations: "Pickup code + nearby agent locations + expiry countdown.",
    },
    tags: ["cash", "pickup", "agent", "otp"],
  }),
  cap({
    id: "disbursements.cross_border",
    name: "Cross Border Transfer",
    description: "Cross-border payout with FX conversion, compliance, and correspondent banking.",
    groupId: "disbursements",
    direction: "OUTBOUND",
    status: "STABLE",
    countries: ["NG", "KE", "GH", "ZA", "GB", "US"],
    currencies: ["USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR"],
    requiredKycTier: 3,
    supportsRecurring: false,
    supportsRefunds: false,
    supportsChargeback: false,
    supportsPartial: false,
    supportsSplit: false,
    features: [
      {
        slug: "fx_lock",
        name: "FX Lock",
        description: "Lock exchange rate for 5 minutes.",
        mandatory: true,
      },
      {
        slug: "correspondent",
        name: "Correspondent Banking",
        description: "Route via correspondent bank network.",
        mandatory: true,
      },
      {
        slug: "purpose_code",
        name: "Purpose Code",
        description: "Regulatory purpose-of-payment code.",
        mandatory: true,
      },
      {
        slug: "beneficiary_verify",
        name: "Beneficiary Verification",
        description: "Verify beneficiary before send.",
        mandatory: true,
      },
      {
        slug: "tracking",
        name: "Transfer Tracking",
        description: "End-to-end transfer status tracking.",
      },
    ],
    versions: [
      { version: "v1", label: "Correspondent Banking", status: "STABLE" },
      {
        version: "v2",
        label: "Multi-rail",
        status: "STABLE",
        current: true,
        releaseNotes: "Auto-selects cheapest/fastest rail (Wise, correspondent, stablecoin).",
      },
    ],
    dependencies: [
      {
        capabilityId: "fx.quote",
        kind: "REQUIRES",
        reason: "Cross-border requires locked FX quote.",
      },
      {
        capabilityId: "compliance.travel_rule",
        kind: "REQUIRES",
        reason: "FATF travel rule for cross-border.",
      },
      {
        capabilityId: "compliance.sanctions",
        kind: "REQUIRES",
        reason: "Destination country sanctions check.",
      },
      { capabilityId: "banking.beneficiary", kind: "RECOMMENDS" },
    ],
    certification: [
      {
        slug: "fx_lock_honored",
        name: "FX Lock Honored",
        description: "Locked rate honored for 5 minutes.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "travel_rule",
        name: "Travel Rule",
        description: "Originator + beneficiary info captured.",
        mandatory: true,
        category: "COMPLIANCE",
      },
      {
        slug: "sanctions_pass",
        name: "Sanctions Pass",
        description: "Sanctions screening passes for clean recipient.",
        mandatory: true,
        category: "COMPLIANCE",
      },
      {
        slug: "beneficiary_verified",
        name: "Beneficiary Verified",
        description: "Beneficiary name matches account.",
        mandatory: true,
        category: "FUNCTIONAL",
      },
      {
        slug: "purpose_code_valid",
        name: "Purpose Code Valid",
        description: "Purpose code validated against regulator list.",
        mandatory: true,
        category: "COMPLIANCE",
      },
    ],
    documentation: {
      functional:
        "Cross-border payout with FX conversion, compliance screening, and multi-rail delivery.",
      businessRules: [
        "Tier 3 KYC required.",
        "FX quote locked for 5 minutes.",
        "Purpose code mandatory.",
        "Sanctions screening on both originator and beneficiary.",
        "Daily cross-border limit per merchant.",
      ],
      technicalContract:
        "POST /payout/cross-border — {beneficiary, amountMinor, sourceCurrency, targetCurrency, purposeCode} → {quote, reference, estimatedDelivery}",
      requiredPermissions: ["payments.disbursements.cross_border.send"],
      complianceRequirements: [
        "Travel Rule (FATF)",
        "AML",
        "OFAC sanctions",
        "Central bank reporting",
      ],
      failureScenarios: [
        "Sanctions hit",
        "Correspondent bank reject",
        "FX expired",
        "Beneficiary mismatch",
      ],
      uxExpectations:
        "Beneficiary + amount + FX preview + compliance disclosure + estimated delivery.",
    },
    tags: ["cross-border", "intl", "fx", "travel-rule", "correspondent"],
  }),

  // =========================================================================
  // 3. WALLETS
  // =========================================================================
  ...[
    ["deposit", "Deposit", "Fund a wallet from an external source.", "INBOUND", "STABLE", 1],
    [
      "withdraw",
      "Withdraw",
      "Move funds from wallet to an external destination.",
      "OUTBOUND",
      "STABLE",
      1,
    ],
    ["freeze", "Freeze", "Lock a wallet — no debit allowed.", "NEUTRAL", "STABLE", 2],
    ["reserve", "Reserve", "Hold a portion of the balance as collateral.", "NEUTRAL", "STABLE", 2],
    ["escrow", "Escrow", "Hold funds pending a release condition.", "NEUTRAL", "STABLE", 2],
    ["savings", "Savings", "Interest-bearing savings wallet.", "NEUTRAL", "STABLE", 1],
    ["interest", "Interest", "Accrue interest on wallet balance.", "NEUTRAL", "STABLE", 1],
    ["rewards", "Rewards", "Loyalty points / cashback wallet.", "NEUTRAL", "STABLE", 1],
    [
      "cashback",
      "Cashback",
      "Auto-credit cashback on eligible transactions.",
      "INBOUND",
      "STABLE",
      1,
    ],
    ["loyalty", "Loyalty", "Tiered loyalty program wallet.", "NEUTRAL", "STABLE", 1],
    ["sub_wallet", "Sub Wallet", "Child wallet under a parent wallet.", "NEUTRAL", "STABLE", 2],
    [
      "multi_currency",
      "Multi-Currency Wallet",
      "Hold balances in multiple currencies.",
      "NEUTRAL",
      "STABLE",
      2,
    ],
    ["joint_wallet", "Joint Wallet", "Wallet shared between multiple users.", "NEUTRAL", "BETA", 2],
    [
      "merchant_wallet",
      "Merchant Wallet",
      "Wallet for a merchant's settlement balance.",
      "NEUTRAL",
      "STABLE",
      2,
    ],
  ].map(([slug, name, desc, dir, status, tier]) =>
    cap({
      id: `wallets.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "wallets",
      direction: dir as any,
      status: status as any,
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: tier as any,
      supportsRecurring: slug === "interest" || slug === "savings",
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: slug === "sub_wallet",
      features: [
        {
          slug: "balance",
          name: "Balance",
          description: "Current balance query.",
          mandatory: true,
        },
        { slug: "history", name: "History", description: "Transaction history.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: status as any, current: true }],
      dependencies:
        slug === "escrow"
          ? [{ capabilityId: "wallets.freeze", kind: "REQUIRES" }]
          : slug === "joint_wallet"
            ? [{ capabilityId: "compliance.kyc", kind: "REQUIRES" }]
            : [],
      certification: [
        {
          slug: "balance_consistency",
          name: "Balance Consistency",
          description: "Balance matches ledger sum.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["KYC tier enforced.", "Concurrency-safe balance updates."],
        technicalContract: `POST /wallet/${slug} — {...} → {...}`,
        requiredPermissions: [`payments.wallets.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Insufficient funds", "Wallet frozen"],
        uxExpectations: "Wallet card with balance + history.",
      },
      tags: ["wallet", slug as string],
    })
  ),

  // =========================================================================
  // 4. IDENTITY
  // =========================================================================
  ...[
    ["email_verify", "Email Verification", "Verify customer email ownership."],
    ["phone_verify", "Phone Verification", "Verify customer phone via OTP."],
    ["otp", "OTP", "One-time password delivery + verification."],
    ["national_id", "National ID", "Verify national identity number."],
    ["passport", "Passport", "Verify passport document."],
    ["drivers_license", "Driver License", "Verify driver's license."],
    ["bvn", "BVN", "Bank Verification Number (Nigeria)."],
    ["nin", "NIN", "National Identification Number (Nigeria)."],
    ["tin", "TIN", "Tax Identification Number."],
    ["business_verify", "Business Verification", "KYB — corporate registry lookup."],
    ["aml", "AML", "Anti-money-laundering screening."],
    ["pep", "PEP", "Politically-exposed-person screening."],
    ["sanctions", "Sanctions", "OFAC / UN sanctions list screening."],
    ["liveness", "Liveness", "Selfie liveness check."],
    ["face_match", "Face Match", "Match selfie to ID photo."],
    ["doc_ocr", "Document OCR", "Extract data from ID documents."],
    ["address_verify", "Address Verification", "Verify residential address."],
  ].map(([slug, name, desc]) =>
    cap({
      id: `identity.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "identity",
      direction: "NEUTRAL",
      status: slug === "aml" || slug === "pep" || slug === "sanctions" ? "STABLE" : "STABLE",
      countries: slug === "bvn" || slug === "nin" ? ["NG"] : ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 0,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "verify", name: "Verify", description: "Run verification.", mandatory: true },
        { slug: "status", name: "Status", description: "Query verification status." },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "verify_success",
          name: "Verify Success",
          description: "Valid identity passes.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
        {
          slug: "verify_fail",
          name: "Verify Fail",
          description: "Invalid identity rejected.",
          mandatory: true,
          category: "FAILURE_MODE",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Audit-trail every verification."],
        technicalContract: `POST /identity/${slug} — {input} → {verified, score}`,
        requiredPermissions: [`identity.${slug}`],
        complianceRequirements: slug === "aml" || slug === "sanctions" ? ["FATF", "OFAC"] : [],
        failureScenarios: ["Provider timeout", "Invalid input", "Sanctions hit"],
        uxExpectations: "Inline verification with progress + result.",
      },
      tags: ["identity", "kyc", slug as string],
    })
  ),

  // =========================================================================
  // 5. FX
  // =========================================================================
  ...[
    ["rates", "Exchange Rates", "Live exchange rate feed.", "STABLE"],
    ["convert", "Currency Conversion", "Convert between currencies.", "STABLE"],
    ["spread", "Spread Calculation", "Compute buy/sell spread.", "STABLE"],
    ["quote", "FX Quotes", "Locked-in quote with expiry.", "STABLE"],
    ["lock", "FX Lock", "Lock a rate for a window.", "STABLE"],
    ["settlement", "FX Settlement", "Settle the converted amount.", "STABLE"],
    ["multi_ledger", "Multi-Currency Ledger", "Per-currency ledger entries.", "STABLE"],
    ["fx_wallet", "FX Wallet", "Hold balances in multiple currencies.", "STABLE"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `fx.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "fx",
      direction: "NEUTRAL",
      status: status as any,
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 1,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "live", name: "Live", description: "Real-time rates.", mandatory: true },
        { slug: "historical", name: "Historical", description: "Historical rate lookup." },
      ],
      versions: [{ version: "v1", label: "Standard", status: status as any, current: true }],
      dependencies: [],
      certification: [
        {
          slug: "rate_fresh",
          name: "Rate Freshness",
          description: "Rate < 60s old.",
          mandatory: true,
          category: "PERFORMANCE",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Rates cached for 60 seconds.", "Quotes locked for 5 minutes."],
        technicalContract: `GET /fx/${slug} — {from, to} → {rate, expiresAt}`,
        requiredPermissions: [`fx.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Rate provider down", "Stale rate"],
        uxExpectations: "Rate display with conversion preview.",
      },
      tags: ["fx", slug as string],
    })
  ),

  // =========================================================================
  // 6. MERCHANT
  // =========================================================================
  ...[
    ["checkout", "Checkout", "Hosted checkout session.", "STABLE"],
    ["hosted_checkout", "Hosted Checkout", "Full-page hosted checkout.", "STABLE"],
    ["payment_link", "Payment Link", "Shareable payment URL.", "STABLE"],
    ["invoice", "Invoice", "Issue invoices.", "STABLE"],
    ["subscription", "Subscription", "Recurring billing.", "STABLE"],
    ["split", "Split Payment", "Split payment between multiple parties.", "STABLE"],
    ["marketplace", "Marketplace", "Multi-seller marketplace payments.", "BETA"],
    ["escrow", "Escrow", "Hold funds pending delivery.", "STABLE"],
    ["pos", "POS", "Point-of-sale integration.", "PLANNED"],
    ["storefront", "Storefront", "Hosted merchant storefront.", "PLANNED"],
    ["api", "API Access", "Merchant API keys.", "STABLE"],
    ["sdk", "SDK", "Mobile/web SDK.", "STABLE"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `merchant.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "merchant",
      direction: "NEUTRAL",
      status: status as any,
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 2,
      supportsRecurring: slug === "subscription",
      supportsRefunds: true,
      supportsChargeback: true,
      supportsPartial: false,
      supportsSplit: slug === "split" || slug === "marketplace",
      features: [
        { slug: "create", name: "Create", description: "Create resource.", mandatory: true },
        { slug: "list", name: "List", description: "List resources." },
      ],
      versions: [{ version: "v1", label: "Standard", status: status as any, current: true }],
      dependencies:
        slug === "subscription"
          ? [
              {
                capabilityId: "cards.tokenization",
                kind: "REQUIRES",
                reason: "Subscriptions need a tokenized card for recurring billing.",
              },
              {
                capabilityId: "cards.recurring",
                kind: "REQUIRES",
                reason: "Subscriptions need the recurring billing capability.",
              },
              {
                capabilityId: "cards.saved_cards",
                kind: "REQUIRES",
                reason: "Subscriptions need a saved card-on-file.",
              },
            ]
          : slug === "split"
            ? [
                {
                  capabilityId: "wallets.sub_wallet",
                  kind: "REQUIRES",
                  reason: "Split payments route to sub-wallets.",
                },
              ]
            : slug === "marketplace"
              ? [
                  {
                    capabilityId: "merchant.split",
                    kind: "REQUIRES",
                    reason: "Marketplace needs split payment.",
                  },
                  {
                    capabilityId: "wallets.escrow",
                    kind: "REQUIRES",
                    reason: "Marketplace needs escrow for buyer protection.",
                  },
                ]
              : slug === "escrow"
                ? [
                    {
                      capabilityId: "wallets.escrow",
                      kind: "REQUIRES",
                      reason: "Merchant escrow uses the wallet escrow capability.",
                    },
                  ]
                : [],
      certification: [
        {
          slug: "merchant_onboarded",
          name: "Merchant Onboarded",
          description: "Merchant KYB complete.",
          mandatory: true,
          category: "COMPLIANCE",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Merchant must be KYB-verified."],
        technicalContract: `POST /merchant/${slug} — {...} → {...}`,
        requiredPermissions: [`merchant.${slug}`],
        complianceRequirements: ["KYB"],
        failureScenarios: ["Merchant suspended", "KYB incomplete"],
        uxExpectations: "Merchant dashboard with resource management.",
      },
      tags: ["merchant", slug as string],
    })
  ),

  // =========================================================================
  // 7. CARDS
  // =========================================================================
  ...[
    ["tokenization", "Tokenization", "PAN → vault token.", "STABLE"],
    ["authorization", "Authorization", "Authorize a card charge.", "STABLE"],
    ["capture", "Capture", "Capture a held authorization.", "STABLE"],
    ["void", "Void", "Cancel a held authorization.", "STABLE"],
    ["refund", "Refund", "Refund a captured charge.", "STABLE"],
    ["recurring", "Recurring", "Recurring card billing.", "STABLE"],
    ["installments", "Installments", "Split payment into installments.", "BETA"],
    ["verification", "Card Verification", "$0 auth to verify card.", "STABLE"],
    ["network_tokens", "Network Tokens", "PAN-less network-tokenized auth.", "BETA"],
    ["saved_cards", "Saved Cards", "Card-on-file management.", "STABLE"],
    ["card_updater", "Card Updater", "Auto-update expired cards.", "BETA"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `cards.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "cards",
      direction: slug === "refund" || slug === "void" ? "OUTBOUND" : "INBOUND",
      status: status as any,
      countries: ["NG", "KE", "GH", "ZA", "GB", "US"],
      currencies: ["NGN", "KES", "GHS", "ZAR", "USD", "GBP"],
      requiredKycTier: 1,
      supportsRecurring: slug === "recurring",
      supportsRefunds: slug === "refund",
      supportsChargeback: true,
      supportsPartial: slug === "refund" || slug === "capture",
      supportsSplit: false,
      features: [
        { slug: "execute", name: "Execute", description: "Run operation.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: status as any, current: true }],
      dependencies:
        slug === "refund"
          ? [
              {
                capabilityId: "collections.cards",
                kind: "REQUIRES",
                reason: "Refund requires a prior card payment.",
              },
            ]
          : slug === "recurring"
            ? [
                {
                  capabilityId: "cards.tokenization",
                  kind: "REQUIRES",
                  reason: "Recurring billing needs a tokenized card.",
                },
                {
                  capabilityId: "cards.saved_cards",
                  kind: "REQUIRES",
                  reason: "Recurring billing needs a saved card-on-file.",
                },
              ]
            : slug === "tokenization"
              ? [
                  {
                    capabilityId: "collections.cards",
                    kind: "REQUIRES",
                    reason: "Tokenization requires the card collection capability.",
                  },
                ]
              : slug === "capture"
                ? [
                    {
                      capabilityId: "cards.authorization",
                      kind: "REQUIRES",
                      reason: "Capture requires a prior authorization.",
                    },
                  ]
                : slug === "void"
                  ? [
                      {
                        capabilityId: "cards.authorization",
                        kind: "REQUIRES",
                        reason: "Void requires a prior authorization.",
                      },
                    ]
                  : slug === "network_tokens"
                    ? [
                        {
                          capabilityId: "cards.tokenization",
                          kind: "REQUIRES",
                          reason: "Network tokens build on tokenization.",
                        },
                      ]
                    : slug === "card_updater"
                      ? [
                          {
                            capabilityId: "cards.saved_cards",
                            kind: "REQUIRES",
                            reason: "Card updater maintains saved cards.",
                          },
                        ]
                      : [],
      certification:
        slug === "refund"
          ? [
              {
                slug: "full_refund",
                name: "Full Refund",
                description: "Refund of the full captured amount.",
                mandatory: true,
                category: "FUNCTIONAL",
              },
              {
                slug: "partial_refund",
                name: "Partial Refund",
                description: "Refund of less than the captured amount.",
                mandatory: true,
                category: "FUNCTIONAL",
              },
              {
                slug: "duplicate_refund",
                name: "Duplicate Refund",
                description: "Idempotency key prevents double-refund.",
                mandatory: true,
                category: "EDGE_CASE",
              },
              {
                slug: "currency_validation",
                name: "Currency Validation",
                description: "Refund currency matches original.",
                mandatory: true,
                category: "COMPLIANCE",
              },
              {
                slug: "settlement_validation",
                name: "Settlement Validation",
                description: "Refund reflected in settlement.",
                mandatory: true,
                category: "FUNCTIONAL",
              },
            ]
          : slug === "authorization"
            ? [
                {
                  slug: "auth_success",
                  name: "Successful Authorization",
                  description: "Valid card authorizes.",
                  mandatory: true,
                  category: "FUNCTIONAL",
                },
                {
                  slug: "auth_decline",
                  name: "Declined Authorization",
                  description: "Insufficient funds returns decline.",
                  mandatory: true,
                  category: "FAILURE_MODE",
                },
                {
                  slug: "3ds_validation",
                  name: "3DS Validation",
                  description: "3DS authentication enforced where required.",
                  mandatory: true,
                  category: "COMPLIANCE",
                },
                {
                  slug: "duplicate_auth",
                  name: "Duplicate Authorization",
                  description: "Idempotency key prevents double-charge.",
                  mandatory: true,
                  category: "EDGE_CASE",
                },
                {
                  slug: "pci_scope",
                  name: "PCI Scope Validation",
                  description: "No raw PAN logged.",
                  mandatory: true,
                  category: "COMPLIANCE",
                },
              ]
            : slug === "tokenization"
              ? [
                  {
                    slug: "token_unique",
                    name: "Token Unique",
                    description: "Each PAN maps to a unique token.",
                    mandatory: true,
                    category: "FUNCTIONAL",
                  },
                  {
                    slug: "token_detokenize",
                    name: "Detokenize",
                    description: "Token can be detokenized server-side.",
                    mandatory: true,
                    category: "FUNCTIONAL",
                  },
                  {
                    slug: "pci_scope",
                    name: "PCI Scope Validation",
                    description: "No raw PAN persisted.",
                    mandatory: true,
                    category: "COMPLIANCE",
                  },
                ]
              : slug === "capture"
                ? [
                    {
                      slug: "full_capture",
                      name: "Full Capture",
                      description: "Capture full authorized amount.",
                      mandatory: true,
                      category: "FUNCTIONAL",
                    },
                    {
                      slug: "partial_capture",
                      name: "Partial Capture",
                      description: "Capture less than authorized.",
                      mandatory: true,
                      category: "FUNCTIONAL",
                    },
                    {
                      slug: "overcapture_rejected",
                      name: "Overcapture Rejected",
                      description: "Capture > authorized rejected.",
                      mandatory: true,
                      category: "EDGE_CASE",
                    },
                  ]
                : slug === "recurring"
                  ? [
                      {
                        slug: "scheduled_charge",
                        name: "Scheduled Charge",
                        description: "Recurring charge fires on schedule.",
                        mandatory: true,
                        category: "FUNCTIONAL",
                      },
                      {
                        slug: "dunning_retry",
                        name: "Dunning Retry",
                        description: "Failed charge retried per dunning.",
                        mandatory: true,
                        category: "FAILURE_MODE",
                      },
                      {
                        slug: "cancel_stops",
                        name: "Cancel Stops",
                        description: "Cancelled subscription stops charges.",
                        mandatory: true,
                        category: "FUNCTIONAL",
                      },
                    ]
                  : slug === "void"
                    ? [
                        {
                          slug: "void_before_capture",
                          name: "Void Before Capture",
                          description: "Void before capture releases hold.",
                          mandatory: true,
                          category: "FUNCTIONAL",
                        },
                        {
                          slug: "void_after_capture_rejected",
                          name: "Void After Capture Rejected",
                          description: "Void after capture rejected.",
                          mandatory: true,
                          category: "EDGE_CASE",
                        },
                      ]
                    : [
                        {
                          slug: "execute_success",
                          name: "Execute Success",
                          description: "Operation completes.",
                          mandatory: true,
                          category: "FUNCTIONAL",
                        },
                        {
                          slug: "idempotency",
                          name: "Idempotency",
                          description: "Idempotent execution.",
                          mandatory: true,
                          category: "EDGE_CASE",
                        },
                      ],
      documentation: {
        functional: desc as string,
        businessRules: ["PCI scope required."],
        technicalContract: `POST /cards/${slug} — {...} → {...}`,
        requiredPermissions: [`cards.${slug}`],
        complianceRequirements: ["PCI-DSS"],
        failureScenarios: ["Card declined", "Network error"],
        uxExpectations: "Inline operation with result.",
      },
      tags: ["cards", slug as string],
    })
  ),

  // =========================================================================
  // 8. MOBILE MONEY
  // =========================================================================
  ...[
    ["collection", "MM Collection", "Collect from MM wallet.", "STABLE"],
    ["payout", "MM Payout", "Disburse to MM wallet.", "STABLE"],
    ["balance", "MM Balance", "Query MM wallet balance.", "STABLE"],
    ["merchant_payment", "MM Merchant Payment", "Pay a merchant via MM.", "STABLE"],
    ["wallet_funding", "MM Wallet Funding", "Fund MM wallet from bank.", "STABLE"],
    ["wallet_withdrawal", "MM Wallet Withdrawal", "Withdraw MM to bank.", "STABLE"],
    ["cash_in", "MM Cash In", "Agent cash-in to MM wallet.", "STABLE"],
    ["cash_out", "MM Cash Out", "Agent cash-out from MM wallet.", "STABLE"],
    ["bill_payment", "MM Bill Payment", "Pay bills via MM.", "STABLE"],
    ["merchant_settlement", "MM Merchant Settlement", "Settle merchant MM balance.", "STABLE"],
    ["stk_push", "STK Push", "Push USSD prompt to customer.", "STABLE"],
    ["request_to_pay", "Request To Pay", "RTP via MM API.", "STABLE"],
    ["qr", "MM QR", "QR-based MM payment.", "STABLE"],
    ["agent_cash_out", "Agent Cash Out", "Agent-facilitated cash-out.", "STABLE"],
  ].map(([slug, name, desc]) =>
    cap({
      id: `mobile_money.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "mobile_money",
      direction:
        slug === "collection" || slug === "cash_in" || slug === "wallet_funding"
          ? "INBOUND"
          : slug === "payout" || slug === "cash_out" || slug === "wallet_withdrawal"
            ? "OUTBOUND"
            : "NEUTRAL",
      status: "STABLE",
      countries: ["KE", "UG", "GH", "TZ", "RW", "CI", "ZM", "CM", "NG"],
      currencies: ["KES", "UGX", "GHS", "TZS", "RWF", "XOF", "ZMW", "XAF", "NGN"],
      requiredKycTier: 1,
      supportsRecurring: slug === "collection" || slug === "merchant_payment",
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "execute", name: "Execute", description: "Run operation.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "mm_success",
          name: "MM Success",
          description: "Operation completes.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Recipient must be MM-registered."],
        technicalContract: `POST /mobile-money/${slug} — {...} → {...}`,
        requiredPermissions: [`mobile_money.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Wallet not registered", "Operator downtime"],
        uxExpectations: "Inline operation with status.",
      },
      tags: ["mobile_money", slug as string],
    })
  ),

  // =========================================================================
  // 9. VIRTUAL ACCOUNTS
  // =========================================================================
  ...[
    ["permanent", "Permanent VA", "Permanent dedicated account.", "STABLE"],
    ["temporary", "Temporary VA", "Account that expires.", "STABLE"],
    ["static", "Static VA", "Fixed account number.", "STABLE"],
    ["dynamic", "Dynamic VA", "Per-transaction account.", "STABLE"],
    ["dedicated", "Dedicated VA", "One customer, one account.", "STABLE"],
    ["reserved", "Reserved VA", "High-value merchant account.", "STABLE"],
    ["shared", "Shared VA", "Multiple customers reference one account.", "BETA"],
    ["escrow", "Escrow VA", "Account for escrow holdings.", "STABLE"],
    ["collection", "Collection VA", "Account for inbound collection.", "STABLE"],
    ["verification", "VA Verification", "Verify account belongs to customer.", "STABLE"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `virtual_accounts.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "virtual_accounts",
      direction: "INBOUND",
      status: (status as any) ?? "STABLE",
      countries: ["NG", "GH", "KE"],
      currencies: ["NGN", "GHS", "KES"],
      requiredKycTier: 1,
      supportsRecurring: slug === "permanent",
      supportsRefunds: true,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "allocate", name: "Allocate", description: "Allocate account.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "unique",
          name: "Unique",
          description: "Account is unique.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["KYC required."],
        technicalContract: `POST /virtual-account/${slug} — {...} → {...}`,
        requiredPermissions: [`virtual_accounts.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Pool exhausted", "KYC incomplete"],
        uxExpectations: "Account details card.",
      },
      tags: ["virtual_account", slug as string],
    })
  ),

  // =========================================================================
  // 10. BANKING
  // =========================================================================
  ...[
    ["account_verification", "Account Verification", "Validate account name vs number.", "STABLE"],
    ["account_lookup", "Account Lookup", "Resolve account to bank + name.", "STABLE"],
    ["transfer", "Bank Transfer", "Outbound bank transfer.", "STABLE"],
    ["direct_debit", "Direct Debit", "Recurring bank debit.", "STABLE"],
    ["standing_order", "Standing Order", "Customer-configured recurring transfer.", "STABLE"],
    ["open_banking", "Open Banking", "PSD2 / open-banking APIs.", "BETA"],
    ["account_balance", "Account Balance", "Query linked bank balance.", "STABLE"],
    ["statement", "Statement", "Fetch bank statement.", "STABLE"],
    ["beneficiary", "Beneficiary Management", "Saved bank beneficiaries.", "STABLE"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `banking.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "banking",
      direction: slug === "transfer" || slug === "direct_debit" ? "OUTBOUND" : "NEUTRAL",
      status: (status as any) ?? "STABLE",
      countries: ["NG", "KE", "GH", "ZA", "GB"],
      currencies: ["NGN", "KES", "GHS", "ZAR", "GBP"],
      requiredKycTier: 1,
      supportsRecurring: slug === "direct_debit" || slug === "standing_order",
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "execute", name: "Execute", description: "Run operation.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "name_match",
          name: "Name Match",
          description: "Name validated.",
          mandatory: true,
          category: "COMPLIANCE",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Bank code required."],
        technicalContract: `POST /banking/${slug} — {...} → {...}`,
        requiredPermissions: [`banking.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Invalid account", "Bank downtime"],
        uxExpectations: "Inline operation with result.",
      },
      tags: ["banking", slug as string],
    })
  ),

  // =========================================================================
  // 11. RISK
  // =========================================================================
  ...[
    ["velocity", "Velocity", "Transaction-rate limiting per user.", "STABLE"],
    ["geo_blocking", "Geo Blocking", "Block by country / region.", "STABLE"],
    ["ip_reputation", "IP Reputation", "IP fraud-score feed.", "STABLE"],
    ["device_trust", "Device Trust", "Device fingerprint scoring.", "STABLE"],
    ["behavior", "Behavior", "Behavioral biometrics.", "BETA"],
    ["fraud_scoring", "Fraud Scoring", "Composite fraud score.", "STABLE"],
    ["monitoring", "Transaction Monitoring", "Real-time tx monitoring.", "STABLE"],
    ["blacklist", "Blacklist", "Block-listed entities.", "STABLE"],
    ["whitelist", "Whitelist", "Trusted-entity allow-list.", "STABLE"],
    ["rules", "Risk Rules", "Configurable risk rules engine.", "STABLE"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `risk.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "risk",
      direction: "NEUTRAL",
      status: (status as any) ?? "STABLE",
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 0,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "evaluate", name: "Evaluate", description: "Run risk check.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "block_hit",
          name: "Block Hit",
          description: "Blocklisted entity blocked.",
          mandatory: true,
          category: "SECURITY",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Rules hot-reloadable."],
        technicalContract: `POST /risk/${slug} — {...} → {score, action}`,
        requiredPermissions: [`risk.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Provider timeout"],
        uxExpectations: "Inline risk decision.",
      },
      tags: ["risk", slug as string],
    })
  ),

  // =========================================================================
  // 12. COMPLIANCE
  // =========================================================================
  ...[
    ["aml", "AML", "Anti-money-laundering screening.", "STABLE"],
    ["kyc", "KYC", "Know-your-customer verification.", "STABLE"],
    ["kyb", "KYB", "Know-your-business verification.", "STABLE"],
    ["travel_rule", "Travel Rule", "FATF travel rule for cross-border.", "STABLE"],
    ["pep", "PEP", "Politically-exposed-person screening.", "STABLE"],
    ["sanctions", "Sanctions", "OFAC / UN sanctions screening.", "STABLE"],
    ["monitoring", "Monitoring", "Ongoing transaction monitoring.", "STABLE"],
    ["screening", "Transaction Screening", "Per-transaction screening.", "STABLE"],
    ["reporting", "Regulatory Reporting", "File regulatory reports.", "STABLE"],
  ].map(([slug, name, desc]) =>
    cap({
      id: `compliance.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "compliance",
      direction: "NEUTRAL",
      status: "STABLE",
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 0,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "screen", name: "Screen", description: "Run screening.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "hit_detect",
          name: "Hit Detect",
          description: "Sanctioned entity flagged.",
          mandatory: true,
          category: "COMPLIANCE",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Every hit requires analyst review."],
        technicalContract: `POST /compliance/${slug} — {...} → {hit, score}`,
        requiredPermissions: [`compliance.${slug}`],
        complianceRequirements: ["FATF", "OFAC", "local regulator"],
        failureScenarios: ["Provider timeout", "False positive"],
        uxExpectations: "Compliance decision + audit trail.",
      },
      tags: ["compliance", slug as string],
    })
  ),

  // =========================================================================
  // 13. SETTLEMENT
  // =========================================================================
  ...[
    ["schedule", "Settlement Schedule", "Configure settlement cadence.", "STABLE"],
    ["reports", "Settlement Reports", "Generate settlement reports.", "STABLE"],
    ["fee_calc", "Fee Calculation", "Compute fees per transaction.", "STABLE"],
    ["revenue_split", "Revenue Split", "Split revenue between parties.", "STABLE"],
    ["tax", "Tax", "Compute + remit tax.", "STABLE"],
    ["partner", "Partner Settlement", "Settle partner share.", "STABLE"],
    ["merchant", "Merchant Settlement", "Settle merchant balance.", "STABLE"],
    ["provider", "Provider Settlement", "Settle provider dues.", "STABLE"],
  ].map(([slug, name, desc]) =>
    cap({
      id: `settlement.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "settlement",
      direction: "OUTBOUND",
      status: "STABLE",
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 2,
      supportsRecurring: slug === "schedule",
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit:
        slug === "revenue_split" ||
        slug === "partner" ||
        slug === "merchant" ||
        slug === "provider",
      features: [
        { slug: "execute", name: "Execute", description: "Run settlement.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "reconcile",
          name: "Reconcile",
          description: "Settlement reconciles with ledger.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Settlement cadence per merchant."],
        technicalContract: `POST /settlement/${slug} — {...} → {...}`,
        requiredPermissions: [`settlement.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Bank downtime", "Reconciliation mismatch"],
        uxExpectations: "Settlement dashboard.",
      },
      tags: ["settlement", slug as string],
    })
  ),

  // =========================================================================
  // 14. ANALYTICS
  // =========================================================================
  ...[
    ["revenue", "Revenue", "Revenue analytics.", "STABLE"],
    ["volume", "Volume", "Transaction volume analytics.", "STABLE"],
    ["provider_health", "Provider Health", "Per-provider health metrics.", "STABLE"],
    ["countries", "Countries", "Geographic analytics.", "STABLE"],
    ["currencies", "Currencies", "Currency mix analytics.", "STABLE"],
    ["fx", "FX Analytics", "FX volume + spread.", "STABLE"],
    ["latency", "Latency", "Latency percentiles.", "STABLE"],
    ["risk", "Risk Analytics", "Risk score distribution.", "STABLE"],
    ["merchant_dashboard", "Merchant Dashboard", "Per-merchant analytics.", "STABLE"],
    ["customer_dashboard", "Customer Dashboard", "Per-customer analytics.", "STABLE"],
  ].map(([slug, name, desc]) =>
    cap({
      id: `analytics.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "analytics",
      direction: "NEUTRAL",
      status: "STABLE",
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 0,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "query", name: "Query", description: "Run analytics query.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "fresh",
          name: "Fresh",
          description: "Data < 5 min old.",
          mandatory: true,
          category: "PERFORMANCE",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Aggregates pre-computed hourly."],
        technicalContract: `GET /analytics/${slug} — {...} → {...}`,
        requiredPermissions: [`analytics.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["No data"],
        uxExpectations: "Chart dashboard.",
      },
      tags: ["analytics", slug as string],
    })
  ),

  // =========================================================================
  // 15. DEVELOPER
  // =========================================================================
  ...[
    ["rest_api", "REST API", "RESTful API access.", "STABLE"],
    ["graphql", "GraphQL", "GraphQL API access.", "BETA"],
    ["sdk", "SDK", "Mobile/web SDKs.", "STABLE"],
    ["webhook", "Webhook", "Outbound webhook delivery.", "STABLE"],
    ["cli", "CLI", "Command-line interface.", "STABLE"],
    ["sandbox", "Sandbox", "Sandbox environment.", "STABLE"],
    ["testing", "Testing", "Test fixtures + mocks.", "STABLE"],
    ["logs", "Logs", "API request logs.", "STABLE"],
    ["replay", "Replay", "Replay a webhook / request.", "STABLE"],
    ["versioning", "Versioning", "API version management.", "STABLE"],
    ["api_keys", "API Keys", "Key management.", "STABLE"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `developer.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "developer",
      direction: "NEUTRAL",
      status: (status as any) ?? "STABLE",
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 0,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [{ slug: "use", name: "Use", description: "Use the surface.", mandatory: true }],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "auth",
          name: "Auth",
          description: "Authentication enforced.",
          mandatory: true,
          category: "SECURITY",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Rate limits enforced."],
        technicalContract: `* /developer/${slug}`,
        requiredPermissions: [`developer.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Rate limited", "Auth fail"],
        uxExpectations: "Developer portal surface.",
      },
      tags: ["developer", slug as string],
    })
  ),

  // =========================================================================
  // 16. TREASURY
  // =========================================================================
  ...[
    ["liquidity", "Liquidity", "Liquidity position monitoring.", "STABLE"],
    ["sweep", "Sweep", "Sweep balances between accounts.", "STABLE"],
    ["reconciliation", "Reconciliation", "Inter-bank reconciliation.", "STABLE"],
    ["position", "Position Management", "Manage Nostro positions.", "BETA"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `treasury.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "treasury",
      direction: "NEUTRAL",
      status: (status as any) ?? "STABLE",
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 3,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "execute", name: "Execute", description: "Run treasury op.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "reconcile",
          name: "Reconcile",
          description: "Position reconciles.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Treasury ops require Tier 3."],
        technicalContract: `POST /treasury/${slug} — {...} → {...}`,
        requiredPermissions: [`treasury.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Position imbalance"],
        uxExpectations: "Treasury dashboard.",
      },
      tags: ["treasury", slug as string],
    })
  ),

  // =========================================================================
  // 17. SUBSCRIPTIONS
  // =========================================================================
  ...[
    ["plans", "Plans", "Subscription plan management.", "STABLE"],
    ["trials", "Trials", "Free-trial lifecycle.", "STABLE"],
    ["dunning", "Dunning", "Retry failed renewals.", "STABLE"],
    ["proration", "Proration", "Mid-cycle upgrade/downgrade proration.", "STABLE"],
    ["lifecycle", "Lifecycle Events", "Start / renew / cancel / churn events.", "STABLE"],
  ].map(([slug, name, desc]) =>
    cap({
      id: `subscriptions.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "subscriptions",
      direction: "INBOUND",
      status: "STABLE",
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 1,
      supportsRecurring: true,
      supportsRefunds: true,
      supportsChargeback: true,
      supportsPartial: false,
      supportsSplit: false,
      features: [{ slug: "execute", name: "Execute", description: "Run op.", mandatory: true }],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [{ capabilityId: "cards.recurring", kind: "REQUIRES" }],
      certification: [
        {
          slug: "renew",
          name: "Renew",
          description: "Renewal charges correctly.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Grace period configurable."],
        technicalContract: `POST /subscriptions/${slug} — {...} → {...}`,
        requiredPermissions: [`subscriptions.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Card expired", "Dunning exhausted"],
        uxExpectations: "Subscription management UI.",
      },
      tags: ["subscriptions", slug as string],
    })
  ),

  // =========================================================================
  // 18. INVOICES
  // =========================================================================
  ...[
    ["issue", "Issue", "Issue an invoice.", "STABLE"],
    ["send", "Send", "Send invoice to customer.", "STABLE"],
    ["track", "Track", "Track invoice status.", "STABLE"],
    ["remind", "Remind", "Send payment reminders.", "STABLE"],
    ["write_off", "Write-off", "Mark uncollectable.", "STABLE"],
    ["line_items", "Line Items", "Manage invoice line items.", "STABLE"],
    ["tax", "Tax", "Compute invoice tax.", "STABLE"],
  ].map(([slug, name, desc]) =>
    cap({
      id: `invoices.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "invoices",
      direction: "INBOUND",
      status: "STABLE",
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 1,
      supportsRecurring: false,
      supportsRefunds: true,
      supportsChargeback: false,
      supportsPartial: true,
      supportsSplit: false,
      features: [{ slug: "execute", name: "Execute", description: "Run op.", mandatory: true }],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "number_seq",
          name: "Number Sequence",
          description: "Invoice numbers sequential.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Sequential per merchant."],
        technicalContract: `POST /invoices/${slug} — {...} → {...}`,
        requiredPermissions: [`invoices.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Customer disputes"],
        uxExpectations: "Invoice management UI.",
      },
      tags: ["invoices", slug as string],
    })
  ),

  // =========================================================================
  // 19. QR
  // =========================================================================
  ...[
    ["static", "Static QR", "Reusable merchant QR.", "STABLE"],
    ["dynamic", "Dynamic QR", "Per-transaction QR.", "STABLE"],
    ["merchant_presented", "Merchant-Presented QR", "Customer scans merchant QR.", "STABLE"],
    ["consumer_presented", "Consumer-Presented QR", "Merchant scans customer QR.", "BETA"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `qr.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "qr",
      direction: "INBOUND",
      status: (status as any) ?? "STABLE",
      countries: ["NG", "KE", "GH", "ZA"],
      currencies: ["NGN", "KES", "GHS", "ZAR"],
      requiredKycTier: 1,
      supportsRecurring: false,
      supportsRefunds: true,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "generate", name: "Generate", description: "Generate QR.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "scannable",
          name: "Scannable",
          description: "QR decodes.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Dynamic QR expires."],
        technicalContract: `POST /qr/${slug} — {...} → {...}`,
        requiredPermissions: [`qr.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["QR expired"],
        uxExpectations: "QR display.",
      },
      tags: ["qr", slug as string],
    })
  ),

  // =========================================================================
  // 20. CRYPTO
  // =========================================================================
  ...[
    ["onchain_collect", "On-chain Collection", "Native crypto inbound.", "EXPERIMENTAL"],
    ["onchain_payout", "On-chain Payout", "Native crypto outbound.", "EXPERIMENTAL"],
    ["address_management", "Address Management", "HD address derivation.", "STABLE"],
    ["confirmation", "Confirmation Tracking", "Wait for N confirmations.", "STABLE"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `crypto.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "crypto",
      direction: slug === "onchain_payout" ? "OUTBOUND" : "INBOUND",
      status: (status as any) ?? "STABLE",
      countries: ["ALL"],
      currencies: ["BTC", "ETH", "MATIC"],
      requiredKycTier: 3,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [{ slug: "execute", name: "Execute", description: "Run op.", mandatory: true }],
      versions: [
        { version: "v1", label: "Standard", status: (status as any) ?? "STABLE", current: true },
      ],
      dependencies: [],
      certification: [
        {
          slug: "address_valid",
          name: "Address Valid",
          description: "Address passes checksum.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Tier 3 KYC required."],
        technicalContract: `POST /crypto/${slug} — {...} → {...}`,
        requiredPermissions: [`crypto.${slug}`],
        complianceRequirements: ["Travel Rule", "Chain analytics"],
        failureScenarios: ["Reorg", "Fee spike"],
        uxExpectations: "On-chain UI.",
      },
      tags: ["crypto", slug as string],
    })
  ),

  // =========================================================================
  // 21. STABLECOINS
  // =========================================================================
  ...[
    ["bridge", "Bridge", "On/off-ramp stablecoins.", "STABLE"],
    ["mint", "Mint", "Mint stablecoins (regulated).", "BETA"],
    ["redeem", "Redeem", "Redeem stablecoins for fiat.", "BETA"],
    ["transfer", "Transfer", "On-chain stablecoin transfer.", "STABLE"],
  ].map(([slug, name, desc, status]) =>
    cap({
      id: `stablecoins.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "stablecoins",
      direction: "NEUTRAL",
      status: (status as any) ?? "STABLE",
      countries: ["ALL"],
      currencies: ["USDC", "USDT", "CUSD"],
      requiredKycTier: 2,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [{ slug: "execute", name: "Execute", description: "Run op.", mandatory: true }],
      versions: [
        { version: "v1", label: "Standard", status: (status as any) ?? "STABLE", current: true },
      ],
      dependencies:
        slug === "bridge"
          ? [
              {
                capabilityId: "compliance.aml",
                kind: "REQUIRES",
                reason: "Stablecoin bridging requires AML screening.",
              },
              {
                capabilityId: "compliance.travel_rule",
                kind: "REQUIRES",
                reason: "Cross-chain bridge needs travel rule compliance.",
              },
            ]
          : slug === "mint"
            ? [
                {
                  capabilityId: "compliance.kyb",
                  kind: "REQUIRES",
                  reason: "Minting requires business verification.",
                },
                {
                  capabilityId: "compliance.aml",
                  kind: "REQUIRES",
                  reason: "Minting requires AML screening.",
                },
              ]
            : slug === "redeem"
              ? [
                  {
                    capabilityId: "compliance.aml",
                    kind: "REQUIRES",
                    reason: "Redemption requires AML screening.",
                  },
                  {
                    capabilityId: "banking.account_verification",
                    kind: "REQUIRES",
                    reason: "Redemption needs verified bank account for fiat payout.",
                  },
                ]
              : slug === "transfer"
                ? [
                    {
                      capabilityId: "compliance.travel_rule",
                      kind: "RECOMMENDS",
                      reason: "On-chain transfers may trigger travel rule above threshold.",
                    },
                  ]
                : [],
      certification: [
        {
          slug: "address_valid",
          name: "Address Valid",
          description: "Address validated.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Tier 2 KYC minimum."],
        technicalContract: `POST /stablecoin/${slug} — {...} → {...}`,
        requiredPermissions: [`stablecoins.${slug}`],
        complianceRequirements: ["Travel Rule"],
        failureScenarios: ["Bridge outage"],
        uxExpectations: "Stablecoin UI.",
      },
      tags: ["stablecoin", slug as string],
    })
  ),

  // =========================================================================
  // 22. NOTIFICATIONS
  // =========================================================================
  ...[
    ["email", "Email", "Transactional email.", "STABLE"],
    ["sms", "SMS", "Transactional SMS.", "STABLE"],
    ["push", "Push", "Mobile push notifications.", "STABLE"],
    ["in_app", "In-App", "In-app notifications.", "STABLE"],
    ["otp_delivery", "OTP Delivery", "OTP via SMS/voice.", "STABLE"],
    ["template_management", "Template Management", "Manage notification templates.", "STABLE"],
  ].map(([slug, name, desc]) =>
    cap({
      id: `notifications.${slug}`,
      name: name as string,
      description: desc as string,
      groupId: "notifications",
      direction: "OUTBOUND",
      status: "STABLE",
      countries: ["ALL"],
      currencies: ["ALL"],
      requiredKycTier: 0,
      supportsRecurring: false,
      supportsRefunds: false,
      supportsChargeback: false,
      supportsPartial: false,
      supportsSplit: false,
      features: [
        { slug: "send", name: "Send", description: "Send notification.", mandatory: true },
      ],
      versions: [{ version: "v1", label: "Standard", status: "STABLE", current: true }],
      dependencies: [],
      certification: [
        {
          slug: "delivered",
          name: "Delivered",
          description: "Notification delivered.",
          mandatory: true,
          category: "FUNCTIONAL",
        },
      ],
      documentation: {
        functional: desc as string,
        businessRules: ["Templates versioned."],
        technicalContract: `POST /notifications/${slug} — {...} → {...}`,
        requiredPermissions: [`notifications.${slug}`],
        complianceRequirements: [],
        failureScenarios: ["Provider downtime", "Invalid recipient"],
        uxExpectations: "Notification delivery.",
      },
      tags: ["notifications", slug as string],
    })
  ),
];

// ---------------------------------------------------------------------------
// Lookup helpers (used by the resolution engine + API)
// ---------------------------------------------------------------------------

export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

/**
 * Returns a capability with its `providers` field populated from the
 * provider-matrix. This is the "attached, not embedded" pattern from
 * Chapter 7 — the catalogue never hardcodes provider names; they're
 * resolved dynamically at query time.
 *
 * Use this instead of getCapability() when you need the full picture
 * (e.g. in the API layer). Use getCapability() for pure catalogue lookups
 * where providers aren't needed (e.g. in the resolution engine, which
 * queries the provider-matrix directly).
 */
export function getCapabilityWithProviders(id: string): Capability | undefined {
  const cap = getCapability(id);
  if (!cap) return undefined;
  if (cap.providers.length === 0) {
    // Lazy require to avoid circular dependency at module load time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pm = require("./provider-matrix");
    const entries = pm.getCapabilityProviders(id);
    if (entries.length > 0) {
      return { ...cap, providers: entries.map((e: any) => e.providerCode) };
    }
  }
  return cap;
}

export function getCapabilitiesByGroup(groupId: string): Capability[] {
  return CAPABILITIES.filter((c) => c.groupId === groupId);
}

export function getGroup(id: string): CapabilityGroup | undefined {
  return CAPABILITY_GROUPS.find((g) => g.id === id);
}
