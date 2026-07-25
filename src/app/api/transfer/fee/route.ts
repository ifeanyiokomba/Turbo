import { json, handleError, requireUser, ServiceError } from "@/lib/api";

const BANK_FEE_KOBO = 5250; // ₦52.50
const TURBOPAY_FEE_KOBO = 0;

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") ?? "").toUpperCase();
    const amountKobo = Number(url.searchParams.get("amountKobo") ?? 0);

    if (!Number.isFinite(amountKobo) || amountKobo < 0)
      throw new ServiceError("Invalid amountKobo", 400, "INVALID_AMOUNT");

    const feeKobo = type === "BANK" ? BANK_FEE_KOBO : TURBOPAY_FEE_KOBO;
    return json({ feeKobo, type: type || "TURBOPAY" });
  } catch (e) {
    return handleError(e);
  }
}
