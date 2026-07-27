// TurboCore Bounded Service — Country Service
//
// Thin facade over the country registry (manifest-enriched) + country
// config (DB-backed, geo-routing) + manifest-registry provider lookup.
// The single source of truth for "what does this country support?" —
// currencies, KYC requirements, payment methods, providers, regulations,
// settlement cycle, locale/RTL.

import {
  getCountryRegistry,
  getAllCountryRegistries,
  type CountryRegistryEntry,
} from "@/lib/turbocore/geo/country-registry";
import { detectCountryFromHeaders } from "@/lib/turbocore/geo/country-config";
import { getProvidersForCountry } from "@/lib/turbocore/manifest-registry";
import type { ProviderManifest } from "@/lib/turbocore/manifest-registry";

export const countryService = {
  /** Get the full registry entry for a country (currency, providers, KYC, regulations). */
  async getCountry(code: string): Promise<CountryRegistryEntry | null> {
    return getCountryRegistry(code);
  },

  /** List all country registries (manifest-enriched, dynamic provider lists). */
  async getAllCountries(): Promise<CountryRegistryEntry[]> {
    return getAllCountryRegistries();
  },

  /** Detect the user's country from request headers (CDN geo header + accept-language). */
  async detectCountry(headers: Headers, fallback = "NG"): Promise<string> {
    return detectCountryFromHeaders(headers, fallback);
  },

  /** List provider manifests active in a country. */
  async getProviders(country: string): Promise<ProviderManifest[]> {
    return getProvidersForCountry(country);
  },
};
