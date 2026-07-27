// TurboCore Sandbox Runner
//
// Every plugin must support sandbox mode:
//   - Mock Payments
//   - Mock Webhooks
//   - Mock Refunds
//   - Mock KYC
//   - Mock Settlement
//
// This enables deterministic automated testing without touching live money.

import { ok, fail, type ProviderResult } from "./result";

export interface SandboxConfig {
  provider: string;
  enabled: boolean;
  mockDelayMs: number; // simulated latency
  failureRate: number; // 0-1, probability of simulated failure
  mockData: Record<string, unknown>; // pre-configured test data
}

export interface SandboxPayment {
  reference: string;
  amount: number;
  currency: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
  method: string;
  customer: { email?: string; phone?: string; name?: string };
  providerReference: string;
  createdAt: string;
}

export interface SandboxWebhook {
  eventId: string;
  eventType: string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  payload: Record<string, unknown>;
}

// ===== Sandbox State =====

const sandboxPayments = new Map<string, SandboxPayment>();
const sandboxWebhooks = new Map<string, SandboxWebhook>();
const sandboxConfig = new Map<string, SandboxConfig>();

// ===== Sandbox Configuration =====

export function configureSandbox(provider: string, config: Partial<SandboxConfig>): void {
  const existing = sandboxConfig.get(provider) ?? {
    provider,
    enabled: true,
    mockDelayMs: 200,
    failureRate: 0,
    mockData: {},
  };
  sandboxConfig.set(provider, { ...existing, ...config });
}

export function isSandboxEnabled(provider: string): boolean {
  return sandboxConfig.get(provider)?.enabled ?? false;
}

export function setSandboxMode(provider: string, enabled: boolean): void {
  configureSandbox(provider, { enabled });
}

// ===== Mock Payment Operations =====

export async function mockCollect(
  provider: string,
  request: { reference: string; amount: number; currency: string; method: string; customer: any }
): Promise<ProviderResult<SandboxPayment>> {
  const config = sandboxConfig.get(provider);
  const delay = config?.mockDelayMs ?? 200;
  const failureRate = config?.failureRate ?? 0;

  await new Promise((r) => setTimeout(r, delay));

  // Simulate failure based on failureRate
  if (Math.random() < failureRate) {
    return fail("UPSTREAM_ERROR", "Simulated failure (sandbox)");
  }

  const payment: SandboxPayment = {
    reference: request.reference,
    amount: request.amount,
    currency: request.currency,
    status: "SUCCESS",
    method: request.method,
    customer: request.customer,
    providerReference: `sandbox-${provider}-${request.reference}`,
    createdAt: new Date().toISOString(),
  };

  sandboxPayments.set(request.reference, payment);

  // Auto-generate webhook
  const webhook: SandboxWebhook = {
    eventId: `wh-${Date.now()}`,
    eventType: "charge.success",
    reference: request.reference,
    status: "SUCCESS",
    amount: request.amount,
    currency: request.currency,
    payload: { ...payment },
  };
  sandboxWebhooks.set(webhook.eventId, webhook);

  return ok(payment, `sandbox-${request.reference}`, delay);
}

export async function mockDisburse(
  provider: string,
  request: { reference: string; amount: number; currency: string; recipient: any }
): Promise<ProviderResult<SandboxPayment>> {
  const config = sandboxConfig.get(provider);
  const delay = config?.mockDelayMs ?? 200;

  await new Promise((r) => setTimeout(r, delay));

  const payment: SandboxPayment = {
    reference: request.reference,
    amount: request.amount,
    currency: request.currency,
    status: "SUCCESS",
    method: "BANK_TRANSFER",
    customer: { name: request.recipient?.name },
    providerReference: `sandbox-${provider}-${request.reference}`,
    createdAt: new Date().toISOString(),
  };

  sandboxPayments.set(request.reference, payment);
  return ok(payment, `sandbox-${request.reference}`, delay);
}

export async function mockRefund(
  provider: string,
  request: { reference: string; originalReference: string; amount?: number }
): Promise<ProviderResult<{ refundReference: string; status: string; amount: number }>> {
  const original = sandboxPayments.get(request.originalReference);
  if (!original) {
    return fail("INVALID_REQUEST", "Original payment not found in sandbox");
  }

  const refundAmount = request.amount ?? original.amount;
  const result = {
    refundReference: `sandbox-refund-${request.reference}`,
    status: "SUCCESS",
    amount: refundAmount,
  };

  return ok(result, result.refundReference, 100);
}

export async function mockVerifyIdentity(
  provider: string,
  request: { idType: string; idValue: string }
): Promise<
  ProviderResult<{ verified: boolean; tier: number; firstName: string; lastName: string }>
> {
  await new Promise((r) => setTimeout(r, 150));

  return ok(
    {
      verified: true,
      tier: request.idType === "BVN" ? 3 : 2,
      firstName: "Sandbox",
      lastName: "User",
    },
    `sandbox-kyc-${request.idValue}`,
    150
  );
}

export async function mockSettlement(
  provider: string,
  request: { amount: number; currency: string; reference: string }
): Promise<ProviderResult<{ settlementReference: string; status: string; settledAt: string }>> {
  await new Promise((r) => setTimeout(r, 100));

  const result = {
    settlementReference: `sandbox-settlement-${request.reference}`,
    status: "SETTLED",
    settledAt: new Date().toISOString(),
  };

  return ok(result, result.settlementReference, 100);
}

// ===== Mock Webhook Retrieval =====

export function getMockWebhooks(provider?: string): SandboxWebhook[] {
  const all = Array.from(sandboxWebhooks.values());
  if (!provider) return all;
  return all.filter((w) => w.reference.includes(provider));
}

export function getMockWebhookByEventId(eventId: string): SandboxWebhook | null {
  return sandboxWebhooks.get(eventId) ?? null;
}

// ===== Mock Payment Retrieval =====

export function getMockPayment(reference: string): SandboxPayment | null {
  return sandboxPayments.get(reference) ?? null;
}

export function getAllMockPayments(): SandboxPayment[] {
  return Array.from(sandboxPayments.values());
}

// ===== Sandbox Reset =====

export function resetSandbox(): void {
  sandboxPayments.clear();
  sandboxWebhooks.clear();
}

// ===== Default Sandbox Setup =====
// Configure all providers for sandbox mode by default in development

export function initDefaultSandbox(providers: string[]): void {
  for (const provider of providers) {
    configureSandbox(provider, {
      enabled: true,
      mockDelayMs: 200,
      failureRate: 0,
      mockData: {},
    });
  }
}
