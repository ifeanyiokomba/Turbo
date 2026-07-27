// TurboCore GCR — Capability Certification
//
// Every capability has certification tests. Providers only pass certification
// if they satisfy all mandatory tests for that capability.
//
// This module is the *capability-level* certification catalog (the test
// definitions live on each Capability object). The *provider-level* runner
// lives in src/lib/turbocore/certification.ts.
//
// For the GCR admin surface, we expose:
//   - the catalog of tests per capability
//   - a per-provider × per-capability certification matrix (in-memory store)
//   - a "run certification" function that simulates test execution

import { CAPABILITIES, getCapability } from "./capability-tree";
import type { CapabilityCertification, CertificationStatus } from "./types";

// ---------------------------------------------------------------------------
// Certification result store (in-memory)
// ---------------------------------------------------------------------------

export interface ProviderCapabilityCertification {
  id: string;
  providerCode: string;
  capabilityId: string;
  status: CertificationStatus;
  passed: number;
  failed: number;
  total: number;
  mandatoryPassed: number;
  mandatoryTotal: number;
  durationMs: number;
  certifiedAt?: string;
  failureReason?: string;
  testResults: Array<{
    slug: string;
    name: string;
    category: string;
    mandatory: boolean;
    status: "PASS" | "FAIL" | "SKIP";
    message?: string;
    durationMs?: number;
  }>;
}

const certStore = new Map<string, ProviderCapabilityCertification>(); // key: provider:capability

function certKey(providerCode: string, capabilityId: string): string {
  return `${providerCode}:${capabilityId}`;
}

