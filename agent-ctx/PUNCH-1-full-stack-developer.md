# Task PUNCH-1 — RBAC system (full-stack-developer)

> Builds the complete RBAC (Role-Based Access Control) layer for TurboPay:
> 10 roles × 60 granular permissions, `requirePermission()` guard, applied to
> 12 admin routes, plus a premium "Roles & Permissions" admin tab.

## What was built

### 1. RBAC foundation — `src/lib/turbocore/rbac/`

**`permissions.ts`** — 60 granular permissions as `Permissions` const +
`Permission` type. Dotted `<domain>:<action>` strings:
- USERS_VIEW / USERS_MANAGE / USERS_FREEZE / USERS_CLOSE
- TX_VIEW_ALL / TX_REVERSE / TX_EXPORT
- PROVIDERS_VIEW / PROVIDERS_MANAGE / PROVIDERS_CREDENTIALS / PROVIDERS_HEALTH / PROVIDERS_CIRCUIT_RESET
- ROUTING_VIEW / ROUTING_MANAGE
- CAPABILITIES_VIEW / CAPABILITIES_MANAGE
- COMPLIANCE_VIEW / COMPLIANCE_MANAGE / COMPLIANCE_CASES
- AML_VIEW / AML_MANAGE / SANCTIONS_SCREEN / STR_GENERATE
- KYC_VIEW / KYC_REVIEW / KYC_APPROVE
- FINANCE_VIEW / FINANCE_RECONCILIATION / FINANCE_SETTLEMENTS / FEES_MANAGE / FX_MANAGE
- WEBHOOKS_VIEW / WEBHOOKS_MANAGE
- FLAGS_VIEW / FLAGS_MANAGE
- CONFIG_VIEW / CONFIG_MANAGE / CONFIG_ROLLBACK
- TEAM_VIEW / TEAM_MANAGE / TEAM_INVITE
- AUDIT_VIEW / AUDIT_EXPORT
- SUPPORT_VIEW / SUPPORT_MANAGE
- ANALYTICS_VIEW / ANALYTICS_EXPORT
- MONITORING_VIEW
- CARDS_VIEW / CARDS_MANAGE
- SAVINGS_VIEW / SAVINGS_MANAGE / INVESTMENTS_VIEW / INVESTMENTS_MANAGE
- VOUCHERS_VIEW / VOUCHERS_MANAGE

Plus `PERMISSION_CATEGORIES` (18 visual groups) and `TOTAL_PERMISSIONS`.

**`roles.ts`** — 10 roles, each with a non-empty permission list:
- `SUPER_ADMIN` → ALL permissions (master escalation role)
- `ADMINISTRATOR` → ALL except `CONFIG_ROLLBACK`
- `FINANCE_OFFICER` → finance/recon/settlements/fees/fx/tx-view/tx-export/analytics/audit
- `COMPLIANCE_OFFICER` → compliance/aml/sanctions/str/kyc-review-approve/users-view/tx-view/audit
- `SUPPORT_OFFICER` → users-view/tx-view/support-view-manage/kyc-view/compliance-view
- `OPERATIONS_OFFICER` → users-view-manage/providers-view-health/routing-view/capabilities-view/webhooks-view/monitoring/audit
- `RISK_OFFICER` → aml-view-manage/compliance-view-cases/sanctions/tx-view/users-view/monitoring/audit
- `DEVELOPER` → providers-view-health/circuit-reset/config-view/flags-view-manage/monitoring/audit
- `AUDITOR` → audit-view-export/tx-view-export/users-view/providers-view/config-view/compliance-view/finance-view/analytics-view
- `READONLY_ANALYST` → analytics-view-export/tx-view/users-view/providers-view/monitoring/audit

Plus `ROLE_META` (label/description/tone/admin flag) for the UI.

**`index.ts`** — runtime guards:
- `hasPermission(role, perm)` — pure check; legacy "ADMIN" role gets implicit full grant for backward compat
- `hasAnyPermission(role, perms)` — OR over a list
- `getUserPermissions(role)` — full grant for a role
- `requirePermission(perm)` — async guard (session + active + permission); throws ServiceError(403, INSUFFICIENT_PERMISSIONS) on denial; returns the User row
- `requireAnyPermission(perms)` — async OR variant
- Re-exports `Permissions`/`Roles`/etc. for a single import point

### 2. RBAC applied to 12 admin routes

