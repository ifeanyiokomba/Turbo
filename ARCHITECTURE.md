# TurboPay — Complete Architecture & Reference Document

**Version:** 1.0  
**Date:** July 2026  
**Status:** Production-ready (standalone mode)  
**Repository:** https://github.com/ifeanyiokomba/Turbo  

---

## Table of Contents

1. [Complete Architecture](#1-complete-architecture)
2. [Database ERD](#2-database-erd)
3. [API Contracts](#3-api-contracts)
4. [Event Architecture](#4-event-architecture)
5. [Queue Design](#5-queue-design)
6. [Authentication Design](#6-authentication-design)
7. [Wallet Design](#7-wallet-design)
8. [Provider Design](#8-provider-design)
9. [Orchestrator Design](#9-orchestrator-design)
10. [Risk Engine](#10-risk-engine)
11. [Notification System](#11-notification-system)
12. [Audit System](#12-audit-system)
13. [Logging](#13-logging)
14. [Monitoring](#14-monitoring)
15. [Infrastructure Diagram](#15-infrastructure-diagram)

---

## 1. Complete Architecture

### 1.1 System Overview

TurboPay is a payment orchestration platform — a software layer that routes transactions through licensed third-party providers rather than holding customer funds directly. The platform provides one integration point for businesses and consumers to access payment collection, transfers, bill payments, mobile money, and identity verification across multiple providers.

### 1.2 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  Web App    │  │  Mobile App │  │  MiniPay    │                │
│  │  (Next.js)  │  │  (future)   │  │  (dormant)  │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
└─────────┼────────────────┼────────────────┼────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EDGE / MIDDLEWARE LAYER                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  proxy.ts    │  │  CORS        │  │  Security    │             │
│  │  (routing)   │  │  Headers     │  │  Headers     │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Rate        │  │  Sentry      │  │  GeoIP       │             │
│  │  Limiter     │  │  (edge)      │  │  Detection   │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API LAYER (171 routes)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │  Auth    │ │  Wallet  │ │Transfer  │ │  Bills   │ │  Cards   ││
│  │  (15)    │ │  (8)     │ │  (5)     │ │  (2)     │ │  (5)     ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │ Savings  │ │Investment│ │  KYC     │ │Analytics │ │Marketplc ││
│  │  (5)     │ │  (3)     │ │  (2)     │ │  (4)     │ │  (4)     ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │  Admin   │ │  Cron    │ │Webhooks  │ │  Celo    │ │  Misc    ││
│  │  (28)    │ │  (7)     │ │  (5)     │ │  (12)    │ │  (45)    ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Ledger      │  │  Auth        │  │  Compliance  │             │
│  │  (double-    │  │  (scrypt,    │  │  (AML, sanc- │             │
│  │   entry)     │  │   passkeys,  │  │   tions, KYC)│             │
│  │              │  │   MFA, JWT)  │  │              │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  FX Engine   │  │  Notification│  │  Rate Limit  │             │
│  │  (multi-     │  │  Service     │  │  (sliding    │             │
│  │   currency)  │  │              │  │   window)    │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  RBAC        │  │  Audit       │  │  Webhook     │             │
│  │  (10 roles,  │  │  Log         │  │  Signature   │             │
│  │   60 perms)  │  │              │  │  Verify      │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              PROVIDER ORCHESTRATION LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Router      │  │  Circuit     │  │  Health      │             │
│  │  (scored,   │  │  Breaker     │  │  Monitor     │             │
│  │   geo-aware)│  │  (CLOSED/    │  │  (EMA,       │             │
│  │              │  │   OPEN/      │  │   latency,   │             │
│  │              │  │   HALF_OPEN) │  │   success %) │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Orchestrator│  │  Failover    │  │  Idempotency │             │
│  │  (12-step    │  │  (3-call     │  │  (SHA-256    │             │
│  │   flow)      │  │   chain)     │  │   key)       │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              PROVIDER ADAPTER LAYER (17 adapters)                   │
│  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐    │
│  │Paystack││Fluttwv ││Monnify ││  Baxi  ││ Remita ││Quicktl │    │
│  └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘    │
│  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐    │
│  │  Paga  ││ M-Pesa ││MTN MoMo││Airtel$ ││Smartcsh││  Dojah │    │
│  └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘    │
│  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐              │
│  │ Termii ││ Resend ││  Wise  ││ Stripe ││Turbopay│              │
│  │        ││        ││        ││(parked)││ (mock) │              │
│  └────────┘└────────┘└────────┘└────────┘└────────┘              │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              DATA LAYER                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  PostgreSQL  │  │  Redis       │  │  Object      │             │
│  │  (Prisma)    │  │  (cache,     │  │  Storage     │             │
│  │  76 models   │  │   rate limit)│  │  (avatars,   │             │
│  │              │  │              │  │   receipts)  │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js (App Router) | 16.x |
| UI | React + Tailwind CSS + shadcn/ui | React 19, Tailwind 4 |
| Backend | Next.js API Routes | 171 routes |
| Database | PostgreSQL via Prisma ORM | Prisma 6.x |
| Cache | Redis (rate limiting, sessions) | 7.x |
| Auth | Custom (scrypt + Passkeys + MFA) | WebAuthn, TOTP |
| State | Zustand | 5.x |
| Charts | Recharts | 2.15.x |
| Monitoring | Sentry | 10.x |
| Deployment | Vercel + Docker (Render) | — |
| Runtime | Bun (Alpine) | 1.3.x |

### 1.4 Key Metrics

| Metric | Count |
|---|---|
| Prisma models | 76 |
| API routes | 171 |
| Frontend views | 35 |
| Provider adapters | 17 |
| Provider contracts (interfaces) | 51 |
| Provider methods | 170+ |
| Admin tabs | 15 |
| RBAC roles | 10 |
| RBAC permissions | 60 |
| Cron jobs | 7 |
| Webhook handlers | 5 |
| Countries supported | 6 (NG, KE, GH, ZA, GB, US) |

---

## 2. Database ERD

### 2.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CORE ENTITIES                               │
│                                                                     │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                  │
│  │   User   │─────│  Wallet   │─────│  Ledger  │                  │
│  │          │  1:1 │          │  1:N │  Entry   │                  │
│  │ id       │     │ id       │     │ id       │                  │
│  │ fullName │     │ userId   │     │ walletId │                  │
│  │ username │     │ balance  │     │ type     │                  │
│  │ email    │     │ version  │     │ amount   │                  │
│  │ phone    │     │ status   │     │ refType  │                  │
│  │ passwordH│     └──────────┘     │ pairId   │                  │
│  │ pinHash  │                      │ balance  │                  │
│  │ kycTier  │                      └──────────┘                  │
│  │ role     │                                                    │
│  │ status   │     ┌──────────┐     ┌──────────┐                  │
│  └────┬─────┘     │Currency  │     │Transaction│                  │
│       │           │ Wallet   │     │           │                  │
│       │     1:N   │          │ 1:N │ id        │                  │
│       ├───────────│ userId   │─────│ userId    │                  │
│       │           │ currency │     │ type      │                  │
│       │           │ balance  │     │ direction │                  │
│       │           │ version  │     │ amount    │                  │
│       │           └──────────┘     │ status    │                  │
│       │                            │ state     │                  │
│       │              ┌──────────┐  │ provider  │                  │
│       │              │Currency  │  │ providerRef│                 │
│       │              │ Ledger   │  └──────────┘                  │
│       │              │ Entry    │                                 │
│       │              └──────────┘                                 │
└───────┼─────────────────────────────────────────────────────────┘
        │
        ├─────── ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   1:N  │ Session  │  │ Passkey  │  │MfaSecret │
        │        │          │  │          │  │          │
        │        │ tokenHash│  │credId    │  │ secretEnc│
        │        │ expiresAt│  │publicKey │  │ backupH  │
        │        │ ip       │  │ counter  │  │ enabled  │
        │        └──────────┘  └──────────┘  └──────────┘
        │
        ├─────── ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   1:N  │Virtual   │  │Beneficiary│ │BillPaymt │
        │        │ Account  │  │          │  │          │
        │        │ acctNum  │  │ name     │  │ category │
        │        │ bankName │  │ acctNum  │  │ biller   │
        │        └──────────┘  │ bankCode │  │ amount   │
        │                      └──────────┘  │ token    │
        │                                    └──────────┘
        │
        ├─────── ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   1:N  │Virtual   │  │Savings   │  │Investment│
        │        │ Card     │  │ Trans    │  │          │
        │        │ panEnc   │  │ product  │  │ product  │
        │        │ cvvEnc   │  │ amount   │  │ principal│
        │        │ last4    │  │ type     │  │ current  │
        │        │ status   │  └──────────┘  │ maturity │
        │        └──────────┘                └──────────┘
        │
        ├─────── ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   1:N  │ AuditLog │  │ AmlFlag  │  │InAppNotif│
        │        │          │  │          │  │          │
        │        │ action   │  │ rule     │  │ type     │
        │        │ category │  │ severity │  │ title    │
        │        │ severity │  │ desc     │  │ read     │
        │        │ ip       │  │ resolved │  │ actionUrl│
        │        └──────────┘  └──────────┘  └──────────┘
        │
        ├─────── ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   1:N  │ Dispute  │  │ Support  │  │SchedPaymt│
        │        │          │  │ Ticket   │  │          │
        │        │ subject  │  │ subject  │  │ type     │
        │        │ category │  │ category │  │ frequency│
        │        │ status   │  │ status   │  │ nextRun  │
        │        │ priority │  │ priority │  │ payload  │
        │        └──────────┘  └──────────┘  └──────────┘
        │
        ├─────── ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   1:N  │PaymentLink│ │Voucher   │  │Budget    │
        │        │          │  │Redemption│  │          │
        │        │ slug     │  │          │  │ category │
        │        │ amount   │  │ voucherId│  │ limit    │
        │        │ status   │  │ value    │  │ period   │
        │        └──────────┘  └──────────┘  └──────────┘
        │
        └─────── ┌──────────┐  ┌──────────┐
            1:N  │SavingsGo │  │Transfer  │
                 │ al       │  │Template  │
                 │          │  │          │
                 │ target   │  │ name     │
                 │ current  │  │ recipient│
                 │ progress │  │ amount   │
                 └──────────┘  └──────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    PROVIDER ENTITIES                                 │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │Provider  │  │Provider  │  │Provider  │  │Provider  │          │
│  │ Config   │  │ Capability│ │  Route   │  │ HealthChk│          │
│  │          │  │          │  │          │  │          │          │
│  │ code     │  │ provider │  │ contract │  │ provider │          │
│  │ name     │  │ contract │  │ provider │  │ ok       │          │
│  │ sandbox  │  │ country  │  │ country  │  │ latency  │          │
│  │ enabled  │  │ currency │  │ priority │  │ score    │          │
│  │ priority │  │ direction│  │ weight   │  │ sampledAt│          │
│  └──────────┘  │ feeBps   │  │ canary   │  └──────────┘          │
│                │ settleHrs│  └──────────┘                        │
│  ┌──────────┐  └──────────┘                                      │
│  │Provider  │    ┌──────────┐  ┌──────────┐                     │
│  │ CredVer  │    │Payment   │  │Payment   │                     │
│  │          │    │ Routing  │  │ Flow     │                     │
│  │ provider │    │ Decision │  │ Log      │                     │
│  │ version  │    │          │  │          │                     │
│  │ secrets  │    │ txId     │  │ txId     │                     │
│  │ active   │    │ chosen   │  │ step     │                     │
│  └──────────┘    │ scores   │  │ status   │                     │
│                  │ alternatv│  │ latency  │                     │
│  ┌──────────┐    └──────────┘  └──────────┘                     │
│  │Country   │                                                      │
│  │ Config   │    ┌──────────┐  ┌──────────┐                     │
│  │          │    │Webhook   │  │Webhook   │                     │
│  │ code     │    │ Event    │  │ Endpoint │                     │
│  │ currency │    │          │  │          │                     │
│  │ locale   │    │ eventId  │  │ url      │                     │
│  │ methods  │    │ type     │  │ secret   │                     │
│  │ kycReq   │    │ payload  │  │ events   │                     │
│  └──────────┘    │ processed│  └──────────┘                     │
│                  └──────────┘                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLIANCE ENTITIES                               │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │KycVerif  │  │Sanctions │  │Screening │  │Compliance│          │
│  │          │  │ Entry    │  │ Result   │  │ Case     │          │
│  │ tier     │  │          │  │          │  │          │          │
│  │ status   │  │ listName │  │ entity   │  │ type     │          │
│  │ nin/bvn  │  │ name     │  │ hit      │  │ status   │          │
│  │ verified │  │ aliases  │  │ score    │  │ assigned │          │
│  └──────────┘  │ country  │  │ matched  │  │ summary  │          │
│                └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    EVENT / QUEUE ENTITIES                            │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │Outbox    │  │AsyncTask │  │CronLock  │  │Idempotncy│          │
│  │ Event    │  │          │  │          │  │ Record   │          │
│  │          │  │ type     │  │ key      │  │          │          │
│  │ type     │  │ payload  │  │ lockedBy │  │ key      │          │
│  │ payload  │  │ status   │  │ lockedUnt│  │ userId   │          │
│  │ status   │  │ attempts │  │ acquired │  │ response │          │
│  │ attempts │  │ nextRetry│  └──────────┘  │ completed│          │
│  │ nextRetry│  │ lockedBy │                └──────────┘          │
│  └──────────┘  └──────────┘                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Model Catalog (76 models, grouped)

| Group | Models | Count |
|---|---|---|
| **Core Financial** | User, Wallet, LedgerEntry, Transaction, CurrencyWallet, CurrencyLedgerEntry, VirtualAccount, VirtualCard, VirtualCardTransaction | 9 |
| **KYC & Compliance** | KycVerification, KycTierLimit, SanctionsEntry, ScreeningResult, ComplianceCase, AmlFlag | 6 |
| **Provider Platform** | ProviderConfig, ProviderCredentialVersion, ProviderRoute, ProviderHealthCheck, ProviderCapability, PaymentRoutingDecision, PaymentFlowLog, Settlement, SettlementAccount | 9 |
| **Event/Queue** | OutboxEvent, AsyncTask, CronLock, IdempotencyRecord, WebhookEvent, WebhookEndpoint | 6 |
| **Geo & Config** | CountryConfig, FeatureFlag, FeatureFlagOverride, ConfigVersion | 4 |
| **User Features** | Beneficiary, BillPayment, AirtimeDataPurchase, SavingsProduct, SavingsTransaction, SavingsGoal, SavingsGoalContribution, InvestmentProduct, UserInvestment, Voucher, VoucherRedemption, UserBadge, SpendingBudget, AutoSaveRule, TransferTemplate | 15 |
| **Payments** | PaymentLink, PaymentLinkPayment, SubscriptionPlan, Subscription, Mandate, ScheduledPayment, MarketplaceMerchant, MerchantReview, Merchant, MerchantApiKey | 10 |
| **Support & Notifications** | Dispute, DisputeMessage, SupportTicket, InAppNotification, CommunicationPreference, StatementRequest | 6 |
| **Auth & Security** | Session, Passkey, MfaSecret | 3 |
| **FX** | FxRateSnapshot, FxConfig | 2 |
| **Blockchain (dormant)** | CeloWallet, OnChainTransaction, CeloBridgeEvent, CeloTokenConfig | 4 |
| **Team** | TeamMember | 1 |
| **Audit** | AuditLog | 1 |
| **Notifications** | OutboxEvent (shared), AsyncTask (shared) | — |

---

## 3. API Contracts

### 3.1 API Design Principles

- **RESTful** — all endpoints are HTTP JSON APIs under `/api/*`
- **Auth** — `requireUser()` for user routes, `requirePermission(P)` for admin routes, `x-cron-secret` for cron routes
- **Idempotency** — `IdempotencyRecord` table, SHA-256 key from userId + endpoint + body
- **Rate limiting** — sliding window, per-endpoint config (login 10/min, transfer 20/min, etc.)
- **Error format** — `{ error: string, code?: string }` with HTTP status codes
- **Pagination** — `?page=&limit=` with `{ items, total, hasMore }` response

### 3.2 API Route Catalog (171 routes)

#### Authentication (15 routes)
```
POST   /api/auth/register              — Create account (scrypt, session, virtual account)
POST   /api/auth/login                 — Login (identifier + password, lockout, audit)
POST   /api/auth/logout                — Destroy session
GET    /api/auth/me                    — Current user
POST   /api/auth/forgot-password       — Request reset code (email/SMS, never reveals existence)
POST   /api/auth/reset-password        — Reset with code + new password
POST   /api/auth/step-up               — Trigger large-tx OTP (>50% of KYC tier limit)
POST   /api/auth/step-up/verify        — Verify step-up OTP
POST   /api/auth/mfa/setup             — Generate TOTP secret + QR URI
POST   /api/auth/mfa/verify            — Enable MFA + return backup codes
POST   /api/auth/mfa/disable           — Disable MFA (password-gated)
GET    /api/auth/mfa/status            — MFA enabled status
POST   /api/auth/mfa/regenerate-codes  — New backup codes (password-gated)
POST   /api/auth/passkey/register/options   — WebAuthn registration options
POST   /api/auth/passkey/register/verify   — Verify + store passkey
POST   /api/auth/passkey/authenticate/options — WebAuthn auth options
POST   /api/auth/passkey/authenticate/verify — Verify passkey + create session
GET    /api/auth/passkey/list          — List user's passkeys
DELETE /api/auth/passkey/[id]          — Delete passkey
```

#### Wallet & Transfers (13 routes)
```
GET    /api/wallet                     — Wallet + virtual account + ledger entries
POST   /api/wallet/fund                — Fund wallet (bank/card/USSD/demo)
GET    /api/wallet/insights            — Cash flow forecast + burn rate
GET    /api/wallets/currencies         — Multi-currency wallets
POST   /api/wallets/currencies         — Create currency wallet
POST   /api/transfer                   — Transfer (Turbopay/bank, PIN, fee, resolve)
GET    /api/transfer/fee               — Fee estimate (0 Turbopay, ₦52.50 bank)
GET    /api/transfer/resolve           — Account name resolution (Paystack)
GET    /api/transfer-templates         — List templates
POST   /api/transfer-templates         — Save template
PATCH  /api/transfer-templates/[id]    — Update template
DELETE /api/transfer-templates/[id]    — Delete template
```

#### Bills, Airtime & Data (4 routes)
```
GET    /api/bills                      — Biller catalog (8 categories)
POST   /api/bills                      — Pay bill (PIN, token for electricity)
POST   /api/airtime                    — Buy airtime (PIN, 4 networks)
POST   /api/data                       — Buy data (PIN, plan selection)
```

#### Cards (5 routes)
```
GET    /api/cards                      — List virtual cards
POST   /api/cards                      — Create card (Luhn PAN, AES-256-GCM encrypt)
GET    /api/cards/[id]                 — Card detail + transactions
PATCH  /api/cards/[id]                 — Freeze/unfreeze/terminate
POST   /api/cards/[id]/fund            — Fund card (PIN, debit wallet)
POST   /api/cards/[id]/withdraw        — Withdraw from card (PIN, credit wallet)
POST   /api/cards/[id]/reveal          — Reveal PAN+CVV (audit-logged)
```

#### Savings & Investments (8 routes)
```
GET    /api/savings                    — Products + user savings + totals
POST   /api/savings                    — Deposit/withdraw (PIN, lock enforcement)
GET    /api/savings-goals              — List savings goals
POST   /api/savings-goals              — Create goal
PATCH  /api/savings-goals/[id]         — Update goal
DELETE /api/savings-goals/[id]         — Delete goal
POST   /api/savings-goals/[id]/contribute — Add/withdraw (PIN)
GET    /api/savings/auto-rules         — List auto-save rules
POST   /api/savings/auto-rules         — Create rule
PATCH  /api/savings/auto-rules/[id]    — Toggle rule
DELETE /api/savings/auto-rules/[id]    — Delete rule
GET    /api/investments                — Products + holdings
POST   /api/investments                — Invest (PIN, maturity calc)
POST   /api/investments/[id]/liquidate — Liquidate (PIN)
```

#### Analytics & Insights (4 routes)
```
GET    /api/dashboard                  — Balance, cashflow, stats, spending
GET    /api/analytics                  — 30-day trends, categories, counterparties
GET    /api/analytics/advanced         — Financial health score, forecast, peer comparison
GET    /api/analytics/heatmap          — 365-day spending heatmap
GET    /api/budgets                    — List budgets
POST   /api/budgets                    — Set budget
DELETE /api/budgets/[id]               — Delete budget
```

#### Provider Platform (10 routes)
```
GET    /api/capabilities               — Capability matrix per country
GET    /api/capabilities/enhanced      — Scored providers + failover chains
GET    /api/capabilities/geo           — Country config + preferred providers
GET    /api/geo/detect                 — Auto-detect country from headers
GET    /api/geo/countries              — All country configs
POST   /api/geo/switch                 — Switch user country
GET    /api/fx/quote                   — FX quote (rate + fee + spread)
POST   /api/fx/convert                 — Convert currency (PIN)
GET    /api/fx/rates                   — Current FX rates
```

#### Admin (28 routes)
```
GET    /api/admin                      — Overview stats
GET    /api/admin/monitoring           — Real-time monitoring (6 KPIs, tx feed)
GET    /api/admin/customers            — Paginated users
GET    /api/admin/transactions         — Paginated all transactions
GET    /api/admin/audit                — Audit log (paginated)
GET    /api/admin/savings-investments  — Aggregate savings/investment stats
GET    /api/admin/compliance           — Cases + screenings + AML flags
PATCH  /api/admin/compliance/[id]      — Update case status
GET    /api/admin/providers            — Provider list + health + circuit state
PATCH  /api/admin/providers/[id]       — Update provider config
GET    /api/admin/provider-health/[code] — Deep health (50 samples + sparkline)
POST   /api/admin/provider-health/[code] — Reset circuit / test provider
GET    /api/admin/capabilities         — Capability matrix (admin)
POST   /api/admin/capabilities         — Create capability
PATCH  /api/admin/capabilities/[id]    — Update capability
GET    /api/admin/routing              — Routing rules
POST   /api/admin/routing              — Create route
PATCH  /api/admin/routing/[id]         — Update route
GET    /api/admin/health               — Provider health dashboard
GET    /api/admin/credentials          — Credential versions (masked)
POST   /api/admin/credentials           — Rotate credentials (AES-256-GCM)
GET    /api/admin/webhooks             — Webhook events + endpoints
POST   /api/admin/webhooks             — Create webhook endpoint
GET    /api/admin/feature-flags        — Feature flags + overrides
POST   /api/admin/feature-flags        — Upsert flag
POST   /api/admin/feature-flags/toggle — Toggle flag
GET    /api/admin/config-history       — Config version timeline
POST   /api/admin/config-history       — Snapshot config
POST   /api/admin/config-history/[id]/rollback — Rollback config
GET    /api/admin/settlements          — Settlements + accounts
GET    /api/admin/failover-stats       — Failover statistics (24h/7d)
GET    /api/admin/security-audit       — Security posture (9 checks)
GET    /api/admin/team                 — Team members
POST   /api/admin/team                 — Invite member
PATCH  /api/admin/team/[id]            — Activate/deactivate
GET    /api/admin/vouchers             — All vouchers
POST   /api/admin/vouchers             — Create voucher
PATCH  /api/admin/vouchers/[id]        — Update voucher
```

#### Cron (7 routes, x-cron-secret guarded)
```
POST   /api/cron/outbox-publisher      — Drain OutboxEvent queue (every 10s)
POST   /api/cron/stuck-transactions    — Resolve stuck PENDING transactions (every 5min)
POST   /api/cron/scheduled-payments    — Execute scheduled payments (every minute)
POST   /api/cron/sanctions-fetch       — Fetch OFAC SDN list (daily)
POST   /api/cron/health-flush          — Write health samples to DB (every 30s)
POST   /api/cron/session-cleanup       — Delete expired sessions (hourly)
POST   /api/cron/interest-accrue       — Accrue savings interest (daily)
```

#### Webhooks (5 routes)
```
POST   /api/webhooks/turbocore/[provider] — Generic provider webhook
POST   /api/webhooks/mpesa              — M-Pesa STK push callback
POST   /api/webhooks/mtn-momo            — MTN MoMo request-to-pay callback
POST   /api/webhooks/airtel-money        — Airtel Money callback
POST   /api/webhooks/paga                — Paga callback
```

#### Other (40+ routes)
```
GET    /api/health                      — Public health check (DB connectivity)
POST   /api/ai-support                  — LLM-powered AI support chat
GET    /api/notifications               — In-app notifications
PATCH  /api/notifications/[id]/read     — Mark notification read
GET    /api/rewards                     — Referral dashboard + tiers
POST   /api/rewards                     — Claim referral rewards
GET    /api/badges                      — Achievement badges (auto-award)
GET    /api/help                        — Help center articles (27 articles, 8 categories)
GET    /api/profile/completion          — Profile completion (4 steps)
GET    /api/transactions                — Transactions (filtered, paginated, summary)
PATCH  /api/transactions/[id]/note      — Add note to transaction
GET    /api/statements                  — Statement requests
POST   /api/statements                  — Generate PDF/CSV statement
GET    /api/statements/[id]             — Download statement
GET    /api/settings                    — User profile
PATCH  /api/settings                    — Update profile
POST   /api/settings/pin                — Set PIN
PUT    /api/settings/pin                — Change PIN
PUT    /api/settings/password           — Change password
GET    /api/settings/preferences        — Communication preferences
PUT    /api/settings/preferences        — Update preferences
GET    /api/settings/export-data        — NDPR data export (JSON download)
POST   /api/settings/delete-account     — Delete account (password-gated)
GET    /api/security                    — Security dashboard
DELETE /api/security/sessions/[id]      — Revoke session
GET    /api/kyc                         — KYC status + limits
POST   /api/kyc                         — Verify NIN/BVN
GET    /api/beneficiaries               — List beneficiaries
POST   /api/beneficiaries               — Add beneficiary
PATCH  /api/beneficiaries/[id]          — Update beneficiary
DELETE /api/beneficiaries/[id]          — Delete beneficiary
GET    /api/disputes                    — List disputes
POST   /api/disputes                    — Create dispute
GET    /api/disputes/[id]               — Dispute detail + messages
PATCH  /api/disputes/[id]               — Update dispute (admin)
POST   /api/disputes/[id]/messages      — Add message
GET    /api/vouchers                    — List vouchers
POST   /api/vouchers/redeem             — Redeem voucher (PIN)
GET    /api/scheduled-payments          — List scheduled payments
POST   /api/scheduled-payments          — Create scheduled payment
PATCH  /api/scheduled-payments/[id]     — Pause/resume
DELETE /api/scheduled-payments/[id]     — Delete
GET    /api/payment-links               — List payment links
POST   /api/payment-links               — Create link
GET    /api/payment-links/[id]          — Link detail + payments
PATCH  /api/payment-links/[id]          — Update/disable
GET    /api/payment-links/[id]/analytics — Views, conversion, revenue
POST   /api/payment-links/pay           — Pay into a link
GET    /api/qr/generate                 — Generate payment QR token
POST   /api/qr/resolve                  — Resolve QR token
POST   /api/qr/pay                      — Pay via QR (PIN)
GET    /api/qr/history                  — QR payment history
GET    /api/marketplace                 — Browse merchants (24 seeded)
GET    /api/marketplace/[id]            — Merchant detail
POST   /api/marketplace/[id]/pay        — Pay merchant (PIN)
GET    /api/marketplace/[id]/reviews    — Merchant reviews
POST   /api/marketplace/[id]/reviews    — Write review
GET    /api/merchant/dashboard          — Merchant sales dashboard
GET    /api/merchant/api-keys           — API keys (masked)
POST   /api/merchant/api-keys           — Generate API key
DELETE /api/merchant/api-keys/[id]      — Revoke API key
GET    /api/subscriptions               — Active subscriptions
GET    /api/subscriptions/[id]          — Subscription detail
PATCH  /api/subscriptions/[id]          — Cancel subscription
GET    /api/intl/corridors               — Cross-border corridors
GET    /api/intl/quote                  — International transfer quote
POST   /api/intl/send                   — Send international transfer
GET    /api/intl/beneficiaries          — International beneficiaries
POST   /api/intl/beneficiaries          — Add international beneficiary
GET    /api/mobile-money/collect        — Mobile money collect (STK push)
POST   /api/mobile-money/collect        — Initiate collection
POST   /api/mobile-money/disburse       — Mobile money disburse (B2C)
```

### 3.3 Standard Request/Response Shapes

```typescript
// Success
{ "data": T, "meta"?: { "page": number, "total": number, "hasMore": boolean } }

// Error
{ "error": string, "code"?: string }

// Authenticated request
Headers: {
  Cookie: "tp_session=<token>",   // HttpOnly, set by /api/auth/login
  "Content-Type": "application/json",
  "X-Idempotency-Key"?: string,    // For payment operations
}

// Rate-limited response (429)
Headers: {
  "Retry-After": "<seconds>",
  "X-RateLimit-Limit": "<limit>",
  "X-RateLimit-Remaining": "<remaining>",
  "X-RateLimit-Reset": "<epoch>",
}
```

---

## 4. Event Architecture

### 4.1 Transactional Outbox Pattern

TurboPay uses the **transactional outbox pattern** to guarantee event delivery without dual-write inconsistency:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT FLOW (Outbox Pattern)                   │
│                                                                  │
│  API Route                                                       │
│      │                                                           │
│      ▼                                                           │
│  ┌─────────┐    ┌──────────────────────────────────┐           │
│  │ Service │───▶│ Prisma $transaction              │           │
│  │ Layer   │    │  1. UPDATE Wallet balance         │           │
│  └─────────┘    │  2. INSERT LedgerEntry            │           │
│       │          │  3. UPDATE Transaction status     │           │
│       │          │  4. INSERT OutboxEvent            │ ◀── SAME │
│       │          │  5. INSERT AuditLog               │     TX   │
│       │          └──────────────────────────────────┘           │
│       │                    │                                     │
│       │                    ▼                                     │
│       │          ┌──────────────────┐                           │
│       │          │  OutboxEvent     │                           │
│       │          │  (status=PENDING)│                           │
│       │          └──────────────────┘                           │
│       │                    │                                     │
│       │          ┌─────────┴─────────┐                          │
│       │          │  Cron:            │                          │
│       │          │  outbox-publisher │ (every 10s)              │
│       │          │  + CronLock       │                          │
│       │          └─────────┬─────────┘                          │
│       │                    │                                     │
│       │          ┌─────────┴─────────┐                          │
│       │          │  For each event:  │                          │
│       │          │  1. Find subscribers│                        │
│       │          │  2. POST + HMAC sign│                        │
│       │          │  3. Retry ladder   │                         │
│       │          └─────────┬─────────┘                          │
│       │                    │                                     │
│       │          ┌─────────┴─────────┐                          │
│       │          │  In-App Notif     │                          │
│       │          │  (PAYMENT_SETTLED)│                          │
│       │          └───────────────────┘                          │
│       │                    │                                     │
│       │          ┌─────────┴─────────┐                          │
│       │          │  Merchant Webhook │                          │
│       │          │  (HMAC-SHA256)    │                          │
│       │          └───────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Event Types

| Event Type | Trigger | Subscribers |
|---|---|---|
| `PAYMENT_SETTLED` | Transaction status → SUCCESS | InAppNotification, Merchant Webhook |
| `PAYMENT_PENDING` | Transaction status → PENDING (async provider) | InAppNotification |
| `PAYMENT_REVERSED` | Auto-reverse on provider failure | InAppNotification, Merchant Webhook |
| `PAYMENT_FAILED` | Transaction status → FAILED | InAppNotification |
| `FX_CONVERTED` | Currency conversion completed | InAppNotification |
| `DEPOSIT_CONFIRMED` | On-chain deposit verified (Celo) | InAppNotification |
| `WITHDRAWAL_INITIATED` | Withdrawal started | InAppNotification |
| `KYC_VERIFIED` | KYC tier upgraded | InAppNotification |
| `AML_FLAG_RAISED` | AML rule triggered | ComplianceCase, Admin Alert |
| `SANCTIONS_HIT` | Sanctions screening match | ComplianceCase, Wallet Freeze |
| `BADGE_EARNED` | Achievement unlocked | InAppNotification |
| `DISPUTE_UPDATED` | Dispute status changed | InAppNotification |
| `SCHEDULED_PAYMENT_EXECUTED` | Scheduled payment ran | InAppNotification |

### 4.3 OutboxEvent Lifecycle

```
                    ┌──────────┐
                    │ PENDING  │ ◀── created in same TX as state change
                    └────┬─────┘
                         │
                    outbox-publisher cron (every 10s)
                         │
                         ▼
              ┌────────────────────┐
              │  POST to subscriber │
              │  (HMAC-SHA256 sign) │
              └────────┬───────────┘
                       │
              ┌────────┴────────┐
              │                 │
         2xx response      Non-2xx response
              │                 │
              ▼                 ▼
        ┌──────────┐    ┌──────────────┐
        │ PUBLISHED│    │ Retry ladder │
        └──────────┘    │ 10s→1m→5m→  │
                        │ 30m→2h→6h   │
                        └──────┬───────┘
                               │
                        attempts >= 6?
                          │        │
                         Yes       No
                          │        │
                          ▼        └─→ back to PENDING (nextRetryAt)
                   ┌──────────┐
                   │  FAILED  │
                   └──────────┘
```

---

## 5. Queue Design

### 5.1 Queue Architecture

TurboPay uses a **database-backed queue** (PostgreSQL/SQLite via Prisma) rather than a separate message broker. This ensures transactional consistency with state changes.

```
┌─────────────────────────────────────────────────────────────────┐
│                     QUEUE ARCHITECTURE                          │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  OutboxEvent    │  │  AsyncTask      │  │  CronLock       │ │
│  │  (event queue)  │  │  (work queue)   │  │  (leader elect) │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │           │
│           ▼                    ▼                    ▼           │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ outbox-publisher│  │ stuck-tx       │  │ CronLock       │   │
│  │ cron (10s)     │  │ cron (5min)    │  │ acquire(key)   │   │
│  │                │  │                │  │ release(key)   │   │
│  │ - Drain PENDING│  │ - Find INITIATED│ │ withCronLock() │   │
│  │ - POST + HMAC  │  │   tx > 5min old│  │                │   │
│  │ - Retry ladder  │  │ - Poll provider│  │ key @unique    │   │
│  │ - 6 attempts   │  │ - Confirm/Rev  │  │ lockedBy=UUID  │   │
│  └────────────────┘  │ - Auto-reverse │  │ lockedUntil    │   │
│                      └────────────────┘  └────────────────┘   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ scheduled-pay  │  │ sanctions-fetch│  │ health-flush   │   │
│  │ ments (1min)   │  │ (daily)        │  │ (30s)          │   │
│  │                │  │                │  │                │   │
│  │ - Find ACTIVE  │  │ - Fetch OFAC   │  │ - Read breaker │   │
│  │   nextRun<=now │  │   SDN XML/CSV  │  │   states       │   │
│  │ - Execute      │  │ - Parse + upsert│ │ - Write        │   │
│  │   (transfer/   │  │   SanctionsEntry│ │   ProviderHealth│   │
│  │   bill/airtime)│  │ - 500 cap      │  │   Check rows   │   │
│  │ - Increment    │  │                │  │                │   │
│  │   runCount     │  │                │  │                │   │
│  │ - Compute next │  │                │  │                │   │
│  │   runAt        │  │                │  │                │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 CronLock (Leader Election)

For multi-instance deployments, CronLock prevents duplicate cron execution:

```typescript
// Acquire (upsert with conditional update)
await db.cronLock.upsert({
  where: { key },
  create: { key, lockedBy: instanceId, lockedUntil: now + 30s },
  update: { lockedBy: instanceId, lockedUntil: now + 30s }
    // only succeeds if lockedUntil < now (stale lock reclaim)
});

// Release (only if owned)
await db.cronLock.deleteMany({
  where: { key, lockedBy: instanceId }
});

// withCronLock wrapper
async function withCronLock(key: string, fn: () => Promise<void>) {
  if (!await acquireCronLock(key)) return; // another instance has it
  try { await fn(); } finally { await releaseCronLock(key); }
}
```

### 5.3 AsyncTask Queue

For deferred/background work (provider call retries, webhook dispatch):

| Field | Purpose |
|---|---|
| `type` | `retry_provider_call` / `webhook_dispatch` / `scheduled_payment` |
| `payloadJSON` | Serialized task input |
| `status` | `PENDING` / `RUNNING` / `DONE` / `FAILED` |
| `attempts` | Current attempt count |
| `maxAttempts` | Max retries (default 3) |
| `nextRetryAt` | When to next attempt (exponential backoff: 5s → 30s → 2min) |
| `lockedBy` | Instance UUID processing this task |
| `lockedUntil` | Lock expiry (prevents stuck tasks) |

---

## 6. Authentication Design

### 6.1 Auth Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   AUTHENTICATION FLOW                            │
│                                                                  │
│  ┌──────────┐                                                   │
│  │  User    │                                                   │
│  └────┬─────┘                                                   │
│       │                                                         │
│       ├────── Password + Identifier ──────────┐                 │
│       │                                        │                 │
│       ├────── Passkey (WebAuthn) ─────────────┤                 │
│       │                                        │                 │
│       └────── MFA (TOTP) ─────────────────────┘                 │
│                                                │                 │
│                                                ▼                 │
│                                    ┌──────────────────┐         │
│                                    │  Auth API Route   │         │
│                                    │  (rate-limited)   │         │
│                                    └────────┬─────────┘         │
│                                             │                   │
│                          ┌──────────────────┼──────────────┐   │
│                          │                  │              │   │
│                          ▼                  ▼              ▼   │
│                   ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│                   │  scrypt  │    │ WebAuthn │    │  TOTP    │ │
│                   │  verify  │    │  verify  │    │  verify  │ │
│                   │          │    │          │    │          │ │
│                   │ 16-byte  │    │ counter  │    │ otpauth  │ │
│                   │ salt     │    │ check    │    │ 30s wind │ │
│                   │ 64-byte  │    │ (clone   │    │ SHA-1    │ │
│                   │ key      │    │  detect) │    │ 6 digits │ │
│                   └────┬─────┘    └────┬─────┘    └────┬─────┘ │
│                        │               │               │       │
│                        └───────────────┼───────────────┘       │
│                                        │                       │
│                                        ▼                       │
│                              ┌──────────────────┐              │
│                              │  Session Create   │              │
│                              │                   │              │
│                              │  token = CSPRNG   │              │
│                              │  hash = SHA-256   │              │
│                              │  expires = 7 days │              │
│                              │  HttpOnly cookie   │              │
│                              └────────┬──────────┘              │
│                                       │                         │
│                                       ▼                         │
│                              ┌──────────────────┐              │
│                              │  Audit Log        │              │
│                              │  (LOGIN/PASSKEY)  │              │
│                              └──────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Password Security

| Property | Value |
|---|---|
| Algorithm | scrypt |
| Salt | 16 bytes, random per user |
| Key length | 64 bytes |
| Storage format | `scrypt$<salt-hex>$<key-hex>` |
| Verification | `timingSafeEqual` (constant-time) |
| User enumeration | Dummy hash + timing match (fails safe) |
| Lockout | 5 failures → 15-minute lock |
| Password policy | 8+ chars, uppercase, lowercase, digit |

### 6.3 Session Management

| Property | Value |
|---|---|
| Token | 32 bytes CSPRNG, hex-encoded |
| Storage | SHA-256 hash in `Session` table |
| Cookie | `tp_session`, HttpOnly, SameSite=Lax, 7-day expiry |
| Max sessions | 10 per user |
| Revocation | `Session.revokedAt` timestamp |
| Auto-logout | 15-min inactivity → 2-min warning → force logout |
| Cleanup | Cron every hour deletes expired sessions |

### 6.4 WebAuthn (Passkeys)

```
Registration Flow:
  Client → POST /api/auth/passkey/register/options
       ← { challenge, rpId, rpName, user, pubKeyCredParams }
  Client → startRegistration(options) [browser API]
       ← credential (authenticator response)
  Client → POST /api/auth/passkey/register/verify { credential }
  Server → verifyRegistrationResponse() [@simplewebauthn/server]
  Server → store Passkey { credentialId, publicKey, counter }
  Server → audit(PASSKEY_REGISTERED)

Authentication Flow:
  Client → POST /api/auth/passkey/authenticate/options
       ← { challenge, allowCredentials }
  Client → startAuthentication(options) [browser API]
       ← assertion
  Client → POST /api/auth/passkey/authenticate/verify { assertion }
  Server → verifyAuthenticationResponse() + counter check (clone detection)
  Server → createSession(userId)
  Server → audit(PASSKEY_LOGIN)
  Client ← { user } [logged in]
```

### 6.5 MFA (TOTP)

| Property | Value |
|---|---|
| Algorithm | TOTP (RFC 6238) via `otpauth` |
| Secret | 20 bytes, AES-256-GCM encrypted at rest |
| Period | 30 seconds |
| Digits | 6 |
| Hash | SHA-1 (RFC 6238 standard) |
| Backup codes | 8 codes × 8 chars, scrypt-hashed |
| Issuer | "TurboPay" |
| QR | `otpauth://totp/TurboPay:user@email?secret=XXX&issuer=TurboPay` |

### 6.6 RBAC (Role-Based Access Control)

```
10 Roles:
  SUPER_ADMIN       — ALL permissions (master admin)
  ADMINISTRATOR     — All except CONFIG_ROLLBACK
  FINANCE_OFFICER   — Finance, fees, FX, settlements, reconciliation
  COMPLIANCE_OFFICER— AML, sanctions, KYC, compliance cases
  SUPPORT_OFFICER   — Users, transactions, support tickets
  OPERATIONS_OFFICER— Providers, health, routing, monitoring
  RISK_OFFICER      — AML, compliance, fraud, monitoring
  DEVELOPER         — Providers, health, circuit reset, config, flags
  AUDITOR           — Audit log, read-only analytics, exports
  READONLY_ANALYST  — Analytics, read-only dashboard

60 Permissions across 18 categories:
  users:view, users:manage, users:freeze, users:close
  tx:view:all, tx:reverse, tx:export
  providers:view, providers:manage, providers:credentials, providers:health
  providers:circuit:reset, routing:view, routing:manage
  capabilities:view, capabilities:manage
  compliance:view, compliance:manage, compliance:cases
  aml:view, aml:manage, sanctions:screen, str:generate
  kyc:view, kyc:review, kyc:approve
  finance:view, finance:reconciliation, finance:settlements
  fees:manage, fx:manage, webhooks:view, webhooks:manage
  flags:view, flags:manage, config:view, config:manage, config:rollback
  team:view, team:manage, team:invite
  audit:view, audit:export, support:view, support:manage
  analytics:view, analytics:export, monitoring:view
  cards:view, cards:manage, savings:view, savings:manage
  investments:view, investments:manage, vouchers:view, vouchers:manage
```

### 6.7 Rate Limiting

| Endpoint | Limit | Window | Key |
|---|---|---|---|
| `/api/auth/login` | 10 | 1 min | IP + identifier |
| `/api/auth/register` | 5 | 1 hour | IP |
| `/api/auth/forgot-password` | 3 | 1 hour | IP + identifier |
| `/api/transfer` | 20 | 1 min | userId |
| `/api/airtime` | 20 | 1 min | userId |
| `/api/bills` | 20 | 1 min | userId |
| `/api/settings/pin` | 10 | 1 min | userId |
| `/api/auth/step-up` | 5 | 5 min | userId |

---

## 7. Wallet Design

### 7.1 Double-Entry Ledger

TurboPay uses a strict **double-entry ledger** — every credit has a matching debit, linked by `pairId`:

```
┌─────────────────────────────────────────────────────────────────┐
│                   DOUBLE-ENTRY LEDGER                           │
│                                                                  │
│  Transfer: User A sends ₦1,000 to User B                       │
│                                                                  │
│  ┌──────────────────────────────────────────────┐               │
│  │  LedgerEntry 1 (DEBIT)                       │               │
│  │  walletId: A.wallet.id                       │               │
│  │  entryType: DEBIT                            │               │
│  │  amountKobo: 100,000                         │               │
│  │  refType: TRANSFER                           │               │
│  │  balanceAfterKobo: A.balance - 100,000       │               │
│  │  pairId: <entry2.id>  ◀──────────────────┐   │               │
│  └──────────────────────────────────────────┼───┘               │
│                                              │                   │
│  ┌──────────────────────────────────────────┼───┐               │
│  │  LedgerEntry 2 (CREDIT)                   │   │               │
│  │  walletId: B.wallet.id                    │   │               │
│  │  entryType: CREDIT                        │   │               │
│  │  amountKobo: 100,000                      │   │               │
│  │  refType: TRANSFER                        │   │               │
│  │  balanceAfterKobo: B.balance + 100,000    │   │               │
│  │  pairId: <entry1.id>  ◀─────────────────────┘               │
│  └──────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Atomic Conditional Debit

```typescript
// Prevents race conditions (TOCTOU) on concurrent debits
const updated = await db.wallet.updateMany({
  where: {
    id: wallet.id,
    balanceKobo: { gte: amountKobo },  // conditional
    status: "ACTIVE",
  },
  data: {
    balanceKobo: { decrement: amountKobo },
    version: { increment: 1 },  // optimistic concurrency
  },
});
if (updated.count === 0) throw new LedgerError("Insufficient balance (race)");
```

### 7.3 Wallet Model

| Field | Type | Description |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `userId` | String (unique) | 1:1 with User |
| `balanceKobo` | Int | Balance in kobo (1 NGN = 100 kobo) |
| `currency` | String | "NGN" (default) |
| `status` | String | ACTIVE / FROZEN |
| `version` | Int | Optimistic concurrency counter |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### 7.4 Multi-Currency Wallets

```
┌─────────────────────────────────────────────────────────────────┐
│              MULTI-CURRENCY WALLET                              │
│                                                                  │
│  User ──┬── Wallet (NGN, 1:1, primary)                         │
│         │                                                        │
│         ├── CurrencyWallet (USD)                                │
│         │   balanceMinor: 5000 ($50.00)                        │
│         │   version: 3                                          │
│         │                                                        │
│         ├── CurrencyWallet (EUR)                                │
│         │   balanceMinor: 2300 (€23.00)                        │
│         │                                                        │
│         ├── CurrencyWallet (GBP)                                │
│         │   balanceMinor: 1800 (£18.00)                        │
│         │                                                        │
│         └── CurrencyWallet (KES)                                │
│             balanceMinor: 84000 (KSh 840.00)                   │
│                                                                  │
│  Supported: NGN, USD, EUR, GBP, KES, GHS, ZAR, CAD, AUD        │
│                                                                  │
│  FX Engine:                                                      │
│    - Rate snapshots (5-min TTL, FxRateSnapshot table)           │
│    - Spread + markup config (FxConfig table)                    │
│    - Quote endpoint (60s lock)                                  │
│    - Atomic convert (debit source + credit dest in one TX)      │
└─────────────────────────────────────────────────────────────────┘
```

### 7.5 RefType Enum (ledger entry categories)

```
FUNDING, TRANSFER, AIRTIME, DATA, BILL, REVERSAL, FEE,
CARD_FUND, CARD_WITHDRAW, REWARD, REFERRAL, SAVINGS,
INVESTMENT, CELO_DEPOSIT, CELO_WITHDRAW, CELO_PAYMENT
```

---

## 8. Provider Design

### 8.1 Provider Abstraction Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                PROVIDER ABSTRACTION LAYER                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  CONTRACTS (51 interfaces)                          │        │
│  │                                                     │        │
│  │  IVirtualAccountProvider    IBillPaymentProvider    │        │
│  │  ICardPaymentProvider       IAirtimeProvider         │        │
│  │  IBankTransferProvider      IKYCProvider             │        │
│  │  INotificationProvider      IInternationalTransferP  │        │
│  │  IMobileMoneyProvider       IExchangeRateProvider    │        │
│  │  IVirtualCardIssuer         ISplitPaymentProvider    │        │
│  │  IRecurringBillingProvider  ICheckoutProvider        │        │
│  │  IUssdProvider              ICustomerProvider        │        │
│  │  IPayoutProvider            IRefundProvider          │        │
│  │  ISettlementProvider        IApplePayProvider        │        │
│  │  IVirtualCardMgmtProvider   IBulkTransferProvider    │        │
│  │  IChargebackProvider        IProductProvider         │        │
│  │  IPriceProvider             IWebhookEndpointProvider │        │
│  │  IAMLProvider               IBusinessKYCProvider     │        │
│  │  IFraudScreeningProvider    IOTPProvider             │        │
│  │  IRecipientProvider         IMultiCurrencyBalProvider│        │
│  │  IInvoiceProvider           IDirectDebitProvider     │        │
│  │  ICardTokenizationProvider                           │        │
│  └─────────────────────────────────────────────────────┘        │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  REGISTRY                                           │        │
│  │  register(contract, providerCode, asyncResolver)    │        │
│  │  resolve<T>(contract, providerCode): Promise<T>     │        │
│  │  list(contract): string[]                           │        │
│  │  getHealth(providerCode): {score, lastUpdated}      │        │
│  │  resetCircuitBreaker(providerCode): boolean          │        │
│  └─────────────────────────────────────────────────────┘        │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  HEALTH-MONITORING PROXY                            │        │
│  │                                                     │        │
│  │  Wraps every adapter method:                        │        │
│  │  - Records {ok, latencyMs, errorCode}               │        │
│  │  - Updates EMA health score: 0.7*old + 0.3*sample   │        │
│  │  - Trips circuit breaker on failures                │        │
│  │  - Catches exceptions → ProviderResult<error>       │        │
│  └─────────────────────────────────────────────────────┘        │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  CIRCUIT BREAKER                                    │        │
│  │                                                     │        │
│  │  CLOSED ──failures>=5──▶ OPEN                       │        │
│  │    ▲                      │                        │        │
│  │    │                      │ cooldown (30s)          │        │
│  │    │                      ▼                        │        │
│  │  CLOSED ◀──2 successes── HALF_OPEN                  │        │
│  │                                                     │        │
│  │  OPEN state: reject all calls with PROVIDER_DOWN    │        │
│  │  HALF_OPEN: allow 1 probe call                      │        │
│  └─────────────────────────────────────────────────────┘        │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  ADAPTERS (17 providers, 170+ methods)              │        │
│  │                                                     │        │
│  │  Each adapter:                                      │        │
│  │  - Implements 1+ contract interfaces                │        │
│  │  - requireCreds() → loadCreds() → mock fallback     │        │
│  │  - http() helper (20s timeout, AbortController)      │        │
│  │  - sanitize() on errors (scrubs secrets)            │        │
│  │  - defaultHttpError() maps HTTP status → error code  │        │
│  │  - AES-256-GCM credential encryption                │        │
│  └─────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Provider Registry (17 providers)

| Provider | Contracts Implemented | Methods |
|---|---|---|
| **Paystack** | Card, Bank Transfer, Virtual Account, KYC, Subaccounts, Plans, Subscriptions, Refunds, Payment Pages, USSD, Apple Pay, Settlements | 12 |
| **Flutterwave** | Card, Bank Transfer, Intl, Mobile Money, Subaccounts, Payment Plans, Virtual Cards, Bulk Transfers, Bills, Chargebacks | 10 |
| **Monnify** | Virtual Account, Card, Subaccounts, Reserved Account Split, Invoices, Direct Debit | 6 |
| **Baxi** | Bills, Airtime, Data Bundles, Cable TV, Electricity | 6 |
| **Remita** | Bills (RRR), Mandates, Payment Notifications | 4 |
| **Quickteller** | Bills, Card Tokenization, Biller Categories | 5 |
| **Paga** | Mobile Money, Bills, Bank Transfer, Airtime, Merchant Payment | 7 |
| **M-Pesa** | Mobile Money (STK, B2C, C2B, Reversal, Status, Balance) | 1 (+6 deep) |
| **MTN MoMo** | Mobile Money (RTP, Disbursement, Pre-Approval, Delivery, Account Holder) | 1 (+7 deep) |
| **Airtel Money** | Mobile Money (Collect, Disburse, KYC, Refund, Merchant) | 1 (+5 deep) |
| **Smartcash** | Mobile Money, Bank Transfer, Airtime, Bills, Verification, History | 4 |
| **Dojah** | KYC, AML, Business KYC, Fraud Screening | 5 |
| **Termii** | Notifications (SMS, Voice, WhatsApp), OTP, Sender IDs, Templates | 2 |
| **Resend** | Notifications (Email, Batch, Domains, Contacts, Webhooks) | 1 |
| **Wise** | Intl Transfer, Exchange Rate, Recipients, Profiles, Balances | 5 |
| **Stripe** | Card, Virtual Card Issuer, Customers, Subscriptions, Prices, Products, Payouts, Refunds, Webhooks | 9 |
| **Turbopay** (mock) | All 11 base contracts (sandbox fallback) | 11 |

### 8.3 Capability Matrix

The `ProviderCapability` table drives both routing and UI:

```
Example: NG + BANK_TRANSFER + OUTBOUND
  ┌──────────────────────────────────────────────┐
  │ providerCode: paystack                        │
  │ contract: BANK_TRANSFER                       │
  │ country: NG                                   │
  │ currency: NGN                                 │
  │ direction: OUTBOUND                           │
  │ minAmountMinor: 10,000 (₦100)                │
  │ maxAmountMinor: 5,000,000 (₦50,000)          │
  │ feeBps: 0                                     │
  │ feeFixedMinor: 5,250 (₦52.50)                │
  │ settleHours: 0 (instant)                      │
  │ enabled: true                                 │
  └──────────────────────────────────────────────┘
```

### 8.4 Credential Management

```
┌─────────────────────────────────────────────────────────────────┐
│              CREDENTIAL ROTATION FLOW                           │
│                                                                  │
│  Admin → POST /api/admin/credentials                             │
│        { providerCode: "paystack", secrets: {...} }             │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────┐                   │
│  │  encryptSecret(secretsJSON)               │                   │
│  │  AES-256-GCM                              │                   │
│  │  IV: 12 bytes random                      │                   │
│  │  Tag: 16 bytes                             │                   │
│  │  Payload: v1:<iv>:<tag>:<enc>             │                   │
│  └──────────────────────┬───────────────────┘                   │
│                         │                                        │
│  ┌──────────────────────▼───────────────────┐                   │
│  │  ProviderCredentialVersion                │                   │
│  │  - Deactivate previous (active=false)     │                   │
│  │  - Insert new (active=true, version=N+1)  │                   │
│  └──────────────────────┬───────────────────┘                   │
│                         │                                        │
│  ┌──────────────────────▼───────────────────┐                   │
│  │  Credential cache invalidated             │                   │
│  │  (module-level Map, 5-min TTL)            │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
│  On adapter call:                                                │
│  1. getCredentials(providerCode)                                │
│  2. Check cache → if miss, query DB (active=true)               │
│  3. decryptSecret(secretsEnc)                                   │
│  4. Return parsed JSON                                          │
│  5. Cache for 5 minutes                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Orchestrator Design

### 9.1 The 12-Step Synchronized Payment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              ORCHESTRATOR: 12-STEP PAYMENT FLOW                 │
│                                                                  │
│  POST /api/transfer { amount, recipient, pin }                  │
│       │                                                          │
│       ▼                                                          │
│  ┌────────────────────────────────────────────────────┐         │
│  │ 1. IDEMPOTENCY CHECK                                │         │
│  │    key = SHA256(userId + endpoint + body)           │         │
│  │    if exists & completed → return cached response   │         │
│  │    if in-flight (<30s) → 409 CONFLICT              │         │
│  │    else → INSERT pending IdempotencyRecord          │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 2. PRE-FLIGHT VALIDATION                            │         │
│  │    - requireUser() + status === ACTIVE              │         │
│  │    - KYC tier limit check (single tx + daily)       │         │
│  │    - Feature flag check (if applicable)             │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 3. AML / SANCTIONS SCREENING                        │         │
│  │    - Screen counterparty (Jaro-Winkler >= 0.85)     │         │
│  │    - Run AML rules (VELOCITY, LARGE_AMOUNT, etc.)   │         │
│  │    - If hit → freeze wallet, ComplianceCase, 403   │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 4. PIN VERIFY                                       │         │
│  │    - verifyPin(user, pin)                           │         │
│  │    - Increment fail count on miss                   │         │
│  │    - Lock after 5 failures (15 min)                 │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 5. PROVIDER ROUTING                                 │         │
│  │    - route({contract, country, currency, amount})   │         │
│  │    - Capability filter → health filter → score      │         │
│  │    - Geo preference boost (+15)                     │         │
│  │    - Feature flag filter (skip parked Stripe/Wise)  │         │
│  │    - Persist PaymentRoutingDecision                 │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 6. HOLD DEBIT (for OUTBOUND)                        │         │
│  │    - $transaction:                                  │         │
│  │      debitWallet(amount + fee)                      │         │
│  │      create LedgerEntry (DEBIT, refType)            │         │
│  │      create Transaction (status=PENDING)            │         │
│  │    - PaymentFlowLog {step: HOLD_DEBIT}              │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 7. PROVIDER CALL (with FAILOVER)                    │         │
│  │    - tryWithFailover(req, decision):                │         │
│  │      attempt primary → if retryable error:          │         │
│  │      attempt alternative #1 → if retryable error:   │         │
│  │      attempt alternative #2                        │         │
│  │    - Each attempt: PaymentFlowLog {step: PROVIDER_  │         │
│  │      CALLED, providerCode, latencyMs}              │         │
│  │    - On failover: PaymentFlowLog {step: FAILOVER,   │         │
│  │      from: original, to: new, reason}              │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 8. CONFIRM or AUTO-REVERSE                          │         │
│  │    If result.ok && status === SUCCESS:              │         │
│  │      - For OUTBOUND: mark tx SUCCESS/SETTLED        │         │
│  │      - For INBOUND: creditWallet + LedgerEntry      │         │
│  │      - PaymentFlowLog {step: CONFIRMED}             │         │
│  │    If result.ok && status === PENDING:              │         │
│  │      - Leave PENDING (stuck-tx cron will resolve)   │         │
│  │    If !result.ok OR status === FAILED:              │         │
│  │      - AUTO-REVERSE: creditWallet back (REVERSAL)   │         │
│  │      - Mark tx REVERSED                            │         │
│  │      - PaymentFlowLog {step: AUTO_REVERSED}         │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 9. OUTBOX EVENT (same TX as step 8)                 │         │
│  │    INSERT OutboxEvent {                             │         │
│  │      type: PAYMENT_SETTLED | PAYMENT_REVERSED       │         │
│  │      aggregateType: TRANSACTION                     │         │
│  │      aggregateId: tx.id                             │         │
│  │      payloadJSON: {reference, amount, provider}     │         │
│  │    }                                                │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 10. WEBHOOK DISPATCH (via outbox-publisher cron)    │         │
│  │     - Find WebhookEndpoint for merchant             │         │
│  │     - POST payload + HMAC-SHA256 signature           │         │
│  │     - Retry: 10s → 1m → 5m → 30m → 2h → 6h         │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 11. AUDIT & NOTIFY                                  │         │
│  │     - AuditLog {action: TRANSFER_SUCCESS, ...}      │         │
│  │     - InAppNotification {type: TRANSACTION, ...}    │         │
│  │     - (Optional) SMS/Push via NotificationService   │         │
│  └────────────────────┬───────────────────────────────┘         │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────┐         │
│  │ 12. IDEMPOTENCY FINALIZE                            │         │
│  │     UPDATE IdempotencyRecord                        │         │
│  │       SET responseBody, status=200, completedAt     │         │
│  │     Return response to client                       │         │
│  └────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Failover Logic

```typescript
async function tryWithFailover(req, decision): Promise<ProviderResult> {
  const providers = [decision.providerCode, ...decision.alternatives];
  let lastError: ProviderError | null = null;
  let failoverCount = 0;

  for (const providerCode of providers.slice(0, 3)) { // max 3 calls
    const adapter = await registry.resolve(req.contract, providerCode);
    const result = await req.providerCall(adapter, providerRef);

    if (result.ok) return result;

    lastError = result.error;

    // Only failover on retryable errors
    if (!result.error.retryable) break;

    // Log failover
    await db.paymentFlowLog.create({
      data: { transactionId: tx.id, step: "FAILOVER",
        status: "ATTEMPTED", payloadJSON: JSON.stringify({
          from: providerCode, to: providers[failoverCount + 1],
          reason: result.error.code
        })
      }
    });
    failoverCount++;
  }

  return { ok: false, error: lastError };
}
```

---

## 10. Risk Engine

### 10.1 AML Rule Engine

```
┌─────────────────────────────────────────────────────────────────┐
│                    RISK / AML ENGINE                             │
│                                                                  │
│  Every transaction passes through:                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  1. SANCTIONS SCREENING                               │       │
│  │     - Jaro-Winkler fuzzy match (threshold >= 0.85)    │       │
│  │     - OFAC SDN list (19,254 entries, daily fetch)     │       │
│  │     - UN Consolidated, CBN Watchlist                  │       │
│  │     - Hit → wallet FREEZE + ComplianceCase + 403     │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  2. AML RULES                                         │       │
│  │                                                       │       │
│  │  VELOCITY: >5 tx in 10 min → MEDIUM flag             │       │
│  │  LARGE_AMOUNT: ≥ tier threshold → HIGH + step-up OTP │       │
│  │    Tier 1: ₦500K, Tier 2: ₦5M, Tier 3: ₦50M         │       │
│  │  RAPID_TRANSFER: ≥3 debits within 60s of funding     │       │
│  │    → HIGH + freeze 24h                               │       │
│  │  STRUCTURING: ≥3 deposits of ₦490K-₦500K in 7 days  │       │
│  │    → HIGH (smurfing detection)                       │       │
│  │  UNUSUAL_LOCATION: debit from geo-IP outside         │       │
│  │    user's last-3 countries → MEDIUM + step-up OTP    │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  3. AUTO-FREEZE (HIGH severity)                       │       │
│  │     - Wallet.status = FROZEN                          │       │
│  │     - User.status = FROZEN                            │       │
│  │     - ComplianceCase created (status=OPEN)           │       │
│  │     - Transaction blocked                             │       │
│  │     - Admin notified                                  │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  4. FRAUD SCREENING (Dojah)                           │       │
│  │     - Phone reputation lookup                         │       │
│  │     - Email breach check                              │       │
│  │     - IP geolocation + risk                           │       │
│  │     - Card BIN lookup                                 │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 KYC Tier System

| Tier | Label | Requirement | Single Tx Limit | Daily Limit | Max Balance |
|---|---|---|---|---|---|
| 1 | Starter | Phone only | ₦50,000 | ₦150,000 | ₦300,000 |
| 2 | Verified | NIN (Dojah/Paystack) | ₦500,000 | ₦2,000,000 | ₦5,000,000 |
| 3 | Premium | BVN (Paystack) | ₦5,000,000 | ₦20,000,000 | Unlimited |

### 10.3 Step-Up Authentication

For high-value transactions (>50% of tier limit):

```
User initiates ₦400,000 transfer (Tier 1, limit ₦50,000 → over limit, blocked)
User initiates ₦20,000 transfer (Tier 1, <50% of ₦50K → normal PIN)

User initiates ₦30,000 transfer (Tier 1, >50% of ₦50K):
  1. POST /api/auth/step-up { amountKobo: 3,000,000 }
     → Generate 6-digit OTP → send via Termii SMS / Resend email
     → Return { required: true, channel: "SMS" }
  2. User enters OTP
  3. POST /api/auth/step-up/verify { code }
     → Verify OTP → return { verified: true }
  4. Proceed with PIN + transfer (OTP verified for this session)
```

---

## 11. Notification System

### 11.1 Notification Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  NOTIFICATION SYSTEM                             │
│                                                                  │
│  Event (from OutboxEvent)                                       │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  NotificationService                                  │       │
│  │                                                       │       │
│  │  1. Determine channels (from CommunicationPreference)│       │
│  │     - emailEnabled, smsEnabled, pushEnabled,          │       │
│  │       whatsappEnabled                                 │       │
│  │  2. Determine category relevance:                    │       │
│  │     - transactionAlerts, securityAlerts,             │       │
│  │       marketingAlerts, weeklySummary                 │       │
│  │  3. Route to provider chain:                         │       │
│  └──────────────────────────────────────────────────────┘       │
│       │                                                          │
│       ├── SMS ──→ Termii ──→ (fallback) GetOTP/otp.dev         │
│       │                                                          │
│       ├── Email ──→ Resend ──→ (fallback) Termii/Gmail SMTP    │
│       │                                                          │
│       ├── Push ──→ Firebase (future)                            │
│       │                                                          │
│       └── WhatsApp ──→ Termii                                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  In-App Notifications                                 │       │
│  │  - InAppNotification table (type, title, body,       │       │
│  │    priority, read, actionUrl)                         │       │
│  │  - Real-time badge (30s polling)                     │       │
│  │  - Slide-over panel (All/Unread/Important tabs)      │       │
│  │  - Mark read individually or all                     │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  OTP (One-Time Passwords)                             │       │
│  │  - Termii OTP API (managed cross-channel)             │       │
│  │    - sendOTP (SMS/Voice/WhatsApp)                     │       │
│  │    - verifyOTP                                         │       │
│  │  - Internal OTP cache (sha256-hashed, 10-min TTL)     │       │
│  │  - Used for: step-up auth, forgot-password,           │       │
│  │    PIN reset, email/phone verification                │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 Notification Log + Retry

Every notification attempt is logged in `NotificationLog` with:
- `channel` (SMS/EMAIL/PUSH/WHATSAPP)
- `provider` (termii/resend/etc.)
- `status` (sent/delivered/failed)
- `attempts` (retry count)
- `nextRetryAt` (exponential backoff)

The `notification-retry` cron job retries failed notifications (max 3 attempts).

---

## 12. Audit System

### 12.1 Audit Log Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUDIT SYSTEM                                  │
│                                                                  │
│  Every sensitive action calls:                                  │
│  audit({ userId, action, category, severity, ip, userAgent,     │
│         metadata })                                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  AuditLog Table                                       │       │
│  │                                                       │       │
│  │  id: cuid                                             │       │
│  │  userId: FK → User (nullable for system events)      │       │
│  │  action: string (e.g. "LOGIN", "TRANSFER_SUCCESS")   │       │
│  │  category: AUTH | WALLET | TRANSFER | BILL | KYC |   │       │
│  │           AML | ADMIN | WEBHOOK | ERROR              │       │
│  │  severity: INFO | WARN | ERROR | CRITICAL            │       │
│  │  ip: string (client IP from x-forwarded-for)         │       │
│  │  userAgent: string                                    │       │
│  │  metadata: JSON string (sanitized, no secrets)       │       │
│  │  createdAt: DateTime                                  │       │
│  │                                                       │       │
│  │  Indexes: [userId, createdAt], [category]             │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  Categories (9)                                       │       │
│  │                                                       │       │
│  │  AUTH: LOGIN, LOGOUT, LOGIN_FAILED, REGISTER,        │       │
│  │        PASSKEY_REGISTERED, PASSKEY_LOGIN,             │       │
│  │        MFA_ENABLED, MFA_DISABLED, PASSWORD_RESET,     │       │
│  │        ACCOUNT_DELETED, DATA_EXPORT                   │       │
│  │                                                       │       │
│  │  WALLET: FUNDING, TRANSFER, REVERSAL, FEE,           │       │
│  │          CARD_FUND, CARD_WITHDRAW, AUTO_REVERSE       │       │
│  │                                                       │       │
│  │  TRANSFER: TRANSFER_SUCCESS, TRANSFER_REVERSED,       │       │
│  │            TRANSFER_FAILED                             │       │
│  │                                                       │       │
│  │  BILL: BILL_SUCCESS, BILL_FAILED                      │       │
│  │                                                       │       │
│  │  KYC: KYC_VERIFIED, KYC_PENDING, KYC_REJECTED         │       │
│  │                                                       │       │
│  │  AML: VELOCITY, LARGE_AMOUNT, RAPID_TRANSFER,         │       │
│  │       STRUCTURING, SANCTIONS_HIT                      │       │
│  │                                                       │       │
│  │  ADMIN: PROVIDER_CONFIG_UPDATE, CREDENTIAL_ROTATED,   │       │
│  │         FEATURE_FLAG_TOGGLE, CONFIG_ROLLBACK,         │       │
│  │         TEAM_INVITE, SECURITY_AUDIT_VIEWED             │       │
│  │                                                       │       │
│  │  WEBHOOK: WEBHOOK_RECEIVED, WEBHOOK_VERIFIED,         │       │
│  │           WEBHOOK_PROCESSED, WEBHOOK_FAILED            │       │
│  │                                                       │       │
│  │  ERROR: CLIENT_ERROR, SERVER_ERROR, PROVIDER_ERROR    │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  PaymentFlowLog (per-transaction step trace)          │       │
│  │                                                       │       │
│  │  transactionId: FK → Transaction                     │       │
│  │  step: ROUTED | HOLD_DEBIT | PROVIDER_CALLED |       │       │
│  │        PROVIDER_RESPONSE | CONFIRMED | AUTO_REVERSED  │       │
│  │        | FAILOVER                                      │       │
│  │  status: SUCCESS | FAILED | PENDING                   │       │
│  │  providerCode: string                                  │       │
│  │  payloadJSON: sanitized details                        │       │
│  │  latencyMs: int                                        │       │
│  │  at: DateTime                                          │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 NDPR / Data Export

- `GET /api/settings/export-data` — downloads ALL user data (29 tables) as JSON
- Sensitive fields stripped (passwordHash, tokenHash, panEnc, cvvEnc)
- BVN/NIN masked to last-4
- `Content-Disposition: attachment`

---

## 13. Logging

### 13.1 Logging Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOGGING STRATEGY                              │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │  Console Logs    │  │  AuditLog (DB)   │  │  Sentry        ││
│  │  (dev)           │  │  (persistent)    │  │  (errors)      ││
│  └──────────────────┘  └──────────────────┘  └────────────────┘│
│                                                                  │
│  Levels:                                                        │
│  - console.log: info (dev only, suppressed in prod)             │
│  - console.error: errors (always, also sent to Sentry)          │
│  - audit(): business events (DB AuditLog)                       │
│  - Sentry.captureException: unhandled errors                    │
│                                                                  │
│  What's logged:                                                  │
│  - Auth events (login, logout, passkey, MFA)                    │
│  - Payment events (every orchestrator step)                     │
│  - Provider calls (latency, success/failure)                    │
│  - Admin actions (config changes, credential rotations)         │
│  - Webhook receipts + processing                                │
│  - AML/sanctions hits                                           │
│  - Cron job execution                                           │
│  - Rate limit triggers                                          │
│                                                                  │
│  What's NOT logged:                                              │
│  - Passwords, PINs, tokens (never)                              │
│  - Full card PAN/CVV (only last4)                               │
│  - Provider API keys (sanitize() scrubs these)                  │
│  - Session tokens (only SHA-256 hash)                           │
└─────────────────────────────────────────────────────────────────┘
```

### 13.2 Sentry Integration

| Config | Value |
|---|---|
| Client DSN | `NEXT_PUBLIC_SENTRY_DSN` (env, optional) |
| Server DSN | `SENTRY_DSN` (env, optional) |
| Traces sample rate | 0.1 (10% of transactions) |
| Session replay | 1% normal, 100% on error |
| Environment | `process.env.NODE_ENV` |
| User context | Set on login (id, username, role) |
| Error filtering | Ignore auth errors (401, 403) |
| Source maps | Uploaded on build (hidden in prod) |

### 13.3 Structured Error Handling

```typescript
// Standard error response
{ "error": "Insufficient balance", "code": "INSUFFICIENT_BALANCE" }

// Error codes
AUTH_FAILED | INVALID_REQUEST | INSUFFICIENT_FUNDS | BENEFICIARY_INVALID
RATE_LIMITED | PROVIDER_DOWN | PROVIDER_TIMEOUT | COMPLIANCE_REJECT
DUPLICATE_REF | NOT_SUPPORTED | UPSTREAM_ERROR | UNKNOWN

// ServiceError class
class ServiceError extends Error {
  constructor(message: string, statusCode: number, code?: string)
}

// handleError() helper
async function handleError(e: unknown) {
  if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
  console.error("[API error]", e);
  return errorJson("Internal server error", 500);
}
```

---

## 14. Monitoring

### 14.1 Monitoring Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONITORING                                    │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │  Health Check    │  │  Provider Health │  │  Sentry        ││
│  │  /api/health     │  │  Dashboard       │  │  (APM)         ││
│  │                  │  │  (admin)         │  │                ││
│  │  - DB connectivity│  │  - Per-provider  │  │  - Error rate  ││
│  │  - Version       │  │    health score  │  │  - Performance ││
│  │  - Uptime        │  │  - Circuit state │  │  - Session     ││
│  │  - 200/503       │  │  - Success rate  │  │    replay      ││
│  │                  │  │  - Avg latency   │  │  - User context││
│  │  (Docker         │  │  - Sparkline     │  │                ││
│  │   healthcheck)   │  │  - Test button   │  │                ││
│  └──────────────────┘  └──────────────────┘  └────────────────┘│
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │  Admin Dashboard │  │  Failover Stats  │  │  Security      ││
│  │  (real-time)     │  │                  │  │  Audit         ││
│  │                  │  │  - 24h/7d totals │  │                ││
│  │  - 6 KPI cards   │  │  - By provider   │  │  - 9 checks    ││
│  │  - Live tx feed  │  │  - By reason     │  │  - scrypt      ││
│  │  - Provider health│  │  - Success after │  │  - CORS        ││
│  │  - Error breakdown│  │    failover      │  │  - Rate limit  ││
│  │  - Queue health  │  │                  │  │  - WebAuthn    ││
│  │  - Auto-refresh  │  │                  │  │  - Sentry DSN  ││
│  │    (15s toggle)  │  │                  │  │                ││
│  └──────────────────┘  └──────────────────┘  └────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 14.2 KPIs Tracked

| KPI | Source | Refresh |
|---|---|---|
| Today's transaction volume | Transaction aggregate | 15s |
| Success rate | Transaction status | 15s |
| Active users (24h) | Session count | 15s |
| Avg processing time | PaymentFlowLog latency | 15s |
| Total fees collected | Transaction feeKobo sum | 15s |
| Open alerts (AML + compliance) | AmlFlag + ComplianceCase | 15s |
| Provider health score | ProviderHealthCheck EMA | 30s |
| Circuit breaker states | In-memory breaker Map | 30s |
| Outbox queue depth | OutboxEvent count | 15s |
| Stuck transactions | Transaction state=INITIATED | 5min |
| Failed webhooks | WebhookEvent count | 15s |

### 14.3 Alerting

| Alert | Trigger | Action |
|---|---|---|
| Provider circuit OPEN | 5 consecutive failures | Admin notification + dashboard red |
| Treasury balance low | < 10 USDm or < 0.5 CELO | Admin email |
| Deposit confirmation lag | > 60s | Investigate RPC |
| Failed tx rate | > 5% | Sentry alert |
| AML HIGH flag | Auto-freeze triggered | ComplianceCase + admin alert |
| Sanctions hit | Score >= 0.85 | Wallet freeze + compliance case |
| Cron job failure | Cron returns error | Sentry + admin dashboard |

---

## 15. Infrastructure Diagram

### 15.1 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE DIAGRAM                          │
│                                                                  │
│                    ┌─────────────┐                              │
│                    │   Internet   │                              │
│                    └──────┬──────┘                              │
│                           │                                      │
│                    ┌──────▼──────┐                              │
│                    │   Caddy      │ (TLS termination,           │
│                    │   (reverse   │  security headers,          │
│                    │    proxy)    │  gzip)                      │
│                    └──────┬──────┘                              │
│                           │                                      │
│              ┌────────────┼────────────┐                        │
│              │            │            │                        │
│         ┌────▼───┐  ┌────▼───┐  ┌────▼───┐                    │
│         │ App #1  │  │ App #2  │  │ App #3  │ (3 replicas)     │
│         │ (Bun)   │  │ (Bun)   │  │ (Bun)   │                   │
│         │ :3000   │  │ :3000   │  │ :3000   │                   │
│         └────┬───┘  └────┬───┘  └────┬───┘                    │
│              │            │            │                        │
│              └────────────┼────────────┘                        │
│                           │                                      │
│              ┌────────────┼────────────┐                        │
│              │            │            │                        │
│         ┌────▼───┐  ┌────▼───┐  ┌────▼───┐                    │
│         │PostgreSQL│  │  Redis  │  │ Object  │                   │
│         │  16     │  │   7     │  │ Storage │                   │
│         │ (Prisma)│  │ (cache, │  │ (S3/    │                   │
│         │         │  │  rate   │  │  avatars)│                   │
│         │  76     │  │  limit, │  │          │                   │
│         │  models │  │  queue) │  │          │                   │
│         └─────────┘  └─────────┘  └─────────┘                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  CRON JOBS (Kubernetes CronJob or Vercel Cron)        │       │
│  │                                                       │       │
│  │  outbox-publisher    every 10s                        │       │
│  │  stuck-transactions  every 5min                       │       │
│  │  scheduled-payments  every 1min                       │       │
│  │  sanctions-fetch     every 24h                        │       │
│  │  health-flush        every 30s                        │       │
│  │  session-cleanup     every 1h                         │       │
│  │  interest-accrue     every 24h                        │       │
│  │                                                       │       │
│  │  All guarded by CronLock (leader election)            │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  EXTERNAL PROVIDERS                                   │       │
│  │                                                       │       │
│  │  Paystack | Flutterwave | Monnify | Baxi | Remita    │       │
│  │  Quickteller | Paga | M-Pesa | MTN MoMo | Airtel    │       │
│  │  Smartcash | Dojah | Termii | Resend | Wise | Stripe │       │
│  │                                                       │       │
│  │  Each with:                                           │       │
│  │  - Sandbox + production URLs                          │       │
│  │  - HMAC/OAuth/Basic auth                              │       │
│  │  - Webhook callbacks to /api/webhooks/*               │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  MONITORING                                            │       │
│  │                                                       │       │
│  │  Sentry (errors + APM)                                │       │
│  │  Health endpoint (/api/health, Docker healthcheck)    │       │
│  │  Admin dashboard (real-time monitoring tab)           │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 15.2 Docker Compose

```yaml
version: '3.8'
services:
  turbopay:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [postgres, redis]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 3s
      retries: 3

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: turbopay
      POSTGRES_USER: turbopay
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: ["postgres_data:/var/lib/postgresql/data"]
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U turbopay"]
      interval: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes: ["redis_data:/data"]
    ports: ["6379:6379"]

volumes:
  postgres_data:
  redis_data:
```

### 15.3 Dockerfile (Multi-stage, Bun Alpine)

```dockerfile
# Stage 1: deps
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: builder
FROM oven/bun:1.3-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN bun run build

# Stage 3: runner (~150MB)
FROM oven/bun:1.3-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --spider -q http://localhost:3000/api/health || exit 1
CMD ["bun", "server.js"]
```

### 15.4 CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    CI/CD PIPELINE                                │
│                                                                  │
│  GitHub Push ──→ GitHub Actions ──→ Build ──→ Test ──→ Deploy  │
│                     │              │         │        │         │
│                     │              │         │        ▼         │
│                     │              │         │    ┌──────┐     │
│                     │              │         │    │Vercel │     │
│                     │              │         │    │(auto) │     │
│                     │              │         │    └──────┘     │
│                     │              │         │                  │
│                     │              │         │    ┌──────┐     │
│                     │              │         └───→│Docker │     │
│                     │              │              │(manual)│    │
│                     │              │              └──────┘     │
│                     │              │                           │
│                     │              ▼                           │
│                     │         ┌──────────┐                     │
│                     │         │  Prisma  │                     │
│                     │         │  migrate │                     │
│                     │         └──────────┘                     │
│                     │                                           │
│                     ▼                                           │
│                ┌──────────┐                                     │
│                │  ESLint   │                                     │
│                │  (lint)   │                                     │
│                └──────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 15.5 Environment Configuration

| Env Var | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `JWT_SECRET` | Session signing secret | ✅ (prod) |
| `SESSION_SECRET` | Session encryption | ✅ (prod) |
| `CRON_SECRET` | Cron route authentication | ✅ |
| `ALLOWED_ORIGINS` | CORS whitelist | ✅ |
| `SENTRY_DSN` | Error monitoring | Optional |
| `NEXT_PUBLIC_SENTRY_DSN` | Client error monitoring | Optional |
| `REDIS_URL` | Rate limiting + cache | Optional (in-memory fallback) |
| `PAYSTACK_SECRET_KEY` | Paystack integration | Optional (sandbox mock) |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave integration | Optional |
| `MONNIFY_API_KEY` / `MONNIFY_SECRET_KEY` | Monnify integration | Optional |
| `MPESA_CONSUMER_KEY` / `SECRET` / `PASSKEY` / `SHORTCODE` | M-Pesa integration | Optional |
| `MTN_MOMO_SUBSCRIPTION_KEY` / `USER_ID` / `API_KEY` | MTN MoMo | Optional |
| `AIRTEL_MONEY_CLIENT_ID` / `SECRET` | Airtel Money | Optional |
| `SMARTCASH_API_KEY` / `MERCHANT_ID` | Smartcash | Optional |
| `PAGA_API_KEY` / `PUBLIC_KEY` / `SECRET_KEY` | Paga | Optional |
| `DOJAH_APP_ID` / `PRIVATE_KEY` | Dojah KYC | Optional |
| `TERMII_API_KEY` | Termii SMS | Optional |
| `RESEND_API_KEY` | Resend email | Optional |
| `WISE_API_TOKEN` | Wise international | Optional (parked) |
| `STRIPE_SECRET_KEY` | Stripe cards | Optional (parked) |

---

*End of TurboPay Complete Architecture & Reference Document*
