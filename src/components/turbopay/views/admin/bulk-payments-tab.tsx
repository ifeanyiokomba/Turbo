"use client";

// TurboCore — Bulk Payment Admin Tab
//
// Create, validate, process, and monitor bulk payment batches.
// Supports CSV upload (paste), manual entry, and batch processing.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Upload,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  ChevronLeft,
  AlertTriangle,
  Clock,
  Users,
  DollarSign,
} from "lucide-react";

interface BulkBatch {
  id: string;
  batchRef: string;
  name: string | null;
  totalItems: number;
  totalAmountMinor: number;
  currency: string;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  completedAt: string | null;
  items?: BulkItem[];
}

interface BulkItem {
  id: string;
  rowNumber: number;
  recipientName: string;
  recipientAccount: string | null;
  bankCode: string | null;
  recipientPhone: string | null;
  amountMinor: number;
  currency: string;
  narration: string | null;
  status: string;
  errorMessage: string | null;
  providerRef: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  VALIDATING: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  PARTIALLY_COMPLETED: "bg-amber-100 text-amber-700",
  FAILED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  VALIDATED: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-amber-100 text-amber-700",
  SUCCESS: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700",
  REVERSED: "bg-rose-100 text-rose-700",
};

export default function BulkPaymentsTab() {
  const [batches, setBatches] = React.useState<BulkBatch[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedBatch, setSelectedBatch] = React.useState<BulkBatch | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  // Create form state
  const [batchName, setBatchName] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("BANK_TRANSFER");
  const [currency, setCurrency] = React.useState("NGN");
  const [csvText, setCsvText] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bulk-payments", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load batches");
        return;
      }
      const d = await res.json();
      setBatches(d.batches);
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const loadBatch = React.useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/bulk-payments?id=${id}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load batch");
        return;
      }
      const d = await res.json();
      setSelectedBatch(d.batch);
    } catch {
      toast.error("Network error");
    }
  }, []);

  const handleCreate = React.useCallback(async () => {
    setCreating(true);
    try {
      // Parse CSV: recipientName,recipientAccount,bankCode,amountMinor,narration
      const lines = csvText
        .trim()
        .split("\n")
        .filter((l) => l.trim());
      const items = lines.map((line) => {
        const parts = line.split(",").map((p) => p.trim());
        return {
          recipientName: parts[0] ?? "",
          recipientAccount: parts[1] ?? undefined,
          bankCode: parts[2] ?? undefined,
          amountMinor: Number(parts[3] ?? 0),
          narration: parts[4] ?? undefined,
        };
      });

      if (items.length === 0) {
        toast.error("No items to process");
        return;
      }

      const res = await fetch("/api/admin/bulk-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: batchName || `Bulk Batch ${new Date().toISOString().slice(0, 10)}`,
          paymentMethod,
          currency,
          items,
          source: "CSV",
        }),
      });
      const d = await res.json();
      if (d.success) {
        toast.success(d.message);
        setShowCreate(false);
        setCsvText("");
        setBatchName("");
        load();
      } else {
        toast.error(d.error ?? "Failed to create batch");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  }, [csvText, batchName, paymentMethod, currency, load]);

  const handleAction = React.useCallback(
    async (batchId: string, action: string) => {
      setActionLoading(true);
      try {
        const res = await fetch(`/api/admin/bulk-payments/${batchId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const d = await res.json();
        if (d.success) {
          toast.success(d.message ?? `Action ${action} completed`);
          loadBatch(batchId);
          load();
        } else {
          toast.error(d.error ?? d.message ?? `Failed to ${action}`);
        }
      } catch {
        toast.error("Network error");
      } finally {
        setActionLoading(false);
      }
    },
    [load, loadBatch]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  // Batch detail view
  if (selectedBatch) {
    const progress =
      selectedBatch.totalItems > 0
        ? Math.round(
            ((selectedBatch.successCount + selectedBatch.failedCount) / selectedBatch.totalItems) *
              100
          )
        : 0;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedBatch(null)}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h2 className="text-xl font-bold">{selectedBatch.name ?? selectedBatch.batchRef}</h2>
            <p className="text-muted-foreground text-sm">
              {selectedBatch.batchRef} · {selectedBatch.paymentMethod}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className={STATUS_COLORS[selectedBatch.status] ?? ""}>
            {selectedBatch.status}
          </Badge>
          <Badge variant="outline">{selectedBatch.currency}</Badge>
          <Badge variant="outline">{selectedBatch.totalItems} items</Badge>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground text-xs">Total Items</span>
            </div>
            <div className="text-2xl font-bold">{selectedBatch.totalItems}</div>
          </Card>
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-muted-foreground text-xs">Success</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">{selectedBatch.successCount}</div>
          </Card>
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-500" />
              <span className="text-muted-foreground text-xs">Failed</span>
            </div>
            <div className="text-2xl font-bold text-rose-600">{selectedBatch.failedCount}</div>
          </Card>
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-500" />
              <span className="text-muted-foreground text-xs">Total Amount</span>
            </div>
            <div className="text-2xl font-bold">
              {(selectedBatch.totalAmountMinor / 100).toLocaleString()} {selectedBatch.currency}
            </div>
          </Card>
        </div>

        {/* Progress bar */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm font-bold">{progress}%</span>
          </div>
          <div className="bg-muted h-3 w-full overflow-hidden rounded-full">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-muted-foreground mt-1 flex justify-between text-xs">
            <span>{selectedBatch.successCount} succeeded</span>
            <span>{selectedBatch.failedCount} failed</span>
            <span>{selectedBatch.pendingCount} pending</span>
          </div>
        </Card>

        {/* Actions */}
        {selectedBatch.status === "PENDING" && (
          <div className="flex gap-2">
            <Button
              onClick={() => handleAction(selectedBatch.id, "validate")}
              disabled={actionLoading}
              className="gap-2"
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Validate Items
            </Button>
            <Button
              variant="outline"
              onClick={() => handleAction(selectedBatch.id, "cancel")}
              disabled={actionLoading}
              className="gap-2"
            >
              Cancel
            </Button>
          </div>
        )}
        {(selectedBatch.status === "PROCESSING" ||
          selectedBatch.status === "PARTIALLY_COMPLETED") && (
          <Button
            onClick={() => handleAction(selectedBatch.id, "process")}
            disabled={actionLoading}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Process Batch
          </Button>
        )}

        {/* Items table */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Items ({selectedBatch.items?.length ?? 0})</h3>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-1">
              {selectedBatch.items?.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                  <span className="text-muted-foreground shrink-0 font-mono">
                    #{item.rowNumber}
                  </span>
                  <Badge className={`shrink-0 text-xs ${ITEM_STATUS_COLORS[item.status] ?? ""}`}>
                    {item.status}
                  </Badge>
                  <span className="shrink-0 font-medium">{item.recipientName}</span>
                  {item.recipientAccount && (
                    <span className="text-muted-foreground shrink-0">{item.recipientAccount}</span>
                  )}
                  <span className="ml-auto shrink-0 font-bold">
                    {(item.amountMinor / 100).toLocaleString()} {item.currency}
                  </span>
                  {item.errorMessage && (
                    <span className="ml-2 truncate text-rose-600">{item.errorMessage}</span>
                  )}
                  {item.providerRef && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {item.providerRef.slice(0, 12)}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <FileSpreadsheet className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Bulk Payments</h2>
            <p className="text-muted-foreground text-sm">
              Process thousands of payments in a single batch.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Batch
          </Button>
        </div>
      </div>

      {/* Batch list */}
      {batches?.length === 0 ? (
        <Card className="p-8 text-center">
          <Upload className="text-muted-foreground mx-auto mb-2 h-12 w-12" />
          <p className="text-muted-foreground text-sm">
            No bulk payment batches yet. Create one to get started.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {batches?.map((b) => {
            const progress =
              b.totalItems > 0
                ? Math.round(((b.successCount + b.failedCount) / b.totalItems) * 100)
                : 0;
            return (
              <Card
                key={b.id}
                className="hover:bg-muted/50 cursor-pointer p-4 transition-colors"
                onClick={() => loadBatch(b.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{b.name ?? b.batchRef}</span>
                      <Badge className={`text-xs ${STATUS_COLORS[b.status] ?? ""}`}>
                        {b.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {b.paymentMethod}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {b.batchRef} · {b.createdAt.slice(0, 10)} · {b.totalItems} items
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <div className="font-bold">
                      {(b.totalAmountMinor / 100).toLocaleString()} {b.currency}
                    </div>
                    <div className="mt-0.5 flex gap-2">
                      <span className="text-emerald-600">{b.successCount}✓</span>
                      <span className="text-rose-600">{b.failedCount}✗</span>
                      <span className="text-muted-foreground">{b.pendingCount}⏳</span>
                    </div>
                  </div>
                </div>
                {progress > 0 && (
                  <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
                    <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Bulk Payment Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="batchName">Batch Name</Label>
                <Input
                  id="batchName"
                  placeholder="e.g. July Payroll"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    <SelectItem value="WALLET">Wallet Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN (₦)</SelectItem>
                    <SelectItem value="KES">KES (KSh)</SelectItem>
                    <SelectItem value="GHS">GHS (₵)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="csv">
                Items (CSV format: name, account, bankCode, amountMinor, narration)
              </Label>
              <Textarea
                id="csv"
                placeholder={
                  "John Doe,0123456789,057,5000000,July salary\nJane Smith,0123456780,057,7500000,July salary\nBob Johnson,0123456781,057,3000000,Consulting fee"
                }
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="min-h-[200px] font-mono text-xs"
              />
              <p className="text-muted-foreground text-xs">
                Each line = one payment. Amount is in minor units (e.g., 5000000 = ₦50,000). Max
                10,000 items per batch.
              </p>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
              <AlertTriangle className="mr-1 inline h-4 w-4 text-amber-500" />
              After creation, click <strong>Validate</strong> to check all items, then{" "}
              <strong>Process</strong> to send payments.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !csvText.trim()} className="gap-2">
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
