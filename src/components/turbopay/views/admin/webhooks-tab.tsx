"use client";

// Admin tab — Webhooks
// Two sections:
//   1) Inbound WebhookEvent log (last 50) — provider/eventType/signatureValid/
//      processedAt/transactionId/createdAt.
//   2) Outbound WebhookEndpoint management — list + "Create endpoint" dialog that
//      generates a fresh secret and shows it once.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, RefreshCw, Loader2, Download, Webhook, Copy, Check, Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, timeAgo } from "@/lib/money";
import { exportCsv } from "./shared";

interface WebhookEventRow {
  id: string;
  providerCode: string;
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  processedAt: string | null;
  transactionId: string | null;
  payloadPreview: string;
  createdAt: string;
}

interface WebhookEndpointRow {
  id: string;
  merchantId: string;
  url: string;
  eventsJSON: string;
  enabled: boolean;
  lastFailedAt: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
  secretMasked: string;
}

export default function WebhooksTab() {
  const [events, setEvents] = React.useState<WebhookEventRow[] | null>(null);
  const [endpoints, setEndpoints] = React.useState<WebhookEndpointRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({ merchantId: "", url: "", events: "" });
  const [adding, setAdding] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/webhooks", { cache: "no-store" });
      if (!res.ok) { toast.error("Failed to load webhooks"); return; }
      const data = await res.json();
      setEvents(data.events);
      setEndpoints(data.endpoints);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function submitAdd() {
    if (!addForm.merchantId.trim() || !addForm.url.trim()) {
      toast.error("Merchant ID and URL are required");
      return;
    }
    if (!/^https?:\/\//i.test(addForm.url)) {
      toast.error("URL must start with http:// or https://");
      return;
    }
    setAdding(true);
    try {
      const eventsArr = addForm.events.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: addForm.merchantId.trim(),
          url: addForm.url.trim(),
          events: eventsArr,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      const data = await res.json();
      setNewSecret(data.secret);
      toast.success("Webhook endpoint created");
      setAddForm({ merchantId: "", url: "", events: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create endpoint");
    } finally {
      setAdding(false);
    }
  }

  function copySecret() {
    if (!newSecret) return;
    navigator.clipboard.writeText(newSecret).then(() => {
      setCopied(true);
      toast.success("Secret copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Inbound webhook events</h3>
            <p className="text-xs text-muted-foreground">Last 50 received events from upstream providers.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!events || events.length === 0} onClick={() => {
              if (!events) return;
              exportCsv(
                `turbopay-webhook-events-${new Date().toISOString().slice(0, 10)}.csv`,
                ["Provider", "Event ID", "Event Type", "Signature Valid", "Processed At", "Transaction ID", "Created At"],
                events.map((e) => [e.providerCode, e.eventId, e.eventType, e.signatureValid ? "Yes" : "No", e.processedAt ?? "", e.transactionId ?? "", new Date(e.createdAt).toISOString()]),
              );
              toast.success("Events exported");
            }}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        {loading && !events ? (
          <div className="space-y-2">
            {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : events && events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Provider</th>
                  <th className="pb-2 pr-2 font-medium">Event type</th>
                  <th className="pb-2 pr-2 font-medium">Event ID</th>
                  <th className="pb-2 pr-2 font-medium">Signature</th>
                  <th className="pb-2 pr-2 font-medium">Transaction</th>
                  <th className="pb-2 pr-2 font-medium">Processed</th>
                  <th className="pb-2 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t transition-colors hover:bg-muted/40">
                    <td className="py-2 pr-2 font-mono text-xs">{e.providerCode}</td>
                    <td className="py-2 pr-2 text-xs font-medium">{e.eventType}</td>
                    <td className="py-2 pr-2 font-mono text-[10px] text-muted-foreground">{e.eventId}</td>
                    <td className="py-2 pr-2">
                      <Badge variant="secondary" className={`text-[10px] ${e.signatureValid ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                        {e.signatureValid ? "Valid" : "Invalid"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2 font-mono text-[10px] text-muted-foreground">{e.transactionId ?? "—"}</td>
                    <td className="py-2 pr-2 text-xs">{e.processedAt ? formatDate(e.processedAt, true) : "Pending"}</td>
                    <td className="py-2 text-xs text-muted-foreground" title={formatDate(e.createdAt, true)}>{timeAgo(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
            <Webhook className="h-6 w-6 text-muted-foreground" />
            <p className="mt-3 font-medium">No inbound webhook events yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Provider events will appear here once they fire.</p>
          </div>
        )}
      </Card>

      {/* Outbound endpoints */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Outbound webhook endpoints</h3>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => { setAddOpen(true); setNewSecret(null); }}>
            <Plus className="h-4 w-4" /> Create endpoint
          </Button>
        </div>
        {endpoints && endpoints.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Merchant</th>
                  <th className="pb-2 pr-2 font-medium">URL</th>
                  <th className="pb-2 pr-2 font-medium">Events</th>
                  <th className="pb-2 pr-2 font-medium">Secret</th>
                  <th className="pb-2 pr-2 font-medium">Failures</th>
                  <th className="pb-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => (
                  <tr key={ep.id} className="border-t transition-colors hover:bg-muted/40">
                    <td className="py-2 pr-2 font-mono text-xs">{ep.merchantId}</td>
                    <td className="py-2 pr-2 text-xs truncate max-w-xs" title={ep.url}>{ep.url}</td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{ep.eventsJSON || "[]"}</td>
                    <td className="py-2 pr-2 font-mono text-[10px] text-muted-foreground">{ep.secretMasked}</td>
                    <td className="py-2 pr-2 text-xs">
                      {ep.consecutiveFailures > 0 ? (
                        <Badge variant="secondary" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400">{ep.consecutiveFailures}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">0</Badge>
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{formatDate(ep.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No outbound endpoints registered.</p>
        )}
      </Card>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setNewSecret(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create webhook endpoint</DialogTitle>
            <DialogDescription>
              Generates a fresh signing secret. The plaintext secret is shown ONCE below — copy it now and store it securely.
            </DialogDescription>
          </DialogHeader>
          {newSecret ? (
            <div className="space-y-3">
              <Label>Signing secret (shown once)</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={newSecret} className="font-mono text-xs" />
                <Button size="sm" variant="outline" className="gap-1" onClick={copySecret}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Store this secret securely — it will not be shown again.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Merchant ID</Label>
                <Input placeholder="merchant_123" value={addForm.merchantId} onChange={(e) => setAddForm({ ...addForm, merchantId: e.target.value })} />
              </div>
              <div>
                <Label>Endpoint URL</Label>
                <Input placeholder="https://merchant.example.com/webhooks/turbopay" value={addForm.url} onChange={(e) => setAddForm({ ...addForm, url: e.target.value })} />
              </div>
              <div>
                <Label>Subscribed events (comma-separated)</Label>
                <Input placeholder="PAYMENT_SETTLED, PAYMENT_REVERSED" value={addForm.events} onChange={(e) => setAddForm({ ...addForm, events: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            {newSecret ? (
              <Button onClick={() => { setAddOpen(false); setNewSecret(null); }}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={submitAdd} disabled={adding}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Create endpoint
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
