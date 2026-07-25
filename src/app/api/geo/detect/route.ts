import {
  json,
  handleError,
  requireUser,
} from "@/lib/api";
import { headers as nextHeaders } from "next/headers";
import {
  detectCountryFromHeaders,
  getCountryConfig,
} from "@/lib/turbocore/geo/country-config";

export async function GET() {
  try {
    const user = await requireUser().catch(() => null);
    const hdrs = await nextHeaders();
    const detected = detectCountryFromHeaders(hdrs as unknown as Headers);
    const effective = user?.country ?? detected;
    const config = await getCountryConfig(effective);

    return json({
      detected,
      effective,
      source: user ? "profile" : "header",
      country: config,
    });
  } catch (e) {
    // Even if user is not authed, we still want to detect country
    try {
      const hdrs = await nextHeaders();
      const detected = detectCountryFromHeaders(hdrs as unknown as Headers);
      const config = await getCountryConfig(detected);
      return json({ detected, effective: detected, source: "header", country: config });
    } catch (e2) {
      return handleError(e2);
    }
  }
}