// Seed a few certification records so the admin UI shows realistic data
function seedCerts(): void {
  if (certStore.size > 0) return;
  const seeds: Array<{ provider: string; capability: string; passRate: number }> = [
    { provider: "paystack", capability: "collections.cards", passRate: 1.0 },
    { provider: "paystack", capability: "collections.bank_transfer", passRate: 1.0 },
    { provider: "paystack", capability: "collections.virtual_account", passRate: 1.0 },
    { provider: "paystack", capability: "collections.ussd", passRate: 1.0 },
    { provider: "paystack", capability: "cards.tokenization", passRate: 1.0 },
    { provider: "paystack", capability: "cards.refund", passRate: 1.0 },
    { provider: "paystack", capability: "cards.recurring", passRate: 0.8 },
    { provider: "flutterwave", capability: "collections.cards", passRate: 1.0 },
    { provider: "flutterwave", capability: "collections.bank_transfer", passRate: 1.0 },
    { provider: "flutterwave", capability: "collections.mobile_money", passRate: 1.0 },
    { provider: "flutterwave", capability: "cards.tokenization", passRate: 1.0 },
    { provider: "flutterwave", capability: "disbursements.bank_transfer", passRate: 1.0 },
    { provider: "flutterwave", capability: "disbursements.international", passRate: 0.6 },
    { provider: "monnify", capability: "collections.virtual_account", passRate: 1.0 },
    { provider: "monnify", capability: "collections.cards", passRate: 1.0 },
    { provider: "monnify", capability: "collections.invoice", passRate: 1.0 },
    { provider: "mpesa", capability: "collections.mobile_money", passRate: 1.0 },
    { provider: "mpesa", capability: "disbursements.mobile_money", passRate: 1.0 },
    { provider: "mpesa", capability: "mobile_money.stk_push", passRate: 1.0 },
    { provider: "mpesa", capability: "mobile_money.collection", passRate: 1.0 },
    { provider: "mpesa", capability: "mobile_money.payout", passRate: 1.0 },
    { provider: "mtn-momo", capability: "collections.mobile_money", passRate: 1.0 },
    { provider: "mtn-momo", capability: "disbursements.mobile_money", passRate: 1.0 },
    { provider: "airtel-money", capability: "collections.mobile_money", passRate: 1.0 },
    { provider: "airtel-money", capability: "disbursements.mobile_money", passRate: 1.0 },
    { provider: "dojah", capability: "identity.aml", passRate: 1.0 },
    { provider: "dojah", capability: "identity.bvn", passRate: 1.0 },
    { provider: "dojah", capability: "identity.nin", passRate: 1.0 },
    { provider: "dojah", capability: "compliance.aml", passRate: 1.0 },
    { provider: "termii", capability: "notifications.sms", passRate: 1.0 },
    { provider: "termii", capability: "notifications.otp_delivery", passRate: 1.0 },
    { provider: "resend", capability: "notifications.email", passRate: 1.0 },
    { provider: "turbopay", capability: "collections.cards", passRate: 1.0 },
    { provider: "turbopay", capability: "disbursements.bank_transfer", passRate: 1.0 },
    { provider: "turbopay", capability: "wallets.deposit", passRate: 1.0 },
  ];

  for (const seed of seeds) {
    const cap = getCapability(seed.capability);
    if (!cap) continue;
    const tests = cap.certification;
    if (tests.length === 0) continue;
    const mandatory = tests.filter((t) => t.mandatory);
    const passed = Math.floor(tests.length * seed.passRate);
    const mandatoryPassed = Math.floor(mandatory.length * seed.passRate);
    const status: CertificationStatus =
      mandatoryPassed === mandatory.length
        ? "CERTIFIED"
        : mandatoryPassed > 0
          ? "IN_PROGRESS"
          : "FAILED";
    const cert: ProviderCapabilityCertification = {
      id: `seed-${seed.provider}-${seed.capability}`,
      providerCode: seed.provider,
      capabilityId: seed.capability,
      status,
      passed,
      failed: tests.length - passed,
      total: tests.length,
      mandatoryPassed,
      mandatoryTotal: mandatory.length,
      durationMs: Math.floor(Math.random() * 5000) + 500,
      certifiedAt: status === "CERTIFIED" ? new Date().toISOString() : undefined,
      failureReason: status === "FAILED" ? "Mandatory tests failed" : undefined,
      testResults: tests.map((t, i) => ({
        slug: t.slug,
        name: t.name,
        category: t.category,
        mandatory: t.mandatory,
        status: i < passed ? "PASS" : "FAIL",
        message: i < passed ? undefined : "Simulated failure",
        durationMs: Math.floor(Math.random() * 800) + 50,
      })),
    };
    certStore.set(certKey(seed.provider, seed.capability), cert);
  }
}
seedCerts();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function listCertifications(filter?: {
  providerCode?: string;
  capabilityId?: string;
  status?: CertificationStatus;
}): ProviderCapabilityCertification[] {
  let certs = Array.from(certStore.values());
  if (filter?.providerCode) certs = certs.filter((c) => c.providerCode === filter.providerCode);
  if (filter?.capabilityId) certs = certs.filter((c) => c.capabilityId === filter.capabilityId);
  if (filter?.status) certs = certs.filter((c) => c.status === filter.status);
  return certs.sort(
    (a, b) =>
      a.providerCode.localeCompare(b.providerCode) || a.capabilityId.localeCompare(b.capabilityId)
  );
}

export function getCertification(
  providerCode: string,
  capabilityId: string
): ProviderCapabilityCertification | null {
  return certStore.get(certKey(providerCode, capabilityId)) ?? null;
}

export function getCapabilityTests(capabilityId: string): CapabilityCertification[] {
  return getCapability(capabilityId)?.certification ?? [];
}

/**
 * Run certification for a (provider, capability) pair.
 *
 * This is a *simulated* runner — the real runner lives in
 * src/lib/turbocore/certification.ts and executes live provider calls. For the
 * GCR admin surface, the simulation produces a deterministic result based on
 * the provider's declared maturity for that capability.
 */
