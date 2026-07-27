// TurboCore — Termii notification + OTP adapter (SMS / WhatsApp / Voice / Email).
//
// Implements 2 contracts + 1 extension:
//   - termiiNotification (INotificationProvider extended) — SMS send, status,
//     plus voice, WhatsApp, sender IDs, templates
//   - termiiOTP          (IOTPProvider)                  — send/verify OTP,
//     voice OTP, WhatsApp OTP
//
// Base URL: https://api.termii.com/api (sandbox: same host with test api_key).
// Auth: `api_key` in the request body (Termii's auth model is body-based, not
// header-based).
//
// Endpoints:
//   - SMS send:        POST /sms/send with { to, from, sms, api_key, type, channel }
//   - WhatsApp send:   POST /sms/send/wa
//   - Voice send:      POST /sms/voice
//   - OTP send:        POST /sms/otp/send
//   - OTP verify:      POST /sms/otp/verify
//   - Voice OTP:       POST /sms/otp/voice
//   - WhatsApp OTP:    POST /sms/otp/whatsapp
//   - Sender ID req:   POST /sender-id/request
//   - Sender IDs list: GET  /sender-id?api_key=
//   - Template add:    POST /templates/add
//   - Template list:   GET  /templates?api_key=
//   - Template send:   POST /sms/template/send
//   - Delivery status: GET  /sms/${messageId}?api_key=
//
// Secrets expected: { "apiKey": "...", "senderId": "TURBOPAY" }

