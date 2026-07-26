// POST /api/auth/passkey/authenticate/verify
// Body: { credential, challengeToken, username? }
// Verifies the WebAuthn authentication response, looks up the Passkey by
// credentialId, updates the counter, creates a session, and returns the public user.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { verifyAuthenticationResponse, parseTransports } from "@/lib/passkey";
import { consumeChallenge } from "@/lib/webauthn-challenge";
import { createSession } from "@/lib/session";

function publicUser(u: any) {
  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    phone: u.phone,
    country: u.country,
    role: u.role,
    kycTier: u.kycTier,
    kycStatus: u.kycStatus,
    status: u.status,
    emailVerified: u.emailVerified,
    avatarUrl: u.avatarUrl,
    hasPin: !!u.transactionPinHash,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.credential || !body?.challengeToken) {
      return errorJson("Missing credential or challenge token", 400);
    }
    const credential = body.credential;
    const challengeToken = body.challengeToken;

    const entry = consumeChallenge(challengeToken);
    if (!entry || !entry.challenge) {
      return errorJson("Challenge expired or invalid. Please try again.", 400, "CHALLENGE_EXPIRED");
    }

    // If username was anchored to the challenge, ensure the credential belongs to that user
    // by looking up the passkey first, then verifying ownership.
    const credentialId: string = credential?.id;
    if (!credentialId) {
      return errorJson("Malformed credential", 400);
    }

    const passkey = await db.passkey.findUnique({
      where: { credentialId },
    });
    if (!passkey) {
      return errorJson("Passkey not recognized", 401, "UNKNOWN_PASSKEY");
    }
    const user = await db.user.findUnique({ where: { id: passkey.userId } });
    if (!user) {
      return errorJson("Account not found", 401, "USER_NOT_FOUND");
    }
    if (user.status !== "ACTIVE") {
      return errorJson("Account is " + user.status.toLowerCase(), 403);
    }

    // Optional: anchor username → user match check
    if (entry.username && entry.username !== user.username) {
      return errorJson("Credential does not match the provided user", 401, "USER_MISMATCH");
    }

    const result = await verifyAuthenticationResponse({
      credential,
      expectedChallenge: entry.challenge,
      authenticator: {
        credentialID: passkey.credentialId,
        credentialPublicKey: passkey.publicKey,
        counter: passkey.counter,
      },
    });
    if (!result.verified || !result.authenticationInfo) {
      return errorJson("Passkey verification failed", 401, "VERIFY_FAILED");
    }

    // Update counter (replay protection)
    await db.passkey.update({
      where: { id: passkey.id },
      data: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });

    // Reset login fail counters
    await db.user.update({
      where: { id: user.id },
      data: { loginFailCount: 0, loginLockedUntil: null },
    });

    await createSession({ userId: user.id, ip: getClientIp(req), userAgent: getUserAgent(req) });
    await audit({
      userId: user.id,
      action: "PASSKEY_LOGIN",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { passkeyId: passkey.id, deviceName: passkey.deviceName ?? null },
    });

    return json({ user: publicUser(user) });
  } catch (e) {
    return handleError(e);
  }
}
