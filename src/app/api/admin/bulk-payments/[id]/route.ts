// TurboCore — Bulk Payment Batch Detail + Process API
//
// POST /api/admin/bulk-payments/[id]
//   { action: "validate" } — validate all items (check account numbers, amounts)
//   { action: "process" } — start processing the batch (sends to provider)
//   { action: "cancel" } — cancel a pending batch

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const { id } = await params;
    const { db } = await import("@/lib/db");

    const batch = await db.bulkPaymentBatch.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { rowNumber: "asc" },
          take: 200,
        },
      },
    });

    if (!batch) return json({ error: "Batch not found" }, 404);

    return json({ batch });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(Permissions.PROVIDERS_MANAGE);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    const { db } = await import("@/lib/db");
    const { logger } = await import("@/lib/turbocore/omo/observability");

    const batch = await db.bulkPaymentBatch.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!batch) return json({ error: "Batch not found" }, 404);

    if (action === "validate") {
      // Validate all items
      let validCount = 0;
      let invalidCount = 0;
      const errors: string[] = [];

      for (const item of batch.items) {
        const itemErrors: string[] = [];
        if (!item.recipientName || item.recipientName.length < 2) {
          itemErrors.push("Recipient name too short");
        }
        if (item.amountMinor <= 0) {
          itemErrors.push("Amount must be positive");
        }
        if (item.amountMinor > 10_000_000_00) {
          itemErrors.push("Amount exceeds single transaction limit");
        }
        if (
          batch.paymentMethod === "BANK_TRANSFER" &&
          (!item.recipientAccount || item.recipientAccount.length < 8)
        ) {
          itemErrors.push("Invalid account number");
        }
        if (batch.paymentMethod === "BANK_TRANSFER" && !item.bankCode) {
          itemErrors.push("Bank code required");
        }
        if (batch.paymentMethod === "MOBILE_MONEY" && !item.recipientPhone) {
          itemErrors.push("Phone number required for mobile money");
        }

        if (itemErrors.length > 0) {
          await db.bulkPaymentItem.update({
            where: { id: item.id },
            data: {
              status: "FAILED",
              errorCode: "VALIDATION_ERROR",
              errorMessage: itemErrors.join("; "),
            },
          });
          invalidCount++;
          errors.push(`Row ${item.rowNumber}: ${itemErrors.join(", ")}`);
        } else {
          await db.bulkPaymentItem.update({
            where: { id: item.id },
            data: { status: "VALIDATED" },
          });
          validCount++;
        }
      }

      await db.bulkPaymentBatch.update({
        where: { id },
        data: {
          status: validCount > 0 ? "PROCESSING" : "FAILED",
          successCount: 0,
          failedCount: invalidCount,
          pendingCount: validCount,
        },
      });

      logger.info(
        "bulk-payment",
        `Batch ${batch.batchRef} validated: ${validCount} valid, ${invalidCount} invalid`,
        {
          metadata: { batchId: batch.id, validCount, invalidCount },
        }
      );

      await audit({
        userId: user.id,
        action: "BULK_PAYMENT_VALIDATED",
        category: "PAYMENTS",
        ip: getClientIp(req),
        metadata: { batchId: id, validCount, invalidCount },
      });

      return json({
        success: true,
        validCount,
        invalidCount,
        errors: errors.slice(0, 20),
        message: `Validation complete: ${validCount} valid, ${invalidCount} invalid`,
      });
    }

    if (action === "process") {
      // Start processing — in production this would call the orchestrator
      // for each item. For now, we simulate processing.
      const validItems = batch.items.filter(
        (i) => i.status === "VALIDATED" || i.status === "PENDING"
      );

      if (validItems.length === 0) {
        return json({ error: "No valid items to process" }, 400);
      }

      await db.bulkPaymentBatch.update({
        where: { id },
        data: { status: "PROCESSING", processingStartedAt: new Date() },
      });

      // Process each item (simulated — in production, calls orchestrator)
      let successCount = 0;
      let failedCount = 0;

      for (const item of validItems) {
        try {
          // Simulate provider call — 95% success rate
          const success = Math.random() > 0.05;

          if (success) {
            await db.bulkPaymentItem.update({
              where: { id: item.id },
              data: {
                status: "SUCCESS",
                providerCode: batch.providerCode ?? "turbopay",
                providerRef: `prv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                transactionId: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                processedAt: new Date(),
              },
            });
            successCount++;
          } else {
            await db.bulkPaymentItem.update({
              where: { id: item.id },
              data: {
                status: "FAILED",
                errorCode: "PROVIDER_ERROR",
                errorMessage: "Provider declined the transfer",
                processedAt: new Date(),
              },
            });
            failedCount++;
          }
        } catch {
          await db.bulkPaymentItem.update({
            where: { id: item.id },
            data: {
              status: "FAILED",
              errorCode: "PROCESSING_ERROR",
              errorMessage: "Internal error",
            },
          });
          failedCount++;
        }
      }

      const finalStatus =
        failedCount === 0 ? "COMPLETED" : successCount > 0 ? "PARTIALLY_COMPLETED" : "FAILED";

      await db.bulkPaymentBatch.update({
        where: { id },
        data: {
          status: finalStatus,
          successCount,
          failedCount,
          pendingCount: 0,
          completedAt: new Date(),
        },
      });

      logger.info(
        "bulk-payment",
        `Batch ${batch.batchRef} processed: ${successCount} success, ${failedCount} failed`,
        {
          metadata: { batchId: batch.id, successCount, failedCount, finalStatus },
        }
      );

      await audit({
        userId: user.id,
        action: "BULK_PAYMENT_PROCESSED",
        category: "PAYMENTS",
        severity: "WARN",
        ip: getClientIp(req),
        metadata: { batchId: id, successCount, failedCount, finalStatus },
      });

      return json({
        success: true,
        successCount,
        failedCount,
        status: finalStatus,
        message: `Batch ${finalStatus.toLowerCase()}: ${successCount} succeeded, ${failedCount} failed`,
      });
    }

    if (action === "cancel") {
      if (batch.status !== "PENDING") {
        return json({ error: "Can only cancel pending batches" }, 400);
      }
      await db.bulkPaymentBatch.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await audit({
        userId: user.id,
        action: "BULK_PAYMENT_CANCELLED",
        category: "PAYMENTS",
        ip: getClientIp(req),
        metadata: { batchId: id },
      });
      return json({ success: true, message: "Batch cancelled" });
    }

    return json({ error: "Invalid action. Use: validate, process, or cancel" }, 400);
  } catch (e) {
    return handleError(e);
  }
}
