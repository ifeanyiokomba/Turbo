import { db } from "@/lib/db";
import { json, handleError, requireUser, ServiceError } from "@/lib/api";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const link = await db.paymentLink.findFirst({
      where: { id, merchantId: user.id },
    });
    if (!link) {
      throw new ServiceError("Payment link not found", 404, "NOT_FOUND");
    }

    const payments = await db.paymentLinkPayment.findMany({
      where: { paymentLinkId: link.id },
      orderBy: { createdAt: "desc" },
    });

    return json({ link, payments });
  } catch (e) {
    return handleError(e);
  }
}