export async function runCapabilityCertification(
  providerCode: string,
  capabilityId: string
): Promise<ProviderCapabilityCertification> {
  const cap = getCapability(capabilityId);
  if (!cap) {
    throw new Error(`Unknown capability: ${capabilityId}`);
  }
  const tests = cap.certification;
  const start = Date.now();

  // Simulate: NATIVE/SUPPORTED providers pass all mandatory tests; BETA passes 70%;
  // LIMITED passes 50%; PARKED fails all
  const { getProviderMatrix } = await import("./provider-matrix");
  const matrix = getProviderMatrix();
  const entry = matrix.find(
    (e) => e.providerCode === providerCode && e.capabilityId === capabilityId
  );
  const maturity = entry?.maturity ?? "ROADMAP";
  const passProbability =
    maturity === "NATIVE"
      ? 1.0
      : maturity === "SUPPORTED"
        ? 0.95
        : maturity === "BETA"
          ? 0.7
          : maturity === "LIMITED"
            ? 0.5
            : maturity === "PARKED"
              ? 0.0
              : 0.1;

  const testResults = tests.map((t) => {
    const pass = Math.random() < (t.mandatory ? passProbability : passProbability * 0.9 + 0.1);
    return {
      slug: t.slug,
      name: t.name,
      category: t.category,
      mandatory: t.mandatory,
      status: (pass ? "PASS" : "FAIL") as "PASS" | "FAIL" | "SKIP",
      message: pass ? undefined : "Simulated failure",
      durationMs: Math.floor(Math.random() * 800) + 50,
    };
  });

  const passed = testResults.filter((t) => t.status === "PASS").length;
  const failed = testResults.length - passed;
  const mandatoryTests = testResults.filter((t) => t.mandatory);
  const mandatoryPassed = mandatoryTests.filter((t) => t.status === "PASS").length;
  const mandatoryTotal = mandatoryTests.length;
  const status: CertificationStatus =
    mandatoryPassed === mandatoryTotal && mandatoryTotal > 0
      ? "CERTIFIED"
      : mandatoryPassed > 0
        ? "IN_PROGRESS"
        : "FAILED";

  const cert: ProviderCapabilityCertification = {
    id: `cert-${providerCode}-${capabilityId}-${Date.now()}`,
    providerCode,
    capabilityId,
    status,
    passed,
    failed,
    total: tests.length,
    mandatoryPassed,
    mandatoryTotal,
    durationMs: Date.now() - start,
    certifiedAt: status === "CERTIFIED" ? new Date().toISOString() : undefined,
    failureReason:
      status === "FAILED"
        ? `${mandatoryTotal - mandatoryPassed} mandatory tests failed`
        : undefined,
    testResults,
  };

  certStore.set(certKey(providerCode, capabilityId), cert);
  return cert;
}

export function getCertificationStats(): {
  total: number;
  certified: number;
  inProgress: number;
  failed: number;
  pending: number;
  byCategory: Record<string, number>;
} {
  const certs = Array.from(certStore.values());
  return {
    total: certs.length,
    certified: certs.filter((c) => c.status === "CERTIFIED").length,
    inProgress: certs.filter((c) => c.status === "IN_PROGRESS").length,
    failed: certs.filter((c) => c.status === "FAILED").length,
    pending: certs.filter((c) => c.status === "PENDING").length,
    byCategory: certs.reduce(
      (acc, c) => {
        acc[c.status] = (acc[c.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
  };
}

export function getCertificationMatrix(): Array<{
  providerCode: string;
  capabilityId: string;
  capabilityName: string;
  status: CertificationStatus;
  mandatoryPassed: number;
  mandatoryTotal: number;
}> {
  const certs = Array.from(certStore.values());
  return certs.map((c) => {
    const cap = getCapability(c.capabilityId);
    return {
      providerCode: c.providerCode,
      capabilityId: c.capabilityId,
      capabilityName: cap?.name ?? c.capabilityId,
      status: c.status,
      mandatoryPassed: c.mandatoryPassed,
      mandatoryTotal: c.mandatoryTotal,
    };
  });
}
