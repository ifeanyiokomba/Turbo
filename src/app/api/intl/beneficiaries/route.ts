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

const COUNTRY_CODES = new Set([
  "NG", "KE", "GH", "ZA", "GB", "US", "CA", "AU", "DE", "FR", "IT", "ES", "NL", "IE", "IN", "CN", "JP", "AE",
]);

interface IntlBeneficiaryBody {
  name?: string;
  country?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  routingNumber?: string;
  mobileWallet?: string;
  currency?: string;
}

// Encode international details into the Beneficiary.bankName field as a structured string,
// since the existing schema does not have a dedicated IntlBeneficiary model.
// Format: "<bankName> | SWIFT:<swift> | IBAN:<iban> | COUNTRY:<country> | CUR:<currency> | MW:<mobileWallet>"
function encodeBankName(b: IntlBeneficiaryBody): string {
  const parts: string[] = [b.bankName || "International bank"];
  if (b.swiftCode) parts.push(`SWIFT:${b.swiftCode}`);
  if (b.iban) parts.push(`IBAN:${b.iban}`);
  if (b.country) parts.push(`COUNTRY:${b.country}`);
  if (b.currency) parts.push(`CUR:${b.currency}`);
  if (b.mobileWallet) parts.push(`MW:${b.mobileWallet}`);
  if (b.routingNumber) parts.push(`ROUTING:${b.routingNumber}`);
  return parts.join(" | ");
}

export interface DecodedIntlBeneficiary {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string;
  bankCode: string | null;
  type: string;
  isFavorite: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  country: string;
  currency: string;
  swiftCode?: string;
  iban?: string;
  routingNumber?: string;
  mobileWallet?: string;
}

export function decodeIntlBeneficiary(b: any): DecodedIntlBeneficiary {
  const decoded: DecodedIntlBeneficiary = {
    id: b.id,
    name: b.name,
    accountNumber: b.accountNumber,
    bankName: b.bankName,
    bankCode: b.bankCode,
    type: b.type,
    isFavorite: b.isFavorite,
    lastUsedAt: b.lastUsedAt,
    createdAt: b.createdAt,
    country: "",
    currency: "",
  };
  if (typeof b.bankName === "string") {
    const parts = b.bankName.split(" | ");
    // First part is the bankName
    decoded.bankName = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      const [k, v] = p.split(":");
      if (k === "SWIFT") decoded.swiftCode = v;
      else if (k === "IBAN") decoded.iban = v;
      else if (k === "COUNTRY") decoded.country = v;
      else if (k === "CUR") decoded.currency = v;
      else if (k === "MW") decoded.mobileWallet = v;
      else if (k === "ROUTING") decoded.routingNumber = v;
    }
  }
  return decoded;
}

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.beneficiary.findMany({
      where: { userId: user.id, type: "INTERNATIONAL" },
      orderBy: [{ isFavorite: "desc" }, { lastUsedAt: "desc" }],
    });
    const beneficiaries = rows.map(decodeIntlBeneficiary);
    return json({ beneficiaries });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as IntlBeneficiaryBody;

    const name = String(body.name ?? "").trim();
    const country = String(body.country ?? "").toUpperCase().trim();
    const bankName = String(body.bankName ?? "").trim();
    const accountNumber = String(body.accountNumber ?? body.iban ?? body.mobileWallet ?? "").trim();
    const currency = String(body.currency ?? "USD").toUpperCase().trim();

    if (!name) throw new ServiceError("Beneficiary name is required", 400, "MISSING_NAME");
    if (!country || !COUNTRY_CODES.has(country)) {
      throw new ServiceError("Pick a valid beneficiary country", 400, "INVALID_COUNTRY");
    }
    if (!bankName && !body.mobileWallet) {
      throw new ServiceError("Bank name is required (or mobile wallet)", 400, "MISSING_BANK");
    }
    if (!accountNumber) {
      throw new ServiceError("Account number / IBAN / mobile wallet is required", 400, "MISSING_ACCOUNT");
    }

    // Dedupe by name + accountNumber
    const existing = await db.beneficiary.findFirst({
      where: { userId: user.id, accountNumber, type: "INTERNATIONAL" },
    });
    if (existing) {
      const updated = await db.beneficiary.update({
        where: { id: existing.id },
        data: {
          name,
          bankName: encodeBankName(body),
          lastUsedAt: new Date(),
        },
      });
      return json({ beneficiary: decodeIntlBeneficiary(updated) });
    }

    const created = await db.beneficiary.create({
      data: {
        userId: user.id,
        name,
        accountNumber,
        bankName: encodeBankName(body),
        bankCode: body.swiftCode ?? null,
        type: "INTERNATIONAL",
        lastUsedAt: new Date(),
      },
    });

    await audit({
      userId: user.id,
      action: "INTL_BENEFICIARY_ADD",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { beneficiaryId: created.id, name, country, currency },
    });

    return json({ beneficiary: decodeIntlBeneficiary(created) });
  } catch (e) {
    return handleError(e);
  }
}
