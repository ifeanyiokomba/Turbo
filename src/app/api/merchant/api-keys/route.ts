import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { randomBytes } from "crypto";

/**
 * Merchant API keys — keyed by user.id as merchantId (consumer-as-merchant).
 *
 * GET  — list the user's API keys (masked — prefix only, lastUsedAt, createdAt, revokedAt)
 * POST — generate a new API key (tp_live_ + 32-hex), scrypt-hash the full key,
 *        store prefix + hash. Returns the full key ONCE.
 */

function generateApiKey(): { full: string; prefix: string; hash: string } {
  const hex = randomBytes(16).toString("hex"); // 32 chars
  const full = `tp_live_${hex}`;
  // Prefix shown in listings: tp_live_ + first 8 chars of hex
  const prefix = `tp_live_${hex.slice(0, 8)}…`;
  const hash = hashPassword(full);
  return { full, prefix, hash };
}

export async function GET() {
  try {
    const user = await requireUser();
    const keys = await db.merchantApiKey.findMany({
      where: { merchantId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        prefix: true,
        scopesJSON: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return json({
      keys: keys.map((k) => ({
        id: k.id,
        prefix: k.prefix,
        scopes: (() => {
          try {
            const v = JSON.parse(k.scopesJSON);
            return Array.isArray(v) ? v : [];
          } catch {
            return [];
          }
        })(),
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
        active: !k.revokedAt,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { name?: string; scopes?: string[] };
    const name = String(body.name ?? "").trim().slice(0, 60);
    if (!name) {
      throw new ServiceError("Give your API key a name (e.g. 'Production webhook')", 400, "NAME_REQUIRED");
    }

    const scopesRaw = Array.isArray(body.scopes) ? body.scopes : [];
    const scopes = scopesRaw
      .map((s) => String(s).trim().toUpperCase())
      .filter((s) => ["READ", "WRITE", "PAYMENTS", "REFUNDS", "LINKS"].includes(s))
      .slice(0, 8);

    const { full, prefix, hash } = generateApiKey();

    const record = await db.merchantApiKey.create({
      data: {
        merchantId: user.id,
        keyHash: hash,
        prefix,
        scopesJSON: JSON.stringify(scopes),
      },
    });

    await audit({
      userId: user.id,
      action: "MERCHANT_API_KEY_CREATED",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { keyId: record.id, prefix, name, scopes },
    });

    // Store the human-readable name in metadata via a side-channel: prefix already
    // includes a fingerprint; we can't add a column, so we'll stash the name in
    // scopesJSON as {name, scopes} for our own GET listing. Re-encode:
    await db.merchantApiKey.update({
      where: { id: record.id },
      data: { scopesJSON: JSON.stringify({ name, scopes }) },
    });

    return json({
      key: full,
      id: record.id,
      prefix,
      name,
      scopes,
      createdAt: record.createdAt,
      warning: "Store this key securely — it will not be shown again.",
    });
  } catch (e) {
    return handleError(e);
  }
}
