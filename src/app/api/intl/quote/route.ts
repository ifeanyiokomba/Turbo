import { json, handleError, requireUser, ServiceError } from "@/lib/api";
import { route } from "@/lib/turbocore/routing-engine";
import { registry } from "@/lib/turbocore/registry";
import type { IInternationalTransferProvider } from "@/lib/turbocore/contracts";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const source = String(url.searchParams.get("source") ?? "").toUpperCase();
    const target = String(url.searchParams.get("target") ?? "").toUpperCase();
    const amountMinor = Math.round(Number(url.searchParams.get("amountMinor") ?? "0"));

    if (!source || !target) {
      throw new ServiceError("source and target currencies are required", 400, "MISSING_PARAMS");
    }
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new ServiceError("amountMinor must be a positive integer", 400, "INVALID_AMOUNT");
    }

    // Route to an INTERNATIONAL_TRANSFER provider for the user's country / source currency
    const decision = await route({
      contract: "INTERNATIONAL_TRANSFER",
      country: user.country,
      currency: source,
      amountMinor,
      direction: "OUTBOUND",
      userId: user.id,
    });

    if (decision.reason === "none" || !decision.providerCode) {
      return json(
        {
          ok: false,
          error: "No international provider available for this route. Try NGN → USD/EUR/GBP.",
          decision,
        },
        404
      );
    }

    const adapter = await registry.resolve<IInternationalTransferProvider>(
      "INTERNATIONAL_TRANSFER",
      decision.providerCode
    );

    const result = await adapter.getQuote({
      sourceCurrency: source,
      targetCurrency: target,
      amountMinor,
      direction: "OUTBOUND",
    });

    if (!result.ok) {
      return json(
        {
          ok: false,
          error: result.error.message,
          provider: decision.providerCode,
        },
        502
      );
    }

    return json({
      ok: true,
      quote: {
        ...result.data,
        sourceCurrency: source,
        targetCurrency: target,
        amountMinor,
        provider: decision.providerCode,
      },
      decision: {
        providerCode: decision.providerCode,
        reason: decision.reason,
        alternatives: decision.alternatives,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
