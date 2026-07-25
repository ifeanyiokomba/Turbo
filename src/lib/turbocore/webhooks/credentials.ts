// TurboCore — provider credential lookup for inbound webhook signature
// verification. Resolves the provider's shared secret either from the
// active ProviderCredentialVersion (decrypted) or from an env-variable
// fallback. Returns null when no secret is configured.

import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/auth";

/**
 * Look up the webhook shared secret for a provider. Resolution order:
 *   1. `ProviderCredentialVersion` where active=true, ordered by version
 *      desc → decrypt `secretsEnc` JSON → pick the first key in the
 *      candidate list that's present (webhookSecret | secret | secretKey |
 *      webhook_secret | paystackSecret etc).
 *   2. Environment variable `${PROVIDER_UPPER}_WEBHOOK_SECRET` (e.g.
 *      `PAYSTACK_WEBHOOK_SECRET`, `FLUTTERWAVE_WEBHOOK_SECRET`).
 *
 * Returns the secret string, or null if none is configured.
 */
export async function getProviderWebhookSecret(providerCode: string): Promise<string | null> {
  // 1. Try DB-stored credentials.
  try {
    const cred = await db.providerCredentialVersion.findFirst({
      where: { providerCode, active: true },
      orderBy: { version: "desc" },
      select: { secretsEnc: true },
    });
    if (cred?.secretsEnc) {
      try {
        const json = decryptSecret(cred.secretsEnc);
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === "object") {
          const candidates = [
            "webhookSecret",
            "webhook_secret",
            "secret",
            "secretKey",
            "secret_key",
            `${providerCode}WebhookSecret`,
            `${providerCode}Secret`,
            "paystackSecret",
            "flutterwaveSecret",
            "monnifySecret",
            "mpesaSecret",
            "apiKey",
          ];
          for (const key of candidates) {
            const v = (parsed as Record<string, unknown>)[key];
            if (typeof v === "string" && v.length > 0) return v;
          }
        }
      } catch (e) {
        console.warn(`[webhook-secret] decrypt failed for ${providerCode}:`, e);
      }
    }
  } catch (e) {
    console.warn(`[webhook-secret] DB lookup failed for ${providerCode}:`, e);
  }

  // 2. Env fallback.
  const envKey = `${providerCode.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_WEBHOOK_SECRET`;
  const envVal = process.env[envKey];
  if (envVal && envVal.length > 0) return envVal;

  return null;
}
