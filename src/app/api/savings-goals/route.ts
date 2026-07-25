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
import { debitWallet, LedgerError } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";

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

/**
 * GET /api/savings-goals
 * List the authenticated user's savings goals (ACTIVE first, then COMPLETED, then CANCELLED)
 * with progress %, milestone info, average monthly contribution, and an estimated completion date.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const goals = await db.savingsGoal.findMany({
      where: { userId: user.id },
      include: { contributions: { select: { amountKobo: true, type: true, createdAt: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    const dtos = goals.map(toDTO);

    const totalSaved = dtos
      .filter((g) => g.status !== "CANCELLED")
      .reduce((s, g) => s + g.currentKobo, 0);
    const totalTarget = dtos
      .filter((g) => g.status === "ACTIVE")
      .reduce((s, g) => s + g.targetKobo, 0);
    const completedCount = dtos.filter((g) => g.status === "COMPLETED").length;
    const activeCount = dtos.filter((g) => g.status === "ACTIVE").length;

    return json({
      goals: dtos,
      stats: {
        totalSaved,
        totalTarget,
        completedCount,
        activeCount,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

interface CreateBody {
  name?: unknown;
  targetKobo?: unknown;
  targetDate?: unknown;
  color?: unknown;
  icon?: unknown;
  initialDepositKobo?: unknown;
  pin?: unknown;
}

/**
 * POST /api/savings-goals
 * Create a new savings goal. Optionally fund it with an initial deposit from the wallet
 * (PIN required when initialDepositKobo > 0; the wallet is debited atomically with the
 * goal creation and a contribution record is written).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as CreateBody;

    const name = String(body?.name ?? "").trim();
    const targetKobo = Math.round(Number(body?.targetKobo ?? 0));
    const color = String(body?.color ?? "emerald");
    const icon = String(body?.icon ?? "Target");
    const initialDepositKobo = Math.round(Number(body?.initialDepositKobo ?? 0));

    if (name.length < 2 || name.length > 60)
      throw new ServiceError("Goal name must be 2–60 characters", 400, "INVALID_NAME");
    if (!Number.isFinite(targetKobo) || targetKobo < 1000)
      throw new ServiceError("Target amount must be at least ₦10", 400, "INVALID_TARGET");

    let targetDate: Date | null = null;
    if (body?.targetDate) {
      const d = new Date(String(body.targetDate));
      if (!isNaN(d.getTime())) targetDate = d;
    }

    if (!ALLOWED_COLORS.has(color))
      throw new ServiceError("Invalid color", 400, "INVALID_COLOR");
    if (!ALLOWED_ICONS.has(icon))
      throw new ServiceError("Invalid icon", 400, "INVALID_ICON");

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    // Optional initial deposit: needs a PIN + a wallet debit + a contribution row.
    const pinVal = String(body?.pin ?? "");
    if (initialDepositKobo > 0) {
      if (!pinVal) throw new ServiceError("PIN is required for initial deposit", 400, "PIN_REQUIRED");
      const { verifyPin } = await import("@/lib/auth");
      if (!user.transactionPinHash)
        throw new ServiceError("Transaction PIN not set", 400, "PIN_NOT_SET");
      if (!verifyPin(pinVal, user.transactionPinHash))
        throw new ServiceError("Incorrect PIN", 400, "INVALID_PIN");
      if (initialDepositKobo > targetKobo)
        throw new ServiceError("Initial deposit cannot exceed target", 400, "OVER_TARGET");
    }

    const reference = initialDepositKobo > 0 ? generateReference("SGL") : "";

    // Atomic: create the goal, optionally debit wallet + record contribution + Transaction row.
    const created = await db.$transaction(async (tx) => {
      const goal = await tx.savingsGoal.create({
        data: {
          userId: user.id,
          name,
          targetKobo,
          currentKobo: initialDepositKobo > 0 ? initialDepositKobo : 0,
          targetDate,
          color,
          icon,
          status: "ACTIVE",
        },
      });

      if (initialDepositKobo > 0) {
        await debitWallet({
          tx,
          userId: user.id,
          amountKobo: initialDepositKobo,
          refType: RefType.SAVINGS,
          refId: reference,
          description: `Savings goal deposit — ${name}`,
        });

        await tx.savingsGoalContribution.create({
          data: {
            goalId: goal.id,
            userId: user.id,
            amountKobo: initialDepositKobo,
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
            amountKobo: initialDepositKobo,
            feeKobo: 0,
            status: TxStatus.SUCCESS,
            state: TxState.SETTLED,
            description: `Savings goal deposit — ${name}`,
            counterpartyName: name,
            provider: "turbopay-savings-goal",
            providerRef: reference,
          },
        });

        if (initialDepositKobo >= targetKobo) {
          await tx.savingsGoal.update({
            where: { id: goal.id },
            data: { status: "COMPLETED" },
          });
        }
      }

      return tx.savingsGoal.findUnique({
        where: { id: goal.id },
        include: {
          contributions: { select: { amountKobo: true, type: true, createdAt: true } },
        },
      });
    });

    if (!created) throw new ServiceError("Failed to create goal", 500, "CREATE_FAILED");

    await audit({
      userId: user.id,
      action: "SAVINGS_GOAL_CREATE",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        goalId: created.id,
        name,
        targetKobo,
        initialDepositKobo,
        targetDate: targetDate?.toISOString() ?? null,
      },
    });

    return json({ goal: toDTO(created) }, 201);
  } catch (e) {
    if (e instanceof LedgerError) {
      return errorJson(e.message, 400, "LEDGER_ERROR");
    }
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}
