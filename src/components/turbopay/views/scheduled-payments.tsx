"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarClock,
  Plus,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  Repeat,
  Calendar,
  Clock,
  ArrowRight,
} from "lucide-react";
import { naira, timeAgo, formatDate } from "@/lib/money";
import { toast } from "sonner";

interface ScheduledPayment {
  id: string;
  type: string;
  payloadJSON: string;
  frequency: string;
  nextRunAt: string;
  status: string;
  runCount: number;
  failCount: number;
  lastRunAt: string | null;
  createdAt: string;
}

const SCHEDULE_TYPES = [
  { code: "TRANSFER", label: "Transfer", desc: "Send money to a beneficiary" },
  { code: "BILL", label: "Bill payment", desc: "Pay a recurring bill" },
  { code: "AIRTIME", label: "Airtime", desc: "Top up a phone number" },
  { code: "DATA", label: "Data bundle", desc: "Buy a data bundle" },
];

const FREQUENCIES = [
  { code: "ONCE", label: "Once", desc: "Run a single time" },
  { code: "DAILY", label: "Daily", desc: "Every day" },
  { code: "WEEKLY", label: "Weekly", desc: "Every 7 days" },
  { code: "MONTHLY", label: "Monthly", desc: "Every 30 days" },
];

function describePayload(type: string, payload: any): string {
  if (!payload) return "—";
  if (type === "TRANSFER") {
    return `${payload.recipient ?? "—"} · ${naira(Number(payload.amountKobo ?? 0))}`;
  }
  if (type === "BILL") {
    return `${payload.billerName ?? "—"} · ${naira(Number(payload.amountKobo ?? 0))}`;
  }
  if (type === "AIRTIME" || type === "DATA") {
    return `${payload.network ?? "—"} · ${payload.phone ?? "—"} · ${naira(Number(payload.amountKobo ?? 0))}`;
  }
  return JSON.stringify(payload).slice(0, 80);
}

function nextRunLabel(nextRunAt: string): {
  label: string;
  tone: "default" | "warning" | "danger";
} {
  const d = new Date(nextRunAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffMs < 0) return { label: `Overdue ${timeAgo(d)}`, tone: "danger" };
  if (diffH < 24) return { label: `In ${diffH}h`, tone: "warning" };
  if (diffH < 48) return { label: "Tomorrow", tone: "default" };
  return { label: formatDate(d, true), tone: "default" };
}

