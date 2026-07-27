// Account-name resolution endpoint.
//
// Two flows:
//   1. Bank account resolution — when `bankCode` is provided:
//        - Try the Paystack adapter's resolveAccountName() (which hits
//          Paystack's /bank/resolve endpoint) via the provider registry.
//        - If Paystack is not configured (no credentials) OR the registry
//          cannot resolve it, fall back to a deterministic mock name derived
//          from a hash of the account number.
//        - Response: { name, type: "BANK", accountNumber, bankName, source }
//          where source ∈ "paystack" | "mock".
//   2. Turbopay user resolution — when no `bankCode` is provided, the query
//      is matched against virtual accounts / username / email / phone.

import { db } from "@/lib/db";
import { json, handleError, requireUser, ServiceError } from "@/lib/api";
import { BANKS_BY_CODE } from "@/lib/banks";
import { registry } from "@/lib/turbocore/registry";
import type { IBankTransferProvider } from "@/lib/turbocore/contracts";
import "@/lib/turbocore/providers"; // side-effect: registers adapters in the registry

interface ResolveResponse {
  name: string;
  type: "TURBOPAY" | "BANK";
  accountNumber?: string;
  bankName?: string;
  username?: string;
  source?: "paystack" | "mock";
}

// Deterministic mock name from a seed string. Used when Paystack is not
// configured or the upstream resolution fails — keeps the demo UX useful
// without leaking wrong names.
function mockBankName(seed: string): string {
  const names = [
    "JOHN DOE",
    "MARY JANE",
    "CHIKA OBIAJULU",
    "ADEKUNLE BELLO",
    "FATIMA ABUBAKAR",
    "EMEKA NWANKWO",
    "GRACE OKAFOR",
    "TUNDE BALOGUN",
    "NUHU SANI",
    "BOLA AHMED",
    "IFENYI OKOYE",
    "ZAINAB YUSUF",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return names[hash % names.length];
}

// Resolve the account holder name via the Paystack adapter (registered as the
// BANK_TRANSFER contract provider "paystack"). Returns:
//   { ok: true, name, bankName }       — when Paystack resolves successfully
//   { ok: false }                      — when no creds, registry miss, or upstream error
async function resolveViaPaystack(
  accountNumber: string,
  bankCode: string,
  country: string
): Promise<{ ok: true; name: string; bankName: string } | { ok: false }> {
  try {
    const adapter = await registry.resolve<IBankTransferProvider>("BANK_TRANSFER", "paystack");
    if (!adapter?.resolveAccountName) return { ok: false };
    const result = await adapter.resolveAccountName({
      accountNumber,
      bankCode,
      country,
    });
    if (!result.ok || !result.data?.accountName) return { ok: false };
    return {
      ok: true,
      name: result.data.accountName,
      bankName: result.data.bankName ?? "",
    };
  } catch {
    return { ok: false };
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const query = (url.searchParams.get("query") ?? "").trim();
    const bankCode = (url.searchParams.get("bankCode") ?? "").trim();

    if (!query) throw new ServiceError("Query is required", 400, "MISSING_QUERY");
    if (query.length < 3) throw new ServiceError("Query is too short", 400, "QUERY_TOO_SHORT");

    // Branch 1 — bank account resolution
    if (bankCode) {
      const bank = BANKS_BY_CODE[bankCode];
      if (!bank) throw new ServiceError("Unknown bank code", 400, "UNKNOWN_BANK");
      if (!/^\d{6,10}$/.test(query))
        throw new ServiceError("Account number must be 6–10 digits", 400, "INVALID_ACCOUNT");

      const country = user.country || "NG";

      // Try Paystack first.
      const ps = await resolveViaPaystack(query, bankCode, country);
      if (ps.ok) {
        const result: ResolveResponse = {
          name: ps.name,
          type: "BANK",
          accountNumber: query,
          bankName: ps.bankName || bank.name,
          source: "paystack",
        };
        return json(result);
      }

      // Fall back to deterministic mock name.
      const result: ResolveResponse = {
        name: mockBankName(query + bankCode),
        type: "BANK",
        accountNumber: query,
        bankName: bank.name,
        source: "mock",
      };
      return json(result);
    }

    // Branch 2 — Turbopay user resolution by username/phone/email/virtualAccount
    const byAccount = await db.virtualAccount.findUnique({
      where: { accountNumber: query },
      include: { user: true },
    });
    if (byAccount?.user) {
      const result: ResolveResponse = {
        name: byAccount.user.fullName,
        type: "TURBOPAY",
        accountNumber: byAccount.accountNumber,
        username: byAccount.user.username,
      };
      return json(result);
    }

    const userRow = await db.user.findFirst({
      where: {
        OR: [{ username: query }, { email: query }, { phone: query }],
      },
    });
    if (userRow) {
      const result: ResolveResponse = {
        name: userRow.fullName,
        type: "TURBOPAY",
        username: userRow.username,
      };
      return json(result);
    }

    throw new ServiceError(
      "No Turbopay user found. Check the username, phone, email or account number.",
      404,
      "RECIPIENT_NOT_FOUND"
    );
  } catch (e) {
    return handleError(e);
  }
}
