import { json, handleError, requireUser } from "@/lib/api";
import { getAllCountryConfigs } from "@/lib/turbocore/geo/country-config";

export async function GET() {
  try {
    await requireUser();
    const configs = await getAllCountryConfigs();
    return json({
      countries: configs.map((c) => ({
        code: c.code,
        name: c.name,
        currency: c.currency,
        dialCode: c.dialCode,
        flagEmoji: c.flagEmoji,
        locale: c.locale,
        rtl: c.rtl,
        paymentMethods: c.paymentMethods,
        enabled: c.enabled,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
