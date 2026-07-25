"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  LifeBuoy,
  MessageSquare,
  Plus,
  Loader2,
  ChevronRight,
  HelpCircle,
  Sparkles,
  Search,
  Mail,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";

interface Article {
  id: string;
  q: string;
  a: string;
}

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

interface SupportData {
  tickets: Ticket[];
  articles: Article[];
}

const CATEGORY_LABELS: Record<string, string> = {
  ACCOUNT: "Account",
  BILLING: "Billing",
  TRANSACTION: "Transaction",
  SECURITY: "Security",
  OTHER: "Other",
};

const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  IN_PROGRESS: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  RESOLVED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CLOSED: "bg-muted text-muted-foreground",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
};

export default function SupportView() {
  const [data, setData] = React.useState<SupportData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [ticketOpen, setTicketOpen] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState("ACCOUNT");
  const [priority, setPriority] = React.useState("NORMAL");
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [openTicketId, setOpenTicketId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/support", { cache: "no-store" });
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load support.");
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function submitTicket() {
    if (subject.trim().length < 3) {
      toast.error("Subject is too short");
      return;
    }
    if (message.trim().length < 10) {
      toast.error("Please provide more detail in your message");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          message: message.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Failed to create ticket");
        return;
      }
      toast.success("Ticket created — we'll get back to you soon");
      setTicketOpen(false);
      setSubject("");
      setCategory("ACCOUNT");
      setPriority("NORMAL");
      setMessage("");
      await load();
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredArticles = React.useMemo(() => {
    if (!search.trim()) return data?.articles ?? [];
    const q = search.toLowerCase();
    return (data?.articles ?? []).filter((a) => a.q.toLowerCase().includes(q) || a.a.toLowerCase().includes(q));
  }, [data, search]);

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Help & Support" subtitle="Get answers and reach our team" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help & Support"
        subtitle="Get answers and reach our team"
        actions={
          <Button onClick={() => setTicketOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Create ticket
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left col: FAQ + contact options */}
        <div className="space-y-5 lg:col-span-2">
          {/* Help articles */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Help articles</h2>
            </div>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search FAQs..."
                className="pl-9"
              />
            </div>
            {filteredArticles.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {filteredArticles.map((a) => (
                  <AccordionItem key={a.id} value={a.id}>
                    <AccordionTrigger className="text-left text-sm hover:no-underline">
                      {a.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {a.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <EmptyState
                icon={HelpCircle}
                title="No matching articles"
                description="Try a different search term."
              />
            )}
          </Card>

          {/* Contact options */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="p-5">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="font-medium">AI assistant</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Chat with our AI helper (floating chat button bottom-right) for instant answers, 24/7.
              </p>
            </Card>
            <Card className="p-5">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Mail className="h-5 w-5" />
              </div>
              <p className="font-medium">Email us</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reach our human support team at <span className="font-medium text-foreground">help@turbopay.app</span> for complex issues.
              </p>
            </Card>
          </div>
        </div>

        {/* Right col: my tickets */}
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">My tickets</h2>
              <Badge variant="secondary" className="ml-auto">{data?.tickets.length ?? 0}</Badge>
            </div>
            {data?.tickets && data.tickets.length > 0 ? (
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                {data.tickets.map((t) => {
                  const expanded = openTicketId === t.id;
                  return (
                    <li
                      key={t.id}
                      className={`rounded-xl border p-3 transition-colors ${expanded ? "border-primary" : "hover:bg-muted/40"}`}
                    >
                      <button
                        onClick={() => setOpenTicketId(expanded ? null : t.id)}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{t.subject}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {CATEGORY_LABELS[t.category] ?? t.category} · {timeAgo(t.createdAt)}
                          </p>
                        </div>
                        <Badge variant="secondary" className={`text-[10px] ${STATUS_TONE[t.status] ?? ""}`}>
                          {t.status.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
                      </button>
                      {expanded && (
                        <div className="mt-3 space-y-2 border-t pt-3">
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            <Badge variant="outline">Priority: {PRIORITY_LABELS[t.priority] ?? t.priority}</Badge>
                            <Badge variant="outline" className="gap-1">
                              <Clock className="h-3 w-3" /> {formatDate(t.createdAt, true)}
                            </Badge>
                            {t.status === "RESOLVED" || t.status === "CLOSED" ? (
                              <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> Resolved
                              </Badge>
                            ) : null}
                          </div>
                          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{t.message}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="No tickets yet"
                description="Need help with something specific? Create a ticket and our team will respond."
                action={
                  <Button size="sm" onClick={() => setTicketOpen(true)} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Create ticket
                  </Button>
                }
              />
            )}
          </Card>
        </div>
      </div>

      {/* Create ticket dialog */}
      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create support ticket</DialogTitle>
            <DialogDescription>
              Tell us what&apos;s going on. Our team typically responds within 24 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of the issue"
                maxLength={120}
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
                      <SelectItem key={v} value={v}>{l}</SelectItem>
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
                    {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the issue in as much detail as you can. Include reference numbers if applicable."
                maxLength={4000}
              />
              <p className="text-right text-xs text-muted-foreground">{message.length}/4000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTicketOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitTicket} disabled={submitting} className="gap-1.5">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
