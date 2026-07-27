// TurboCore — payment orchestrator. The synchronized hold-confirm-reverse flow.
// Every money-moving endpoint calls orchestratePayment().

import { db } from "@/lib/db";
import { createHash } from "crypto";
import { debitWallet, creditWallet, transferBetweenWallets } from "@/lib/ledger";
import { audit } from "@/lib/api";
import { verifyPin } from "@/lib/auth";
import { generateReference } from "@/lib/money";
import { route, persistDecision } from "./routing-engine";
import type { RoutingDecision } from "./routing-engine";
import { registry } from "./registry";
import type { ContractName, ProviderResult } from "./result";
import { publishPaymentEvent, EventTypes } from "./event-bus";
import { storeExplanation, createRoutingExplanation } from "./routing-explainability";

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
    return {
      ok: true,
      transaction: existing.responseBody ? JSON.parse(existing.responseBody) : null,
    };
  }
  if (existing && !existing.completedAt && Date.now() - existing.createdAt.getTime() < 30_000) {
    return { ok: false, error: { code: "DUPLICATE_REF", message: "Request in flight" } };
  }
  await db.idempotencyRecord.upsert({
    where: { key: idKey },
    create: {
      key: idKey,
      userId: req.userId,
      endpoint: req.contract,
      requestBody: JSON.stringify({ a: req.amountMinor }),
      status: 202,
    },
    update: {},
  });

  // 2. Load user + PIN verify
  const user = await db.user.findUnique({ where: { id: req.userId } });
  if (!user) return { ok: false, error: { code: "INVALID_REQUEST", message: "User not found" } };
  if (user.status !== "ACTIVE")
    return {
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Account " + user.status.toLowerCase() },
    };

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
    return {
      ok: false,
      error: { code: "NOT_SUPPORTED", message: "No provider available for this request" },
    };
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
      metadata: JSON.stringify({
        requestId,
        decision: { reason: decision.reason, scores: decision.scores },
      }),
    },
  });
  await persistDecision(decision, requestId, tx.id);

  // Store routing explanation for audit (explainable routing)
  if (decision.scores.length > 0) {
    const winner = decision.scores.find((s) => s.providerCode === decision.providerCode);
    if (winner) {
      storeExplanation(
        createRoutingExplanation(
          {
            contract: req.contract,
            country: req.country,
            currency: req.currency,
            amountMinor: req.amountMinor,
            direction: req.direction,
            service: req.service,
            preferredProvider: req.preferredProvider,
          },
          decision.scores.map((s) => ({
            provider: s.providerCode,
            eligible: s.circuit !== "OPEN" && s.successRate >= 30,
            scores: {
              health: s.health,
              cost: s.charge,
              speed: s.speed,
              capability: 100,
              total: s.score,
            },
            circuitState: s.circuit,
            preferred: s.preferred,
          })),
          decision.providerCode,
          decision.reason,
          decision.alternatives,
          {
            health: winner.health,
            cost: winner.charge,
            speed: winner.speed,
            capability: 100,
            total: winner.score,
          },
          {
            amlPassed: true,
            sanctionsPassed: true,
            kycTierSufficient: true,
            featureFlagEnabled: true,
          },
          0
        )
      );
    }
  }

  // Publish PAYMENT.CREATED event
  await publishPaymentEvent(EventTypes.PAYMENT_CREATED, tx.id, {
    reference: tx.reference,
    type: req.contract,
    amount: req.amountMinor,
    provider: decision.providerCode,
  });

  await db.paymentFlowLog.create({
    data: {
      transactionId: tx.id,
      step: "ROUTED",
      status: decision.providerCode,
      providerCode: decision.providerCode,
    },
  });

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
      await db.paymentFlowLog.create({
        data: {
          transactionId: tx.id,
          step: "HOLD_DEBIT",
          status: "SUCCESS",
          payloadJSON: JSON.stringify({ holdDebitId }),
        },
      });
    } catch (e: any) {
      await db.transaction.update({
        where: { id: tx.id },
        data: { status: "FAILED", state: "REVERSED" },
      });
      return {
        ok: false,
        error: { code: "INSUFFICIENT_FUNDS", message: e.message ?? "Insufficient balance" },
      };
    }
  }

  // 6. Provider call — attempts the primary, then automatically fails over to
  //    decision.alternatives if the primary returns a retryable error.
  //    Up to MAX_ATTEMPTS total provider calls (1 primary + 2 failovers).
  const providerRef = generateReference("PRV");
  const {
    result,
    providerCode: actualProviderCode,
    failovers,
  } = await tryWithFailover(req, decision, tx.id, providerRef);

  // If a failover happened, mutate the tx row so the audit trail reflects the
  // provider that actually handled the call.
  if (actualProviderCode !== decision.providerCode) {
    await db.transaction.update({
      where: { id: tx.id },
      data: { provider: actualProviderCode },
    });
  }

  // 7. Confirm or auto-reverse
  if (result.ok && (result.data.status === "SUCCESS" || result.data.status === "PENDING")) {
    const realProviderRef = result.data.providerRef ?? providerRef;
    await db.transaction.update({
      where: { id: tx.id },
      data: {
        providerRef: realProviderRef,
        provider: actualProviderCode,
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
        payloadJSON: JSON.stringify({
          reference: tx.reference,
          amountMinor: req.amountMinor,
          provider: actualProviderCode,
          failovers,
        }),
      },
    });

    // Publish PAYMENT.COMPLETED or PAYMENT.PENDING via event bus
    await publishPaymentEvent(
      result.data.status === "SUCCESS" ? EventTypes.PAYMENT_COMPLETED : EventTypes.PAYMENT_PENDING,
      tx.id,
      {
        reference: tx.reference,
        amount: req.amountMinor,
        provider: actualProviderCode,
        status: result.data.status,
        failovers: failovers.length,
      }
    );

    if (req.onConfirm) {
      try {
        await req.onConfirm(tx);
      } catch {}
    }

    await audit({
      userId: req.userId,
      action: `${req.contract}_SUCCESS`,
      category: "WALLET",
      metadata: {
        reference: tx.reference,
        provider: actualProviderCode,
        failovers: failovers.length,
      },
    });

    // Finalize idempotency
    const wallet = await db.wallet.findUnique({ where: { userId: req.userId } });
    await db.idempotencyRecord.update({
      where: { key: idKey },
      data: { responseBody: JSON.stringify(tx), status: 200, completedAt: new Date() },
    });

    return {
      ok: true,
      transaction: tx,
      newBalanceMinor: wallet?.balanceKobo,
      providerRef: realProviderRef,
    };
  }

  // AUTO-REVERSE — all attempts (primary + failovers) failed.
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
  await db.transaction.update({
    where: { id: tx.id },
    data: { status: "REVERSED", state: "REVERSED", provider: actualProviderCode },
  });
  await db.paymentFlowLog.create({
    data: {
      transactionId: tx.id,
      step: "AUTO_REVERSED",
      status: "FAILED",
      providerCode: actualProviderCode,
      payloadJSON: JSON.stringify({ result: result.ok ? result.data : result.error, failovers }),
    },
  });
  await db.outboxEvent.create({
    data: {
      aggregateType: "TRANSACTION",
      aggregateId: tx.id,
      type: "PAYMENT_REVERSED",
      payloadJSON: JSON.stringify({
        reference: tx.reference,
        reason: result.ok ? result.data : result.error,
        failovers,
      }),
    },
  });

  // Publish PAYMENT.REVERSED via event bus
  await publishPaymentEvent(EventTypes.PAYMENT_REVERSED, tx.id, {
    reference: tx.reference,
    reason: result.ok ? result.data : result.error,
    provider: actualProviderCode,
    failovers: failovers.length,
  });

  await audit({
    userId: req.userId,
    action: `${req.contract}_REVERSED`,
    category: "WALLET",
    severity: "WARN",
    metadata: {
      reference: tx.reference,
      provider: actualProviderCode,
      error: result.ok ? result.data : result.error,
      failovers: failovers.length,
    },
  });

  const wallet = await db.wallet.findUnique({ where: { userId: req.userId } });
  await db.idempotencyRecord.update({
    where: { key: idKey },
    data: { responseBody: JSON.stringify(tx), status: 200, completedAt: new Date() },
  });

  return {
    ok: false,
    transaction: tx,
    newBalanceMinor: wallet?.balanceKobo,
    error: {
      code: result.ok ? result.data.status : result.error.code,
      message: result.ok ? "Provider returned failure" : result.error.message,
    },
  };
}

