// TurboCore GCR — Provider Capability Matrix
//
// Every provider advertises capabilities. The GCR compares this against the
// country's requirements during resolution.
//
// The mapping is derived from the existing provider manifests
// (src/lib/turbocore/providers/manifests/*.ts) — each manifest's `capabilities[]`
// array is translated into GCR ProviderCapabilityEntry rows.
//
// Maturity levels:
//   NATIVE     — first-class, fully certified
//   SUPPORTED  — implemented & certified
//   LIMITED    — partial feature coverage
//   BETA       — pilot
//   PARKED     — implemented but disabled pending compliance
//   ROADMAP    — declared but not yet implemented

import { CAPABILITIES, getCapability } from "./capability-tree";
import type { ProviderCapabilityEntry, ProviderCapabilityMaturity } from "./types";
import { getAllManifests } from "../manifest-registry";

// ---------------------------------------------------------------------------
// Manifest capability name → GCR capability id mapping
// ---------------------------------------------------------------------------

/**
 * Maps a manifest capability name (e.g. "CARD", "MOBILE_MONEY") to one or more
 * GCR capability ids. A single manifest capability may correspond to multiple
 * GCR capabilities (e.g. "MOBILE_MONEY" maps to both collection and payout).
 */
const MANIFEST_TO_GCR: Record<
  string,
  Array<{ id: string; direction: "INBOUND" | "OUTBOUND" | "BOTH" }>
