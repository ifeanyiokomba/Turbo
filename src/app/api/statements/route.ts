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
import { z } from "zod";
import {
  generateStatementPdf,
  generateStatementCsv,
  buildStatementFilename,
  type StatementTx,
  type StatementAccount,
} from "@/lib/statement-pdf";
import { setCachedStatement } from "@/lib/statement-cache";

// GET /api/statements — list the user's statement-request history (newest first)
export async function GET() {
  try {
    const user = await requireUser();
    const statements = await db.statementRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return json({
      statements: statements.map((s) => ({
        id: s.id,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        format: s.format,
        status: s.status,
        createdAt: s.createdAt,
        downloadUrl: `/api/statements/${s.id}`,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

const postSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  format: z.enum(["PDF", "CSV"]).default("PDF"),
});

// POST /api/statements — generate a new statement and return its metadata.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid input";
      return errorJson(msg, 400, "VALIDATION");
    }
    const { periodStart, periodEnd, format } = parsed.data;

    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (start >= end) {
      return errorJson("Period start must be before period end", 400, "BAD_PERIOD");
    }
    // Cap the period at 366 days to keep statement size sane.
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (days > 366) {
      return errorJson("Statement period cannot exceed 366 days", 400, "PERIOD_TOO_LONG");
    }

    // Fetch wallet + virtual account info for the header.
    const [wallet, virtualAccount] = await Promise.all([
      db.wallet.findUnique({ where: { userId: user.id } }),
      db.virtualAccount.findUnique({ where: { userId: user.id } }),
    ]);

    // Pull all transactions in the period (oldest first for running balance).
    const transactions = await db.transaction.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "asc" },
      take: 1000,
    });

    // Compute opening balance = current balance − signed sum of all txns in period.
    // (Use SUCCESS-only deltas; PENDING/FAILED don't move money.)
    const currentBalance = wallet?.balanceKobo ?? 0;
    const signedDelta = transactions
      .filter((t) => t.status === "SUCCESS")
      .reduce((s, t) => s + (t.direction === "CREDIT" ? t.amountKobo : -t.amountKobo), 0);
    const openingBalance = currentBalance - signedDelta;

    const account: StatementAccount = {
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      accountNumber: virtualAccount?.accountNumber ?? null,
      accountName: virtualAccount?.accountName ?? user.fullName,
      bankName: virtualAccount?.bankName ?? "Turbopay MFB",
      currency: wallet?.currency ?? "NGN",
      openingBalanceKobo: openingBalance,
      closingBalanceKobo: currentBalance,
    };

    const statementTxs: StatementTx[] = transactions.map((t) => ({
      id: t.id,
      reference: t.reference,
      type: t.type,
      direction: t.direction,
      amountKobo: t.amountKobo,
      feeKobo: t.feeKobo,
      status: t.status,
      description: t.description,
      counterpartyName: t.counterpartyName,
      createdAt: t.createdAt,
    }));

    // Generate the file bytes.
    const period = { periodStart: start, periodEnd: end };
    const bytes =
      format === "PDF"
        ? generateStatementPdf(account, period, statementTxs)
        : generateStatementCsv(account, period, statementTxs);

    const filename = buildStatementFilename(account, period, format);

    // Persist metadata.
    const statement = await db.statementRequest.create({
      data: {
        userId: user.id,
        periodStart: start,
        periodEnd: end,
        format,
        status: "READY",
        filePath: `cache:${format.toLowerCase()}`,
      },
    });

    // Cache the bytes for the GET download endpoint.
    setCachedStatement({
      statementId: statement.id,
      format,
      bytes,
      filename,
      createdAt: Date.now(),
    });

    await audit({
      userId: user.id,
      action: "STATEMENT_GENERATED",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        statementId: statement.id,
        format,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        transactionCount: transactions.length,
      },
    });

    return json({
      statement: {
        id: statement.id,
        status: statement.status,
        format,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        downloadUrl: `/api/statements/${statement.id}`,
        transactionCount: transactions.length,
      },
    });
  } catch (e) {
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}
