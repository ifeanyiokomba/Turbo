// Turbopay — NDPR / GDPR right-to-erasure (account deletion).
//
// POST /api/settings/delete-account
//   body: { password: string, confirmText: string }
//
// Flow:
//   1. requireUser — must be ACTIVE.
//   2. verifyPassword(password, user.passwordHash) — defence against
//      session-hijack → delete attacks.
//   3. confirmText must equal "DELETE MY ACCOUNT" — typed confirmation.
//   4. Anonymize the User row (NOT delete — we need the row for FK
//      integrity on transactions / ledger entries / audit logs):
//        fullName="Deleted User", email=null, phone=null,
//        username=`deleted_${userId.slice(0,8)}`, passwordHash=random,
//        status="CLOSED", bio=null, avatarUrl=null, bvn=null, nin=null.
//   5. Revoke all sessions (Session.revokedAt = now) so any other
//      device is signed out immediately.
//   6. Freeze the wallet (status="FROZEN") so no further movement is
//      possible even if a stale session somehow survives.
//   7. KEEP all Transaction / LedgerEntry / AuditLog / etc. records —
//      CBN AML regulations require 5+ years of transaction history
//      retention. The User FK on those rows is now pointing at an
//      anonymized stub, which is the regulatory-compliant way to do
//      "right to erasure" for a financial institution.
//   8. audit({action:"ACCOUNT_DELETED", category:"AUTH", severity:"CRITICAL"}).
//   9. destroySession() — clears the cookie.
//
// Returns { ok: true } on success.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
} from "@/lib/api";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { destroySession } from "@/lib/session";
import { z } from "zod";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const CONFIRM_PHRASE = "DELETE MY ACCOUNT";

const schema = z.object({
  password: z.string().min(1, "Password is required"),
  confirmText: z.string().min(1, "Confirmation phrase is required"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? "Invalid input", 400, "VALIDATION");
    }
    const { password, confirmText } = parsed.data;

    // 1. Password re-auth.
    if (!verifyPassword(password, user.passwordHash)) {
      await audit({
        userId: user.id,
        action: "ACCOUNT_DELETE_FAILED",
        category: "AUTH",
        severity: "WARN",
        ip,
        userAgent: ua,
        metadata: { reason: "invalid-password" },
      });
      return errorJson("Incorrect password", 401, "INVALID_PASSWORD");
    }

    // 2. Typed confirmation.
    if (confirmText.trim() !== CONFIRM_PHRASE) {
      return errorJson(
        `Type "${CONFIRM_PHRASE}" exactly to confirm`,
        400,
        "CONFIRM_MISMATCH",
      );
    }

    // 3. Anonymize the User row. The username must remain unique so we
    //    prefix with `deleted_` and the leading 8 chars of the cuid.
    const deletedUsername = `deleted_${user.id.slice(0, 8)}`;
    // Random password hash so even the user can never log back in to
    // this stub account.
    const randomPasswordHash = hashPassword(randomBytes(32).toString("hex"));

    // Uniqueness: if a previous deletion left a stub with this username
    // (extremely unlikely — userId is a cuid), make this one unique.
    let finalUsername = deletedUsername;
    const existing = await db.user.findUnique({ where: { username: deletedUsername } });
    if (existing && existing.id !== user.id) {
      finalUsername = `${deletedUsername}_${Date.now().toString(36)}`;
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        fullName: "Deleted User",
        email: null,
        phone: null,
        username: finalUsername,
        passwordHash: randomPasswordHash,
        transactionPinHash: null,
        status: "CLOSED",
        bio: null,
        avatarUrl: null,
        bvn: null,
        nin: null,
        pinSetAt: null,
        pinFailCount: 0,
        pinLockedUntil: null,
        loginFailCount: 0,
        loginLockedUntil: null,
        emailVerified: false,
        phoneVerified: false,
      },
    });

    // 4. Revoke all sessions for this user.
    await db.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 5. Freeze the wallet (if it exists). `requireUser` doesn't include
    //    the wallet relation, so we use updateMany which is a no-op if
    //    no row matches.
    await db.wallet.updateMany({
      where: { userId: user.id },
      data: { status: "FROZEN" },
    });

    // 6. Audit the deletion (CRITICAL severity). We log BEFORE
    //    destroySession so the userId is still resolvable.
    await audit({
      userId: user.id,
      action: "ACCOUNT_DELETED",
      category: "AUTH",
      severity: "CRITICAL",
      ip,
      userAgent: ua,
      metadata: {
        reason: "user-requested-erasure",
        anonymizedTo: finalUsername,
      },
    });

    // 7. Destroy the current session cookie.
    await destroySession();

    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
