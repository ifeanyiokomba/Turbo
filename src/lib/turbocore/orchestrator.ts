// TurboCore — payment orchestrator. The synchronized hold-confirm-reverse flow.
// Every money-moving endpoint calls orchestratePayment().

import { db } from "@/lib/db";
import { hash } from "crypto";
import { debitWallet, creditWallet, transferBetweenWallets } from "@/lib/ledger";
import { audit } from "@/lib/api";
import { verifyPin } from "@/lib/auth";
import { generateReference } from "@/lib/money";
import { route, persistDecision } from "./routing-engine";
import { registry } from "./registry";
import type { ContractName, ProviderResult } from "./result";

export interface OrchestrateRequest {
  userId: string;
  contract: ContractName;
  country: string;
  currency: string;
  amountMinor: number;
  feeMinor?: number;
  direction: "INBOUND" | "OUTBOUND";
  service?: string;
  description: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  counterpartyBank?: string;
  pin: string;
  preferredProvider?: string;
  idempotencyKey?: string;
  providerCall: (adapter: any, providerRef: string) => Promise<ProviderResult<any>>;
  onConfirm?: (tx: any) => Promise<void>;
}

export interface OrchestrateResult {
  ok: boolean;
  transaction?: any;
  newBalanceMinor?: number;
  providerRef?: string;
  error?: { code: string; message: string };
}