> = {
  CARD_PAYMENT: [{ id: "collections.cards", direction: "INBOUND" }],
  CARD: [
    { id: "collections.cards", direction: "INBOUND" },
    { id: "cards.tokenization", direction: "INBOUND" },
  ],
  CARD_TOKENIZATION: [{ id: "cards.tokenization", direction: "INBOUND" }],
  BANK_TRANSFER: [
    { id: "collections.bank_transfer", direction: "INBOUND" },
    { id: "disbursements.bank_transfer", direction: "OUTBOUND" },
    { id: "banking.transfer", direction: "OUTBOUND" },
  ],
  VIRTUAL_ACCOUNT: [
    { id: "collections.virtual_account", direction: "INBOUND" },
    { id: "virtual_accounts.permanent", direction: "INBOUND" },
  ],
  USSD: [{ id: "collections.ussd", direction: "INBOUND" }],
  QR: [
    { id: "collections.qr", direction: "INBOUND" },
    { id: "qr.dynamic", direction: "INBOUND" },
  ],
  PAYMENT_PAGE: [
    { id: "collections.payment_link", direction: "INBOUND" },
    { id: "merchant.payment_link", direction: "INBOUND" },
  ],
  PAYMENT_LINK: [{ id: "collections.payment_link", direction: "INBOUND" }],
  INVOICE: [
    { id: "collections.invoice", direction: "INBOUND" },
    { id: "invoices.issue", direction: "INBOUND" },
  ],
  CHECKOUT: [
    { id: "collections.checkout", direction: "INBOUND" },
    { id: "merchant.checkout", direction: "INBOUND" },
  ],
  APPLE_PAY: [{ id: "collections.apple_pay", direction: "INBOUND" }],
  MOBILE_MONEY: [
    { id: "collections.mobile_money", direction: "INBOUND" },
    { id: "disbursements.mobile_money", direction: "OUTBOUND" },
    { id: "mobile_money.collection", direction: "INBOUND" },
    { id: "mobile_money.payout", direction: "OUTBOUND" },
    { id: "mobile_money.stk_push", direction: "INBOUND" },
  ],
  BILL_PAYMENT: [{ id: "mobile_money.bill_payment", direction: "INBOUND" }],
  AIRTIME: [{ id: "mobile_money.wallet_funding", direction: "INBOUND" }],
  MERCHANT_PAYMENT: [{ id: "mobile_money.merchant_payment", direction: "INBOUND" }],
  KYC: [
    { id: "identity.kyc", direction: "INBOUND" },
    { id: "compliance.kyc", direction: "INBOUND" },
  ],
  BUSINESS_KYC: [{ id: "compliance.kyb", direction: "INBOUND" }],
  AML: [
    { id: "compliance.aml", direction: "INBOUND" },
    { id: "identity.aml", direction: "INBOUND" },
  ],
  FRAUD_SCREENING: [{ id: "risk.fraud_scoring", direction: "INBOUND" }],
  PEP: [{ id: "identity.pep", direction: "INBOUND" }],
  SANCTIONS: [{ id: "identity.sanctions", direction: "INBOUND" }],
  LIVENESS: [{ id: "identity.liveness", direction: "INBOUND" }],
  FACE_MATCH: [{ id: "identity.face_match", direction: "INBOUND" }],
  DOC_OCR: [{ id: "identity.doc_ocr", direction: "INBOUND" }],
  INTERNATIONAL_TRANSFER: [{ id: "disbursements.international", direction: "OUTBOUND" }],
  EXCHANGE_RATE: [
    { id: "fx.rates", direction: "INBOUND" },
    { id: "fx.quote", direction: "INBOUND" },
  ],
  RECIPIENT: [{ id: "banking.beneficiary", direction: "INBOUND" }],
  MULTI_CURRENCY_BALANCE: [{ id: "wallets.multi_currency", direction: "INBOUND" }],
  SPLIT_PAYMENT: [{ id: "merchant.split", direction: "INBOUND" }],
  DIRECT_DEBIT: [{ id: "banking.direct_debit", direction: "OUTBOUND" }],
  RECURRING_BILLING: [
    { id: "cards.recurring", direction: "INBOUND" },
    { id: "merchant.subscription", direction: "INBOUND" },
  ],
  SUBSCRIPTION: [{ id: "merchant.subscription", direction: "INBOUND" }],
  REFUND: [{ id: "cards.refund", direction: "OUTBOUND" }],
  CHARGEBACK: [{ id: "collections.cards", direction: "INBOUND" }],
  PAYOUT: [{ id: "disbursements.bank_transfer", direction: "OUTBOUND" }],
  BULK_TRANSFER: [{ id: "disbursements.bulk", direction: "OUTBOUND" }],
  SETTLEMENT: [{ id: "settlement.merchant", direction: "OUTBOUND" }],
  SUBACCOUNT: [{ id: "merchant.split", direction: "INBOUND" }],
  VIRTUAL_CARD: [{ id: "cards.tokenization", direction: "INBOUND" }],
  VIRTUAL_CARD_ISSUER: [{ id: "cards.tokenization", direction: "INBOUND" }],
  VIRTUAL_CARD_MGMT: [{ id: "cards.saved_cards", direction: "INBOUND" }],
  CUSTOMER: [{ id: "identity.kyc", direction: "INBOUND" }],
  PRODUCT: [{ id: "merchant.storefront", direction: "INBOUND" }],
  PRICE: [{ id: "merchant.storefront", direction: "INBOUND" }],
  WEBHOOK_ENDPOINT: [{ id: "developer.webhook", direction: "INBOUND" }],
  MANDATE: [{ id: "banking.direct_debit", direction: "OUTBOUND" }],
  NOTIFICATION: [{ id: "notifications.email", direction: "OUTBOUND" }],
  OTP: [{ id: "notifications.otp_delivery", direction: "OUTBOUND" }],
};

// ---------------------------------------------------------------------------
// Build the provider matrix from manifests at module load
// ---------------------------------------------------------------------------

let matrixCache: ProviderCapabilityEntry[] | null = null;

function isParked(providerCode: string): boolean {
  return providerCode === "stripe" || providerCode === "wise";
}

function isMock(providerCode: string): boolean {
  return providerCode === "turbopay";
}

