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
import { orchestratePayment } from "@/lib/turbocore/orchestrator";
import { route } from "@/lib/turbocore/routing-engine";
import { registry } from "@/lib/turbocore/registry";
import { debitCurrencyWallet, creditCurrencyWallet } from "@/lib/turbocore/fx/convert";
import type { IInternationalTransferProvider } from "@/lib/turbocore/contracts";
import type { InternationalBeneficiary } from "@/lib/turbocore/result";
import { generateReference } from "@/lib/money";
import { ContractName } from "@/lib/turbocore/result";

interface IntlSendBody {
  sourceCurrency?: string;
  targetCurrency?: string;
  amountMinor?: number;
  beneficiary?: InternationalBeneficiary & { id?: string };
  pin?: string;
  purpose?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as IntlSendBody;

    const sourceCurrency = String(body.sourceCurrency ?? "NGN").toUpperCase();
    const targetCurrency = String(body.targetCurrency ?? "USD").toUpperCase();
    const amountMinor = Math.round(Number(body.amountMinor ?? 0));
    const pin = String(body.pin ?? "");
    const purpose = String(body.purpose ?? "International transfer").slice(0, 140);
    const beneficiary = body.beneficiary;

    if (!beneficiary || !beneficiary.name) {
      throw new ServiceError("Beneficiary details are required", 400, "MISSING_BENEFICIARY");
    }
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
    }
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pin);

    // Route to provider
    const decision = await route({
      contract: "INTERNATIONAL_TRANSFER",
      country: user.country,
      currency: sourceCurrency,
      amountMinor,
      direction: "OUTBOUND",
      userId: user.id,
    });

    if (decision.reason === "none" || !decision.providerCode) {
      throw new ServiceError(
        "No international transfer provider available for this route",
        400,
        "NOT_SUPPORTED",
      );
    }

    // NGN source: use the orchestrator (debits the user's main NGN wallet)
    if (sourceCurrency === "NGN") {
      const result = await orchestratePayment({
        userId: user.id,
        contract: "INTERNATIONAL_TRANSFER" as ContractName,
        country: user.country,
        currency: "NGN",
        amountMinor,
        direction: "OUTBOUND",
        description: `Intl transfer to ${beneficiary.name} (${targetCurrency})`,
        counterpartyName: beneficiary.name,
        counterpartyAccount: beneficiary.accountNumber ?? beneficiary.iban ?? beneficiary.mobileWallet ?? "",
        counterpartyBank: beneficiary.bankName,
        pin,
        preferredProvider: decision.providerCode,
        providerCall: async (adapter: IInternationalTransferProvider, providerRef: string) => {
          return adapter.sendTransfer({
            reference: providerRef,
            beneficiary,
            amountMinor,
            currency: sourceCurrency,
            narration: purpose,
          });
        },
      });

      if (!result.ok) {
        return json({ error: result.error?.message ?? "Transfer failed" }, 400);
      }

      await audit({
        userId: user.id,
        action: "INTL_TRANSFER_SEND",
        category: "WALLET",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: {
          sourceCurrency,
          targetCurrency,
          amountMinor,
          beneficiary: beneficiary.name,
          provider: decision.providerCode,
          reference: result.transaction?.reference,
        },
      });

      return json({
        ok: true,
        transaction: result.transaction,
        providerRef: result.providerRef,
        newBalance: result.newBalanceMinor,
        estimatedDelivery: new Date(Date.now() + 24 * 3600_000).toISOString(),
      });
    }

    // Non-NGN source — debit the source currency wallet directly, then call provider
    // We bypass the orchestrator's main-wallet debit because the funds are in a CurrencyWallet.
    const reference = generateReference("INTL");

    let providerResult;
    try {
      // 1. Debit source currency wallet (amountMinor + fee of 0 — intl fee comes from the quote)
      await debitCurrencyWallet({
        userId: user.id,
        currency: sourceCurrency,
        amountMinor,
        refType: "INTERNATIONAL_TRANSFER",
        refId: reference,
        description: `Intl transfer to ${beneficiary.name} — ${purpose}`,
      });

      // 2. Call provider
      const adapter = await registry.resolve<IInternationalTransferProvider>(
        "INTERNATIONAL_TRANSFER",
        decision.providerCode,
      );
      providerResult = await adapter.sendTransfer({
        reference,
        beneficiary,
        amountMinor,
        currency: sourceCurrency,
        narration: purpose,
      });

      // 3. If provider failed — auto-reverse the currency wallet debit
      if (!providerResult.ok || (providerResult.data.status !== "SUCCESS" && providerResult.data.status !== "PENDING")) {
        try {
          await creditCurrencyWallet({
            userId: user.id,
            currency: sourceCurrency,
            amountMinor,
            refType: "REVERSAL",
            refId: reference,
            description: `REVERSAL: Intl transfer ${reference}`,
          });
        } catch {}
      }
    } catch (e: any) {
      // Debit failed (insufficient balance) — nothing to reverse
      throw new ServiceError(e?.message ?? "Insufficient balance", 400, "INSUFFICIENT_FUNDS");
    }

    // 4. Create a Transaction record for the international transfer
    const tx = await db.transaction.create({
      data: {
        userId: user.id,
        reference,
        type: "INTERNATIONAL_TRANSFER",
        direction: "DEBIT",
        amountKobo: amountMinor, // minor units in source currency
        feeKobo: 0,
        status: providerResult.ok ? (providerResult.data.status === "SUCCESS" ? "SUCCESS" : "PENDING") : "REVERSED",
        state: providerResult.ok && providerResult.data.status === "SUCCESS" ? "SETTLED" : "INITIATED",
        counterpartyName: beneficiary.name,
        counterpartyAccount: beneficiary.accountNumber ?? beneficiary.iban ?? beneficiary.mobileWallet ?? "",
        counterpartyBank: beneficiary.bankName,
        description: `${purpose} · ${sourceCurrency}→${targetCurrency}`,
        provider: decision.providerCode,
        providerRef: providerResult.ok ? providerResult.data.providerRef : null,
        metadata: JSON.stringify({
          sourceCurrency,
          targetCurrency,
          beneficiary,
          decision: { providerCode: decision.providerCode, reason: decision.reason },
        }),
      },
    });

    if (!providerResult.ok) {
      return json({
        ok: false,
        error: providerResult.error.message,
        transaction: tx,
      }, 502);
    }

    await audit({
      userId: user.id,
      action: "INTL_TRANSFER_SEND",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        sourceCurrency,
        targetCurrency,
        amountMinor,
        beneficiary: beneficiary.name,
        provider: decision.providerCode,
        reference,
      },
    });

    const updatedSourceWallet = await db.currencyWallet.findUnique({
      where: { userId_currency: { userId: user.id, currency: sourceCurrency } },
    });

    return json({
      ok: true,
      transaction: tx,
      providerRef: providerResult.data.providerRef,
      newBalance: updatedSourceWallet?.balanceMinor,
      estimatedDelivery: new Date(Date.now() + 24 * 3600_000).toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}
