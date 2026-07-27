import { db } from "@/lib/db";
import { json, handleError, requireUser, ServiceError } from "@/lib/api";

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/celo/transactions/[id]
// Single OnChainTransaction detail (ownership-checked).
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const transaction = await db.onChainTransaction.findUnique({
      where: { id },
      include: { celoWallet: { select: { address: true, chainId: true } } },
    });

    if (!transaction) throw new ServiceError("Transaction not found", 404, "TX_NOT_FOUND");
    if (transaction.userId !== user.id)
      throw new ServiceError("Transaction not found", 404, "TX_NOT_FOUND");

    return json({
      transaction: {
        id: transaction.id,
        hash: transaction.hash,
        type: transaction.type,
        direction: transaction.direction,
        tokenSymbol: transaction.tokenSymbol,
        tokenAddress: transaction.tokenAddress,
        amountHuman: transaction.amountHuman,
        amountWei: transaction.amountWei,
        amountKoboEquiv: transaction.amountKoboEquiv,
        counterpartyAddress: transaction.counterpartyAddress,
        status: transaction.status,
        blockNumber: transaction.blockNumber?.toString() ?? null,
        gasUsed: transaction.gasUsed?.toString() ?? null,
        feeCurrency: transaction.feeCurrency,
        metadata: transaction.metadata,
        celoWallet: transaction.celoWallet
          ? {
              address: transaction.celoWallet.address,
              chainId: transaction.celoWallet.chainId,
            }
          : null,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