function deriveMaturity(
  providerCode: string,
  manifestCapabilityName: string
): ProviderCapabilityMaturity {
  if (isMock(providerCode)) return "NATIVE";
  if (isParked(providerCode)) return "PARKED";
  // Manifest capabilities that are well-established are SUPPORTED; obscure ones are LIMITED
  const wellEstablished = new Set([
    "CARD",
    "CARD_PAYMENT",
    "BANK_TRANSFER",
    "VIRTUAL_ACCOUNT",
    "MOBILE_MONEY",
    "KYC",
    "REFUND",
    "SETTLEMENT",
    "PAYMENT_PAGE",
    "PAYMENT_LINK",
    "INVOICE",
    "CHECKOUT",
    "BILL_PAYMENT",
    "AIRTIME",
    "AML",
    "NOTIFICATION",
    "OTP",
    "PAYOUT",
    "BULK_TRANSFER",
    "INTERNATIONAL_TRANSFER",
    "EXCHANGE_RATE",
    "RECURRING_BILLING",
    "SUBSCRIPTION",
    "SPLIT_PAYMENT",
    "SUBACCOUNT",
    "BUSINESS_KYC",
    "FRAUD_SCREENING",
    "DIRECT_DEBIT",
    "MANDATE",
    "CHARGEBACK",
    "RECIPIENT",
    "MULTI_CURRENCY_BALANCE",
    "CUSTOMER",
    "PRODUCT",
    "PRICE",
    "WEBHOOK_ENDPOINT",
    "CARD_TOKENIZATION",
    "USSD",
    "QR",
    "APPLE_PAY",
    "MERCHANT_PAYMENT",
    "PEP",
    "SANCTIONS",
    "LIVENESS",
    "FACE_MATCH",
    "DOC_OCR",
    "VIRTUAL_CARD",
    "VIRTUAL_CARD_ISSUER",
    "VIRTUAL_CARD_MGMT",
  ]);
  return wellEstablished.has(manifestCapabilityName) ? "SUPPORTED" : "LIMITED";
}

export function getProviderMatrix(): ProviderCapabilityEntry[] {
  if (matrixCache) return matrixCache;

  const entries: ProviderCapabilityEntry[] = [];
  const manifests = getAllManifests();

  for (const manifest of manifests) {
    for (const mCap of manifest.capabilities) {
      const mappings = MANIFEST_TO_GCR[mCap.name] ?? [];
      for (const mapping of mappings) {
        // Only keep mappings that point at real GCR capabilities
        if (!getCapability(mapping.id)) continue;
        // Direction filter: if the manifest capability declares a direction,
        // only include mappings that match (or are BOTH)
        if (
          mCap.direction !== "BOTH" &&
          mapping.direction !== "BOTH" &&
          mCap.direction !== mapping.direction
        ) {
          continue;
        }
        const maturity = deriveMaturity(manifest.provider, mCap.name);
        // Extract feature slugs from the capability that the provider implements
        const cap = getCapability(mapping.id)!;
        const features = cap.features.map((f) => f.slug);
        entries.push({
          providerCode: manifest.provider,
          capabilityId: mapping.id,
          maturity,
          features,
          version: cap.versions.find((v) => v.current)?.version,
          countries: mCap.countries.length > 0 ? mCap.countries : manifest.countries,
          notes: isParked(manifest.provider) ? "PARKED — pending compliance sign-off" : undefined,
        });
      }
    }
  }

  // Deduplicate (providerCode + capabilityId)
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    const key = `${e.providerCode}:${e.capabilityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  matrixCache = deduped;
  return deduped;
}

export function getProviderCapabilities(providerCode: string): ProviderCapabilityEntry[] {
  return getProviderMatrix().filter((e) => e.providerCode === providerCode);
}

export function getCapabilityProviders(capabilityId: string): ProviderCapabilityEntry[] {
  return getProviderMatrix().filter((e) => e.capabilityId === capabilityId);
}

export function getProvidersForCapabilityInCountry(
  capabilityId: string,
  country: string
): ProviderCapabilityEntry[] {
  return getProviderMatrix().filter(
    (e) =>
      e.capabilityId === capabilityId &&
      (e.countries.includes(country) || e.countries.includes("ALL"))
  );
}

/** Returns all provider codes that appear in the matrix. */
export function getMappedProviders(): string[] {
  const matrix = getProviderMatrix();
  return Array.from(new Set(matrix.map((e) => e.providerCode))).sort();
}
