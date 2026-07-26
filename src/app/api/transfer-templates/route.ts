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
    const templates = await db.transferTemplate.findMany({
      where: { userId: user.id },
      orderBy: [{ isFavorite: "desc" }, { lastUsedAt: "desc" }],
    });
    return json({ templates });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name ?? "").trim();
    const type = String(body?.type ?? "BANK").toUpperCase() === "TURBOPAY" ? "TURBOPAY" : "BANK";
    const recipientName = String(body?.recipientName ?? "").trim();
    const accountNumber = String(body?.accountNumber ?? "").trim();
    const bankCode = body?.bankCode ? String(body.bankCode) : null;
    const bankName = body?.bankName ? String(body.bankName) : null;
    const amountKobo =
      body?.amountKobo == null || body?.amountKobo === ""
        ? null
        : Math.round(Number(body.amountKobo));
    const note = body?.note ? String(body.note).trim().slice(0, 100) : null;
    const isFavorite = Boolean(body?.isFavorite ?? false);

    if (!name) throw new ServiceError("Template name is required", 400, "MISSING_NAME");
    if (!recipientName)
      throw new ServiceError("Recipient name is required", 400, "MISSING_RECIPIENT");
    if (!accountNumber)
      throw new ServiceError("Account number is required", 400, "MISSING_ACCOUNT");
    if (type === "BANK") {
      if (!bankCode) throw new ServiceError("Bank code is required for bank templates", 400, "MISSING_BANK_CODE");
      if (!BANKS_BY_CODE[bankCode])
        throw new ServiceError("Unknown bank code", 400, "UNKNOWN_BANK");
    }
    if (amountKobo !== null) {
      if (!Number.isFinite(amountKobo) || amountKobo < 0)
        throw new ServiceError("Invalid amount", 400, "INVALID_AMOUNT");
    }

    // Dedupe by name (per user) — keep template names unique so "Use" UI stays clear
    const existingByName = await db.transferTemplate.findFirst({
      where: { userId: user.id, name },
    });
    if (existingByName) {
      const updated = await db.transferTemplate.update({
        where: { id: existingByName.id },
        data: {
          type,
          recipientName,
          accountNumber,
          bankCode,
          bankName,
          amountKobo,
          note,
          isFavorite,
          lastUsedAt: new Date(),
        },
      });
      return json({ template: updated });
    }

    const template = await db.transferTemplate.create({
      data: {
        userId: user.id,
        name,
        type,
        recipientName,
        accountNumber,
        bankCode,
        bankName,
        amountKobo,
        note,
        isFavorite,
        lastUsedAt: new Date(),
      },
    });

    await audit({
      userId: user.id,
      action: "TRANSFER_TEMPLATE_CREATE",
      category: "TRANSFER",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { templateId: template.id, name, type },
    });

    return json({ template });
  } catch (e) {
    return handleError(e);
  }
}
