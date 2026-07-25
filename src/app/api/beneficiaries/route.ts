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
import { BANKS_BY_CODE } from "@/lib/banks";

export async function GET() {
  try {
    const user = await requireUser();
    const beneficiaries = await db.beneficiary.findMany({
      where: { userId: user.id },
      orderBy: [{ isFavorite: "desc" }, { lastUsedAt: "desc" }],
    });
    return json({ beneficiaries });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const accountNumber = String(body?.accountNumber ?? "").trim();
    const bankName = String(body?.bankName ?? "").trim();
    const bankCode = body?.bankCode ? String(body.bankCode) : null;
    const type = String(body?.type ?? "BANK").toUpperCase() === "TURBOPAY" ? "TURBOPAY" : "BANK";

    if (!name) throw new ServiceError("Name is required", 400, "MISSING_NAME");
    if (!accountNumber)
      throw new ServiceError("Account number is required", 400, "MISSING_ACCOUNT");
    if (!bankName) throw new ServiceError("Bank is required", 400, "MISSING_BANK");
    if (bankCode && !BANKS_BY_CODE[bankCode])
      throw new ServiceError("Unknown bank code", 400, "UNKNOWN_BANK");

    // Dedupe: same userId + accountNumber + bankCode
    const existing = await db.beneficiary.findFirst({
      where: {
        userId: user.id,
        accountNumber,
        bankCode: bankCode ?? null,
      },
    });
    if (existing) {
      const updated = await db.beneficiary.update({
        where: { id: existing.id },
        data: { name, bankName, type, lastUsedAt: new Date() },
      });
      return json({ beneficiary: updated });
    }

    const beneficiary = await db.beneficiary.create({
      data: {
        userId: user.id,
        name,
        accountNumber,
        bankName,
        bankCode,
        type,
        lastUsedAt: new Date(),
      },
    });

    await audit({
      userId: user.id,
      action: "BENEFICIARY_ADD",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { beneficiaryId: beneficiary.id, name, type },
    });

    return json({ beneficiary });
  } catch (e) {
    return handleError(e);
  }
}