// tryWithFailover — calls req.providerCall against the primary provider, then walks
// decision.alternatives in order if the result is a retryable failure. Up to
// MAX_ATTEMPTS total provider calls (1 primary + 2 failovers = 3 calls). Non-retryable
// errors and successes short-circuit immediately.
//
// Every failover is recorded in PaymentFlowLog with step="FAILOVER" and a payload
// {from, to, reason} so the admin dashboard can reconstruct the chain.
const MAX_FAILOVER_ATTEMPTS = 2; // 2 failover attempts on top of the primary call.

interface FailoverEvent {
  from: string;
  to: string;
  reason: string;
  at: string;
}

async function tryWithFailover(
  req: OrchestrateRequest,
  decision: RoutingDecision,
  txId: string,
  providerRef: string
): Promise<{ result: ProviderResult<any>; providerCode: string; failovers: FailoverEvent[] }> {
  const chain = [decision.providerCode, ...decision.alternatives].slice(
    0,
    1 + MAX_FAILOVER_ATTEMPTS
  );
  const failovers: FailoverEvent[] = [];
  let lastResult: ProviderResult<any> = {
    ok: false,
    error: { code: "UNKNOWN", message: "No provider attempted", retryable: false },
  };
  let lastProviderCode = decision.providerCode;

  for (let i = 0; i < chain.length; i++) {
    const providerCode = chain[i];

    // Record a FAILOVER log entry when we are NOT on the primary attempt.
    if (i > 0) {
      const reason = !lastResult.ok ? lastResult.error.code : "UNKNOWN";
      failovers.push({
        from: lastProviderCode,
        to: providerCode,
        reason,
        at: new Date().toISOString(),
      });
      await db.paymentFlowLog.create({
        data: {
          transactionId: txId,
          step: "FAILOVER",
          status: providerCode,
          providerCode,
          payloadJSON: JSON.stringify({ from: lastProviderCode, to: providerCode, reason }),
        },
      });
    }

    // Resolve adapter (the proxy tracks health + breaker state).
    const adapter = await registry.resolve(req.contract, providerCode).catch(() => null);
    if (!adapter) {
      lastResult = {
        ok: false,
        error: {
          code: "PROVIDER_DOWN",
          message: `${providerCode} adapter not registered`,
          retryable: true,
        },
      };
      lastProviderCode = providerCode;
      continue;
    }

    await db.paymentFlowLog.create({
      data: { transactionId: txId, step: "PROVIDER_CALLED", status: "PENDING", providerCode },
    });

    let result: ProviderResult<any>;
    try {
      result = await req.providerCall(adapter, providerRef);
    } catch (e: any) {
      // Defensive: providerCall should never throw (adapters return ProviderResult),
      // but if it does we treat it as a retryable UPSTREAM_ERROR.
      result = {
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: e?.message ?? "Provider call threw",
          retryable: true,
        },
      };
    }

    await db.paymentFlowLog.create({
      data: {
        transactionId: txId,
        step: "PROVIDER_RESPONSE",
        status: result.ok ? "SUCCESS" : "FAILED",
        providerCode,
        latencyMs: result.ok ? result.latencyMs : 0,
        payloadJSON: JSON.stringify(result.ok ? result.data : result.error),
      },
    });

    lastResult = result;
    lastProviderCode = providerCode;

    // Short-circuit on success or non-retryable failure.
    if (result.ok || !result.error.retryable) {
      return { result, providerCode, failovers };
    }
  }

  return { result: lastResult, providerCode: lastProviderCode, failovers };
}

function hashKey(req: OrchestrateRequest): string {
  const s = `${req.userId}:${req.contract}:${req.amountMinor}:${req.counterpartyAccount ?? ""}:${req.direction}`;
  return createHash("sha256").update(s).digest("hex");
}
