// GET /api/celo/transactions?page=1&limit=20
// Paginated list of the user's OnChainTransaction records (newest first),
// joined with the linked CeloWallet.

import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? DEFAULT_PAGE));
    const limitRaw = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw));
    const offset = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      db.onChainTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: { celoWallet: { select: { address: true, chainId: true } } },
      }),
      db.onChainTransaction.count({ where: { userId: user.id } }),
    ]);

    return json({
      transactions: transactions.map((t) => ({
        id: t.id,
        hash: t.hash,
        type: t.type,
        direction: t.direction,
        tokenSymbol: t.tokenSymbol,
        tokenAddress: t.tokenAddress,
        amountHuman: t.amountHuman,
        amountWei: t.amountWei,
        amountKoboEquiv: t.amountKoboEquiv,
        counterpartyAddress: t.counterpartyAddress,
        status: t.status,
        blockNumber: t.blockNumber?.toString() ?? null,
        gasUsed: t.gasUsed?.toString() ?? null,
        feeCurrency: t.feeCurrency,
        metadata: t.metadata,
        celoWallet: t.celoWallet
          ? {
              address: t.celoWallet.address,
              chainId: t.celoWallet.chainId,
            }
          : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      page,
      limit,
      hasMore: offset + transactions.length < total,
    });
  } catch (e) {
    return handleError(e);
  }
}
