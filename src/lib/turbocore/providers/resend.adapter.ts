// TurboCore — Resend notification adapter (transactional email).
//
// Implements 1 contract:
//   - resendNotification (INotificationProvider)
//
// Base URL: https://api.resend.com (sandbox: same host with test API key
// `re_…_test_…`).
// Auth: `Authorization: Bearer ${apiKey}`.
//
// Endpoints:
//   - Send: POST /emails with body { from, to, subject, html, text? }
//   - Status: GET /emails/:id
//
// Only the EMAIL channel is supported — SMS / PUSH / WHATSAPP are rejected
// with NOT_SUPPORTED so callers can route to a different notification
// provider (e.g. Termii) for those channels.
//
// Secrets expected: { "apiKey": "re_...", "from": "Turbopay <no-reply@turbopay.ng>" }

import { ok, fail } from "../result";
import type { INotificationProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";

const CODE = "resend";
const BASE = "https://api.resend.com";

const DEFAULT_FROM = "Turbopay <no-reply@turbopay.ng>";

export const resendNotification: INotificationProvider = {
  contract: "NOTIFICATION",

  async send(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ messageId: `resend-mock-${Date.now()}`, status: "sent" }, "mock", 30);
    }
    if (req.channel !== "EMAIL") {
      return fail("NOT_SUPPORTED", `Resend only supports EMAIL (got ${req.channel})`, { providerCode: CODE });
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    const from = creds.secrets.from ?? DEFAULT_FROM;

    try {
      const { body } = await http(
        `${BASE}/emails`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            from,
            to: req.to,
            subject: req.subject ?? "Turbopay notification",
            html: req.body,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; message?: string });
      const messageId = data.id ?? `resend-${Date.now()}`;
      return ok({ messageId, status: "sent" }, messageId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend send failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getDeliveryStatus(messageId) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "delivered", deliveredAt: new Date().toISOString() }, "mock", 10);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/emails/${encodeURIComponent(messageId)}`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string; created_at?: string; sent_at?: string; delivered_at?: string });
      // Resend statuses: queued | sent | delivered | bounced | complained
      return ok(
        { status: (data.status ?? "queued").toLowerCase(), deliveredAt: data.delivered_at ?? data.sent_at },
        messageId,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend getDeliveryStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
