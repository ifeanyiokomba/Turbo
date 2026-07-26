import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  verifyPin,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { creditWallet, debitWallet, LedgerError } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";

interface GoalDTO {
  id: string;
  name: string;
  targetKobo: number;
  currentKobo: number;
  targetDate: string | null;
  color: string;
  icon: string;
  status: string;
  progressPct: number;
  remainingKobo: number;
  contributionCount: number;
  lastContributionAt: string | null;
  avgMonthlyContributionKobo: number;
  estimatedCompletionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

function computeAvgMonthly(contributions: Array<{ amountKobo: number; type: string; createdAt: Date }>): number {
  const deposits = contributions.filter((c) => c.type === "DEPOSIT");
  if (deposits.length === 0) return 0;
  const total = deposits.reduce((s, c) => s + c.amountKobo, 0);
  const first = deposits[0].createdAt.getTime();
  const now = Date.now();
  const days = Math.max(1, (now - first) / (24 * 60 * 60 * 1000));
  const months = days / 30;
  if (months < 1) return total;
  return Math.round(total / months);
}

function estimateCompletion(
  currentKobo: number,
  targetKobo: number,
  avgMonthly: number,
  targetDate: Date | null,
): string | null {
  if (currentKobo >= targetKobo) return null;
  if (avgMonthly > 0) {
    const remaining = targetKobo - currentKobo;
    const monthsNeeded = Math.ceil(remaining / avgMonthly);
    const d = new Date();
    d.setMonth(d.getMonth() + monthsNeeded);
    return d.toISOString();
  }
  return targetDate ? targetDate.toISOString() : null;
}

function toDTO(
  goal: {
    id: string;
    name: string;
    targetKobo: number;
    currentKobo: number;
    targetDate: Date | null;
    color: string;
    icon: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    contributions: Array<{ amountKobo: number; type: string; createdAt: Date }>;
  },
): GoalDTO {
  const progressPct =
    goal.targetKobo > 0
      ? Math.min(100, Math.round((goal.currentKobo / goal.targetKobo) * 100))
      : 0;
  const avgMonthly = computeAvgMonthly(goal.contributions);
  const sorted = [...goal.contributions].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return {
    id: goal.id,
    name: goal.name,
    targetKobo: goal.targetKobo,
    currentKobo: goal.currentKobo,
    targetDate: goal.targetDate ? goal.targetDate.toISOString() : null,
    color: goal.color,
    icon: goal.icon,
    status: goal.status,
    progressPct,
    remainingKobo: Math.max(0, goal.targetKobo - goal.currentKobo),
    contributionCount: goal.contributions.length,
    lastContributionAt: sorted[0]?.createdAt.toISOString() ?? null,
    avgMonthlyContributionKobo: avgMonthly,
    estimatedCompletionDate: estimateCompletion(
      goal.currentKobo,
      goal.targetKobo,
      avgMonthly,
      goal.targetDate,
    ),
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

interface ContributeBody {
  amountKobo?: unknown;
  pin?: unknown;
  type?: unknown;
}

/**
 * POST /api/savings-goals/[id]/contribute
 * Body: { amountKobo, pin, type: "DEPOSIT" | "WITHDRAW" }
 *
 * DEPOSIT  → verifyPin → debitWallet(amountKobo) → record contribution → bump goal.currentKobo.
 *            If goal.currentKobo reaches targetKobo, mark goal COMPLETED.
 * WITHDRAW → verifyPin → if amountKobo > goal.currentKobo reject → creditWallet(amountKobo) →
 *            record WITHDRAW contribution → decrement goal.currentKobo (min 0). If goal was
 *            COMPLETED, reactivate back to ACTIVE.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!id) return errorJson("Goal id is required", 400, "MISSING_ID");

    const body = (await req.json().catch(() => ({}))) as ContributeBody;
    const amountKobo = Math.round(Number(body?.amountKobo ?? 0));
    const pinVal = String(body?.pin ?? "");
    const type = String(body?.type ?? "").toUpperCase();

    if (type !== "DEPOSIT" && type !== "WITHDRAW")
      throw new ServiceError("Type must be DEPOSIT or WITHDRAW", 400, "INVALID_TYPE");
    if (!Number.isFinite(amountKobo) || amountKobo <= 0)
      throw new ServiceError("Enter a valid amount", 400, "INVALID_AMOUNT");
    if (!pinVal) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pinVal);

    const goal = await db.savingsGoal.findUnique({ where: { id } });
    if (!goal) return errorJson("Goal not found", 404, "NOT_FOUND");
    if (goal.userId !== user.id) throw new ServiceError("Forbidden", 403, "FORBIDDEN");
    if (goal.status === "CANCELLED")
      throw new ServiceError("Goal has been cancelled", 400, "GOAL_CANCELLED");

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference(type === "DEPOSIT" ? "SGD" : "SGW");
    const description =
      type === "DEPOSIT"
        ? `Savings goal deposit — ${goal.name}`
        : `Savings goal withdrawal — ${goal.name}`;

    let completedNow = false;

    const updated = await db.$transaction(async (tx) => {
      if (type === "DEPOSIT") {
        // Debit wallet (throws on insufficient balance)
        await debitWallet({
          tx,
          userId: user.id,
          amountKobo,
          refType: RefType.SAVINGS,
          refId: reference,
          description,
        });

        const newCurrent = goal.currentKobo + amountKobo;
        const reachedTarget = newCurrent >= goal.targetKobo;

        await tx.savingsGoalContribution.create({
          data: {
            goalId: goal.id,
            userId: user.id,
            amountKobo,
            type: "DEPOSIT",
            reference,
          },
        });

        await tx.transaction.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            reference,
            type: TxType.SAVINGS_DEPOSIT,
            direction: TxDirection.DEBIT,
            amountKobo,
            feeKobo: 0,
            status: TxStatus.SUCCESS,
            state: TxState.SETTLED,
            description,
            counterpartyName: goal.name,
            provider: "turbopay-savings-goal",
            providerRef: reference,
          },
        });

        const g = await tx.savingsGoal.update({
          where: { id: goal.id },
          data: {
            currentKobo: newCurrent,
            status: reachedTarget ? "COMPLETED" : goal.status === "COMPLETED" ? "ACTIVE" : goal.status,
          },
          include: {
            contributions: { select: { amountKobo: true, type: true, createdAt: true } },
          },
        });
        if (reachedTarget) completedNow = true;
        return g;
      }

      // WITHDRAW
      if (amountKobo > goal.currentKobo)
        throw new ServiceError("Amount exceeds goal balance", 400, "INSUFFICIENT_GOAL_BALANCE");

      await creditWallet({
        tx,
        userId: user.id,
        amountKobo,
        refType: RefType.SAVINGS,
        refId: reference,
        description,
      });

      const newCurrent = Math.max(0, goal.currentKobo - amountKobo);

      await tx.savingsGoalContribution.create({
        data: {
          goalId: goal.id,
          userId: user.id,
          amountKobo,
          type: "WITHDRAW",
          reference,
        },
      });

      await tx.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.SAVINGS_WITHDRAW,
          direction: TxDirection.CREDIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          description,
          counterpartyName: goal.name,
          provider: "turbopay-savings-goal",
          providerRef: reference,
        },
      });

      // If withdrawal drops below target on a previously COMPLETED goal, reactivate it.
      const newStatus = newCurrent < goal.targetKobo && goal.status === "COMPLETED" ? "ACTIVE" : goal.status;

      return tx.savingsGoal.update({
        where: { id: goal.id },
        data: { currentKobo: newCurrent, status: newStatus },
        include: {
          contributions: { select: { amountKobo: true, type: true, createdAt: true } },
        },
      });
    });

    await audit({
      userId: user.id,
      action: type === "DEPOSIT" ? "SAVINGS_GOAL_DEPOSIT" : "SAVINGS_GOAL_WITHDRAW",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        goalId: goal.id,
        name: goal.name,
        amountKobo,
        type,
        reference,
        completedNow,
      },
    });

    return json({ goal: toDTO(updated), completedNow });
  } catch (e) {
    if (e instanceof LedgerError) return errorJson(e.message, 400, "LEDGER_ERROR");
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}
