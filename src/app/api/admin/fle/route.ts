import { NextRequest } from "next/server";
import { json, handleError, requireAdmin } from "@/lib/api";
import {
  initializeChartOfAccounts,
  getAccount,
  getAccountBalance,
  getAccountEntries,
  snapshotAllAccounts,
  closeAccountingPeriod,
  getCurrentAccountingPeriod,
} from "@/lib/turbocore/fle";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const accountCode = url.searchParams.get("account");
    const action = url.searchParams.get("action");

    if (action === "balance" && accountCode) {
      const account = await getAccount(accountCode);
      if (!account) return json({ error: "Not found" }, 404);
      const balance = await getAccountBalance(account.id);
      return json({ account, balance });
    }

    if (action === "entries" && accountCode) {
      const account = await getAccount(accountCode);
      if (!account) return json({ error: "Not found" }, 404);
      const entries = await getAccountEntries(account.id, 50);
      return json({ entries });
    }

    if (action === "period") {
      const period = await getCurrentAccountingPeriod();
      return json({ period });
    }

    // Default: return chart of accounts
    const accounts = await requireAdmin()
      .then(() => import("@/lib/db"))
      .then(({ db }) => db.ledgerAccount.findMany({ orderBy: { code: "asc" } }));
    return json({ accounts });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();

    if (body.action === "initialize") {
      await initializeChartOfAccounts();
      return json({ ok: true, message: "Chart of accounts initialized" });
    }

    if (body.action === "snapshot") {
      const result = await snapshotAllAccounts();
      return json(result);
    }

    if (body.action === "closePeriod") {
      const result = await closeAccountingPeriod(body.periodId, body.closedBy ?? "admin");
      return json(result);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return handleError(e);
  }
}