export default function ScheduledPaymentsView() {
  const { setView } = useApp();
  const [list, setList] = React.useState<ScheduledPayment[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    type: "TRANSFER",
    frequency: "MONTHLY",
    nextRunAt: "",
    // Transfer
    recipient: "",
    amountInput: "",
    // Bill
    billerName: "",
    customerRef: "",
    // Airtime/Data
    network: "MTN",
    phone: "",
  });
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scheduled-payments", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setList(json.scheduled ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function createSchedule() {
    const amountKobo = Math.round(Number(form.amountInput) * 100);
    let payload: Record<string, unknown> = {};
    if (form.type === "TRANSFER") {
      if (!form.recipient.trim()) return toast.error("Enter recipient");
      if (!amountKobo || amountKobo <= 0) return toast.error("Enter amount");
      payload = { recipient: form.recipient.trim(), amountKobo };
    } else if (form.type === "BILL") {
      if (!form.billerName.trim()) return toast.error("Enter biller name");
      if (!form.customerRef.trim()) return toast.error("Enter customer reference");
      if (!amountKobo || amountKobo <= 0) return toast.error("Enter amount");
      payload = {
        billerName: form.billerName.trim(),
        customerRef: form.customerRef.trim(),
        amountKobo,
      };
    } else if (form.type === "AIRTIME" || form.type === "DATA") {
      if (!form.phone.trim()) return toast.error("Enter phone");
      if (!amountKobo || amountKobo <= 0) return toast.error("Enter amount");
      payload = {
        network: form.network,
        phone: form.phone.trim(),
        amountKobo,
      };
    }
    if (!form.nextRunAt) return toast.error("Pick next run date");

    setCreating(true);
    try {
      const res = await fetch("/api/scheduled-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          frequency: form.frequency,
          nextRunAt: form.nextRunAt,
          payload,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not schedule payment");
        return;
      }
      toast.success("Scheduled payment created");
      setCreateOpen(false);
      setForm({
        type: "TRANSFER",
        frequency: "MONTHLY",
        nextRunAt: "",
        recipient: "",
        amountInput: "",
        billerName: "",
        customerRef: "",
        network: "MTN",
        phone: "",
      });
      load();
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(item: ScheduledPayment) {
    const next = item.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setList((arr) => arr.map((x) => (x.id === item.id ? { ...x, status: next } : x)));
    try {
      const res = await fetch(`/api/scheduled-payments/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next === "ACTIVE" ? "Resumed" : "Paused");
    } catch {
      setList((arr) => arr.map((x) => (x.id === item.id ? { ...x, status: item.status } : x)));
      toast.error("Could not update");
    }
  }

  async function deleteItem(item: ScheduledPayment) {
    const prev = list;
    setList((arr) => arr.filter((x) => x.id !== item.id));
    try {
      const res = await fetch(`/api/scheduled-payments/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Scheduled payment removed");
    } catch {
      setList(prev);
      toast.error("Could not delete");
    }
  }

  return (
    <div className="tp-fade-rise space-y-6">
      <PageHeader
        title="Scheduled Payments"
        subtitle="Automate recurring transfers, bills and airtime top-ups."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Schedule
            </Button>
          </>
        }
      />

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold">All scheduled payments</p>
          <Badge variant="secondary">{list.length} scheduled</Badge>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No scheduled payments"
            description="Automate your recurring transfers, bills and airtime with a single schedule."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Schedule a payment
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {list.map((item) => {
              let payload: any = {};
              try {
                payload = JSON.parse(item.payloadJSON);
              } catch {}
              const next = nextRunLabel(item.nextRunAt);
              const typeLabel =
                SCHEDULE_TYPES.find((t) => t.code === item.type)?.label ?? item.type;
              const freqLabel =
                FREQUENCIES.find((f) => f.code === item.frequency)?.label ?? item.frequency;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border p-4 transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          item.status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <CalendarClock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{typeLabel}</p>
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Repeat className="h-3 w-3" /> {freqLabel}
                          </Badge>
                          <Badge
                            variant={item.status === "ACTIVE" ? "secondary" : "outline"}
                            className={`text-[10px] ${
                              item.status === "ACTIVE"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {item.status}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 truncate text-xs">
                          {describePayload(item.type, payload)}
                        </p>
                        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span
                              className={
                                next.tone === "danger"
                                  ? "font-semibold text-red-600 dark:text-red-400"
                                  : next.tone === "warning"
                                    ? "font-semibold text-amber-600 dark:text-amber-400"
                                    : ""
                              }
                            >
                              {next.label}
                            </span>
                          </span>
                          <span>·</span>
                          <span>{item.runCount} runs</span>
                          {item.failCount > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-red-600 dark:text-red-400">
                                {item.failCount} failed
                              </span>
                            </>
                          )}
                          {item.lastRunAt && (
                            <>
                              <span>·</span>
                              <span>Last: {timeAgo(item.lastRunAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5"
                        onClick={() => toggleStatus(item)}
                      >
                        {item.status === "ACTIVE" ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {item.status === "ACTIVE" ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive gap-1.5"
                        onClick={() => deleteItem(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule a payment</DialogTitle>
            <DialogDescription>
              Automate a recurring transfer, bill or airtime top-up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_TYPES.map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.label} · <span className="text-muted-foreground text-xs">{t.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conditional payload inputs */}
            {form.type === "TRANSFER" && (
              <div className="space-y-2">
                <Label htmlFor="sp-recipient">Recipient (username, account, or @handle)</Label>
                <Input
                  id="sp-recipient"
                  placeholder="@johndoe or 0123456789"
                  value={form.recipient}
                  onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))}
                />
              </div>
            )}
            {form.type === "BILL" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sp-biller">Biller name</Label>
                  <Input
                    id="sp-biller"
                    placeholder="e.g. Ikeja Electric"
                    value={form.billerName}
                    onChange={(e) => setForm((f) => ({ ...f, billerName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sp-cust">Customer reference (meter/IAC)</Label>
                  <Input
                    id="sp-cust"
                    placeholder="e.g. 0123456789"
                    value={form.customerRef}
                    onChange={(e) => setForm((f) => ({ ...f, customerRef: e.target.value }))}
                  />
                </div>
              </>
            )}
            {(form.type === "AIRTIME" || form.type === "DATA") && (
              <>
                <div className="space-y-2">
                  <Label>Network</Label>
                  <Select
                    value={form.network}
                    onValueChange={(v) => setForm((f) => ({ ...f, network: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["MTN", "GLO", "AIRTEL", "NMOBILE"].map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sp-phone">Phone</Label>
                  <Input
                    id="sp-phone"
                    inputMode="tel"
                    placeholder="0801 234 5678"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="sp-amount">Amount (₦)</Label>
              <Input
                id="sp-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amountInput}
                onChange={(e) => setForm((f) => ({ ...f, amountInput: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.code} value={f.code}>
                        {f.label} · <span className="text-muted-foreground text-xs">{f.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sp-next">Next run</Label>
                <Input
                  id="sp-next"
                  type="datetime-local"
                  value={form.nextRunAt}
                  onChange={(e) => setForm((f) => ({ ...f, nextRunAt: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createSchedule} disabled={creating} className="gap-1.5">
              {creating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