| Route | GET | POST |
|---|---|---|
| `/api/admin` | MONITORING_VIEW | — |
| `/api/admin/transactions` | TX_VIEW_ALL | — |
| `/api/admin/audit` | AUDIT_VIEW | — |
| `/api/admin/capabilities` | CAPABILITIES_VIEW | CAPABILITIES_MANAGE |
| `/api/admin/config-history` | CONFIG_VIEW | CONFIG_ROLLBACK |
| `/api/admin/health` | PROVIDERS_HEALTH | — |
| `/api/admin/providers` | PROVIDERS_VIEW | PROVIDERS_MANAGE |
| `/api/admin/credentials` | PROVIDERS_CREDENTIALS | PROVIDERS_CREDENTIALS |
| `/api/admin/compliance` | COMPLIANCE_VIEW | — |
| `/api/admin/feature-flags` | FLAGS_VIEW | FLAGS_MANAGE |
| `/api/admin/team` | TEAM_VIEW | TEAM_INVITE |
| `/api/admin/vouchers` | VOUCHERS_VIEW | VOUCHERS_MANAGE |

`requireAdmin()` left untouched in `lib/api.ts` for backward compat. Legacy
"ADMIN" users continue to pass every `requirePermission()` check via the
implicit-full-grant rule in `hasPermission`.

### 3. RBAC management UI — `src/components/turbopay/views/admin/roles-tab.tsx`

Premium "Roles & Permissions" tab wired as the 15th admin tab:
- **Hero card** — current user's role, description, effective permission count
  with gradient progress bar (emerald → amber).
- **Role picker grid** — 5/3/2/1 columns responsive; each card shows label,
  colored badge, description, "X of Y" count + %, mini progress bar, "You"
  pill if it's the current user's role.
- **Search** — filters roles + permissions by string match.
- **Detail panel** — selected role's permission grid grouped by all 18
  categories; each permission card shows green CheckCircle2 (granted) or muted
  XCircle (denied) + monospace permission string + Tooltip.
- **Footer legend** + Copy role key button (clipboard).

### 4. Admin tab wiring — `src/components/turbopay/views/admin.tsx`

- Imported `RolesTab` from `./admin/roles-tab`.
- Added `ShieldCheck` to the lucide-react import list.
- Added 15th `TabsTrigger value="roles"` ("Roles" with ShieldCheck icon).
- Added matching `TabsContent` rendering `<RolesTab />`.

## Conventions

- All RBAC source-of-truth files live in `src/lib/turbocore/rbac/`.
- `requirePermission()` uses `getSession()` from `@/lib/session` (no new auth flow).
- Every role resolves to a non-empty permission list (no zero-access roles).
- SUPER_ADMIN = all permissions (master escalation).
- New role literals are app-level — `User.role` is a free-form String, so
  assigning `role = "FINANCE_OFFICER"` requires no schema migration.
- No `db:push` run. No test files created.

## Lint / typecheck

- `bun run lint` on my files: 0 errors, 0 warnings.
  (Pre-existing error in `airtel-money/route.ts` and pre-existing warning in
  `transfer.tsx` are NOT my files — left untouched.)
- `tsc --noEmit` on my files: 0 errors.
  (Pre-existing errors in `lib/ledger.ts`, `lib/minipay.ts`, `turbocore/orchestrator.ts`,
  `turbocore/providers/paga.adapter.ts`, `views/settings.tsx`, `views/transfer.tsx`,
  `app-shell.tsx` are NOT my files.)

## Files

### Created
- `src/lib/turbocore/rbac/permissions.ts`
- `src/lib/turbocore/rbac/roles.ts`
- `src/lib/turbocore/rbac/index.ts`
- `src/components/turbopay/views/admin/roles-tab.tsx`

### Modified (RBAC applied)
- `src/app/api/admin/route.ts`
- `src/app/api/admin/transactions/route.ts`
- `src/app/api/admin/audit/route.ts`
- `src/app/api/admin/capabilities/route.ts`
- `src/app/api/admin/config-history/route.ts`
- `src/app/api/admin/health/route.ts`
- `src/app/api/admin/providers/route.ts`
- `src/app/api/admin/credentials/route.ts`
- `src/app/api/admin/compliance/route.ts`
- `src/app/api/admin/feature-flags/route.ts`
- `src/app/api/admin/team/route.ts`
- `src/app/api/admin/vouchers/route.ts`

### Modified (UI wiring)
- `src/components/turbopay/views/admin.tsx`

## Git note

All my files were committed in `470c79f` by parallel Task PUNCH-3 due to a
`git add -A` race (same situation R2-A faced earlier). Worklog + this agent-ctx
file document my task ID + file list explicitly.
