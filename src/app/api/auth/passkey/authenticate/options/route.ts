// POST /api/auth/passkey/authenticate/options
// Body: { username? }
// Generates WebAuthn authentication options. If a username is supplied, only that
// user's passkeys are allowed; otherwise any passkey may be used (discoverable login).

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, handleError } from "@/lib/api";
import { generateAuthenticationOptions, parseTransports } from "@/lib/passkey";
import { saveChallenge } from "@/lib/webauthn-challenge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const username: string | undefined =
      typeof body?.username === "string" && body.username.trim()
        ? body.username.trim().toLowerCase()
        : undefined;

    let allowedCredentials: { id: string; transports?: string[] }[] = [];
    let resolvedUsername: string | undefined;

    if (username) {
      // Find the user by email / phone / username
      const user =
        (await db.user.findUnique({ where: { email: username } })) ??
        (await db.user.findUnique({ where: { phone: username } })) ??
        (await db.user.findUnique({ where: { username } }));
      if (!user) {
        // Don't leak which usernames exist — return generic options
        return json({
          options: await generateAuthenticationOptions({}),
          challengeToken: saveChallenge({ challenge: "" }),
        });
      }
      if (user.status !== "ACTIVE") {
        return errorJson("Account is " + user.status.toLowerCase(), 403);
      }
      const passkeys = await db.passkey.findMany({
        where: { userId: user.id },
        select: { credentialId: true, transports: true },
      });
      if (passkeys.length === 0) {
        return errorJson("No passkey is registered for this account", 404, "NO_PASSKEY");
      }
      allowedCredentials = passkeys.map((p) => ({
        id: p.credentialId,
        transports: parseTransports(p.transports),
      }));
      resolvedUsername = user.username;
    }

    const options = await generateAuthenticationOptions({ allowedCredentials });
    const challengeToken = saveChallenge({
      challenge: options.challenge,
      username: resolvedUsername,
    });

    return json({ options, challengeToken });
  } catch (e) {
    return handleError(e);
  }
}
