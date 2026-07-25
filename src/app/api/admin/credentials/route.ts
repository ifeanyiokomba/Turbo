// Turbopay admin — provider credential version management
//
// GET : list ProviderCredentialVersion rows — NEVER returns decrypted secrets.
//       Only returns metadata: providerCode, version, active, activatedAt, rotatedAt.
// POST {providerCode, secretsJSON}
//       Encrypts the secrets JSON via encryptSecret (AES-256-GCM), creates a new
//       ProviderCredentialVersion with version = previousMax + 1, atomically
//       deactivates all previous active versions, and audits. The new version's
//       plaintext secrets are NEVER returned — only the version metadata.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";
import { encryptSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await db.providerCredentialVersion.findMany({
      orderBy: [{ providerCode: "asc" }, { version: "desc" }],
    });
    return json({
      credentials: rows.map((r) => ({
        id: r.id,
        providerCode: r.providerCode,
        version: r.version,
        active: r.active,
        activatedAt: r.activatedAt,
        rotatedAt: r.rotatedAt,
        rotatedBy: r.rotatedBy,
        secretMasked: "••••••••••••",
      })),
      count: rows.length,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const providerCode = String(body.providerCode ?? "").trim().toLowerCase();
    const secretsJSON = body.secretsJSON;
    if (!providerCode) return json({ error: "providerCode is required" }, 400);
    if (!secretsJSON || typeof secretsJSON !== "object") {
      return json({ error: "secretsJSON must be a JSON object of secret key/value pairs" }, 400);
    }
    const provider = await db.providerConfig.findUnique({ where: { code: providerCode } });
    if (!provider) return json({ error: "Provider not found" }, 404);

    const plaintext = JSON.stringify(secretsJSON);
    // Quick sanity check — must round-trip parse
    try {
      JSON.parse(plaintext);
    } catch {
      return json({ error: "secretsJSON is not serializable" }, 400);
    }

    const enc = encryptSecret(plaintext);

    // Determine next version + deactivate prior in a transaction.
    const result = await db.$transaction(async (tx) => {
      const maxAgg = await tx.providerCredentialVersion.aggregate({
        where: { providerCode },
        _max: { version: true },
      });
      const nextVersion = (maxAgg._max.version ?? 0) + 1;
      await tx.providerCredentialVersion.updateMany({
        where: { providerCode, active: true },
        data: { active: false, rotatedAt: new Date(), rotatedBy: user.id },
      });
      return tx.providerCredentialVersion.create({
        data: {
          providerCode,
          version: nextVersion,
          secretsEnc: enc,
          active: true,
          rotatedBy: user.id,
          rotatedAt: new Date(),
        },
      });
    });

    await audit({
      userId: user.id,
      action: "ADMIN_CREDENTIAL_ROTATE",
      category: "ADMIN",
      severity: "CRITICAL",
      ip: getClientIp(req),
      metadata: { providerCode, version: result.version },
    });
    // NEVER return the encrypted payload back to the client.
    return json(
      {
        credential: {
          id: result.id,
          providerCode: result.providerCode,
          version: result.version,
          active: result.active,
          activatedAt: result.activatedAt,
          rotatedAt: result.rotatedAt,
        },
      },
      201,
    );
  } catch (e) {
    return handleError(e);
  }
}
