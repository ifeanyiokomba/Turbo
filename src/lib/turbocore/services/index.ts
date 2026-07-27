// TurboCore Bounded Services — barrel export.
//
// 15 thin service facades over the existing TurboCore modules. Each service
// is a plain singleton object with async methods — no class hierarchy, no
// state, no reimplementation of business logic. They exist to give TurboPay
// (and future apps) a clean, bounded API surface and to enforce Rule 1:
// "Never call a provider API directly from business logic. Always use the
// Provider SDK."
//
// Services:
//   - identityService     — KYC + sanctions + AML
//   - walletService       — balance / fund / withdraw / transfer / freeze / multi-currency
//   - ledgerService       — credit / debit / entries / reconcile
//   - collectionService   — inbound payments (TurboPay.pay direction=INBOUND)
//   - disbursementService — outbound payments (TurboPay.pay direction=OUTBOUND)
//   - routingService      — route + providers + health + failover stats
//   - webhookService      — receive + verify + dispatch + list
//   - settlementService   — list settlements/accounts + reconcile
//   - notificationService — send / OTP / list / markRead
//   - fxService           — rate / quote / convert / snapshots
//   - countryService      — country registry + detection + providers
//   - merchantService     — dashboard + API keys + payment links
//   - riskService         — assess / score / flag / screen
//   - auditService        — log / list / timeline / export
//   - analyticsService    — dashboard / cashflow / category / provider perf / revenue

export { identityService } from "./identity-service";
export { walletService } from "./wallet-service";
export { ledgerService } from "./ledger-service";
export { collectionService } from "./collection-service";
export { disbursementService } from "./disbursement-service";
export { routingService } from "./routing-service";
export { webhookService } from "./webhook-service";
export { settlementService } from "./settlement-service";
export { notificationService } from "./notification-service";
export { fxService } from "./fx-service";
export { countryService } from "./country-service";
export { merchantService } from "./merchant-service";
export { riskService } from "./risk-service";
export { auditService } from "./audit-service";
export { analyticsService } from "./analytics-service";

// Re-export input/result types for service consumers.
export type { IdentityVerificationInput, AmlAssessmentInput } from "./identity-service";
export type { FundInput, WithdrawInput, TransferInput } from "./wallet-service";
export type { CreditInput, DebitInput } from "./ledger-service";
export type { CollectionRequest } from "./collection-service";
export type { DisbursementRequest } from "./disbursement-service";
export type { ReceiveResult, DispatchInput } from "./webhook-service";
export type { ReconcileResult as SettlementReconcileResult } from "./settlement-service";
export type {
  NotificationChannel,
  SendInput,
  SendResult,
  SendOtpResult,
  VerifyOtpResult,
} from "./notification-service";
export type { RateResult, ConvertResult } from "./fx-service";
export type {
  CreateApiKeyResult,
  CreatePaymentLinkInput,
  PaymentLinkAnalytics,
  MerchantDashboard,
} from "./merchant-service";
export type {
  RiskAssessment,
  RiskScoreResult,
  ScreenTransactionInput,
  ScreenTransactionResult,
  FlagInput,
} from "./risk-service";
export type { AuditLogInput, AuditLogFilters, TimelineEntry, ExportResult } from "./audit-service";
export type {
  DashboardStats,
  CashflowBucket,
  SpendingByCategory,
  ProviderPerformanceEntry,
  RevenueStats,
} from "./analytics-service";
