import { json, handleError, requireUser } from "@/lib/api";
import { getAllCountryConfigs } from "@/lib/turbocore/geo/country-config";
import { route } from "@/lib/turbocore/routing-engine";
import { ContractName } from "@/lib/turbocore/result";

const CONTRACTS: ContractName[] = [
  "VIRTUAL_ACCOUNT",
  "CARD_PAYMENT",
  "BANK_TRANSFER",
  "BILL_PAYMENT",
  "AIRTIME",
  "KYC",
  "INTERNATIONAL_TRANSFER",
  "MOBILE_MONEY",
  "EXCHANGE_RATE",
  "VIRTUAL_CARD_ISSUER",
];

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const countryParam = (url.searchParams.get("country") ?? "").toUpperCase();
    const currencyParam = (url.searchParams.get("currency") ?? "").toUpperCase();

    // Resolve country — explicit param > user profile > default NG
    const allCountries = await getAllCountryConfigs();
    const countries = countryParam ? allCountries.filter((c) => c.code === countryParam) : allCountries;

    const capabilityMatrix = await Promise.all(
      countries.map(async (country) => {
        const currency = currencyParam || country.currency;
        const contractCapabilities = await Promise.all(
          CONTRACTS.map(async (contract) => {
            // Try INBOUND and OUTBOUND directions
            const [inbound, outbound] = await Promise.all([
              route({
                contract,
                country: country.code,
                currency,
                amountMinor: 10000,
                direction: "INBOUND",
              }).catch(() => null),
              route({
                contract,
                country: country.code,
                currency,
                amountMinor: 10000,
                direction: "OUTBOUND",
              }).catch(() => null),
            ]);
            return {
              contract,
              inbound: inbound?.providerCode ?? null,
              outbound: outbound?.providerCode ?? null,
              available: !!(inbound?.providerCode || outbound?.providerCode),
            };
          }),
        );
        return {
          country: country.code,
          name: country.name,
          currency,
          flagEmoji: country.flagEmoji,
          paymentMethods: country.paymentMethods,
          contracts: contractCapabilities,
        };
      }),
    );

    return json({
      capabilities: capabilityMatrix,
      contracts: CONTRACTS,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}
