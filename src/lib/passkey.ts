// Turbopay — WebAuthn (Passkey) server helpers
// Wraps @simplewebauthn/server v13 with Turbopay-specific config.

import {
  generateRegistrationOptions as srvGenReg,
  verifyRegistrationResponse as srvVerifyReg,
  generateAuthenticationOptions as srvGenAuth,
  verifyAuthenticationResponse as srvVerifyAuth,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";

// RP ID: in dev -> "localhost"; in prod -> hostname of NEXT_PUBLIC_APP_URL
export function getRpID(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "localhost";
    }
  }
  return "localhost";
}

// Expected origin: full URL (http://localhost:3000 in dev)
export function getExpectedOrigin(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) return url;
  return "http://localhost:3000";
}

/** Generate registration options for a logged-in user adding a new passkey. */
export async function generateRegistrationOptions(opts: {
  userId: string;
  userEmail: string | null;
  userName: string;
  excludeCredentialIds?: string[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return srvGenReg({
    rpName: "Turbopay",
    rpID: getRpID(),
    userName: opts.userEmail ?? opts.userName,
    userID: Buffer.from(opts.userId, "utf8"),
    userDisplayName: opts.userName,
    attestationType: "none",
    excludeCredentials: (opts.excludeCredentialIds ?? []).map((id) => ({
      id,
      type: "public-key",
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      // Prefer platform authenticators (Face ID / Touch ID / fingerprint)
      authenticatorAttachment: "platform",
    },
    supportedAlgorithmIDs: [-8, -7, -257],
  });
}

/** Verify a registration response from the browser; returns credential info to store. */
export async function verifyRegistrationResponse(opts: {
  credential: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin?: string;
  expectedRPID?: string;
}): Promise<{
  verified: boolean;
  registrationInfo?: {
    credentialID: string; // base64url
    credentialPublicKey: string; // base64
    counter: number;
    credentialDeviceType: string;
    transports: string[];
  };
}> {
  const result = await srvVerifyReg({
    response: opts.credential,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: opts.expectedOrigin ?? getExpectedOrigin(),
    expectedRPID: opts.expectedRPID ?? getRpID(),
    requireUserVerification: false,
  });
  if (!result.verified || !result.registrationInfo) {
    return { verified: false };
  }
  const info = result.registrationInfo;
  // v13: credential is a WebAuthnCredential with id, publicKey (Uint8Array), counter
  const credId = info.credential.id;
  const pubKey = info.credential.publicKey;
  return {
    verified: true,
    registrationInfo: {
      credentialID: credId,
      // Encode raw bytes to base64 (not base64url) for storage
      credentialPublicKey: Buffer.from(pubKey).toString("base64"),
      counter: info.credential.counter,
      credentialDeviceType: info.credentialDeviceType,
      transports: Array.from(info.credential.transports ?? []),
    },
  };
}

/** Generate authentication options (for login). Optionally restrict to a user's credentials. */
export async function generateAuthenticationOptions(opts: {
  allowedCredentials?: { id: string; transports?: string[] }[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return srvGenAuth({
    rpID: getRpID(),
    allowCredentials: (opts.allowedCredentials ?? []).map((c) => ({
      id: c.id,
      transports: c.transports as any,
    })),
    userVerification: "preferred",
    timeout: 60_000,
  });
}

/** Verify an authentication response; returns updated counter. */
export async function verifyAuthenticationResponse(opts: {
  credential: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin?: string;
  expectedRPID?: string;
  authenticator: {
    credentialID: string;
    credentialPublicKey: string; // base64
    counter: number;
  };
}): Promise<{ verified: boolean; authenticationInfo?: { newCounter: number } }> {
  const credential: WebAuthnCredential = {
    id: opts.authenticator.credentialID,
    publicKey: Uint8Array.from(Buffer.from(opts.authenticator.credentialPublicKey, "base64")),
    counter: opts.authenticator.counter,
  };
  const result = await srvVerifyAuth({
    response: opts.credential,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: opts.expectedOrigin ?? getExpectedOrigin(),
    expectedRPID: opts.expectedRPID ?? getRpID(),
    credential,
    requireUserVerification: false,
  });
  if (!result.verified) return { verified: false };
  return {
    verified: true,
    authenticationInfo: { newCounter: result.authenticationInfo.newCounter },
  };
}

/** Convert stored transports JSON string -> array. */
export function parseTransports(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Browser support flag (server-side cannot detect; here for completeness). */
export function isWebAuthnAvailableServerSide(): boolean {
  return true; // always enabled on the server; client gates the UI
}
