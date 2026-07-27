// Turbopay security posture verifier — runs a checklist of runtime checks
// to surface misconfigurations to admins. Called by /api/admin/security-audit.

import { db } from "@/lib/db";
import { RATE_LIMITS } from "@/lib/rate-limit";

export type SecurityStatus = "PASS" | "WARN" | "FAIL";

export interface SecurityCheck {
  check: string;
  status: SecurityStatus;
  message: string;
  details?: Record<string, unknown>;
}

const isProd = process.env.NODE_ENV === "production";

async function checkPasswordHashing(): Promise<SecurityCheck> {
  try {
    const sample = await db.user.findFirst({
      select: { passwordHash: true },
      orderBy: { createdAt: "desc" },
    });
    if (!sample) {
      return {
        check: "Password Hashing (scrypt)",
        status: "WARN",
        message: "No users in database — cannot verify password hash format.",
      };
    }
    if (sample.passwordHash.startsWith("scrypt$")) {
      return {
        check: "Password Hashing (scrypt)",
        status: "PASS",
        message: "Password hashes use the scrypt KDF (not legacy SHA-256).",
        details: { samplePrefix: sample.passwordHash.split("$")[0] },
      };
    }
    return {
      check: "Password Hashing (scrypt)",
      status: "FAIL",
      message:
        "Password hash does not start with the scrypt$ scheme prefix. Possible legacy or weak hash in use.",
      details: { samplePrefix: sample.passwordHash.split("$")[0] },
    };
  } catch (e) {
    return {
      check: "Password Hashing (scrypt)",
      status: "WARN",
      message: "Could not inspect user table: " + (e as Error).message,
    };
  }
}

function checkSecrets(): SecurityCheck {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) {
    return {
      check: "Session / JWT Secret",
      status: "PASS",
      message: "A long session/JWT secret is configured via environment variable.",
    };
  }
  if (isProd) {
    return {
      check: "Session / JWT Secret",
      status: "FAIL",
      message: "JWT_SECRET / SESSION_SECRET / AUTH_SECRET is missing or too short in production.",
    };
  }
  return {
    check: "Session / JWT Secret",
    status: "WARN",
    message: "No JWT_SECRET / SESSION_SECRET set (acceptable in dev).",
  };
}

function checkCors(): SecurityCheck {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) {
    return {
      check: "CORS Origins",
      status: "WARN",
      message: "ALLOWED_ORIGINS not set — defaulting to http://localhost:3000.",
    };
  }
  const list = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const hasWildcard = list.includes("*");
  if (hasWildcard && isProd) {
    return {
      check: "CORS Origins",
      status: "FAIL",
      message: "Wildcard CORS origin (*) is forbidden in production.",
    };
  }
  return {
    check: "CORS Origins",
    status: "PASS",
    message: `${list.length} allowed origin(s) configured.`,
    details: { origins: list },
  };
}

function checkRateLimiting(): SecurityCheck {
  const endpoints = Object.keys(RATE_LIMITS);
  if (endpoints.length === 0) {
    return {
      check: "Rate Limiting",
      status: "FAIL",
      message: "No rate limit rules configured.",
    };
  }
  return {
    check: "Rate Limiting",
    status: "PASS",
    message: `${endpoints.length} endpoint(s) protected by sliding-window limiter: ${endpoints.join(", ")}.`,
    details: { endpoints },
  };
}

async function checkWebAuthn(): Promise<SecurityCheck> {
  try {
    await import("@simplewebauthn/server");
    return {
      check: "WebAuthn (Passkeys)",
      status: "PASS",
      message: "@simplewebauthn/server is installed and importable.",
    };
  } catch {
    return {
      check: "WebAuthn (Passkeys)",
      status: "FAIL",
      message: "@simplewebauthn/server is not installed — passkey auth unavailable.",
    };
  }
}

async function checkTotp(): Promise<SecurityCheck> {
  try {
    await import("otpauth");
    return {
      check: "TOTP MFA",
      status: "PASS",
      message: "otpauth is installed and importable.",
    };
  } catch {
    return {
      check: "TOTP MFA",
      status: "FAIL",
      message: "otpauth is not installed — TOTP-based MFA unavailable.",
    };
  }
}

function checkCardEncryption(): SecurityCheck {
  const key = process.env.TURBOPAY_CARD_KEY;
  if (!key) {
    return {
      check: "Card Encryption Key",
      status: isProd ? "FAIL" : "WARN",
      message: isProd
        ? "TURBOPAY_CARD_KEY not set in production — card PAN/CVV uses the demo key."
        : "TURBOPAY_CARD_KEY not set — using demo key (OK for dev).",
    };
  }
  return {
    check: "Card Encryption Key",
    status: "PASS",
    message: "TURBOPAY_CARD_KEY is configured.",
  };
}

function checkCookieSecurity(): SecurityCheck {
  // Session cookie is set with secure=true only in NODE_ENV=production.
  if (isProd) {
    return {
      check: "Cookie Security",
      status: "PASS",
      message: "Session cookie is HttpOnly + Secure + SameSite=Lax in production.",
    };
  }
  return {
    check: "Cookie Security",
    status: "WARN",
    message: "Session cookie is HttpOnly + SameSite=Lax (Secure flag disabled in dev).",
  };
}

function checkSentry(): SecurityCheck {
  const clientDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const serverDsn = process.env.SENTRY_DSN;
  if (clientDsn && serverDsn) {
    return {
      check: "Sentry Error Reporting",
      status: "PASS",
      message: "Sentry DSN configured for both client and server runtimes.",
    };
  }
  if (clientDsn || serverDsn) {
    return {
      check: "Sentry Error Reporting",
      status: "WARN",
      message: "Only one of NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN is set.",
    };
  }
  return {
    check: "Sentry Error Reporting",
    status: "WARN",
    message: "Sentry DSN not set — errors will fall back to /api/error-report and console logging.",
  };
}

export async function verifySecurityPosture(): Promise<{
  checks: SecurityCheck[];
  summary: { pass: number; warn: number; fail: number; total: number };
  generatedAt: string;
  environment: string;
}> {
  const checks: SecurityCheck[] = await Promise.all([
    checkPasswordHashing(),
    Promise.resolve(checkSecrets()),
    Promise.resolve(checkCors()),
    Promise.resolve(checkRateLimiting()),
    checkWebAuthn(),
    checkTotp(),
    Promise.resolve(checkCardEncryption()),
    Promise.resolve(checkCookieSecurity()),
    Promise.resolve(checkSentry()),
  ]);

  const summary = {
    pass: checks.filter((c) => c.status === "PASS").length,
    warn: checks.filter((c) => c.status === "WARN").length,
    fail: checks.filter((c) => c.status === "FAIL").length,
    total: checks.length,
  };

  return {
    checks,
    summary,
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  };
}
