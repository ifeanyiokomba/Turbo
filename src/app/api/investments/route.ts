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
import { debitWallet, LedgerError } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";

interface InvestmentProductDTO {
  id: string;
  name: string;
  type: string;
  riskLevel: string;
  minAmountKobo: number;
  maxAmountKobo: number;
  expectedReturnBps: number;
  durationLabel: string;
  provider: string;
}

interface UserInvestmentDTO {
  id: string;
  productId: string;
  productName: string;
  productType: string;
  provider: string;
  riskLevel: string;
  durationLabel: string;
  expectedReturnBps: number;
  principalKobo: number;
  currentValueKobo: number;
  status: string;
  maturityAt: string;
  createdAt: string;
}

/** Parse "30 days" / "6 months" / "1 year" / "91 days" into a future Date. */
function parseDuration(durationLabel: string): Date {
  const now = new Date();
  const match = durationLabel
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s*(day|month|year)s?$/);
  if (!match) {
    // default 30 days
    now.setDate(now.getDate() + 30);
    return now;
  }
  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "day") now.setDate(now.getDate() + n);
  else if (unit === "month") now.setMonth(now.getMonth() + n);
  else if (unit === "year") now.setFullYear(now.getFullYear() + n);
  return now;
}

export async function GET() {
  try {
    const user = await requireUser();
    const [products, holdings] = await Promise.all([
      db.investmentProduct.findMany({ orderBy: { minAmountKobo: "asc" } }),
      db.userInvestment.findMany({
        where: { userId: user.id },
        include: { product: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const holdingsDto: UserInvestmentDTO[] = holdings.map((h) => ({
      id: h.id,
      productId: h.productId,
      productName: h.product.name,
      productType: h.product.type,
      provider: h.product.provider,
      riskLevel: h.product.riskLevel,
      durationLabel: h.product.durationLabel,
      expectedReturnBps: h.product.expectedReturnBps,
      principalKobo: h.principalKobo,
      currentValueKobo: h.currentValueKobo,
      status: h.status,
      maturityAt: h.maturityAt.toISOString(),
      createdAt: h.createdAt.toISOString(),
    }));

    const active = holdingsDto.filter((h) => h.status === "ACTIVE");
    const totalValue = active.reduce((s, h) => s + h.currentValueKobo, 0);
    const totalPrincipal = active.reduce((s, h) => s + h.principalKobo, 0);

    return json({
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        riskLevel: p.riskLevel,
        minAmountKobo: p.minAmountKobo,
        maxAmountKobo: p.maxAmountKobo,
        expectedReturnBps: p.expectedReturnBps,
        durationLabel: p.durationLabel,
        provider: p.provider,
      })),
      holdings: holdingsDto,
      totalValue,
      totalPrincipal,
      totalReturn: totalValue - totalPrincipal,
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
    const pinVal = String(body?.pin ?? "");

    if (!productId) throw new ServiceError("Select an investment product", 400, "MISSING_PRODUCT");
    if (!Number.isFinite(amountKobo) || amountKobo <= 0)
      throw new ServiceError("Enter a valid amount", 400, "INVALID_AMOUNT");
    if (!pinVal) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pinVal);

    const product = await db.investmentProduct.findUnique({ where: { id: productId } });
    if (!product) throw new ServiceError("Investment product not found", 404, "PRODUCT_NOT_FOUND");

    if (amountKobo < product.minAmountKobo)
      throw new ServiceError(
        `Minimum investment is ₦${product.minAmountKobo / 100}`,
        400,
        "MIN_AMOUNT"
      );
    if (amountKobo > product.maxAmountKobo)
      throw new ServiceError(
        `Maximum investment is ₦${product.maxAmountKobo / 100}`,
        400,
        "MAX_AMOUNT"
      );

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("INV");
    const description = `Investment — ${product.name}`;
    const maturityAt = parseDuration(product.durationLabel);

    const { newBalance } = await debitWallet({
      userId: user.id,
      amountKobo,
      refType: RefType.INVESTMENT,
      refId: reference,
      description,
    });

    const [transaction, investment] = await db.$transaction([
      db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.INVESTMENT,
          direction: TxDirection.DEBIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          description,
          counterpartyName: product.name,
          provider: product.provider,
          providerRef: reference,
          metadata: JSON.stringify({ productId, maturityAt: maturityAt.toISOString() }),
        },
      }),
      db.userInvestment.create({
        data: {
          userId: user.id,
          productId,
          principalKobo: amountKobo,
          currentValueKobo: amountKobo, // starts at principal; accrues over time (mock)
          status: "ACTIVE",
          maturityAt,
        },
      }),
    ]);

    await audit({
      userId: user.id,
      action: "INVESTMENT_BUY",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        productId,
        productName: product.name,
        amountKobo,
        reference,
        investmentId: investment.id,
        maturityAt: maturityAt.toISOString(),
      },
    });

    return json({
      transaction,
      investment: {
        id: investment.id,
        principalKobo: investment.principalKobo,
        currentValueKobo: investment.currentValueKobo,
        status: investment.status,
        maturityAt: investment.maturityAt.toISOString(),
      },
      newBalance,
    });
  } catch (e) {
    if (e instanceof LedgerError) {
      return json({ error: e.message, code: "LEDGER_ERROR" }, 400);
    }
    return handleError(e);
  }
}