export async function orchestratePayment(req: OrchestrateRequest): Promise<OrchestrateResult> {
  const requestId = generateReference("REQ");

  // 1. Idempotency check
  const idKey = req.idempotencyKey ?? hashKey(req);
  const existing = await db.idempotencyRecord.findUnique({ where: { key: idKey } });
  if (existing?.completedAt) {
    return { ok: true, transaction: existing.responseBody ? JSON.parse(existing.responseBody) : null };
  }
  if (existing && !existing.completedAt && Date.now() - existing.createdAt.getTime() < 30_000) {
    return { ok: false, error: { code: "DUPLICATE_REF", message: "Request in flight" } };
  }
  await db.idempotencyRecord.upsert({
    where: { key: idKey },
    create: { key: idKey, userId: req.userId, endpoint: req.contract, requestBody: JSON.stringify({ a: req.amountMinor }), status: 202 },
    update: {},
  });

  // 2. Load user + PIN verify
  const user = await db.user.findUnique({ where: { id: req.userId } });
  if (!user) return { ok: false, error: { code: "INVALID_REQUEST", message: "User not found" } };
  if (user.status !== "ACTIVE") return { ok: false, error: { code: "INVALID_REQUEST", message: "Account " + user.status.toLowerCase() } };

  try {
    if (user.transactionPinHash) verifyPin(req.pin, user.transactionPinHash);
  } catch {
    await db.user.update({
      where: { id: user.id },
      data: { pinFailCount: { increment: 1 } },
    });
    return { ok: false, error: { code: "AUTH_FAILED", message: "Invalid PIN" } };
  }

  // 3. Route
  const decision = await route({
    contract: req.contract,
    country: req.country,
    currency: req.currency,
    amountMinor: req.amountMinor,
    direction: req.direction,
    service: req.service,
    preferredProvider: req.preferredProvider,
    userId: req.userId,
  });

  if (decision.reason === "none" || !decision.providerCode) {
    return { ok: false, error: { code: "NOT_SUPPORTED", message: "No provider available for this request" } };
  }

  // 4. Create pending transaction
  const tx = await db.transaction.create({
    data: {
      userId: req.userId,
      reference: generateReference("TP"),
      type: req.contract,
      direction: req.direction === "OUTBOUND" ? "DEBIT" : "CREDIT",
      amountKobo: req.amountMinor,
      feeKobo: req.feeMinor ?? 0,
      status: "PENDING",
      state: "PIN_VERIFIED",
      counterpartyName: req.counterpartyName ?? null,
      counterpartyAccount: req.counterpartyAccount ?? null,
      counterpartyBank: req.counterpartyBank ?? null,
      description: req.description,
      provider: decision.providerCode,
      metadata: JSON.stringify({ requestId, decision: { reason: decision.reason, scores: decision.scores } }),
    },
  });
  await persistDecision(decision, requestId, tx.id);
  await db.paymentFlowLog.create({ data: { transactionId: tx.id, step: "ROUTED", status: decision.providerCode, providerCode: decision.providerCode } });

  // 5. HOLD DEBIT (for OUTBOUND) — debit now, confirm/reverse later
  let holdDebitId: string | null = null;
  if (req.direction === "OUTBOUND") {
    try {
      const total = req.amountMinor + (req.feeMinor ?? 0);
      const hold = await debitWallet({
        userId: req.userId,
        amountKobo: total,
        refType: req.contract,
        refId: tx.id,
        description: `HOLD: ${req.description}`,
      });
      holdDebitId = hold.entry.id;
      await db.paymentFlowLog.create({ data: { transactionId: tx.id, step: "HOLD_DEBIT", status: "SUCCESS", payloadJSON: JSON.stringify({ holdDebitId }) } });
    } catch (e: any) {
      await db.transaction.update({ where: { id: tx.id }, data: { status: "FAILED", state: "REVERSED" } });
      return { ok: false, error: { code: "INSUFFICIENT_FUNDS", message: e.message ?? "Insufficient balance" } };
    }
  }

  // 6. Provider call
  const adapter = await registry.resolve(req.contract, decision.providerCode);
  const providerRef = generateReference("PRV");
  await db.paymentFlowLog.create({ data: { transactionId: tx.id, step: "PROVIDER_CALLED", status: "PENDING", providerCode: decision.providerCode } });
  const result = await req.providerCall(adapter, providerRef);
  await db.paymentFlowLog.create({
    data: {
      transactionId: tx.id,
      step: "PROVIDER_RESPONSE",
      status: result.ok ? "SUCCESS" : "FAILED",
      providerCode: decision.providerCode,
      latencyMs: result.ok ? result.latencyMs : 0,
      payloadJSON: JSON.stringify(result.ok ? result.data : result.error),
    },
  });

  // 7. Confirm or auto-reverse
  if (result.ok && (result.data.status === "SUCCESS" || result.data.status === "PENDING")) {
    const realProviderRef = result.data.providerRef ?? providerRef;
    await db.transaction.update({
      where: { id: tx.id },
      data: {
        providerRef: realProviderRef,
        status: result.data.status === "SUCCESS" ? "SUCCESS" : "PENDING",
        state: result.data.status === "SUCCESS" ? "SETTLED" : "INITIATED",
      },
    });

    if (req.direction === "INBOUND" && result.data.status === "SUCCESS") {
      // Credit wallet for funding
      await creditWallet({
        userId: req.userId,
        amountKobo: req.amountMinor,
        refType: req.contract,
        refId: tx.id,
        description: req.description,
      });
    }

    // Outbox event
    await db.outboxEvent.create({
      data: {
        aggregateType: "TRANSACTION",
        aggregateId: tx.id,
        type: result.data.status === "SUCCESS" ? "PAYMENT_SETTLED" : "PAYMENT_PENDING",
        payloadJSON: JSON.stringify({ reference: tx.reference, amountMinor: req.amountMinor, provider: decision.providerCode }),
      },
    });

    if (req.onConfirm) {
      try {
        await req.onConfirm(tx);
      } catch {}
    }

    await audit({ userId: req.userId, action: `${req.contract}_SUCCESS`, category: "WALLET", metadata: { reference: tx.reference, provider: decision.providerCode } });

    // Finalize idempotency
    const wallet = await db.wallet.findUnique({ where: { userId: req.userId } });
    await db.idempotencyRecord.update({
      where: { key: idKey },
      data: { responseBody: JSON.stringify(tx), status: 200, completedAt: new Date() },
    });

    return { ok: true, transaction: tx, newBalanceMinor: wallet?.balanceKobo, providerRef: realProviderRef };
  }

  // AUTO-REVERSE
  if (holdDebitId) {
    try {
      await creditWallet({
        userId: req.userId,
        amountKobo: req.amountMinor + (req.feeMinor ?? 0),
        refType: "REVERSAL",
        refId: tx.id,
        pairId: holdDebitId,
        description: `REVERSAL: ${req.description}`,
      });
    } catch {}
  }
  await db.transaction.update({ where: { id: tx.id }, data: { status: "REVERSED", state: "REVERSED" } });
  await db.paymentFlowLog.create({ data: { transactionId: tx.id, step: "AUTO_REVERSED", status: "FAILED", payloadJSON: JSON.stringify(result.ok ? result.data : result.error) } });
  await db.outboxEvent.create({
    data: {
      aggregateType: "TRANSACTION",
      aggregateId: tx.id,
      type: "PAYMENT_REVERSED",
      payloadJSON: JSON.stringify({ reference: tx.reference, reason: result.ok ? result.data : result.error }),
    },
  });
  await audit({ userId: req.userId, action: `${req.contract}_REVERSED`, category: "WALLET", severity: "WARN", metadata: { reference: tx.reference, error: result.ok ? result.data : result.error } });

  const wallet = await db.wallet.findUnique({ where: { userId: req.userId } });
  await db.idempotencyRecord.update({
    where: { key: idKey },
    data: { responseBody: JSON.stringify(tx), status: 200, completedAt: new Date() },
  });

  return {
    ok: false,
    transaction: tx,
    newBalanceMinor: wallet?.balanceKobo,
    error: { code: result.ok ? result.data.status : result.error.code, message: result.ok ? "Provider returned failure" : result.error.message },
  };
}

function hashKey(req: OrchestrateRequest): string {
  const s = `${req.userId}:${req.contract}:${req.amountMinor}:${req.counterpartyAccount ?? ""}:${req.direction}`;
  return hash("sha256").update(s).digest("hex");
}
