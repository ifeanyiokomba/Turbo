// TurboCore — Bulk Payment API
//
// POST /api/admin/bulk-payments — create a new bulk batch
//   Body: { name, paymentMethod, currency, items: [{recipientName, recipientAccount, bankCode, amountMinor, narration}] }
// GET  /api/admin/bulk-payments — list batches
// GET  /api/admin/bulk-payments?id=X — get single batch with items

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";
import { generateReference } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const batchId = url.searchParams.get("id");
    const { db } = await import("@/lib/db");

    if (batchId) {
      const batch = await db.bulkPaymentBatch.findUnique({
        where: { id: batchId },
        include: { items: { orderBy: { rowNumber: "asc" } } },
      });
      if (!batch) return json({ error: "Batch not found" }, 404);
      return json({ batch });
    }

    const batches = await db.bulkPaymentBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return json({ batches, count: batches.length });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.PROVIDERS_MANAGE);
    const body = await req.json().catch(() => ({}));

    const name = String(body.name ?? `Bulk Batch ${new Date().toISOString().slice(0, 10)}`);
    const paymentMethod = String(body.paymentMethod ?? "BANK_TRANSFER");
    const currency = String(body.currency ?? "NGN");
    const items: Array<{
      recipientName: string;
      recipientAccount?: string;
      bankCode?: string;
      recipientPhone?: string;
      amountMinor: number;
      narration?: string;
    }> = body.items ?? [];

    if (items.length === 0) {
      return json({ error: "At least one item is required" }, 400);
    }

    if (items.length > 10000) {
      return json({ error: "Maximum 10,000 items per batch" }, 400);
    }

    const { db } = await import("@/lib/db");
    const batchRef = generateReference("BULK");

    // Calculate totals
    const totalAmountMinor = items.reduce((sum, i) => sum + (Number(i.amountMinor) || 0), 0);

    // Create batch + items in a transaction
    const batch = await db.$transaction(async (tx) => {
      const batch = await tx.bulkPaymentBatch.create({
        data: {
          batchRef,
          userId: user.id,
          name,
          description: body.description ?? null,
          totalItems: items.length,
          totalAmountMinor,
          currency,
          paymentMethod,
          source: body.source ?? "MANUAL",
          fileName: body.fileName ?? null,
          providerCode: body.providerCode ?? null,
          pendingCount: items.length,
          status: "PENDING",
        },
      });

      // Create items
      const itemData = items.map((item, index) => ({
        batchId: batch.id,
        rowNumber: index + 1,
        recipientName: String(item.recipientName ?? ""),
        recipientAccount: item.recipientAccount ?? null,
        recipientBank: null,
        bankCode: item.bankCode ?? null,
        recipientPhone: item.recipientPhone ?? null,
        amountMinor: Number(item.amountMinor) || 0,
        currency,
        narration: item.narration ?? null,
        reference: generateReference("BLK"),
        status: "PENDING",
      }));

      await tx.bulkPaymentItem.createMany({ data: itemData });

      return batch;
    });

    await audit({
      userId: user.id,
      action: "BULK_PAYMENT_CREATED",
      category: "PAYMENTS",
      severity: "INFO",
      ip: getClientIp(req),
      metadata: {
        batchId: batch.id,
        batchRef: batch.batchRef,
        itemCount: items.length,
        totalAmountMinor,
        currency,
        paymentMethod,
      },
    });

    return json({
      success: true,
      batch,
      message: `Bulk batch created with ${items.length} items. Total: ${currency} ${(totalAmountMinor / 100).toLocaleString()}.`,
    });
  } catch (e) {
    return handleError(e);
  }
}
