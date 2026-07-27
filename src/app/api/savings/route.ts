import { db } from "@/lib/db";
import {
  json,
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
import { generateReference, naira } from "@/lib/money";

interface SavingsProductDTO {
  id: string;
  name: string;
  type: string;
  interestBps: number;
  minAmountKobo: number;
  lockDays: number;
  description: string | null;
}

interface MySavingsDTO {
  product: SavingsProductDTO;
  balanceKobo: number;
  lastActivityAt: string | null;
  lockedUntil: Date | null;
  transactions: Array<{
    id: string;
    type: string;
    amountKobo: number;
    balanceAfterKobo: number;
    status: string;
    reference: string;
    createdAt: string;
  }>;
}

export async function GET() {
  try {
    const user = await requireUser();
    const [products, savingsTx] = await Promise.all([
      db.savingsProduct.findMany({ orderBy: { interestBps: "asc" } }),
      db.savingsTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        include: { product: true },
      }),
    ]);

    // Group by product, compute current balance from latest balanceAfterKobo per product
    const grouped = new Map<string, MySavingsDTO>();
    for (const tx of savingsTx) {
      const existing = grouped.get(tx.productId);
      const txDto = {
        id: tx.id,
        type: tx.type,
        amountKobo: tx.amountKobo,
        balanceAfterKobo: tx.balanceAfterKobo,
        status: tx.status,
        reference: tx.reference,
        createdAt: tx.createdAt.toISOString(),
      };
      if (!existing) {
        const firstDeposit = tx.type === "DEPOSIT" ? tx.createdAt : null;
        const lockedUntil =
          tx.product.lockDays > 0 && firstDeposit
            ? new Date(firstDeposit.getTime() + tx.product.lockDays * 24 * 60 * 60 * 1000)
            : null;
        grouped.set(tx.productId, {
          product: {
            id: tx.product.id,
            name: tx.product.name,
            type: tx.product.type,
            interestBps: tx.product.interestBps,
            minAmountKobo: tx.product.minAmountKobo,
            lockDays: tx.product.lockDays,
            description: tx.product.description,
          },
          balanceKobo: tx.balanceAfterKobo,
          lastActivityAt: tx.createdAt.toISOString(),
          lockedUntil,
          transactions: [txDto],
        });
      } else {
        // The list is desc-ordered, so first encounter has the latest balanceAfterKobo
        existing.transactions.push(txDto);
      }
    }

    const mySavings = Array.from(grouped.values());
    const totalSaved = mySavings.reduce((s, x) => s + x.balanceKobo, 0);
    const estInterest = mySavings.reduce(
      (s, x) => s + Math.round((x.balanceKobo * x.product.interestBps) / 10_000),
      0
    );

    return json({
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        interestBps: p.interestBps,
        minAmountKobo: p.minAmountKobo,
        lockDays: p.lockDays,
        description: p.description,
      })),
      mySavings,
      totalSaved,
      estInterest,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const productId = String(body?.productId ?? "");
    const amountKobo = Math.round(Number(body?.amountKobo));
    const type = String(body?.type ?? "").toUpperCase();
    const pinVal = String(body?.pin ?? "");

    if (!productId) throw new ServiceError("Select a savings product", 400, "MISSING_PRODUCT");
    if (!Number.isFinite(amountKobo) || amountKobo <= 0)
      throw new ServiceError("Enter a valid amount", 400, "INVALID_AMOUNT");
    if (type !== "DEPOSIT" && type !== "WITHDRAW")
      throw new ServiceError("Type must be DEPOSIT or WITHDRAW", 400, "INVALID_TYPE");
    if (!pinVal) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pinVal);

    const product = await db.savingsProduct.findUnique({ where: { id: productId } });
    if (!product) throw new ServiceError("Savings product not found", 404, "PRODUCT_NOT_FOUND");

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    // current balance = latest SavingsTransaction.balanceAfterKobo for this product
    const latest = await db.savingsTransaction.findFirst({
      where: { userId: user.id, productId },
      orderBy: { createdAt: "desc" },
    });
    const prevBalance = latest?.balanceAfterKobo ?? 0;

    if (type === "DEPOSIT") {
      if (amountKobo < product.minAmountKobo)
        throw new ServiceError(
          `Minimum deposit is ${naira(product.minAmountKobo)}`,
          400,
          "MIN_AMOUNT"
        );

      const reference = generateReference("SAV");
      const description = `Savings deposit — ${product.name}`;
      const { newBalance } = await debitWallet({
        userId: user.id,
        amountKobo,
        refType: RefType.SAVINGS,
        refId: reference,
        description,
      });

      const newSavingsBalance = prevBalance + amountKobo;
      const [transaction, savingsTx] = await db.$transaction([
        db.transaction.create({
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
            counterpartyName: product.name,
            provider: "turbopay-savings",
            providerRef: reference,
          },
        }),
        db.savingsTransaction.create({
          data: {
            userId: user.id,
            productId,
            type: "DEPOSIT",
            amountKobo,
            balanceAfterKobo: newSavingsBalance,
            status: "SUCCESS",
            reference,
          },
        }),
      ]);

      await audit({
        userId: user.id,
        action: "SAVINGS_DEPOSIT",
        category: "WALLET",
        severity: "INFO",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: {
          productId,
          productName: product.name,
          amountKobo,
          reference,
          savingsBalance: newSavingsBalance,
        },
      });

      return json({
        transaction,
        savingsTransaction: savingsTx,
        newWalletBalance: newBalance,
        savingsBalance: newSavingsBalance,
      });
    }

    // WITHDRAW
    if (amountKobo > prevBalance)
      throw new ServiceError("Insufficient savings balance", 400, "INSUFFICIENT_BALANCE");

    // lock check — if first deposit was within lockDays, withdraw is blocked
    if (product.lockDays > 0) {
      const firstDeposit = await db.savingsTransaction.findFirst({
        where: { userId: user.id, productId, type: "DEPOSIT" },
        orderBy: { createdAt: "asc" },
      });
      if (firstDeposit) {
        const unlockAt = new Date(
          firstDeposit.createdAt.getTime() + product.lockDays * 24 * 60 * 60 * 1000
        );
        if (unlockAt > new Date()) {
          throw new ServiceError(
            `Locked until ${unlockAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}`,
            400,
            "LOCKED"
          );
        }
      }
    }

    const reference = generateReference("SWD");
    const description = `Savings withdrawal — ${product.name}`;
    const { newBalance } = await creditWallet({
      userId: user.id,
      amountKobo,
      refType: RefType.SAVINGS,
      refId: reference,
      description,
    });

    const newSavingsBalance = prevBalance - amountKobo;
    const [transaction, savingsTx] = await db.$transaction([
      db.transaction.create({
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
          counterpartyName: product.name,
          provider: "turbopay-savings",
          providerRef: reference,
        },
      }),
      db.savingsTransaction.create({
        data: {
          userId: user.id,
          productId,
          type: "WITHDRAW",
          amountKobo,
          balanceAfterKobo: newSavingsBalance,
          status: "SUCCESS",
          reference,
        },
      }),
    ]);

    await audit({
      userId: user.id,
      action: "SAVINGS_WITHDRAW",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        productId,
        productName: product.name,
        amountKobo,
        reference,
        savingsBalance: newSavingsBalance,
      },
    });

    return json({
      transaction,
      savingsTransaction: savingsTx,
      newWalletBalance: newBalance,
      savingsBalance: newSavingsBalance,
    });
  } catch (e) {
    if (e instanceof LedgerError) {
      return json({ error: e.message, code: "LEDGER_ERROR" }, 400);
    }
    return handleError(e);
  }
}
