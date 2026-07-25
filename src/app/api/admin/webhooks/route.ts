// Turbopay admin — webhook events + endpoints management
//
// GET : list last 50 inbound WebhookEvent rows (provider, eventType, signatureValid,
//       processedAt, transactionId) + all WebhookEndpoint rows.
// POST {merchantId, url, events}
//       Creates a new WebhookEndpoint. Generates a fresh random secret via
//       crypto.randomBytes, stores it hashed (scrypt), returns the plaintext
//       secret ONCE in the response (so the operator can copy it to the merchant's
//       webhook configuration). Subsequent GETs never return the plaintext.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";
import { randomBytes, scryptSync } from "crypto";

export const dynamic = "force-dynamic";

function hashSecret(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const providerCode = url.searchParams.get("providerCode");
    const eventsWhere: Record<string, string> = {};
    if (providerCode) eventsWhere.providerCode = providerCode;

    const [events, endpoints] = await Promise.all([
      db.webhookEvent.findMany({
        where: eventsWhere,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.webhookEndpoint.findMany({
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return json({
      events: events.map((e) => ({
        id: e.id,
        providerCode: e.providerCode,
        eventId: e.eventId,
        eventType: e.eventType,
        signatureValid: e.signatureValid,
        processedAt: e.processedAt,
        transactionId: e.transactionId,
        payloadPreview:
          e.payloadJSON && e.payloadJSON.length > 0
            ? e.payloadJSON.slice(0, 200)
            : "",
        createdAt: e.createdAt,
      })),
      endpoints: endpoints.map((ep) => ({
        id: ep.id,
        merchantId: ep.merchantId,
        url: ep.url,
        eventsJSON: ep.eventsJSON,
        enabled: ep.enabled,
        lastFailedAt: ep.lastFailedAt,
        consecutiveFailures: ep.consecutiveFailures,
        createdAt: ep.createdAt,
        updatedAt: ep.updatedAt,
        secretMasked: "whsec_••••••••",
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const merchantId = String(body.merchantId ?? "").trim();
    const url = String(body.url ?? "").trim();
    const eventsArr = Array.isArray(body.events) ? body.events : [];
    if (!merchantId || !url) {
      return json({ error: "merchantId and url are required" }, 400);
    }
    if (!/^https?:\/\//i.test(url)) {
      return json({ error: "url must start with http:// or https://" }, 400);
    }
    const secret = "whsec_" + randomBytes(24).toString("hex");
    const secretHash = hashSecret(secret);
    const eventsJSON = JSON.stringify(eventsArr);

    const endpoint = await db.webhookEndpoint.create({
      data: {
        merchantId,
        url,
        secretHash,
        eventsJSON,
        enabled: true,
      },
    });
    await audit({
      userId: user.id,
      action: "ADMIN_WEBHOOK_ENDPOINT_CREATE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { merchantId, url, events: eventsArr },
    });
    // Return the plaintext secret ONCE — caller must persist it elsewhere.
    return json(
      {
        endpoint: {
          id: endpoint.id,
          merchantId: endpoint.merchantId,
          url: endpoint.url,
          eventsJSON: endpoint.eventsJSON,
          enabled: endpoint.enabled,
          createdAt: endpoint.createdAt,
        },
        secret, // plaintext — shown once
      },
      201,
    );
  } catch (e) {
    return handleError(e);
  }
}
