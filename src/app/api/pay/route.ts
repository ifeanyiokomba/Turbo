import { NextRequest } from "next/server";
import { json, handleError, requireUser, errorJson } from "@/lib/api";
import { pay } from "@/lib/turbopay/pay";
import { z } from "zod";

const paySchema = z.object({
  type: z.enum([
    "TRANSFER",
    "AIRTIME",
    "DATA",
    "BILL",
    "CARD_FUND",
    "CARD_WITHDRAW",
    "MOBILE_MONEY",
    "INTERNATIONAL",
    "PAYMENT_LINK",
    "MERCHANT",
    "SAVINGS",
    "INVESTMENT",
  ]),
  amountKobo: z.number().positive(),
  pin: z.string().min(4).max(4),
  currency: z.string().optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  recipient: z
    .object({
      type: z.string().optional(),
      identifier: z.string().optional(),
      bankCode: z.string().optional(),
      bankName: z.string().optional(),
      name: z.string().optional(),
      country: z.string().optional(),
      currency: z.string().optional(),
    })
    .optional(),
  billerCode: z.string().optional(),
  billerName: z.string().optional(),
  customerRef: z.string().optional(),
  network: z.string().optional(),
  planCode: z.string().optional(),
  cardId: z.string().optional(),
  productId: z.string().optional(),
  note: z.string().optional(),
  reference: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const parsed = paySchema.safeParse(body);
    if (!parsed.success) return errorJson(parsed.error.issues[0].message, 422);
    const result = await pay({ ...parsed.data, userId: user.id });
    return json(result, result.success ? 200 : 400);
  } catch (e) {
    return handleError(e);
  }
}