import { ok, fail } from "../result";
import type { ProviderResult } from "../result";
import type { INotificationProvider, IOTPProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";

const CODE = "termii";
const BASE = "https://api.termii.com/api";

// ---------------------------------------------------------------------------
// Termii Notification — SMS/WhatsApp/Voice + Sender IDs + Templates
// (INotificationProvider + extension methods)
// ---------------------------------------------------------------------------

export interface TermiiNotificationExtensions {
  sendVoice(req: { to: string; message: string }): Promise<ProviderResult<{ messageId: string; status: string }>>;
  sendWhatsApp(req: { to: string; message: string; messageType?: string }): Promise<ProviderResult<{ messageId: string; status: string }>>;
  requestSenderID(req: { senderId: string; company: string; usecase: string }): Promise<ProviderResult<{ senderId: string; status: string }>>;
  listSenderIDs(): Promise<ProviderResult<{ senderIds: Array<{ senderId: string; status: string }> }>>;
  addTemplate(req: { name: string; template: string }): Promise<ProviderResult<{ templateId: string; status: string }>>;
  listTemplates(): Promise<ProviderResult<{ templates: Array<{ id: string; name: string; template: string }> }>>;
  sendTemplate(req: { to: string; templateId: string; data?: Record<string, string> }): Promise<ProviderResult<{ messageId: string; status: string }>>;
}

export const termiiNotification: INotificationProvider & TermiiNotificationExtensions = {
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

  async sendVoice(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ messageId: `termii-voice-mock-${Date.now()}`, status: "sent" }, "mock", 60);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body: resp } = await http(
        `${BASE}/sms/voice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ to: req.to, message: req.message, api_key: apiKey }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { message_id?: string; data?: { message_id?: string }; code?: string });
      const messageId = data.message_id ?? data.data?.message_id ?? `termii-voice-${Date.now()}`;
      return ok({ messageId, status: "sent" }, messageId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii sendVoice failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async sendWhatsApp(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ messageId: `termii-wa-mock-${Date.now()}`, status: "sent" }, "mock", 60);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body: resp } = await http(
        `${BASE}/sms/whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            to: req.to,
            message: req.message,
            message_type: req.messageType ?? "text",
            api_key: apiKey,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { message_id?: string; data?: { message_id?: string } });
      const messageId = data.message_id ?? data.data?.message_id ?? `termii-wa-${Date.now()}`;
      return ok({ messageId, status: "sent" }, messageId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii sendWhatsApp failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async requestSenderID(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ senderId: req.senderId, status: "pending" }, "mock", 80);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body: resp } = await http(
        `${BASE}/sender-id/request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            sender_id: req.senderId,
            company: req.company,
            usecase: req.usecase,
            api_key: apiKey,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { data?: { sender_id?: string; status?: string }; status?: string });
      return ok(
        { senderId: data.data?.sender_id ?? req.senderId, status: data.data?.status ?? data.status ?? "pending" },
        `termii-senderid-${req.senderId}`,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii requestSenderID failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listSenderIDs() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ senderIds: [{ senderId: "TURBOPAY", status: "active" }] }, "mock", 50);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/sender-id?api_key=${encodeURIComponent(apiKey)}`,
        { method: "GET", headers: { Accept: "application/json" } },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Array<{ sender_id?: string; sender_name?: string; status?: string }> });
      const senderIds = (data.data ?? []).map((s) => ({
        senderId: s.sender_id ?? s.sender_name ?? "",
        status: (s.status ?? "active").toLowerCase(),
      }));
      return ok({ senderIds }, "termii-senderids", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii listSenderIDs failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async addTemplate(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ templateId: `termii-tpl-mock-${Date.now()}`, status: "pending" }, "mock", 80);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body: resp } = await http(
        `${BASE}/templates/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ name: req.name, template: req.template, api_key: apiKey }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { data?: { id?: string; template_id?: string }; message?: string });
      const templateId = String(data.data?.id ?? data.data?.template_id ?? `termii-tpl-${Date.now()}`);
      return ok({ templateId, status: "pending" }, templateId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii addTemplate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listTemplates() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ templates: [{ id: "tpl_1", name: "Welcome", template: "Hi {{name}}, welcome to Turbopay" }] }, "mock", 50);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/templates?api_key=${encodeURIComponent(apiKey)}`,
        { method: "GET", headers: { Accept: "application/json" } },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Array<Record<string, unknown>> });
      const templates = (data.data ?? []).map((t) => ({
        id: String(t.id ?? t.template_id ?? ""),
        name: String(t.name ?? t.template_name ?? ""),
        template: String(t.template ?? t.body ?? ""),
      }));
      return ok({ templates }, "termii-templates", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii listTemplates failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async sendTemplate(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ messageId: `termii-tplsend-mock-${Date.now()}`, status: "sent" }, "mock", 60);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body: resp } = await http(
        `${BASE}/sms/template/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            to: req.to,
            template_id: req.templateId,
            data: req.data ?? {},
            api_key: apiKey,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { message_id?: string; data?: { message_id?: string } });
      const messageId = data.message_id ?? data.data?.message_id ?? `termii-tplsend-${Date.now()}`;
      return ok({ messageId, status: "sent" }, messageId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii sendTemplate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// Termii OTP — send, verify, voice, WhatsApp
// (IOTPProvider)
// ---------------------------------------------------------------------------

export const termiiOTP: IOTPProvider = {
  contract: "OTP",

  async sendOTP(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ pinId: `mock-pin-${Date.now()}`, status: "sent", deliveredTo: req.to }, "mock", 200);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    const senderId = creds.secrets.senderId ?? "TURBOPAY";
    const channel = (req.channel ?? "SMS").toLowerCase();
    try {
      const body: Record<string, unknown> = {
        api_key: apiKey,
        message_type: req.messageType ?? "NUMERIC",
        to: req.to,
        from: senderId,
        channel,
        pin_attempts: req.pinAttempts ?? 5,
        pin_time_to_live: req.pinTimeToLive ?? 30,
        pin_length: req.pinLength ?? 6,
        pin_placeholder: req.pinPlaceholder ?? "< 1234 >",
        message_text: req.messageText ?? "Your Turbopay verification code is < 1234 >",
      };
      const { body: resp } = await http(
        `${BASE}/sms/otp/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { pinId?: string; pin_id?: string; data?: { pin_id?: string; phone?: string }; status?: string });
      const pinId = data.pinId ?? data.pin_id ?? data.data?.pin_id ?? `termii-pin-${Date.now()}`;
      const deliveredTo = data.data?.phone ?? req.to;
      return ok({ pinId, status: "sent", deliveredTo }, pinId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii sendOTP failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyOTP(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      // Mock: accept any 6-digit pin matching "123456" or last 6 digits
      const verified = req.pin === "123456";
      return ok({ verified, status: verified ? "verified" : "failed" }, "mock", 80);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body: resp } = await http(
        `${BASE}/sms/otp/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ api_key: apiKey, pin_id: req.pinId, pin: req.pin }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { verified?: boolean; data?: { verified?: boolean }; status?: string; message?: string });
      const verified = data.verified ?? data.data?.verified ?? false;
      const status = verified ? "verified" : (data.status ?? "failed").toLowerCase();
      return ok({ verified, status }, req.pinId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii verifyOTP failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async sendVoiceOTP(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ pinId: `mock-voice-pin-${Date.now()}`, status: "sent" }, "mock", 200);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body: resp } = await http(
        `${BASE}/sms/otp/voice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            to: req.to,
            pin_attempts: req.pinAttempts ?? 5,
            pin_time_to_live: req.pinTimeToLive ?? 30,
            pin_length: req.pinLength ?? 6,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { pinId?: string; pin_id?: string; data?: { pin_id?: string } });
      const pinId = data.pinId ?? data.pin_id ?? data.data?.pin_id ?? `termii-voice-pin-${Date.now()}`;
      return ok({ pinId, status: "sent" }, pinId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii sendVoiceOTP failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async sendWhatsAppOTP(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ pinId: `mock-wa-pin-${Date.now()}`, status: "sent" }, "mock", 200);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Termii apiKey missing", { providerCode: CODE });
    try {
      const { body: resp } = await http(
        `${BASE}/sms/otp/whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            to: req.to,
            pin_attempts: req.pinAttempts ?? 5,
            pin_time_to_live: req.pinTimeToLive ?? 30,
            pin_length: req.pinLength ?? 6,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (resp as { pinId?: string; pin_id?: string; data?: { pin_id?: string } });
      const pinId = data.pinId ?? data.pin_id ?? data.data?.pin_id ?? `termii-wa-pin-${Date.now()}`;
      return ok({ pinId, status: "sent" }, pinId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Termii sendWhatsAppOTP failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
