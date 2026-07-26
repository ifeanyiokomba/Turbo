import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleError, requireUser, ServiceError } from "@/lib/api";
import { getCachedStatement, setCachedStatement } from "@/lib/statement-cache";
import {
  generateStatementPdf,
  generateStatementCsv,
  buildStatementFilename,
  type StatementTx,
  type StatementAccount,
} from "@/lib/statement-pdf";

// GET /api/statements/[id] — download the generated PDF/CSV file.
//
// We first check the in-memory cache. If the entry is missing (e.g. after a
// server restart), we transparently regenerate the file from the stored
// period range + transactions.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const statement = await db.statementRequest.findUnique({ where: { id } });
    if (!statement) throw new ServiceError("Statement not found", 404, "NOT_FOUND");
    if (statement.userId !== user.id) {
      throw new ServiceError("Statement not found", 404, "NOT_FOUND");
    }

    const format = statement.format as "PDF" | "CSV";

    // Try cache first
    const cached = getCachedStatement(id);
    let bytes: Uint8Array;
    let filename: string;

    if (cached) {
      bytes = cached.bytes;
      filename = cached.filename;
    } else {
      // Regenerate from stored period + transactions.
      const [wallet, virtualAccount] = await Promise.all([
        db.wallet.findUnique({ where: { userId: user.id } }),
        db.virtualAccount.findUnique({ where: { userId: user.id } }),
      ]);

      const transactions = await db.transaction.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: statement.periodStart, lte: statement.periodEnd },
        },
        orderBy: { createdAt: "asc" },
        take: 1000,
      });

      const currentBalance = wallet?.balanceKobo ?? 0;
      const signedDelta = transactions
        .filter((t) => t.status === "SUCCESS")
        .reduce(
          (s, t) => s + (t.direction === "CREDIT" ? t.amountKobo : -t.amountKobo),
          0,
        );
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

      const period = {
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
      };

      bytes =
        format === "PDF"
          ? generateStatementPdf(account, period, statementTxs)
          : generateStatementCsv(account, period, statementTxs);

      filename = buildStatementFilename(account, period, format);

      // Repopulate the cache so subsequent downloads are instant.
      setCachedStatement({
        statementId: id,
        format,
        bytes,
        filename,
        createdAt: Date.now(),
      });
    }

    const contentType =
      format === "PDF" ? "application/pdf" : "text/csv;charset=utf-8";

    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
