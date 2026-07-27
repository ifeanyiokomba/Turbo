// TurboCore — Dojah KYC adapter.
//
// Implements 4 contracts:
//   - dojahKyc              (IKYCProvider)        — BVN, NIN, KRA, Ghana Card, SA ID
//   - dojahAdditionalKYC    (extension)           — Drivers License, Voters Card, Passport, NIN Slip, BVN Advanced, Account
//   - dojahAML              (IAMLProvider)        — name screening, transaction screening, PEPs, sanctions
//   - dojahBusinessKYC      (IBusinessKYCProvider)— RC number, TIN, business name
//   - dojahFraudScreening   (IFraudScreeningProvider)— phone, email, IP, BIN
//
// Base URL: https://api.dojah.co/api/v1 (sandbox: same host with sandbox AppId).
// Auth: custom headers `AppId` + `PrivateKey`.
//
// Secrets expected: { "appId": "...", "privateKey": "...", "productId": "..." }

import { ok, fail } from "../result";
import type { ProviderResult } from "../result";
import type {
  IKYCProvider,
  IAMLProvider,
  IBusinessKYCProvider,
  IFraudScreeningProvider,
  AMLMatch,
  BusinessMatch,
} from "../contracts";
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
function lookupEndpoint(
  idType: string,
  idValue: string
): { endpoint: string; params: Record<string, string> } | null {
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

// ---------------------------------------------------------------------------
// 1. Standard KYC (BVN / NIN / KRA / Ghana Card / SA ID)
// ---------------------------------------------------------------------------

export const dojahKyc: IKYCProvider = {
  contract: "KYC",

  async verifyIdentity(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          tier: req.idType === "BVN" ? 3 : 2,
          verified: true,
          firstName: "Verified",
          lastName: "User",
        },
        "mock",
        300
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }

    const lookup = lookupEndpoint(req.idType, req.idValue);
    if (!lookup) {
      return fail("NOT_SUPPORTED", `Dojah does not support idType ${req.idType}`, {
        providerCode: CODE,
      });
    }

    try {
      const qs = new URLSearchParams(lookup.params).toString();
      const { body } = await http(
        `${lookup.endpoint}?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
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
        return fail("UPSTREAM_ERROR", "Dojah returned no name fields", {
          providerCode: CODE,
          raw: sanitize(body),
        });
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
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyIdentity failed";
      // Dojah returns 400/422 when the ID is invalid — map that to a
      // compliance-reject so callers can surface "verify your ID again".
      const code: "UPSTREAM_ERROR" | "COMPLIANCE_REJECT" | "INVALID_REQUEST" =
        /404|not found|invalid/i.test(msg)
          ? "COMPLIANCE_REJECT"
          : /400|422/.test(msg)
            ? "INVALID_REQUEST"
            : "UPSTREAM_ERROR";
      return fail(code, msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 2. Additional KYC — drivers license, voters card, passport, NIN slip,
//    BVN advanced (with photo + address), bank account name resolution.
//
// These extend the IKYCProvider surface; we expose them as a separate object
// typed via the local DojahAdditionalKYC interface so callers can opt-in to
// richer KYC without breaking the standard IKYCProvider contract.
// ---------------------------------------------------------------------------

export interface DojahAdditionalKYC {
  readonly contract: "KYC";
  verifyDriversLicense(req: { licenseNumber: string; dob: string }): Promise<
    ProviderResult<{
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      gender?: string;
      issuedDate?: string;
      expiryDate?: string;
    }>
  >;
  verifyVotersCard(req: { voterNumber: string; state: string; lastName: string }): Promise<
    ProviderResult<{
      firstName?: string;
      lastName?: string;
      gender?: string;
      state?: string;
      valid?: boolean;
    }>
  >;
  verifyPassport(req: { passportNumber: string; firstName: string; lastName: string }): Promise<
    ProviderResult<{
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      gender?: string;
      nationality?: string;
      expiryDate?: string;
    }>
  >;
  verifyNINSlip(req: { nin: string }): Promise<
    ProviderResult<{
      firstName?: string;
      lastName?: string;
      middleName?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      photoUrl?: string;
    }>
  >;
  verifyBVNAdvanced(req: { bvn: string }): Promise<
    ProviderResult<{
      firstName?: string;
      lastName?: string;
      middleName?: string;
      dateOfBirth?: string;
      gender?: string;
      phone?: string;
      address?: string;
      photoUrl?: string;
    }>
  >;
  verifyAccountNumber(req: {
    accountNumber: string;
    bankCode: string;
  }): Promise<ProviderResult<{ accountName: string; bankName?: string }>>;
}

export const dojahAdditionalKYC: DojahAdditionalKYC = {
  contract: "KYC",

  async verifyDriversLicense(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: req.dob,
          gender: "M",
          issuedDate: "2021-01-01",
          expiryDate: "2025-01-01",
        },
        "mock",
        250
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({
        license_number: req.licenseNumber,
        dob: req.dob,
      }).toString();
      const { body } = await http(
        `${BASE}/kyc/drivers-license?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const e = (body as { entity?: Record<string, string> })?.entity ?? {};
      return ok(
        {
          firstName: e.first_name ?? e.firstName,
          lastName: e.last_name ?? e.lastName,
          dateOfBirth: e.birth_date ?? e.date_of_birth ?? req.dob,
          gender: e.gender,
          issuedDate: e.issue_date ?? e.issuedDate,
          expiryDate: e.expiry_date ?? e.expiryDate,
        },
        `dojah-dl-${req.licenseNumber.slice(-4)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyDriversLicense failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyVotersCard(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { firstName: "Voter", lastName: req.lastName, gender: "F", state: req.state, valid: true },
        "mock",
        250
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({
        voter_number: req.voterNumber,
        state: req.state,
        last_name: req.lastName,
      }).toString();
      const { body } = await http(
        `${BASE}/kyc/voters-card?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const e = (body as { entity?: Record<string, string> })?.entity ?? {};
      return ok(
        {
          firstName: e.first_name ?? e.firstName,
          lastName: e.last_name ?? e.lastName,
          gender: e.gender,
          state: e.state ?? req.state,
          valid: true,
        },
        `dojah-vc-${req.voterNumber.slice(-4)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyVotersCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyPassport(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          firstName: req.firstName,
          lastName: req.lastName,
          nationality: "NIGERIAN",
          gender: "M",
          expiryDate: "2030-01-01",
        },
        "mock",
        250
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({
        passport_number: req.passportNumber,
        first_name: req.firstName,
        last_name: req.lastName,
      }).toString();
      const { body } = await http(
        `${BASE}/kyc/passport?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const e = (body as { entity?: Record<string, string> })?.entity ?? {};
      return ok(
        {
          firstName: e.first_name ?? e.firstName,
          lastName: e.last_name ?? e.lastName,
          dateOfBirth: e.birth_date ?? e.date_of_birth,
          gender: e.gender,
          nationality: e.nationality ?? "NIGERIAN",
          expiryDate: e.expiry_date ?? e.expiryDate,
        },
        `dojah-pp-${req.passportNumber.slice(-4)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyPassport failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyNINSlip(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          firstName: "NIN",
          lastName: "Holder",
          middleName: "Middle",
          dateOfBirth: "1990-01-01",
          gender: "M",
          address: "Lagos, Nigeria",
          photoUrl: "mock://nin/photo.jpg",
        },
        "mock",
        250
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({ nin: req.nin }).toString();
      const { body } = await http(
        `${BASE}/kyc/nin/slips?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const e = (body as { entity?: Record<string, string> })?.entity ?? {};
      return ok(
        {
          firstName: e.first_name ?? e.firstname,
          lastName: e.last_name ?? e.lastname,
          middleName: e.middle_name,
          dateOfBirth: e.birth_date ?? e.date_of_birth,
          gender: e.gender,
          address: e.address,
          photoUrl: e.photo ?? e.slip_image,
        },
        `dojah-ninslip-${req.nin.slice(-4)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyNINSlip failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyBVNAdvanced(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          firstName: "Advanced",
          lastName: "Bvn",
          middleName: "M",
          dateOfBirth: "1985-06-15",
          gender: "M",
          phone: "+2348012345678",
          address: "123 Marina, Lagos",
          photoUrl: "mock://bvn/photo.jpg",
        },
        "mock",
        300
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({ bvn: req.bvn }).toString();
      const { body } = await http(
        `${BASE}/kyc/bvn/advanced?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const e = (body as { entity?: Record<string, string> })?.entity ?? {};
      return ok(
        {
          firstName: e.first_name ?? e.firstName,
          lastName: e.last_name ?? e.lastName,
          middleName: e.middle_name,
          dateOfBirth: e.birth_date ?? e.date_of_birth,
          gender: e.gender,
          phone: e.mobile ?? e.phone,
          address: e.residential_address ?? e.address,
          photoUrl: e.photo ?? e.image,
        },
        `dojah-bvn-adv-${req.bvn.slice(-4)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyBVNAdvanced failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyAccountNumber(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const names = ["JOHN DOE", "JANE SMITH", "ADEKUNLE CIROMA"];
      return ok(
        {
          accountName: names[parseInt(req.accountNumber.slice(-1)) % names.length],
          bankName: "Demo Bank",
        },
        "mock",
        200
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({
        account_number: req.accountNumber,
        bank_code: req.bankCode,
      }).toString();
      const { body } = await http(
        `${BASE}/kyc/account/verify?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const e = (body as { entity?: Record<string, string> })?.entity ?? {};
      const accountName = e.account_name ?? e.accountName ?? "";
      if (!accountName) {
        return fail("UPSTREAM_ERROR", "Dojah returned no account name", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      return ok(
        { accountName, bankName: e.bank_name ?? e.bankName },
        `dojah-acct-${req.accountNumber.slice(-4)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyAccountNumber failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 3. AML screening — name, transaction, PEPs, sanctions
//    GET /api/v1/kyc/aml/{name-screening,transaction-screening,peps,sanctions}
// ---------------------------------------------------------------------------

export const dojahAML: IAMLProvider = {
  contract: "AML",

  async screenName(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { hit: false, matches: [], screeningId: `mock-aml-name-${Date.now()}` },
        "mock",
        400
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({
        first_name: req.firstName,
        last_name: req.lastName,
        ...(req.dateOfBirth ? { date_of_birth: req.dateOfBirth } : {}),
      }).toString();
      const { body } = await http(
        `${BASE}/kyc/aml/name-screening?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as {
        entity?: { hits?: number; matches?: Array<Record<string, unknown>>; id?: string };
        data?: { hits?: number; matches?: Array<Record<string, unknown>>; id?: string };
      };
      const e = wrapped.entity ?? wrapped.data ?? {};
      const rawMatches = (e.matches ?? []) as Array<Record<string, unknown>>;
      const matches: AMLMatch[] = rawMatches.map((m) => ({
        name: String(m.name ?? m.full_name ?? ""),
        list: String(m.list ?? m.watchlist ?? "AML"),
        country: m.country ? String(m.country) : undefined,
        score:
          typeof m.score === "number"
            ? m.score
            : typeof m.match_rate === "number"
              ? m.match_rate
              : undefined,
        position: m.position ? String(m.position) : undefined,
        matchType: m.match_type ? String(m.match_type) : undefined,
      }));
      const hit = (e.hits ?? matches.length) > 0;
      return ok(
        { hit, matches, screeningId: e.id ? String(e.id) : `dojah-aml-name-${Date.now()}` },
        "dojah-aml-name",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah AML screenName failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async screenTransaction(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { hit: false, riskScore: 12, matches: [], screeningId: `mock-aml-txn-${Date.now()}` },
        "mock",
        500
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({
        amount: String(req.amountMinor / 100),
        currency: req.currency,
        sender_name: req.senderName,
        ...(req.senderCountry ? { sender_country: req.senderCountry } : {}),
        beneficiary_name: req.beneficiaryName,
        ...(req.beneficiaryCountry ? { beneficiary_country: req.beneficiaryCountry } : {}),
      }).toString();
      const { body } = await http(
        `${BASE}/kyc/aml/transaction-screening?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as {
        entity?: {
          hits?: number;
          risk_score?: number;
          matches?: Array<Record<string, unknown>>;
          id?: string;
        };
        data?: {
          hits?: number;
          risk_score?: number;
          matches?: Array<Record<string, unknown>>;
          id?: string;
        };
      };
      const e = wrapped.entity ?? wrapped.data ?? {};
      const rawMatches = (e.matches ?? []) as Array<Record<string, unknown>>;
      const matches: AMLMatch[] = rawMatches.map((m) => ({
        name: String(m.name ?? ""),
        list: String(m.list ?? "AML"),
        country: m.country ? String(m.country) : undefined,
        score: typeof m.score === "number" ? m.score : undefined,
        matchType: m.match_type ? String(m.match_type) : undefined,
      }));
      const hit = (e.hits ?? matches.length) > 0;
      const riskScore = typeof e.risk_score === "number" ? e.risk_score : hit ? 80 : 10;
      return ok(
        {
          hit,
          riskScore,
          matches,
          screeningId: e.id ? String(e.id) : `dojah-aml-txn-${Date.now()}`,
        },
        "dojah-aml-txn",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah AML screenTransaction failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getAMLPeps(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ matches: [] }, "mock", 200);
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({
        name: req.name,
        ...(req.country ? { country: req.country } : {}),
      }).toString();
      const { body } = await http(
        `${BASE}/kyc/aml/peps?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as {
        entity?: { matches?: Array<Record<string, unknown>> };
        data?: { matches?: Array<Record<string, unknown>> };
      };
      const e = wrapped.entity ?? wrapped.data ?? {};
      const rawMatches = (e.matches ?? []) as Array<Record<string, unknown>>;
      const matches: AMLMatch[] = rawMatches.map((m) => ({
        name: String(m.name ?? m.full_name ?? ""),
        list: "PEP",
        country: m.country ? String(m.country) : undefined,
        position: m.position ? String(m.position) : m.role ? String(m.role) : undefined,
        score: typeof m.score === "number" ? m.score : undefined,
      }));
      return ok({ matches }, "dojah-aml-peps", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah AML getAMLPeps failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getAMLSanctions(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ matches: [] }, "mock", 200);
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({
        name: req.name,
        ...(req.country ? { country: req.country } : {}),
      }).toString();
      const { body } = await http(
        `${BASE}/kyc/aml/sanctions?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as {
        entity?: { matches?: Array<Record<string, unknown>> };
        data?: { matches?: Array<Record<string, unknown>> };
      };
      const e = wrapped.entity ?? wrapped.data ?? {};
      const rawMatches = (e.matches ?? []) as Array<Record<string, unknown>>;
      const matches: AMLMatch[] = rawMatches.map((m) => ({
        name: String(m.name ?? m.full_name ?? ""),
        list: String(m.list ?? m.watchlist ?? "SANCTIONS"),
        country: m.country ? String(m.country) : undefined,
        score: typeof m.score === "number" ? m.score : undefined,
      }));
      return ok({ matches }, "dojah-aml-sanctions", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah AML getAMLSanctions failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Business KYC — RC number (Nigeria CAC), TIN, business name
// ---------------------------------------------------------------------------

export const dojahBusinessKYC: IBusinessKYCProvider = {
  contract: "BUSINESS_KYC",

  async verifyRCNumber(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          verified: true,
          companyName: "Demo Company Ltd",
          address: "Victoria Island, Lagos",
          status: "ACTIVE",
          directors: ["JOHN DOE", "JANE SMITH"],
        },
        "mock",
        400
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({
        rc_number: req.rcNumber,
        ...(req.companyType ? { company_type: req.companyType } : {}),
      }).toString();
      const { body } = await http(
        `${BASE}/kyc/rc/verify?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as { entity?: Record<string, unknown> };
      const e = wrapped.entity ?? {};
      const directorsRaw = e.directors as Array<Record<string, unknown>> | undefined;
      return ok(
        {
          verified: true,
          companyName: String(e.company_name ?? e.name ?? ""),
          address: e.address ? String(e.address) : undefined,
          status: e.status ? String(e.status) : "ACTIVE",
          directors: Array.isArray(directorsRaw)
            ? directorsRaw.map((d) => String(d.name ?? d.full_name ?? ""))
            : undefined,
        },
        `dojah-rc-${req.rcNumber}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyRCNumber failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyTIN(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { verified: true, companyName: "Demo Taxpayer Ltd", tin: req.tin, status: "ACTIVE" },
        "mock",
        300
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({ tin: req.tin }).toString();
      const { body } = await http(
        `${BASE}/kyc/tin/verify?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as { entity?: Record<string, unknown> };
      const e = wrapped.entity ?? {};
      return ok(
        {
          verified: true,
          companyName: String(e.company_name ?? e.name ?? ""),
          tin: String(e.tin ?? req.tin),
          status: e.status ? String(e.status) : "ACTIVE",
        },
        `dojah-tin-${req.tin.slice(-4)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyTIN failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyBusinessName(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          verified: true,
          matches: [{ name: req.businessName, rcNumber: "RC123456", status: "ACTIVE" }],
        },
        "mock",
        350
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({ business_name: req.businessName }).toString();
      const { body } = await http(
        `${BASE}/kyc/business/name-verify?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as {
        entity?: { matches?: Array<Record<string, unknown>>; verified?: boolean };
      };
      const e = wrapped.entity ?? {};
      const rawMatches = (e.matches ?? []) as Array<Record<string, unknown>>;
      const matches: BusinessMatch[] = rawMatches.map((m) => ({
        name: String(m.company_name ?? m.name ?? ""),
        rcNumber: m.rc_number ? String(m.rc_number) : undefined,
        status: m.status ? String(m.status) : undefined,
      }));
      return ok(
        { verified: Boolean(e.verified ?? matches.length > 0), matches },
        `dojah-bn-${req.businessName.slice(0, 10).replace(/\s+/g, "-").toLowerCase()}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah verifyBusinessName failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 5. Fraud screening — phone reputation, email reputation/breach, IP risk, BIN
// ---------------------------------------------------------------------------

export const dojahFraudScreening: IFraudScreeningProvider = {
  contract: "FRAUD_SCREENING",

  async screenPhone(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { riskScore: 5, carrier: "MTN", country: "NG", ported: false, valid: true },
        "mock",
        200
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({ phone: req.phone }).toString();
      const { body } = await http(
        `${BASE}/kyc/phone/lookup?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as { entity?: Record<string, unknown> };
      const e = wrapped.entity ?? {};
      return ok(
        {
          riskScore:
            typeof e.risk_score === "number"
              ? e.risk_score
              : typeof e.fraud_score === "number"
                ? e.fraud_score
                : 10,
          carrier: e.carrier ? String(e.carrier) : e.network ? String(e.network) : undefined,
          country: e.country ? String(e.country) : undefined,
          ported: typeof e.ported === "boolean" ? e.ported : undefined,
          valid:
            typeof e.status === "string"
              ? e.status.toLowerCase() === "valid"
              : typeof e.valid === "boolean"
                ? e.valid
                : true,
        },
        `dojah-phone-${req.phone.slice(-4)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah screenPhone failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async screenEmail(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ riskScore: 8, deliverable: true, breached: false, breaches: 0 }, "mock", 200);
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({ email: req.email }).toString();
      const { body } = await http(
        `${BASE}/kyc/email/lookup?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as { entity?: Record<string, unknown> };
      const e = wrapped.entity ?? {};
      const breaches =
        typeof e.breaches === "number"
          ? e.breaches
          : Array.isArray(e.breach_list)
            ? e.breach_list.length
            : 0;
      return ok(
        {
          riskScore: typeof e.risk_score === "number" ? e.risk_score : breaches > 0 ? 60 : 10,
          deliverable:
            typeof e.deliverable === "boolean"
              ? e.deliverable
              : typeof e.deliverability === "string"
                ? e.deliverability.toLowerCase() === "delivered"
                : true,
          breached: breaches > 0,
          breaches,
        },
        `dojah-email-${req.email.split("@")[0].slice(-4)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah screenEmail failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async screenIP(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          riskScore: 5,
          country: "NG",
          city: "Lagos",
          proxy: false,
          vpn: false,
          isp: "MTN Nigeria",
        },
        "mock",
        200
      );
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({ ip: req.ip }).toString();
      const { body } = await http(
        `${BASE}/kyc/ip/lookup?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as { entity?: Record<string, unknown> };
      const e = wrapped.entity ?? {};
      return ok(
        {
          riskScore: typeof e.risk_score === "number" ? e.risk_score : 10,
          country: e.country
            ? String(e.country)
            : e.country_code
              ? String(e.country_code)
              : undefined,
          city: e.city ? String(e.city) : undefined,
          proxy:
            typeof e.is_proxy === "boolean"
              ? e.is_proxy
              : typeof e.proxy === "boolean"
                ? e.proxy
                : undefined,
          vpn:
            typeof e.is_vpn === "boolean"
              ? e.is_vpn
              : typeof e.vpn === "boolean"
                ? e.vpn
                : undefined,
          isp: e.isp ? String(e.isp) : e.org ? String(e.org) : undefined,
        },
        `dojah-ip-${req.ip.replace(/\./g, "-")}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah screenIP failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async checkBIN(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ bank: "GTBank", brand: "VISA", type: "DEBIT", country: "NG" }, "mock", 150);
    }
    if (!creds.secrets.appId || !creds.secrets.privateKey) {
      return fail("AUTH_FAILED", "Dojah appId/privateKey missing", { providerCode: CODE });
    }
    try {
      const qs = new URLSearchParams({ bin: req.bin }).toString();
      const { body } = await http(
        `${BASE}/kyc/bin/check?${qs}`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const wrapped = body as { entity?: Record<string, unknown> };
      const e = wrapped.entity ?? {};
      return ok(
        {
          bank: e.bank ? String(e.bank) : e.bank_name ? String(e.bank_name) : undefined,
          brand: e.brand ? String(e.brand) : e.card_brand ? String(e.card_brand) : undefined,
          type: e.type ? String(e.type) : e.card_type ? String(e.card_type) : undefined,
          country: e.country
            ? String(e.country)
            : e.country_code
              ? String(e.country_code)
              : undefined,
        },
        `dojah-bin-${req.bin.slice(0, 6)}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dojah checkBIN failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
