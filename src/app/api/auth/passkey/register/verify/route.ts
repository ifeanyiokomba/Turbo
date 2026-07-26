// POST /api/auth/passkey/register/verify
// Body: { credential, deviceName, challengeToken }
// Verifies the WebAuthn registration response and stores a Passkey row.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, handleError, requireUser, audit, getClientIp, getUserAgent } from "@/lib/api";
import { verifyRegistrationResponse } from "@/lib/passkey";
import { consumeChallenge } from "@/lib/webauthn-challenge";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    if (!body?.credential || !body?.challengeToken) {
      return errorJson("Missing credential or challenge token", 400);
    }
    const deviceName: string | undefined =
      typeof body.deviceName === "string" ? body.deviceName.slice(0, 80) : undefined;

    const entry = consumeChallenge(body.challengeToken);
    if (!entry || entry.userId !== user.id) {
      return errorJson("Challenge expired or invalid. Please try again.", 400, "CHALLENGE_EXPIRED");
    }

    const result = await verifyRegistrationResponse({
      credential: body.credential,
      expectedChallenge: entry.challenge,
    });
    if (!result.verified || !result.registrationInfo) {
      return errorJson("We couldn't verify your passkey. Please try again.", 400, "VERIFY_FAILED");
    }
    const info = result.registrationInfo;

    // Persist the passkey (race-safe: if credentialId already exists, return conflict)
    const existing = await db.passkey.findUnique({
      where: { credentialId: info.credentialID },
      select: { id: true },
    });
    if (existing) {
      return errorJson("This passkey is already registered", 409, "DUPLICATE");
    }

    const passkey = await db.passkey.create({
      data: {
        userId: user.id,
        credentialId: info.credentialID,
        publicKey: info.credentialPublicKey,
        counter: info.counter,
        deviceName: deviceName ?? null,
        deviceType: info.credentialDeviceType || "unknown",
        transports: JSON.stringify(info.transports),
        lastUsedAt: null,
      },
    });

    await audit({
      userId: user.id,
      action: "PASSKEY_REGISTERED",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { passkeyId: passkey.id, deviceName: passkey.deviceName ?? null },
    });

    return json({ verified: true, passkey: { id: passkey.id, deviceName: passkey.deviceName } });
  } catch (e) {
    return handleError(e);
  }
}
