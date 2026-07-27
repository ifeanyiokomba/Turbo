import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";

const ALLOWED_COLORS = new Set([
  "emerald",
  "amber",
  "rose",
  "violet",
  "sky",
  "orange",
  "teal",
  "fuchsia",
]);
const ALLOWED_ICONS = new Set([
  "Target",
  "PiggyBank",
  "Plane",
  "Home",
  "Car",
  "GraduationCap",
  "Gift",
  "Heart",
  "ShoppingBag",
  "Laptop",
]);

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

function computeAvgMonthly(
  contributions: Array<{ amountKobo: number; type: string; createdAt: Date }>
): number {
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
  targetDate: Date | null
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

function toDTO(goal: {
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
}): GoalDTO {
  const progressPct =
    goal.targetKobo > 0 ? Math.min(100, Math.round((goal.currentKobo / goal.targetKobo) * 100)) : 0;
  const avgMonthly = computeAvgMonthly(goal.contributions);
  const sorted = [...goal.contributions].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
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
      goal.targetDate
    ),
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

async function loadOwnedGoal(id: string, userId: string) {
  const goal = await db.savingsGoal.findUnique({
    where: { id },
    include: { contributions: { select: { amountKobo: true, type: true, createdAt: true } } },
  });
  if (!goal) return null;
  if (goal.userId !== userId) throw new ServiceError("Forbidden", 403, "FORBIDDEN");
  return goal;
}

/**
 * GET /api/savings-goals/[id]
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!id) return errorJson("Goal id is required", 400, "MISSING_ID");
    const goal = await loadOwnedGoal(id, user.id);
    if (!goal) return errorJson("Goal not found", 404, "NOT_FOUND");
    return json({ goal: toDTO(goal) });
  } catch (e: any) {
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}

interface PatchBody {
  name?: unknown;
  targetKobo?: unknown;
  targetDate?: unknown | null;
  color?: unknown;
  icon?: unknown;
}

/**
 * PATCH /api/savings-goals/[id]
 * Edit goal name / target / target date / color / icon.
 * If the new target is at or below the current balance, the goal is marked COMPLETED.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!id) return errorJson("Goal id is required", 400, "MISSING_ID");
    const existing = await loadOwnedGoal(id, user.id);
    if (!existing) return errorJson("Goal not found", 404, "NOT_FOUND");
    if (existing.status === "CANCELLED")
      throw new ServiceError("Cannot edit a cancelled goal", 400, "GOAL_CANCELLED");

    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const data: {
      name?: string;
      targetKobo?: number;
      targetDate?: Date | null;
      color?: string;
      icon?: string;
      status?: string;
    } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 60)
        throw new ServiceError("Goal name must be 2–60 characters", 400, "INVALID_NAME");
      data.name = name;
    }

    if (body.targetKobo !== undefined) {
      const targetKobo = Math.round(Number(body.targetKobo));
      if (!Number.isFinite(targetKobo) || targetKobo < 1000)
        throw new ServiceError("Target amount must be at least ₦10", 400, "INVALID_TARGET");
      if (targetKobo < existing.currentKobo)
        throw new ServiceError(
          "Target cannot be lower than current savings",
          400,
          "TARGET_TOO_LOW"
        );
      data.targetKobo = targetKobo;
      if (targetKobo <= existing.currentKobo) data.status = "COMPLETED";
      else if (existing.status === "COMPLETED") data.status = "ACTIVE";
    }

    if (body.targetDate !== undefined) {
      if (body.targetDate === null || body.targetDate === "") {
        data.targetDate = null;
      } else {
        const d = new Date(String(body.targetDate));
        if (!isNaN(d.getTime())) data.targetDate = d;
      }
    }

    if (body.color !== undefined) {
      const color = String(body.color);
      if (!ALLOWED_COLORS.has(color)) throw new ServiceError("Invalid color", 400, "INVALID_COLOR");
      data.color = color;
    }

    if (body.icon !== undefined) {
      const icon = String(body.icon);
      if (!ALLOWED_ICONS.has(icon)) throw new ServiceError("Invalid icon", 400, "INVALID_ICON");
      data.icon = icon;
    }

    const updated = await db.$transaction(async (tx) => {
      const goal = await tx.savingsGoal.update({
        where: { id },
        data,
        include: {
          contributions: { select: { amountKobo: true, type: true, createdAt: true } },
        },
      });
      return goal;
    });

    await audit({
      userId: user.id,
      action: "SAVINGS_GOAL_UPDATE",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { goalId: id, fields: Object.keys(data) },
    });

    return json({ goal: toDTO(updated) });
  } catch (e: any) {
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}

/**
 * DELETE /api/savings-goals/[id]
 * Soft-cancel a goal. If the goal has any balance, the wallet is credited back the
 * current amount and a withdrawal contribution is recorded. The goal is then marked
 * CANCELLED (not physically deleted) so the audit + contribution history is preserved.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!id) return errorJson("Goal id is required", 400, "MISSING_ID");
    const existing = await loadOwnedGoal(id, user.id);
    if (!existing) return errorJson("Goal not found", 404, "NOT_FOUND");
    if (existing.status === "CANCELLED")
      return json({ ok: true, cancelled: true, alreadyCancelled: true });

    const { creditWallet, LedgerError } = await import("@/lib/ledger");
    const { RefType, TxType, TxDirection, TxStatus, TxState } = await import("@/lib/constants");
    const { generateReference } = await import("@/lib/money");

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("SGC");
    const refundKobo = existing.currentKobo;

    await db.$transaction(async (tx) => {
      if (refundKobo > 0) {
        await creditWallet({
          tx,
          userId: user.id,
          amountKobo: refundKobo,
          refType: RefType.SAVINGS,
          refId: reference,
          description: `Savings goal withdrawal (cancel) — ${existing.name}`,
        });

        await tx.savingsGoalContribution.create({
          data: {
            goalId: existing.id,
            userId: user.id,
            amountKobo: refundKobo,
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
            amountKobo: refundKobo,
            feeKobo: 0,
            status: TxStatus.SUCCESS,
            state: TxState.SETTLED,
            description: `Savings goal withdrawal (cancel) — ${existing.name}`,
            counterpartyName: existing.name,
            provider: "turbopay-savings-goal",
            providerRef: reference,
          },
        });
      }

      await tx.savingsGoal.update({
        where: { id: existing.id },
        data: { status: "CANCELLED", currentKobo: 0 },
      });
    });

    await audit({
      userId: user.id,
      action: "SAVINGS_GOAL_DELETE",
      category: "WALLET",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        goalId: existing.id,
        name: existing.name,
        refundedKobo: refundKobo,
        reference,
      },
    });

    return json({ ok: true, cancelled: true, refundedKobo: refundKobo });
  } catch (e: any) {
    if (
      e &&
      typeof e === "object" &&
      "message" in e &&
      (e as any).message?.includes("Insufficient")
    )
      return errorJson(e.message, 400, "LEDGER_ERROR");
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}
