import { NextRequest } from "next/server";
import { json, handleError, requireUser, errorJson, audit } from "@/lib/api";
import {
  getCountryKycConfig,
  getIdTypesForTier,
  validateIdFormat,
  verifyIdentity,
  getUserKycStatus,
  listSupportedCountries,
} from "@/lib/turbocore/kyc-engine";
import { z } from "zod";

// GET — returns the user's KYC status + available upgrades + country config
export async function GET() {
  try {
    const user = await requireUser();
    const status = await getUserKycStatus(user.id);
    return json(status);
  } catch (e) {
    return handleError(e);
  }
}

const verifySchema = z.object({
  tier: z.union([z.literal(2), z.literal(3)]),
  idType: z.string().min(1),
  idValue: z.string().min(1),
  additionalFields: z.record(z.string()).optional(),
});

// POST — execute a KYC verification
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) return errorJson(parsed.error.issues[0].message, 422);

    const { tier, idType, idValue, additionalFields } = parsed.data;
    const country = user.country || "NG";

    // Check country is supported
    const config = getCountryKycConfig(country);
    if (!config) return errorJson(`KYC not supported for country: ${country}`, 400);

    // Check the ID type is valid for this country + tier
    const idTypes = getIdTypesForTier(country, tier);
    if (!idTypes.find((t) => t.type === idType)) {
      return errorJson(`ID type ${idType} is not supported for ${country} tier ${tier}`, 400);
    }

    // Validate format before hitting the provider
    const formatCheck = validateIdFormat(idType, idValue, country, tier);
    if (!formatCheck.valid) return errorJson(formatCheck.error ?? "Invalid ID format", 400);

    // Execute verification via the KYC engine
    const result = await verifyIdentity({
      userId: user.id,
      country,
      tier,
      idType,
      idValue,
      additionalFields,
    });

    if (result.success) {
      return json(result, 200);
    } else {
      return errorJson(result.error ?? "Verification failed", 400);
    }
  } catch (e) {
    return handleError(e);
  }
}
