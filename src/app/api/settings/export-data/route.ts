// Turbopay — NDPR / GDPR data export.
//
// GET /api/settings/export-data
//
// Returns the authenticated user's complete data as a downloadable JSON
// file. Sensitive fields are masked or stripped:
//   - passwordHash / transactionPinHash / tokenHash — never exported.
//   - VirtualCard PAN/CVV — only the masked "•••• 4242" form is sent.
//   - Session tokenHash — stripped; only metadata (UA/IP/createdAt) is kept.
//   - KYC payload (raw NIN/BVN submission) — included but the BVN/NIN
//     fields on the User row are masked to last-4.
//
// Triggers an audit log entry of category=AUTH, action=DATA_EXPORT so
// compliance can prove we honoured a data-portability request.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { json, handleError, requireUser, audit, getClientIp, getUserAgent } from "@/lib/api";

export const dynamic = "force-dynamic";

function mask(value: string | null | undefined, keepLast = 4): string | null {
  if (!value) return null;
  if (value.length <= keepLast) return "•".repeat(value.length);
  return "•".repeat(value.length - keepLast) + value.slice(-keepLast);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    // Pull every record that references this user. We run them in
    // parallel for speed — the export is bounded by the user's own
    // activity volume so it's cheap in practice.
    const [
      wallet,
      transactions,
      ledgerEntries,
      virtualAccounts,
      virtualCards,
      beneficiaries,
      billPayments,
      airtimePurchases,
      savingsTransactions,
      savingsGoals,
      userInvestments,
      kycVerifications,
      auditLogs,
      notifications,
      supportTickets,
      disputes,
      disputeMessages,
      voucherRedemptions,
      scheduledPayments,
      sessions,
      paymentLinks,
      paymentLinkPayments,
      celoWallet,
      onchainTxs,
      celoBridgeEvents,
      badges,
      budgets,
      transferTemplates,
      amlFlags,
    ] = await Promise.all([
      db.wallet.findUnique({ where: { userId: user.id } }),
      db.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5000 }),
      db.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5000 }),
      db.virtualAccount.findMany({ where: { userId: user.id } }),
      db.virtualCard.findMany({ where: { userId: user.id } }),
      db.beneficiary.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.billPayment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 2000 }),
      db.airtimeDataPurchase.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 2000 }),
      db.savingsTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5000 }),
      db.savingsGoal.findMany({ where: { userId: user.id } }),
      db.userInvestment.findMany({ where: { userId: user.id } }),
      db.kycVerification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.auditLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5000 }),
      db.inAppNotification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
      db.supportTicket.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.dispute.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.disputeMessage.findMany({ where: { senderId: user.id }, orderBy: { createdAt: "desc" } }),
      db.voucherRedemption.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.scheduledPayment.findMany({ where: { userId: user.id }, orderBy: { nextRunAt: "asc" } }),
      db.session.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.paymentLink.findMany({ where: { merchantId: user.id }, orderBy: { createdAt: "desc" } }),
      db.paymentLinkPayment.findMany({ where: { payerEmail: user.email ?? "" }, orderBy: { createdAt: "desc" } }),
      db.celoWallet.findUnique({ where: { userId: user.id } }),
      db.onChainTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 2000 }),
      db.celoBridgeEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.userBadge.findMany({ where: { userId: user.id } }),
      db.spendingBudget.findMany({ where: { userId: user.id } }),
      db.transferTemplate.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.amlFlag.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    ]);

    // Profile (mask BVN/NIN to last-4; drop password/PIN hashes).
    const profile = {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      phone: user.phone,
      country: user.country,
      role: user.role,
      status: user.status,
      kycTier: user.kycTier,
      kycStatus: user.kycStatus,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      bvnMasked: mask(user.bvn),
      ninMasked: mask(user.nin),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Virtual cards: drop panEnc/cvvEnc entirely; keep only masked PAN.
    const cards = virtualCards.map((c) => ({
      id: c.id,
      panMasked: c.panMasked,
      last4: c.last4,
      expiry: c.expiry,
      cardholder: c.cardholder,
      brand: c.brand,
      balanceKobo: c.balanceKobo,
      status: c.status,
      spendingLimitKobo: c.spendingLimitKobo,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    // Sessions: drop tokenHash entirely.
    const sessionsExport = sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
    }));

    const payload = {
      meta: {
        exportedAt: new Date().toISOString(),
        platform: "Turbopay",
        schema: "ndpr-data-export/v1",
        userId: user.id,
        note:
          "This file contains all personal data Turbopay holds about you. " +
          "Sensitive credentials (password hashes, PIN hashes, session tokens, " +
          "full card PANs/CVCs) are excluded. BVN/NIN are masked to last 4 digits.",
      },
      profile,
      wallet,
      transactions,
      ledgerEntries,
      virtualAccounts,
      virtualCards: cards,
      beneficiaries,
      billPayments,
      airtimePurchases,
      savingsTransactions,
      savingsGoals,
      userInvestments,
      kycVerifications,
      auditLogs,
      notifications,
      supportTickets,
      disputes,
      disputeMessages,
      voucherRedemptions,
      scheduledPayments,
      sessions: sessionsExport,
      paymentLinks,
      paymentLinkPayments,
      celoWallet,
      onchainTransactions: onchainTxs,
      celoBridgeEvents,
      badges,
      budgets,
      transferTemplates,
      amlFlags,
    };

    await audit({
      userId: user.id,
      action: "DATA_EXPORT",
      category: "AUTH",
      ip,
      userAgent: ua,
      metadata: {
        txCount: transactions.length,
        ledgerCount: ledgerEntries.length,
        cardsCount: cards.length,
      },
    });

    const filename = `turbopay-data-export-${user.id}.json`;
    const body = JSON.stringify(payload, null, 2);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

// `json` is imported for parity with other routes but the success path
// returns a raw NextResponse with file-download headers.
void json;
