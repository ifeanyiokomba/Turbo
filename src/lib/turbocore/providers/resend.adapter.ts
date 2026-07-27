// TurboCore — Resend email adapter (transactional + batch + templates + domains + contacts + webhooks).
//
// Implements 1 contract + extensions:
//   - resendNotification (INotificationProvider + extension methods)
//     • send          (single email)
//     • getDeliveryStatus
//     • sendBatch     (up to 100 emails in one call)
//     • createDomain / listDomains / getDomain / verifyDomain
//     • createContact / listContacts
//     • createWebhookEndpoint / listWebhookEndpoints
//     • saveTemplate / listTemplates / renderTemplate / sendTemplate
//
// Base URL: https://api.resend.com (sandbox: same host with test API key
// `re_…_test_…`).
// Auth: `Authorization: Bearer ${apiKey}`. **User-Agent header required** —
// requests without it return 403 (we send `Turbopay/1.0`).
//
// Endpoints:
//   - Send single:    POST /emails
//   - Send batch:     POST /emails/batch
//   - Status:         GET  /emails/:id
//   - Domains:        POST /domains, GET /domains, GET /domains/:id,
//                     POST /domains/:id/verify
//   - Contacts:       POST /contacts, GET /contacts
//   - Webhooks:       POST /webhooks, GET /webhooks
//
// Templates: Resend has a Templates API but it's gated behind their Broadcasts
// product. For TurboPay we implement a lightweight in-process template store
// (module-level Map) — `saveTemplate(name, html)` renders `{{var}}` placeholders
// against a variables map and dispatches the rendered HTML via `/emails`.
//
// Only the EMAIL channel is supported — SMS / PUSH / WHATSAPP are rejected
// with NOT_SUPPORTED so callers can route to a different notification
// provider (e.g. Termii) for those channels.
//
// Secrets expected: { "apiKey": "re_...", "from": "Turbopay <no-reply@turbopay.ng>" }

import { ok, fail } from "../result";
import type { ProviderResult } from "../result";
import type { INotificationProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";

const CODE = "resend";
const BASE = "https://api.resend.com";
const DEFAULT_FROM = "Turbopay <no-reply@turbopay.ng>";
const USER_AGENT = "Turbopay/1.0";

// ---------------------------------------------------------------------------
// In-process template store. A Map<name, html> with a 100-entry soft cap.
// Module-scoped so it survives across requests in the same Node process; not
// persistent across restarts. For persistence, callers should save templates
// in their own DB and pass the rendered HTML to `send({ body })`.
// ---------------------------------------------------------------------------

interface StoredTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  createdAt: string;
}

const templateStore = new Map<string, StoredTemplate>();
const TEMPLATE_SOFT_CAP = 100;

function renderTemplate(html: string, data: Record<string, string>): string {
  return html.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key: string) => data[key] ?? "");
}

// ---------------------------------------------------------------------------
// Extension surface for resendNotification.
// ---------------------------------------------------------------------------

export interface ResendNotificationExtensions {
  sendBatch(req: { emails: Array<{ from?: string; to: string; subject: string; html: string; text?: string }> }): Promise<ProviderResult<{ ids: string[]; status: string }>>;
  createDomain(req: { name: string; region?: string }): Promise<ProviderResult<{ id: string; name: string; status: string }>>;
  listDomains(): Promise<ProviderResult<{ domains: Array<{ id: string; name: string; status: string; region?: string }> }>>;
  getDomain(id: string): Promise<ProviderResult<{ id: string; name: string; status: string; region?: string; createdAt?: string }>>;
  verifyDomain(id: string): Promise<ProviderResult<{ id: string; status: string }>>;
  createContact(req: { email: string; first_name?: string; last_name?: string; unsubscribed?: boolean }): Promise<ProviderResult<{ id: string; email: string; status: string }>>;
  listContacts(): Promise<ProviderResult<{ contacts: Array<{ id: string; email: string; firstName?: string; lastName?: string; unsubscribed?: boolean }> }>>;
  createWebhookEndpoint(req: { endpointUrl: string; events: string[] }): Promise<ProviderResult<{ id: string; endpointUrl: string; status: string }>>;
  listWebhookEndpoints(): Promise<ProviderResult<{ webhooks: Array<{ id: string; endpointUrl: string; events: string[] }> }>>;
  saveTemplate(req: { name: string; subject: string; html: string }): Promise<ProviderResult<{ templateId: string; status: string }>>;
  listTemplates(): Promise<ProviderResult<{ templates: Array<{ id: string; name: string; subject: string; createdAt: string }> }>>;
  sendTemplate(req: { to: string; templateId: string; data?: Record<string, string> }): Promise<ProviderResult<{ messageId: string; status: string }>>;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
}

