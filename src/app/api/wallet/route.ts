import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const [wallet, virtualAccount, ledgerEntries] = await Promise.all([
      db.wallet.findUnique({ where: { userId: user.id } }),
      db.virtualAccount.findUnique({ where: { userId: user.id } }),
      db.ledgerEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return json({
      wallet: wallet
        ? {
            balanceKobo: wallet.balanceKobo,
            currency: wallet.currency,
            status: wallet.status,
          }
        : null,
      virtualAccount: virtualAccount
        ? {
            accountNumber: virtualAccount.accountNumber,
            accountName: virtualAccount.accountName,
            bankName: virtualAccount.bankName,
            bankCode: virtualAccount.bankCode,
          }
        : null,
      ledgerEntries,
    });
  } catch (e) {
    return handleError(e);
  }
}
