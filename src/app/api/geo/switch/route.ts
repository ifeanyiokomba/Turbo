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
import { getCountryConfig, getAllCountryConfigs } from "@/lib/turbocore/geo/country-config";

interface SwitchBody {
  country?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as SwitchBody;
    const country = String(body.country ?? "").toUpperCase().trim();

    if (!country || country.length !== 2) {
      throw new ServiceError("Country code must be a 2-letter ISO code", 400, "INVALID_COUNTRY");
    }

    // Validate country is enabled
    const configs = await getAllCountryConfigs();
    const valid = configs.find((c) => c.code === country);
    if (!valid) {
      throw new ServiceError(
        `Country ${country} is not supported by Turbopay yet`,
        400,
        "UNSUPPORTED_COUNTRY",
      );
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { country },
    });

    await audit({
      userId: user.id,
      action: "COUNTRY_SWITCH",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { from: user.country, to: country },
    });

    const countryConfig = await getCountryConfig(country);

    return json({
      ok: true,
      user: {
        id: updated.id,
        fullName: updated.fullName,
        username: updated.username,
        email: updated.email,
        phone: updated.phone,
        country: updated.country,
        role: updated.role,
        kycTier: updated.kycTier,
        kycStatus: updated.kycStatus,
        status: updated.status,
        emailVerified: updated.emailVerified,
        hasPin: !!updated.transactionPinHash,
      },
      countryConfig,
    });
  } catch (e) {
    return handleError(e);
  }
}
