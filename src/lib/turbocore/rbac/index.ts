// TurboPay RBAC — runtime guard functions.
//
//   hasPermission(role, perm)     → boolean (pure check, no I/O)
//   hasAnyPermission(role, perms)  → boolean (OR over a list)
//   getUserPermissions(role)       → Permission[] (the full grant for a role)
//   requirePermission(perm)        → Promise<User> (authenticates + enforces)
//
// `requirePermission` is the primary entry point used by admin API routes:
//
//   import { requirePermission } from "@/lib/turbocore/rbac";
//   import { Permissions } from "@/lib/turbocore/rbac/permissions";
//
//   export async function GET() {
//     try {
//       const user = await requirePermission(Permissions.USERS_VIEW);
//       ...
//     } catch (e) { return handleError(e); }
//   }
//
// Legacy compatibility:
//   The DB `User.role` column is a free-form String. The original codebase
//   used "USER" | "ADMIN" only and `requireAdmin()` checked role === "ADMIN".
//   To stay backward-compatible, `requirePermission` ALSO grants access when
//   `user.role === "ADMIN"` (legacy admins implicitly have every admin
//   permission). New roles ("SUPER_ADMIN", "FINANCE_OFFICER", etc.) are
//   resolved through ROLE_PERMISSIONS.

import { getSession } from "@/lib/session";
import { ServiceError } from "@/lib/api";
import type { User } from "@prisma/client";
import type { Permission } from "./permissions";
import { Permissions } from "./permissions";
import { ROLE_PERMISSIONS, type Role } from "./roles";

/** The legacy admin role literal — implicit full access for backward compat. */
const LEGACY_ADMIN_ROLE = "ADMIN";

/**
 * Returns true if `userRole` grants `permission`.
 *
 * Resolves to true when either:
 *   - userRole is the legacy "ADMIN" (implicit admin escalation), OR
 *   - userRole is one of the new Role literals and ROLE_PERMISSIONS grants
 *     the requested permission.
 *
 * Unknown / unrecognised roles resolve to false (deny by default).
 */
export function hasPermission(userRole: string, permission: Permission): boolean {
  if (userRole === LEGACY_ADMIN_ROLE) return true;
  const granted = ROLE_PERMISSIONS[userRole as Role];
  if (!granted) return false;
  return granted.includes(permission);
}

/**
 * Returns true if `userRole` grants ANY of the supplied permissions.
 * Useful for routes that accept multiple permissions ("view OR manage").
 */
export function hasAnyPermission(userRole: string, permissions: Permission[]): boolean {
  if (permissions.length === 0) return false;
  return permissions.some((p) => hasPermission(userRole, p));
}

/**
 * Returns the full permission list granted to `userRole`.
 * For the legacy "ADMIN" role, returns every permission (implicit escalation).
 * For unknown roles, returns an empty array.
 */
export function getUserPermissions(userRole: string): Permission[] {
  if (userRole === LEGACY_ADMIN_ROLE) return Object.values(Permissions);
  return ROLE_PERMISSIONS[userRole as Role] ?? [];
}

/**
 * Authenticates the current session and asserts that the user has
 * `permission`. Returns the authenticated user on success; throws a
 * `ServiceError(403, "Insufficient permissions")` otherwise.
 *
 * Throws:
 *   - 401 UNAUTHENTICATED — no session
 *   - 403 ACCOUNT_INACTIVE — user is FROZEN / SUSPENDED / CLOSED
 *   - 403 INSUFFICIENT_PERMISSIONS — authenticated but lacks the permission
 */
export async function requirePermission(permission: Permission): Promise<User> {
  const session = await getSession();
  if (!session) {
    throw new ServiceError("Authentication required", 401, "UNAUTHENTICATED");
  }
  if (session.user.status !== "ACTIVE") {
    throw new ServiceError(
      "Account is " + session.user.status.toLowerCase(),
      403,
      "ACCOUNT_INACTIVE"
    );
  }
  if (!hasPermission(session.user.role, permission)) {
    throw new ServiceError(
      "Insufficient permissions: requires " + permission,
      403,
      "INSUFFICIENT_PERMISSIONS"
    );
  }
  return session.user;
}

/**
 * Authenticates the current session and asserts that the user has ANY of the
 * supplied permissions. Returns the authenticated user on success.
 */
export async function requireAnyPermission(permissions: Permission[]): Promise<User> {
  const session = await getSession();
  if (!session) {
    throw new ServiceError("Authentication required", 401, "UNAUTHENTICATED");
  }
  if (session.user.status !== "ACTIVE") {
    throw new ServiceError(
      "Account is " + session.user.status.toLowerCase(),
      403,
      "ACCOUNT_INACTIVE"
    );
  }
  if (!hasAnyPermission(session.user.role, permissions)) {
    throw new ServiceError(
      "Insufficient permissions: requires one of " + permissions.join(", "),
      403,
      "INSUFFICIENT_PERMISSIONS"
    );
  }
  return session.user;
}

// Re-export the catalogue + role maps so callers can import everything from
// a single entry point: `import { Permissions, Roles, requirePermission } from "@/lib/turbocore/rbac"`.
export * from "./permissions";
export * from "./roles";
