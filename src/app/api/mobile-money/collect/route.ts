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
import { orchestratePayment } from "@/lib/turbocore/orchestrator";
import { getCountryConfig } from "@/lib/turbocore/geo/country-config";
import type { IMobileMoneyProvider } from "@/lib/turbocore/contracts";
import { ContractName } from "@/lib/turbocore/result";

interface CollectBody {
  phone?: string;
  amountMinor?: number;
  walletProvider?: string;
  pin?: string;
  narration?: string;
}

const SUPPORTED_PROVIDERS = new Set(["MPESA", "MTN_MOMO", "AIRTEL_MONEY", "MTN", "AIRTEL"]);

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as CollectBody;

    const phone = String(body.phone ?? "").replace(/[^\d+]/g, "");
    const amountMinor = Math.round(Number(body.amountMinor ?? 0));
    const walletProvider = String(body.walletProvider ?? "").toUpperCase();
    const pin = String(body.pin ?? "");
    const narration = String(body.narration ?? "Mobile money collection").slice(0, 140);

    if (!phone || phone.length < 10) {
      throw new ServiceError("Enter a valid phone number", 400, "INVALID_PHONE");
    }
    if (!SUPPORTED_PROVIDERS.has(walletProvider)) {
      throw new ServiceError(
        "Pick a valid wallet provider (MPESA / MTN_MOMO / AIRTEL_MONEY)",
        400,
        "INVALID_PROVIDER"
      );
    }
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
    }
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    // Geofence — ensure user's country supports MOBILE_MONEY
    const country = await getCountryConfig(user.country);
    if (!country.paymentMethods.includes("MOBILE_MONEY")) {
      throw new ServiceError(
        `Mobile money is not available in ${country.name}. Switch your country to KE/GH/UG to use this feature.`,
        400,
        "NOT_SUPPORTED"
      );
    }

    const result = await orchestratePayment({
      userId: user.id,
      contract: "MOBILE_MONEY" as ContractName,
      country: user.country,
      currency: country.currency,
      amountMinor,
      direction: "INBOUND",
      description: `Mobile money collection from ${phone} (${walletProvider})`,
      counterpartyName: phone,
      counterpartyAccount: phone,
      counterpartyBank: walletProvider,
      pin,
      providerCall: async (adapter: IMobileMoneyProvider, providerRef: string) => {
        return adapter.collect({
          reference: providerRef,
          phone,
          walletProvider,
          amountMinor,
          currency: country.currency,
          narration,
        });
      },
    });

    if (!result.ok) {
      return json({ error: result.error?.message ?? "Collection failed" }, 400);
    }

    await audit({
      userId: user.id,
      action: "MOBILE_MONEY_COLLECT",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        phone,
        walletProvider,
        amountMinor,
        currency: country.currency,
        reference: result.transaction?.reference,
      },
    });

    return json({
      ok: true,
      transaction: result.transaction,
      providerRef: result.providerRef,
      newBalance: result.newBalanceMinor,
    });
  } catch (e) {
    return handleError(e);
  }
}
