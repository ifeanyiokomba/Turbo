// TurboCore — provider credential resolver.
// Reads the active ProviderCredentialVersion row for a provider, decrypts its
// `secretsEnc` JSON blob via decryptSecret() from @/lib/auth, and returns the
// plaintext secrets object (e.g. { secretKey, publicKey }).
//
// Memoized at module scope for 5 minutes per provider code so we don't hit the
// DB on every adapter call. Also surfaces the ProviderConfig.sandbox flag so
// adapters can switch base URLs.
//
// SECURITY: never logs secrets; never returns the encrypted blob; the cache
// holds plaintext only in memory for the lifetime of the process.

import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/auth";

export interface ProviderCredentials {
  /** providerCode lowercased, e.g. "paystack" */
  code: string;
  /** decrypted secret map (e.g. { secretKey: "sk_live_..." }) */
  secrets: Record<string, string>;
  /** sandbox toggle from ProviderConfig.sandbox — defaults true if no row */
  sandbox: boolean;
  /** display name from ProviderConfig (fallbacks to code) */
  displayName: string;
}

interface CacheEntry {
  creds: ProviderCredentials | null;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

/** In-flight dedupe — concurrent callers share the same promise. */
const inflight = new Map<string, Promise<ProviderCredentials | null>>();

/**
 * Resolve the active credentials for a provider.
 *
 * Returns `null` when:
 *   - no ProviderCredentialVersion row exists with active=true, OR
 *   - decryption fails (treated as misconfigured).
 *
 * Adapters should treat `null` as "unconfigured" — in non-prod they fall back
 * to mock behaviour, in prod they return `fail("AUTH_FAILED", ...)`.
 */
export async function getCredentials(
  providerCode: string,
): Promise<ProviderCredentials | null> {
  const code = providerCode.toLowerCase();

  // Cache hit (still within TTL)?
  const cached = cache.get(code);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.creds;
  }

  // Dedupe concurrent calls for the same code.
  const existing = inflight.get(code);
  if (existing) return existing;

  const p = (async (): Promise<ProviderCredentials | null> => {
    try {
      const [credRow, configRow] = await Promise.all([
        db.providerCredentialVersion.findFirst({
          where: { providerCode: code, active: true },
          orderBy: { version: "desc" },
          select: { secretsEnc: true, version: true },
        }),
        db.providerConfig.findUnique({
          where: { code },
          select: { sandbox: true, displayName: true },
        }),
      ]);

      if (!credRow || !credRow.secretsEnc) {
        const result: ProviderCredentials | null = null;
        cache.set(code, { creds: result, fetchedAt: Date.now() });
        return result;
      }

      let plaintext: string;
      try {
        plaintext = decryptSecret(credRow.secretsEnc);
      } catch {
        // Decryption failure means the TURBOPAY_CARD_KEY env var changed or
        // the row was tampered with. Treat as unconfigured rather than throw.
        const result: ProviderCredentials | null = null;
        cache.set(code, { creds: result, fetchedAt: Date.now() });
        return result;
      }

      let secrets: Record<string, string>;
      try {
        const parsed = JSON.parse(plaintext);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          secrets = {};
          for (const [k, v] of Object.entries(parsed)) {
            secrets[k] = typeof v === "string" ? v : String(v ?? "");
          }
        } else {
          secrets = {};
        }
      } catch {
        secrets = {};
      }

      const creds: ProviderCredentials = {
        code,
        secrets,
        sandbox: configRow?.sandbox ?? true,
        displayName: configRow?.displayName ?? code,
      };
      cache.set(code, { creds, fetchedAt: Date.now() });
      return creds;
    } catch {
      // DB error, network blip, etc. — don't crash the adapter; treat as
      // unconfigured so the mock fallback kicks in (non-prod) or AUTH_FAILED
      // surfaces (prod). The cache stays empty so the next call retries.
      return null;
    } finally {
      inflight.delete(code);
    }
  })();

  inflight.set(code, p);
  return p;
}

/**
 * Drop a provider's cached credentials. Call after a credential rotation so
 * the next adapter call picks up the new version immediately.
 */
export function invalidateCredentials(providerCode: string): void {
  cache.delete(providerCode.toLowerCase());
}

/**
 * Read a single named secret from the decrypted map. Returns "" if missing.
 * Adapters should prefer this over reaching into `secrets` directly so the
 * access pattern is uniform and easy to audit.
 */
export function secret(
  creds: ProviderCredentials | null,
  key: string,
): string | null {
  if (!creds) return null;
  const v = creds.secrets[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
