"use client";

import * as React from "react";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Scale,
  Plus,
  Loader2,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Send,
  Tag,
  Clock,
  ShieldAlert,
  Hash,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, timeAgo } from "@/lib/money";

// ---------- Types ----------
interface DisputeListItem {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  lastMessage: {
    message: string;
    senderRole: string;
    createdAt: string;
  } | null;
}

interface DisputeMessage {
  id: string;
  disputeId: string;
  senderId: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

interface DisputeDetail {
  id: string;
  userId: string;
  transactionId: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  resolution: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  messages: DisputeMessage[];
}

interface DisputesData {
  disputes: DisputeListItem[];
  stats: { open: number; resolved: number; total: number };
}

// ---------- Display maps ----------
const CATEGORY_LABELS: Record<string, string> = {
  TRANSACTION: "Transaction",
  BILL: "Bill",
  TRANSFER: "Transfer",
  CARD: "Card",
  AIRTIME: "Airtime",
  OTHER: "Other",
};

const PRIORITY_TONE: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground",
  NORMAL: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  HIGH: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  URGENT: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  UNDER_REVIEW: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  EVIDENCE_REQUIRED: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  RESOLVED_FAVOUR_USER: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  RESOLVED_FAVOUR_PLATFORM: "bg-red-500/10 text-red-600 dark:text-red-400",
  CLOSED: "bg-muted text-muted-foreground",
  ESCALATED: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  EVIDENCE_REQUIRED: "Evidence required",
  RESOLVED_FAVOUR_USER: "Resolved · In your favour",
  RESOLVED_FAVOUR_PLATFORM: "Resolved · Declined",
  CLOSED: "Closed",
  ESCALATED: "Escalated",
};

function prettyStatus(s: string) {
  return STATUS_LABEL[s] ?? s.replace(/_/g, " ").toLowerCase();
}

// ---------- Status timeline helper ----------
function timelineEvents(d: DisputeDetail) {
  const events: { label: string; at: string; tone: string }[] = [
    {
      label: "Dispute opened",
      at: d.createdAt,
      tone: "bg-amber-500",
    },
  ];
  for (const m of d.messages) {
    if (m.senderRole === "ADMIN") {
      // crude heuristic: system-note messages contain "Status changed" / "Priority" / "Assigned" / "Resolution"
      if (/status changed/i.test(m.message)) {
        const match = m.message.match(/changed to (\w+)/);
        const s = match?.[1] ?? "";
        events.push({
          label: `Status → ${prettyStatus(s) || s}`,
          at: m.createdAt,
          tone:
            s.startsWith("RESOLVED") || s === "CLOSED"
              ? "bg-emerald-500"
              : s === "ESCALATED"
                ? "bg-red-500"
                : "bg-sky-500",
        });
      } else if (/priority set/i.test(m.message)) {
        events.push({
          label: m.message,
          at: m.createdAt,
          tone: "bg-amber-500",
        });
      } else if (/assigned to|assignment cleared/i.test(m.message)) {
        events.push({
          label: m.message,
          at: m.createdAt,
          tone: "bg-violet-500",
        });
      } else if (/resolution note updated/i.test(m.message)) {
        events.push({
          label: "Resolution note added",
          at: m.createdAt,
          tone: "bg-emerald-500",
        });
      }
    }
  }
  if (d.resolvedAt) {
    events.push({
      label: "Marked resolved",
      at: d.resolvedAt,
      tone: "bg-emerald-500",
    });
  }
  return events;
}

