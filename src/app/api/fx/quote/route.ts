import {
  json,
  handleError,
  requireUser,
  ServiceError,
} from "@/lib/api";
import { getQuote } from "@/lib/turbocore/fx/convert";

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const from = String(url.searchParams.get("from") ?? "").toUpperCase();
    const to = String(url.searchParams.get("to") ?? "").toUpperCase();
    const amountMinor = Math.round(Number(url.searchParams.get("amountMinor") ?? "0"));

    if (!from || !to) {
      throw new ServiceError(
        "Both 'from' and 'to' currency params are required",
        400,
        "MISSING_PARAMS",
      );
    }
    if (from.length !== 3 || to.length !== 3) {
      throw new ServiceError(
        "Currency codes must be 3 letters (ISO 4217)",
        400,
        "INVALID_CURRENCY",
      );
    }
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new ServiceError(
        "amountMinor must be a positive integer (minor units)",
        400,
        "INVALID_AMOUNT",
      );
    }

    const quote = await getQuote({ from, to, amountMinor });
    return json({ quote });
  } catch (e) {
    return handleError(e);
  }
}