export const resendNotification: INotificationProvider & ResendNotificationExtensions = {
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
          headers: authHeaders(apiKey),
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
        { method: "GET", headers: authHeaders(apiKey) },
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

  // -------------------------------------------------------------------------
  // Batch — POST /emails/batch (up to 100 emails per call)
  // -------------------------------------------------------------------------

  async sendBatch(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ ids: req.emails.map(() => `resend-mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), status: "sent" }, "mock", 80);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    const fromDefault = creds.secrets.from ?? DEFAULT_FROM;
    if (req.emails.length === 0) {
      return fail("INVALID_REQUEST", "sendBatch requires at least 1 email", { providerCode: CODE });
    }
    if (req.emails.length > 100) {
      return fail("INVALID_REQUEST", "Resend batch supports up to 100 emails per call", { providerCode: CODE });
    }
    try {
      const payload = req.emails.map((e) => ({
        from: e.from ?? fromDefault,
        to: e.to,
        subject: e.subject,
        html: e.html,
        ...(e.text ? { text: e.text } : {}),
      }));
      const { body } = await http(
        `${BASE}/emails/batch`,
        {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify(payload),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      // Resend returns { data: [{ id: "..." }, ...] } for batches.
      const data = (body as { data?: Array<{ id?: string }>; ids?: string[]; id?: string });
      const ids: string[] = Array.isArray(data.data)
        ? data.data.map((d) => String(d.id ?? `resend-${Date.now()}`))
        : Array.isArray(data.ids)
          ? data.ids
          : data.id
            ? [String(data.id)]
            : [];
      return ok({ ids, status: "sent" }, `resend-batch-${Date.now()}`, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend sendBatch failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // -------------------------------------------------------------------------
  // Domains — POST /domains, GET /domains, GET /domains/:id, POST /domains/:id/verify
  // -------------------------------------------------------------------------

  async createDomain(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id: `re-dom-mock-${Date.now()}`, name: req.name, status: "not_started" }, "mock", 100);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/domains`,
        {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({ name: req.name, region: req.region ?? "us-east-1" }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; name?: string; status?: string; region?: string });
      return ok({ id: data.id ?? `re-dom-${Date.now()}`, name: data.name ?? req.name, status: data.status ?? "not_started" }, data.id ?? "mock", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend createDomain failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listDomains() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ domains: [] }, "mock", 50);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/domains`,
        { method: "GET", headers: authHeaders(apiKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Array<{ id?: string; name?: string; status?: string; region?: string }> });
      const domains = (data.data ?? []).map((d) => ({
        id: String(d.id ?? ""),
        name: String(d.name ?? ""),
        status: String(d.status ?? "not_started"),
        region: d.region ? String(d.region) : undefined,
      }));
      return ok({ domains }, "resend-domains", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend listDomains failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getDomain(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id, name: "example.com", status: "verified", region: "us-east-1", createdAt: new Date().toISOString() }, "mock", 50);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/domains/${encodeURIComponent(id)}`,
        { method: "GET", headers: authHeaders(apiKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; name?: string; status?: string; region?: string; created_at?: string });
      return ok(
        {
          id: String(data.id ?? id),
          name: String(data.name ?? ""),
          status: String(data.status ?? "not_started"),
          region: data.region ? String(data.region) : undefined,
          createdAt: data.created_at,
        },
        id,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend getDomain failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyDomain(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id, status: "verified" }, "mock", 100);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/domains/${encodeURIComponent(id)}/verify`,
        { method: "POST", headers: authHeaders(apiKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; status?: string });
      return ok({ id: String(data.id ?? id), status: String(data.status ?? "verified") }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend verifyDomain failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // -------------------------------------------------------------------------
  // Contacts — POST /contacts, GET /contacts
  // -------------------------------------------------------------------------

  async createContact(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id: `re-contact-mock-${Date.now()}`, email: req.email, status: "created" }, "mock", 80);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/contacts`,
        {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({
            email: req.email,
            ...(req.first_name ? { first_name: req.first_name } : {}),
            ...(req.last_name ? { last_name: req.last_name } : {}),
            ...(typeof req.unsubscribed === "boolean" ? { unsubscribed: req.unsubscribed } : {}),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; object?: string });
      return ok({ id: String(data.id ?? `re-contact-${Date.now()}`), email: req.email, status: "created" }, data.id ?? "mock", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend createContact failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listContacts() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ contacts: [] }, "mock", 50);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/contacts`,
        { method: "GET", headers: authHeaders(apiKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Array<{ id?: string; email?: string; first_name?: string; last_name?: string; unsubscribed?: boolean }> });
      const contacts = (data.data ?? []).map((c) => ({
        id: String(c.id ?? ""),
        email: String(c.email ?? ""),
        firstName: c.first_name,
        lastName: c.last_name,
        unsubscribed: c.unsubscribed,
      }));
      return ok({ contacts }, "resend-contacts", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend listContacts failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // -------------------------------------------------------------------------
  // Webhooks — POST /webhooks, GET /webhooks
  // -------------------------------------------------------------------------

  async createWebhookEndpoint(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id: `re-wh-mock-${Date.now()}`, endpointUrl: req.endpointUrl, status: "created" }, "mock", 80);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/webhooks`,
        {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({ endpoint_url: req.endpointUrl, events: req.events }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; endpoint_url?: string; status?: string });
      return ok(
        { id: String(data.id ?? `re-wh-${Date.now()}`), endpointUrl: data.endpoint_url ?? req.endpointUrl, status: data.status ?? "created" },
        data.id ?? "mock",
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend createWebhookEndpoint failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listWebhookEndpoints() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ webhooks: [] }, "mock", 50);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/webhooks`,
        { method: "GET", headers: authHeaders(apiKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Array<{ id?: string; endpoint_url?: string; events?: string[] }> });
      const webhooks = (data.data ?? []).map((w) => ({
        id: String(w.id ?? ""),
        endpointUrl: String(w.endpoint_url ?? ""),
        events: Array.isArray(w.events) ? w.events : [],
      }));
      return ok({ webhooks }, "resend-webhooks", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend listWebhookEndpoints failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // -------------------------------------------------------------------------
  // Templates — in-process store with {{var}} rendering, dispatched via /emails
  // -------------------------------------------------------------------------

  async saveTemplate(req) {
    // Template storage is local — no creds required. But we still gate the
    // method on creds so a mock deployment doesn't pretend to have templates
    // it can't actually use for sending.
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    const templateId = `re-tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const tpl: StoredTemplate = {
      id: templateId,
      name: req.name,
      subject: req.subject,
      html: req.html,
      createdAt: new Date().toISOString(),
    };
    // Soft-cap: if we're at the limit, evict the oldest entry.
    if (templateStore.size >= TEMPLATE_SOFT_CAP) {
      const firstKey = templateStore.keys().next().value;
      if (firstKey) templateStore.delete(firstKey);
    }
    templateStore.set(templateId, tpl);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ templateId, status: "saved" }, "mock", 30);
    }
    return ok({ templateId, status: "saved" }, templateId, 0);
  },

  async listTemplates() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ templates: [] }, "mock", 10);
    }
    const templates = Array.from(templateStore.values()).map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      createdAt: t.createdAt,
    }));
    return ok({ templates }, "resend-templates-list", 0);
  },

  async sendTemplate(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ messageId: `resend-tplsend-mock-${Date.now()}`, status: "sent" }, "mock", 60);
    }
    const apiKey = creds.secrets.apiKey;
    if (!apiKey) return fail("AUTH_FAILED", "Resend apiKey missing", { providerCode: CODE });
    const from = creds.secrets.from ?? DEFAULT_FROM;

    const tpl = templateStore.get(req.templateId);
    if (!tpl) {
      return fail("INVALID_REQUEST", `Template ${req.templateId} not found`, { providerCode: CODE });
    }
    const html = renderTemplate(tpl.html, req.data ?? {});
    const subject = renderTemplate(tpl.subject, req.data ?? {});
    try {
      const { body } = await http(
        `${BASE}/emails`,
        {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({ from, to: req.to, subject, html }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string });
      const messageId = data.id ?? `resend-tplsend-${Date.now()}`;
      return ok({ messageId, status: "sent" }, messageId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resend sendTemplate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
