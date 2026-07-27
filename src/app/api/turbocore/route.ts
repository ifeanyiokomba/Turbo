import { json, requireUser } from "@/lib/api";
import {
  getAllManifests,
  getProvidersForCountry,
  getProvidersForCapability,
} from "@/lib/turbocore/manifest-registry";
import { getCountryRegistry, getAllCountryRegistries } from "@/lib/turbocore/geo/country-registry";
import {
  getPluginStatus,
  discoverCapabilities,
  supportsCapability,
  supportsCountry,
} from "@/lib/turbocore/plugin-loader";

// GET /api/turbocore — platform status: manifests, plugins, countries, capabilities
export async function GET() {
  try {
    await requireUser();
    const manifests = getAllManifests();
    const plugins = getPluginStatus();
    const countries = getAllCountryRegistries();

    return json({
      platform: "TurboCore",
      version: "1.0.0",
      providers: manifests.length,
      pluginsLoaded: plugins.filter((p) => p.loaded).length,
      countriesSupported: countries.length,
      manifests: manifests.map((m) => ({
        provider: m.provider,
        displayName: m.displayName,
        version: m.version,
        countries: m.countries,
        currencies: m.currencies,
        capabilities: m.capabilities.map((c) => c.name),
        paymentMethods: m.paymentMethods,
        apiVersion: m.apiVersion,
        authType: m.authType,
        settlementCycle: m.settlementCycle,
        webhookSupported: m.webhookSupported,
      })),
      plugins,
      countries: countries.map((c) => ({
        code: c.code,
        name: c.name,
        currency: c.currency,
        providers: c.providers,
        paymentMethods: c.paymentMethods,
        kyc: c.kyc,
        settlement: c.settlement,
      })),
    });
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }
}
