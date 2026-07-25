// TurboCore — Termii notification adapter (SMS / WhatsApp / Voice OTP).
//
// Implements 1 contract:
//   - termiiNotification (INotificationProvider)
//
// Base URL: https://api.termii.com/api (sandbox: same host with test api_key).
// Auth: `api_key` in the request body (Termii's auth model is body-based, not
// header-based).
//
// Endpoints:
//   - SMS send: POST /sms/send with body { to, from, sms, api_key, type,
//     channel }
//   - WhatsApp: POST /sms/send/wa (or /whatsapp/send)
//   - Delivery status: GET /sms/${messageId}?api_key=…
//
// Secrets expected: { "apiKey": "...", "senderId": "TURBOPAY" }

import { ok, fail } from "../result";
import type { INotificationProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";

const CODE = "termii";
const BASE = "https://api.termii.com/api";

export const termiiNotification: INotificationProvider = {
  contract: "NOTIFICATION",

  async send(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ messageId: `termii-mock-${Date.now()}`, status: "sent" }, "mock", 30);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    const senderId = creds.secrets.senderId ?? "TURBOPAY";

    try {
      // Pick endpoint based on channel
      let endpoint = `${BASE}/sms/send`;
      const body: Record<string, unknown> = {
        to: req.to,
        from: senderId,
        sms: req.body,
        api_key: apiKey,
        type: "plain",
        channel: "generic",
      };
      if (req.channel === "WHATSAPP") {
        endpoint = `${BASE}/sms/send/wa`;
        body.channel = "whatsapp";
      } else if (req.channel === "PUSH") {
        // Termii's "In-app" messaging via /sms/send with channel "dnd" fallback
        body.channel = "dnd";
      }
      if (req.subject) {
        body.sms = `${req.subject}\n${req.body}`;
      }
      const { body: resp } = await http(
        endpoint,
        { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { message_id?: string; messageId?: string; data?: { message_id?: string }; status?: string });
      const messageId = data.message_id ?? data.messageId ?? data.data?.message_id ?? `termii-${Date.now()}`;
      return ok({ messageId, status: "sent" }, messageId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii send failed";
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
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/sms/${encodeURIComponent(messageId)}?api_key=${encodeURIComponent(apiKey)}`,
        { method: "GET", headers: { Accept: "application/json" } },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string; delivered_at?: string; data?: { status?: string; delivered_at?: string } });
      const status = (data.status ?? data.data?.status ?? "pending").toLowerCase();
      const deliveredAt = data.delivered_at ?? data.data?.delivered_at;
      return ok({ status, deliveredAt }, messageId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii getDeliveryStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
