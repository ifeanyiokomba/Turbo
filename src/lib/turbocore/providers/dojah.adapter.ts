// TurboCore — Dojah KYC adapter.
//
// Implements 1 contract:
//   - dojahKyc (IKYCProvider)
//
// Base URL: https://api.dojah.co/api/v1 (sandbox: same host with sandbox AppId).
// Auth: custom headers `AppId` + `PrivateKey`.
//
// Supported id types: BVN (Nigeria), NIN (Nigeria), KRA_PIN (Kenya),
// GHANA_CARD (Ghana), SA_ID (South Africa). Dojah exposes a generic KYC
// lookup endpoint `GET /api/v1/kyc/lookup?type=…&number=…` that dispatches to
// the appropriate sub-service.
//
// Secrets expected: { "appId": "...", "privateKey": "...", "productId": "..." }

import { ok, fail } from "../result";
import type { IKYCProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";

const CODE = "dojah";
const BASE = "https://api.dojah.co/api/v1";

function authHeaders(creds: { secrets: Record<string, string> }): Record<string, string> {
  return {
    AppId: creds.secrets.appId ?? "",
    PrivateKey: creds.secrets.privateKey ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// Map our idType enum to Dojah's lookup endpoint. Dojah splits BVN/NIN/etc into
// separate endpoints (/bvn/verify, /nin/verify, /kra, /ghana_card, ...) — we
// pick the right one per idType.
function lookupEndpoint(idType: string, idValue: string): { endpoint: string; params: Record<string, string> } | null {
  const t = idType.toUpperCase();
  switch (t) {
    case "BVN":
      return { endpoint: `${BASE}/kyc/bvn`, params: { bvn: idValue } };
    case "NIN":
      return { endpoint: `${BASE}/kyc/nin`, params: { nin: idValue } };
    case "KRA_PIN":
      return { endpoint: `${BASE}/kyc/kra`, params: { kra_pin: idValue } };
    case "GHANA_CARD":
      return { endpoint: `${BASE}/kyc/ghana/card`, params: { id_number: idValue } };
    case "SA_ID":
      return { endpoint: `${BASE}/kyc/sa/id`, params: { id_number: idValue } };
    default:
      return null;
  }
}

export const dojahKyc: IKYCProvider = {
  contract: "KYC",

  async verifyIdentity(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { tier: req.idType === "BVN" ? 3 : 2, verified: true, firstName: "Verified", lastName: "User" },
        "mock",
        300,
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }

    const lookup = lookupEndpoint(req.idType, req.idValue);
    if (!lookup) {
      return fail("NOT_SUPPORTED", `Dojah does not support idType ${req.idType}`, { providerCode: CODE });
    }

    try {
      const qs = new URLSearchParams(lookup.params).toString();
      const { body } = await http(
        `${lookup.endpoint}?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      // Dojah wraps the actual data under `entity` (for BVN/NIN) or
      // `data` (for KRA/Ghana). We try both.
      const wrapped = body as {
        entity?: {
          first_name?: string;
          last_name?: string;
          middle_name?: string;
          mobile?: string;
          phone?: string;
          date_of_birth?: string;
          gender?: string;
          // NIN-specific:
          firstname?: string;
          lastname?: string;
          telephoneno?: string;
        };
        data?: {
          first_name?: string;
          last_name?: string;
          phone?: string;
          mobile?: string;
          // Ghana card:
          fullName?: string;
          personal?: { firstName?: string; lastName?: string; phone?: string };
        };
        status?: string;
      };
      const e = wrapped.entity ?? {};
      const d = wrapped.data ?? {};
      const firstName = e.first_name ?? e.firstname ?? d.first_name ?? d.personal?.firstName ?? "";
      const lastName = e.last_name ?? e.lastname ?? d.last_name ?? d.personal?.lastName ?? "";
      const phone = e.mobile ?? e.phone ?? e.telephoneno ?? d.phone ?? d.mobile ?? "";
      if (!firstName && !lastName) {
        return fail("UPSTREAM_ERROR", "Dojah returned no name fields", { providerCode: CODE, raw: sanitize(body) });
      }
      const tier = req.idType === "BVN" || req.idType === "NIN" ? 3 : 2;
      return ok(
        {
          tier,
          verified: true,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone: phone || undefined,
        },
        `dojah-${req.idType.toLowerCase()}-${req.idValue.slice(-4)}`,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyIdentity failed";
      // Dojah returns 400/422 when the ID is invalid — map that to a
      // compliance-reject so callers can surface "verify your ID again".
      const code: "UPSTREAM_ERROR" | "COMPLIANCE_REJECT" | "INVALID_REQUEST" = /404|not found|invalid/i.test(msg)
        ? "COMPLIANCE_REJECT"
        : /400|422/.test(msg)
          ? "INVALID_REQUEST"
          : "UPSTREAM_ERROR";
      return fail(code, msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
