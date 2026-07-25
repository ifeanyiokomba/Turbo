// TurboCore — unified result/error shapes. Methods never throw; they return ProviderResult.

export type ProviderErrorCode =
  | "AUTH_FAILED"
  | "INVALID_REQUEST"
  | "INSUFFICIENT_FUNDS"
  | "BENEFICIARY_INVALID"
  | "RATE_LIMITED"
  | "PROVIDER_DOWN"
  | "PROVIDER_TIMEOUT"
  | "COMPLIANCE_REJECT"
  | "DUPLICATE_REF"
  | "NOT_SUPPORTED"
  | "UPSTREAM_ERROR"
  | "UNKNOWN";

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  providerCode?: string;
  httpStatus?: number;
  retryable: boolean;
  raw?: unknown;
}

export type ProviderResult<T> =
  | { ok: true; data: T; providerRequestId: string; latencyMs: number }
  | { ok: false; error: ProviderError };

export function ok<T>(data: T, providerRequestId = "", latencyMs = 0): ProviderResult<T> {
  return { ok: true, data, providerRequestId, latencyMs };
}

export function fail<T = never>(
  code: ProviderErrorCode,
  message: string,
  opts: Partial<Pick<ProviderError, "providerCode" | "httpStatus" | "raw">> = {},
): ProviderResult<T> {
  const retryable =
    code === "PROVIDER_TIMEOUT" || code === "RATE_LIMITED" || code === "UPSTREAM_ERROR" || code === "PROVIDER_DOWN";
  return {
    ok: false,
    error: { code, message, retryable, ...opts },
  };
}

export function isRetryable(r: ProviderResult<unknown>): boolean {
  return !r.ok && r.error.retryable;
}

// Contract names — single source of truth
export const ContractName = {
  VIRTUAL_ACCOUNT: "VIRTUAL_ACCOUNT",
  CARD_PAYMENT: "CARD_PAYMENT",
  BANK_TRANSFER: "BANK_TRANSFER",
  BILL_PAYMENT: "BILL_PAYMENT",
  AIRTIME: "AIRTIME",
  KYC: "KYC",
  NOTIFICATION: "NOTIFICATION",
  INTERNATIONAL_TRANSFER: "INTERNATIONAL_TRANSFER",
  MOBILE_MONEY: "MOBILE_MONEY",
  EXCHANGE_RATE: "EXCHANGE_RATE",
  VIRTUAL_CARD_ISSUER: "VIRTUAL_CARD_ISSUER",
} as const;
export type ContractName = (typeof ContractName)[keyof typeof ContractName];

export const ALL_CONTRACTS: ContractName[] = Object.values(ContractName);

// Shared domain types used across contracts
export interface Bank {
  code: string;
  name: string;
  short?: string;
  country: string;
}
export interface Biller {
  code: string;
  name: string;
  category: string;
  country: string;
  refLabel: string;
  refType: string;
}
export interface Network {
  id: string;
  name: string;
  country: string;
  color?: string;
}
export interface DataPlan {
  id: string;
  name: string;
  amountMinor: number;
  validity: string;
  network: string;
}
export interface InternationalBeneficiary {
  name: string;
  country: string;
  bankName: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  routingNumber?: string;
  mobileWallet?: string;
  currency: string;
}
export interface TimelineEvent {
  status: string;
  at: string;
  note?: string;
}