// ---------- Component ----------
export default function DisputesView() {
  const [data, setData] = React.useState<DisputesData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  // Create form state
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState("TRANSACTION");
  const [priority, setPriority] = React.useState("NORMAL");
  const [transactionId, setTransactionId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/disputes", { cache: "no-store" });
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load disputes");
        return;
      }
      const body = await res.json();
      setData({
        disputes: body.disputes ?? [],
        stats: body.stats ?? { open: 0, resolved: 0, total: 0 },
      });
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function submitCreate() {
    if (subject.trim().length < 3) {
      toast.error("Subject is too short");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Please describe the issue (min 10 characters)");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          transactionId: transactionId.trim() || undefined,
          description: description.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Failed to create dispute");
        return;
      }
      toast.success("Dispute raised — our team has been notified");
      setCreateOpen(false);
      setSubject("");
      setCategory("TRANSACTION");
      setPriority("NORMAL");
      setTransactionId("");
      setDescription("");
      await load();
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Disputes"
        subtitle="Raise and track issues with transactions, bills, cards & more"
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Raise dispute
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile
          label="Open"
          value={data?.stats.open ?? 0}
          tone="amber"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatTile
          label="Resolved"
          value={data?.stats.resolved ?? 0}
          tone="emerald"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatTile
          label="Total"
          value={data?.stats.total ?? 0}
          tone="slate"
          icon={<Scale className="h-4 w-4" />}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : !data?.disputes.length ? (
        <EmptyState
          icon={Inbox}
          title="No disputes yet"
          description="If something looks off with a transaction, bill, or transfer, raise a dispute and our team will investigate."
          action={
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Raise dispute
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.disputes.map((d) => (
            <DisputeRow key={d.id} d={d} onOpen={() => setDetailId(d.id)} />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise a dispute</DialogTitle>
            <DialogDescription>
              Tell us what went wrong. Include a transaction reference if the issue is tied to a
              specific transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="d-subject">Subject</Label>
              <Input
                id="d-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of the issue"
                maxLength={160}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-tx">
                Transaction reference{" "}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="d-tx"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. TP-ABCD1234"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-desc">Description</Label>
              <Textarea
                id="d-desc"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in as much detail as you can. Include dates, amounts, and reference numbers if applicable."
                maxLength={8000}
              />
              <p className="text-muted-foreground text-right text-xs">{description.length}/8000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={submitting} className="gap-1.5">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <DisputeDetailDialog id={detailId} onClose={() => setDetailId(null)} onChanged={load} />
    </div>
  );
}

// ---------- Stat tile ----------
function StatTile({
  label,
  value,
  tone,
  icon,
  className,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "slate";
  icon: React.ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : tone === "emerald"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";
  return (
    <Card className={`p-4 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
          {icon}
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

// ---------- Dispute row ----------
function DisputeRow({ d, onOpen }: { d: DisputeListItem; onOpen: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="focus-visible:ring-primary cursor-pointer p-4 transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{d.subject}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant="outline" className="gap-1">
              <Tag className="h-3 w-3" />
              {CATEGORY_LABELS[d.category] ?? d.category}
            </Badge>
            <Badge variant="secondary" className={PRIORITY_TONE[d.priority] ?? ""}>
              {d.priority}
            </Badge>
            <Badge variant="secondary" className={STATUS_TONE[d.status] ?? ""}>
              {prettyStatus(d.status)}
            </Badge>
            {d.transactionId && (
              <Badge variant="outline" className="gap-1 font-mono">
                <Hash className="h-3 w-3" />
                {d.transactionId.slice(0, 12)}
              </Badge>
            )}
          </div>
        </div>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          {timeAgo(d.updatedAt)}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </div>
      </div>
      {d.lastMessage && (
        <div className="bg-muted/50 text-muted-foreground mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <p className="line-clamp-1 min-w-0 flex-1">
            <span className="text-foreground font-medium">
              {d.lastMessage.senderRole === "ADMIN" ? "Support" : "You"}:
            </span>{" "}
            {d.lastMessage.message}
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------- Detail dialog ----------
function DisputeDetailDialog({
  id,
  onClose,
  onChanged,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [dispute, setDispute] = React.useState<DisputeDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const threadRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/disputes/${id}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load dispute");
        return;
      }
      const body = await res.json();
      setDispute(body.dispute ?? null);
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    if (id) {
      setDispute(null);
      setReply("");
      load();
    }
  }, [id, load]);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [dispute?.messages.length, loading]);

  async function sendReply() {
    if (!dispute) return;
    if (reply.trim().length < 1) return;
    setSending(true);
    try {
      const res = await fetch(`/api/disputes/${dispute.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Failed to send message");
        return;
      }
      setReply("");
      toast.success("Message sent");
      await load();
      await onChanged();
    } catch {
      toast.error("Network error");
    } finally {
      setSending(false);
    }
  }

  const closed =
    dispute?.status === "CLOSED" ||
    dispute?.status === "RESOLVED_FAVOUR_USER" ||
    dispute?.status === "RESOLVED_FAVOUR_PLATFORM";

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Scale className="text-primary h-4 w-4" />
            <span className="truncate">{dispute?.subject ?? "Dispute"}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Dispute detail and message thread
          </DialogDescription>
          {dispute && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <Badge variant="outline" className="gap-1">
                <Tag className="h-3 w-3" />
                {CATEGORY_LABELS[dispute.category] ?? dispute.category}
              </Badge>
              <Badge variant="secondary" className={PRIORITY_TONE[dispute.priority] ?? ""}>
                {dispute.priority}
              </Badge>
              <Badge variant="secondary" className={STATUS_TONE[dispute.status] ?? ""}>
                {prettyStatus(dispute.status)}
              </Badge>
              {dispute.assignedTo && (
                <Badge variant="outline" className="gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  {dispute.assignedTo}
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : !dispute ? (
          <div className="text-muted-foreground p-8 text-center text-sm">Dispute not found.</div>
        ) : (
          <div className="flex max-h-[calc(92vh-9rem)] flex-col">
            {/* Description + timeline */}
            <div className="border-b p-5">
              <div className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
                <AlertTriangle className="h-3.5 w-3.5" /> Description
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{dispute.description}</p>
              {dispute.resolution && (
                <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-emerald-600 uppercase dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolution
                  </p>
                  <p className="text-foreground whitespace-pre-wrap">{dispute.resolution}</p>
                </div>
              )}
              <Timeline events={timelineEvents(dispute)} />
            </div>

            {/* Thread */}
            <div ref={threadRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-5">
              <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
                <MessageSquare className="h-3.5 w-3.5" /> Conversation
              </div>
              {dispute.messages.length === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">No messages yet.</p>
              )}
              {dispute.messages.map((m) => (
                <MessageBubble key={m.id} m={m} />
              ))}
            </div>

            {/* Reply */}
            <div className="bg-muted/30 border-t p-4">
              {closed ? (
                <p className="text-muted-foreground text-center text-xs">
                  This dispute is closed. Open a new one if you need more help.
                </p>
              ) : (
                <div className="flex items-end gap-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type your reply…"
                    rows={2}
                    className="bg-background min-h-[44px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={sendReply}
                    disabled={sending || reply.trim().length === 0}
                    aria-label="Send reply"
                    className="h-10 w-10 shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
              <p className="text-muted-foreground mt-1.5 text-right text-[10px]">
                ⌘ + Enter to send
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Timeline ----------
function Timeline({ events }: { events: { label: string; at: string; tone: string }[] }) {
  if (events.length === 0) return null;
  return (
    <div className="mt-4 space-y-2.5">
      <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        Timeline
      </p>
      <ol className="border-muted relative space-y-3 border-l pl-4">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span
              className={`ring-background absolute top-1 -left-[1.40rem] h-2.5 w-2.5 rounded-full ring-4 ${e.tone}`}
            />
            <p className="text-sm">{e.label}</p>
            <p className="text-muted-foreground text-[11px]">
              {formatDate(e.at, true)} · {timeAgo(e.at)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------- Message bubble ----------
function MessageBubble({ m }: { m: DisputeMessage }) {
  const isAdmin = m.senderRole === "ADMIN";
  // System notes (admin status-change notes) render as centered pills
  const isSystemNote =
    isAdmin &&
    /^(status changed|priority set|assigned to|assignment cleared|resolution note)/i.test(
      m.message
    );

  if (isSystemNote) {
    return (
      <div className="flex justify-center">
        <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[11px]">
          {m.message} · {timeAgo(m.createdAt)}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
          isAdmin
            ? "bg-card text-card-foreground ring-border rounded-bl-sm ring-1"
            : "bg-primary text-primary-foreground rounded-br-sm"
        }`}
      >
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase opacity-80">
          {isAdmin ? (
            <>
              <ShieldAlert className="h-3 w-3" /> Support
            </>
          ) : (
            <>
              <MessageSquare className="h-3 w-3" /> You
            </>
          )}
        </div>
        <p className="leading-relaxed break-words whitespace-pre-wrap">{m.message}</p>
        <p className={`mt-1 text-[10px] ${isAdmin ? "text-muted-foreground" : "opacity-70"}`}>
          {formatDate(m.createdAt, true)}
        </p>
      </div>
    </div>
  );
}
