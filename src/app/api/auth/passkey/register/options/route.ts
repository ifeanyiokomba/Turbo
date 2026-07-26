// POST /api/auth/passkey/register/options
// Generate WebAuthn registration options for the logged-in user.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";
import { generateRegistrationOptions } from "@/lib/passkey";
import { saveChallenge } from "@/lib/webauthn-challenge";

export async function POST(_req: NextRequest) {
  try {
    const user = await requireUser();

    // Exclude existing passkeys so the same device can't be registered twice
    const existing = await db.passkey.findMany({
      where: { userId: user.id },
      select: { credentialId: true },
    });

    const options = await generateRegistrationOptions({
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      excludeCredentialIds: existing.map((p) => p.credentialId),
    });

    const challengeToken = saveChallenge({
      challenge: options.challenge,
      userId: user.id,
    });

    return json({ options, challengeToken });
  } catch (e) {
    return handleError(e);
  }
}
