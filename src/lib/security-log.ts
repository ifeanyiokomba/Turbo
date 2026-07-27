// Turbopay — security event logger.
//
// Thin wrapper around `audit()` that ensures consistent `category: "SECURITY"`
// + structured event types for security-relevant actions. Use this anywhere
// you log a LOGIN / LOGOUT / MFA / PASSKEY / DEVICE / OAUTH / SUSPICIOUS event
// so the Security Center can filter + report uniformly.
//
// Usage:
//   await logSecurityEvent({
//     userId: user.id,
//     type: "LOGIN_SUCCESS",
//     ip,
//     userAgent: ua,
//     metadata: { method: "password" },
//   });
//
// Event type catalogue:
//   LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, SESSION_EXPIRED
//   PASSKEY_REGISTERED, PASSKEY_USED, PASSKEY_DELETED
//   MFA_ENABLED, MFA_DISABLED, MFA_FAILED
//   PASSWORD_CHANGED, PASSWORD_RESET
//   DEVICE_TRUSTED, DEVICE_REVOKED
//   OAUTH_LINKED, OAUTH_UNLINKED
//   SUSPICIOUS_ACTIVITY, RATE_LIMITED
//   ADMIN_LOGIN, ADMIN_ACCESS_DENIED

import { audit } from "@/lib/api";

export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SESSION_EXPIRED"
  | "PASSKEY_REGISTERED"
  | "PASSKEY_USED"
  | "PASSKEY_DELETED"
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "MFA_FAILED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "DEVICE_TRUSTED"
  | "DEVICE_REVOKED"
  | "OAUTH_LINKED"
  | "OAUTH_UNLINKED"
  | "SUSPICIOUS_ACTIVITY"
  | "RATE_LIMITED"
  | "ADMIN_LOGIN"
  | "ADMIN_ACCESS_DENIED";

export interface LogSecurityEventOpts {
  userId?: string;
  type: SecurityEventType;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  /** Defaults to "INFO". Use "WARN" for failures, "CRITICAL" for security threats. */
  severity?: "INFO" | "WARN" | "ERROR" | "CRITICAL";
}

/** Default severity per event type — callers can override. */
const DEFAULT_SEVERITY: Record<SecurityEventType, "INFO" | "WARN" | "ERROR" | "CRITICAL"> = {
  LOGIN_SUCCESS: "INFO",
  LOGIN_FAILED: "WARN",
  LOGOUT: "INFO",
  SESSION_EXPIRED: "INFO",
  PASSKEY_REGISTERED: "INFO",
  PASSKEY_USED: "INFO",
  PASSKEY_DELETED: "WARN",
  MFA_ENABLED: "INFO",
  MFA_DISABLED: "WARN",
  MFA_FAILED: "WARN",
  PASSWORD_CHANGED: "INFO",
  PASSWORD_RESET: "WARN",
  DEVICE_TRUSTED: "INFO",
  DEVICE_REVOKED: "WARN",
  OAUTH_LINKED: "INFO",
  OAUTH_UNLINKED: "WARN",
  SUSPICIOUS_ACTIVITY: "CRITICAL",
  RATE_LIMITED: "WARN",
  ADMIN_LOGIN: "INFO",
  ADMIN_ACCESS_DENIED: "CRITICAL",
};

/**
 * Log a security event with `category: "SECURITY"` and a structured type.
 * Falls through to `audit()` (which is best-effort — failures are swallowed
 * so they never break the caller's flow).
 */
export async function logSecurityEvent(opts: LogSecurityEventOpts): Promise<void> {
  await audit({
    userId: opts.userId,
    action: opts.type,
    category: "SECURITY",
    severity: opts.severity ?? DEFAULT_SEVERITY[opts.type],
    ip: opts.ip,
    userAgent: opts.userAgent,
    metadata: opts.metadata,
  });
}
