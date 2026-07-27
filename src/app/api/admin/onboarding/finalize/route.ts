// TurboCore — Provider Onboarding: Finalize + Go Live
//
// Step 3 of the plug-and-play onboarding flow.
// Creates the ProviderConfig, ProviderCredentialVersion, ProviderCapability
// rows, and registers the provider in the live registry.
//
// POST /api/admin/onboarding/finalize
//   { providerCode, adapterType, displayName, credentials, environment,
//     selectedCapabilities, selectedCountries, priority, routingWeight }
// → Provider goes live immediately.

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";
import { encryptSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.PROVIDERS_MANAGE);
    const body = await req.json().catch(() => ({}));

    const providerCode = String(body.providerCode ?? "")
      .toLowerCase()
      .trim();
    const adapterType = String(body.adapterType ?? "").trim();
    const displayName = String(body.displayName ?? "").trim();
    const environment = body.environment === "production" ? "production" : "sandbox";
    const credentials = body.credentials ?? {};
    const selectedCapabilities: string[] = body.selectedCapabilities ?? [];
    const selectedCountries: string[] = body.selectedCountries ?? [];
    const notes = body.notes ? String(body.notes) : null;

    if (!providerCode || !adapterType || !displayName) {
      return json({ error: "providerCode, adapterType, and displayName are required" }, 400);
    }

    const { db } = await import("@/lib/db");
    const { getAllManifests } = await import("@/lib/turbocore/manifest-registry");
    const { invalidateCapabilityCache } = await import("@/lib/turbocore/routing-engine");

    // Check for existing provider
    const existing = await db.providerConfig.findUnique({ where: { code: providerCode } });
    if (existing) {
      return json({ error: `Provider "${providerCode}" already exists` }, 409);
    }

    // Get the manifest
    const manifest = getAllManifests().find((m) => m.provider === adapterType);
    if (!manifest) {
      return json({ error: `Unknown adapter: ${adapterType}` }, 400);
    }

    // Encrypt credentials
    const encryptedCreds = encryptSecret(JSON.stringify(credentials));

    // Create everything in a transaction
    const result = await db.$transaction(async (tx) => {
      // 1. Create ProviderConfig
      const config = await tx.providerConfig.create({
        data: {
          code: providerCode,
          displayName,
          sandbox: environment === "sandbox",
          enabled: true,
        },
      });

      // 2. Create ProviderCredentialVersion (encrypted)
      const credVersion = await tx.providerCredentialVersion.create({
        data: {
          providerCode,
          version: 1,
          secretsEnc: encryptedCreds,
          active: true,
        },
      });

      // 3. Create ProviderCapability rows for each selected capability
      const capRows: Array<{
        providerCode: string;
        contract: string;
        country: string;
        currency: string;
        direction: string;
        minAmountMinor: number;
        maxAmountMinor: number;
        feeBps: number;
        feeFixedMinor: number;
        settleHours: number;
        enabled: boolean;
      }> = [];
      for (const capId of selectedCapabilities) {
        const manifestCap = manifest.capabilities.find(
          (c) => c.name === capId || c.name.toLowerCase() === capId.toLowerCase()
        );
        const countries = manifestCap?.countries ?? selectedCountries;
        const currencies = manifestCap?.currencies ?? manifest.currencies;
        for (const country of countries.length > 0 ? countries : selectedCountries) {
          for (const currency of currencies.length > 0 ? currencies : ["ALL"]) {
            capRows.push({
              providerCode,
              contract: capId,
              country,
              currency,
              direction: manifestCap?.direction ?? "INBOUND",
              minAmountMinor: 0,
              maxAmountMinor: 0,
              feeBps: manifest.fees.percentageBps,
              feeFixedMinor: manifest.fees.fixedFee[currency] ?? 0,
              settleHours:
                manifest.settlementCycle === "INSTANT"
                  ? 0
                  : manifest.settlementCycle === "T_PLUS_1"
                    ? 24
                    : 48,
              enabled: true,
            });
          }
        }
      }

      if (capRows.length > 0) {
        // Insert capabilities one by one (skipDuplicates not supported on SQLite)
        for (const cap of capRows) {
          await tx.providerCapability.create({ data: cap }).catch(() => {});
        }
      }

      return { config, credVersion, capabilityCount: capRows.length };
    });

    // Invalidate the routing engine's capability cache so the new provider
    // is immediately considered for routing
    invalidateCapabilityCache();

    await audit({
      userId: user.id,
      action: "PROVIDER_ONBOARDED",
      category: "PROVIDERS",
      severity: "INFO",
      ip: getClientIp(req),
      metadata: {
        providerCode,
        adapterType,
        displayName,
        environment,
        capabilities: selectedCapabilities.length,
        countries: selectedCountries.length,
        credentialVersion: result.credVersion.version,
        notes,
      },
    });

    return json({
      success: true,
      providerCode,
      displayName,
      environment,
      status: "LIVE",
      message: `Provider "${displayName}" is now live and available for routing.`,
      details: {
        configId: result.config.code,
        credentialVersion: result.credVersion.version,
        capabilitiesOnboarded: result.capabilityCount,
        countriesSelected: selectedCountries.length,
        webhookSupported: manifest.webhookSupported,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
