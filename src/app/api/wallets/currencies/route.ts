import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { getRate } from "@/lib/turbocore/fx/convert";

const SUPPORTED_CURRENCIES = new Set([
  "NGN", "USD", "EUR", "GBP", "KES", "GHS", "ZAR", "CAD", "AUD",
]);

const CURRENCY_META: Record<string, { flag: string; name: string }> = {
  NGN: { flag: "🇳🇬", name: "Nigerian Naira" },
  USD: { flag: "🇺🇸", name: "US Dollar" },
  EUR: { flag: "🇪🇺", name: "Euro" },
  GBP: { flag: "🇬🇧", name: "British Pound" },
  KES: { flag: "🇰🇪", name: "Kenyan Shilling" },
  GHS: { flag: "🇬🇭", name: "Ghanaian Cedi" },
  ZAR: { flag: "🇿🇦", name: "South African Rand" },
  CAD: { flag: "🇨🇦", name: "Canadian Dollar" },
  AUD: { flag: "🇦🇺", name: "Australian Dollar" },
};

export async function GET() {
  try {
    const user = await requireUser();
    const wallets = await db.currencyWallet.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    // Compute NGN-equivalent for each wallet
    const withEquiv = await Promise.all(
      wallets.map(async (w) => {
        let ngnEquivMinor = 0;
        if (w.currency === "NGN") {
          ngnEquivMinor = w.balanceMinor;
        } else {
          try {
            const { rate } = await getRate(w.currency, "NGN");
            ngnEquivMinor = Math.round(w.balanceMinor * rate);
          } catch {
            ngnEquivMinor = 0;
          }
        }
        return {
          id: w.id,
          currency: w.currency,
          balanceMinor: w.balanceMinor,
          status: w.status,
          version: w.version,
          createdAt: w.createdAt,
          flag: CURRENCY_META[w.currency]?.flag ?? "🌍",
          name: CURRENCY_META[w.currency]?.name ?? w.currency,
          ngnEquivMinor,
        };
      }),
    );

    const totalNgnEquiv = withEquiv.reduce((sum, w) => sum + w.ngnEquivMinor, 0);

    return json({
      wallets: withEquiv,
      totalNgnEquivMinor: totalNgnEquiv,
      supportedCurrencies: Object.entries(CURRENCY_META).map(([code, meta]) => ({
        code,
        ...meta,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const currency = String(body?.currency ?? "").toUpperCase();

    if (!SUPPORTED_CURRENCIES.has(currency)) {
      throw new ServiceError(
        "Unsupported currency. Pick from USD, EUR, GBP, KES, GHS, ZAR, CAD, AUD or NGN.",
        400,
        "INVALID_CURRENCY",
      );
    }

    // Idempotent: if wallet already exists, return it
    const existing = await db.currencyWallet.findUnique({
      where: { userId_currency: { userId: user.id, currency } },
    });
    if (existing) {
      return json({
        wallet: existing,
        created: false,
        message: `${currency} wallet already exists`,
      });
    }

    const wallet = await db.currencyWallet.create({
      data: {
        userId: user.id,
        currency,
        balanceMinor: 0,
        status: "ACTIVE",
      },
    });

    await audit({
      userId: user.id,
      action: "CURRENCY_WALLET_OPEN",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { currency, walletId: wallet.id },
    });

    return json({
      wallet: {
        ...wallet,
        flag: CURRENCY_META[currency]?.flag ?? "🌍",
        name: CURRENCY_META[currency]?.name ?? currency,
      },
      created: true,
    });
  } catch (e) {
    return handleError(e);
  }
}
