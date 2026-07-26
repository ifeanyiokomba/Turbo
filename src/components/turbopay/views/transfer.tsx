"use client";

import * as React from "react";
import { useApp } from "../store";
import { usePin } from "../parts/pin-dialog";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  ArrowLeftRight,
  Landmark,
  Search,
  Star,
  Trash2,
  CheckCircle2,
  RefreshCw,
  UserPlus,
  ChevronRight,
  ShieldCheck,
  Bookmark,
  Save,
  BookmarkPlus,
} from "lucide-react";
import { UNIQUE_BANKS } from "@/lib/banks";
import { naira, nairaPlain, parseKobo } from "@/lib/money";
import { toast } from "sonner";

type TransferType = "TURBOPAY" | "BANK";

interface Beneficiary {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string;
  bankCode: string | null;
  type: string;
  isFavorite: boolean;
  lastUsedAt: string | null;
}

interface ResolveResult {
  name: string;
  type: "TURBOPAY" | "BANK";
  accountNumber?: string;
  bankName?: string;
  username?: string;
  source?: "paystack" | "mock";
}

interface TransferResult {
  transaction: {
    id: string;
    reference: string;
    amountKobo: number;
    feeKobo: number;
    counterpartyName: string | null;
    counterpartyAccount: string | null;
    counterpartyBank: string | null;
    createdAt: string;
  };
  newBalance: number;
  type: TransferType;
  recipientName: string;
}

interface TransferTemplate {
  id: string;
  name: string;
  type: string;
  recipientName: string;
  accountNumber: string;
  bankCode: string | null;
  bankName: string | null;
  amountKobo: number | null;
  note: string | null;
  isFavorite: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const BANK_FEE_KOBO = 5250;

export default function TransferView() {
  const { setView } = useApp();
  const pin = usePin();

  const [type, setType] = React.useState<TransferType>("TURBOPAY");

  // Turbopay form
  const [tpRecipient, setTpRecipient] = React.useState("");
  const [tpResolved, setTpResolved] = React.useState<ResolveResult | null>(null);
  const [tpResolving, setTpResolving] = React.useState(false);

  // Bank form
  const [bankCode, setBankCode] = React.useState("");
  const [bankAccount, setBankAccount] = React.useState("");
  const [bankResolved, setBankResolved] = React.useState<ResolveResult | null>(null);
  const [bankResolving, setBankResolving] = React.useState(false);
  // null = idle, true = resolved OK, false = resolution failed (show "Proceed anyway" option)
  const [bankResolveStatus, setBankResolveStatus] = React.useState<null | boolean>(null);
  // When true, the user accepted the "Proceed anyway" prompt after a failed resolve.
  const [bankProceedAnyway, setBankProceedAnyway] = React.useState(false);
  // Tracks the in-flight resolve request so a stale response never overwrites a newer one.
  const resolveSeqRef = React.useRef(0);

  // Shared fields
  const [amountInput, setAmountInput] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saveBeneficiary, setSaveBeneficiary] = React.useState(true);
  const [saveTemplate, setSaveTemplate] = React.useState(false);

  // Beneficiaries list
  const [beneficiaries, setBeneficiaries] = React.useState<Beneficiary[]>([]);
  const [benLoading, setBenLoading] = React.useState(true);

  // Templates list
  const [templates, setTemplates] = React.useState<TransferTemplate[]>([]);
  const [tplLoading, setTplLoading] = React.useState(true);

  // Confirm + success
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<TransferResult | null>(null);

  // Save-template dialog (opened either after success via checkbox or via success card button)
  const [tplDialogOpen, setTplDialogOpen] = React.useState(false);
  const [tplName, setTplName] = React.useState("");
  const [tplSaving, setTplSaving] = React.useState(false);
  // Snapshot of the transfer details at the moment of success — used to seed the template payload
  const [lastTransfer, setLastTransfer] = React.useState<{
    type: TransferType;
    recipientName: string;
    accountNumber: string;
    bankCode: string | null;
    bankName: string | null;
    amountKobo: number;
    note: string;
  } | null>(null);

  const amountKobo = parseKobo(amountInput);
  const feeKobo = type === "BANK" ? BANK_FEE_KOBO : 0;
  const totalKobo = amountKobo + feeKobo;

  const resolved = type === "TURBOPAY" ? tpResolved : bankResolved;
  const recipientLabel = type === "TURBOPAY" ? tpRecipient : bankAccount;

  const loadBeneficiaries = React.useCallback(async () => {
    setBenLoading(true);
    try {
      const res = await fetch("/api/beneficiaries", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setBeneficiaries(json.beneficiaries ?? []);
      }
    } finally {
      setBenLoading(false);
    }
  }, []);

  const loadTemplates = React.useCallback(async () => {
    setTplLoading(true);
    try {
      const res = await fetch("/api/transfer-templates", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setTemplates(json.templates ?? []);
      }
    } finally {
      setTplLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadBeneficiaries();
    loadTemplates();
  }, [loadBeneficiaries, loadTemplates]);

  // Prefill from beneficiaries view "Send" action
  React.useEffect(() => {
    try {
      const id = sessionStorage.getItem("tp_prefill_beneficiary");
      if (!id) return;
      sessionStorage.removeItem("tp_prefill_beneficiary");
      (async () => {
        try {
          const res = await fetch("/api/beneficiaries", { cache: "no-store" });
          if (!res.ok) return;
          const json = await res.json();
          const found: Beneficiary | undefined = (json.beneficiaries ?? []).find(
            (b: Beneficiary) => b.id === id,
          );
          if (found) prefill(found);
        } catch {}
      })();
    } catch {}
  }, []);

  // Prefill from QR Pay "Scan" action — JSON payload {acc, name, bank}
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem("tp_prefill_qr");
      if (!raw) return;
      sessionStorage.removeItem("tp_prefill_qr");
      const parsed = JSON.parse(raw) as {
        acc: string;
        name: string;
        bank?: string;
      };
      if (!parsed?.acc || !parsed?.name) return;
      setType("TURBOPAY");
      setTpRecipient(parsed.acc);
      setTpResolved({
        name: parsed.name,
        type: "TURBOPAY",
        accountNumber: parsed.acc,
        username: parsed.acc,
      });
      setAmountInput("");
      setNote("");
      setSaveBeneficiary(false);
      toast.success(`Prefilled ${parsed.name}`);
    } catch {}
  }, []);

  function resetForm() {
    setTpRecipient("");
    setTpResolved(null);
    setBankCode("");
    setBankAccount("");
    setBankResolved(null);
    setBankResolveStatus(null);
    setBankProceedAnyway(false);
    setAmountInput("");
    setNote("");
    setSaveBeneficiary(true);
    setSaveTemplate(false);
  }

  async function resolveTurbopay() {
    const q = tpRecipient.trim();
    if (q.length < 3) {
      toast.error("Enter a valid username, phone, email or account number");
      return;
    }
    setTpResolving(true);
    setTpResolved(null);
    try {
      const url = `/api/transfer/resolve?query=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not resolve recipient");
        return;
      }
      setTpResolved(json);
      toast.success(`Resolved: ${json.name}`);
    } finally {
      setTpResolving(false);
    }
  }

  async function resolveBank(): Promise<boolean> {
    const acc = bankAccount.trim();
    if (!/^\d{6,10}$/.test(acc)) return false;
    if (!bankCode) return false;
    const seq = ++resolveSeqRef.current;
    setBankResolving(true);
    setBankResolved(null);
    setBankResolveStatus(null);
    setBankProceedAnyway(false);
    try {
      const url = `/api/transfer/resolve?query=${encodeURIComponent(acc)}&bankCode=${encodeURIComponent(bankCode)}`;
      const res = await fetch(url);
      const payload = await res.json();
      // Drop the response if a newer resolve was kicked off while we were waiting.
      if (seq !== resolveSeqRef.current) return false;
      if (!res.ok) {
        setBankResolveStatus(false);
        toast.error(payload?.error ?? "Could not verify account name");
        return false;
      }
      setBankResolved(payload);
      setBankResolveStatus(true);
      return true;
    } catch {
      if (seq !== resolveSeqRef.current) return false;
      setBankResolveStatus(false);
      return false;
    } finally {
      if (seq === resolveSeqRef.current) setBankResolving(false);
    }
  }

  // Debounced auto-resolve — 500ms after the user stops typing a 6–10 digit
  // account number while a bank is selected. Cancels any in-flight resolve via
  // the seq counter so a stale fetch can never overwrite a fresh one.
  React.useEffect(() => {
    const acc = bankAccount.trim();
    if (!bankCode || !/^\d{6,10}$/.test(acc)) {
      setBankResolved(null);
      setBankResolveStatus(null);
      setBankProceedAnyway(false);
      return;
    }
    const t = setTimeout(() => {
      // Fire-and-forget; resolveBank tracks its own seq guard.
      void resolveBank();
    }, 500);
    return () => clearTimeout(t);
  }, [bankAccount, bankCode, resolveBank]);

  function canContinue(): boolean {
    if (amountKobo <= 0) return false;
    if (type === "TURBOPAY") return !!tpResolved;
    // Bank transfer: Continue is enabled when account name is verified OR the
    // user explicitly chose "Proceed anyway" after a failed resolution.
    if (!bankCode || !/^\d{6,10}$/.test(bankAccount.trim())) return false;
    if (bankResolving) return false;
    if (bankResolveStatus === true && bankResolved) return true;
    if (bankResolveStatus === false && bankProceedAnyway) return true;
    return false;
  }

  function onContinue() {
    if (!canContinue()) {
      toast.error("Resolve recipient and enter amount first");
      return;
    }
    setConfirmOpen(true);
  }

  async function submitTransfer() {
    setConfirmOpen(false);
    try {
      const pinValue = await pin.request({
        title: "Confirm transfer",
        description: `Send ${naira(amountKobo)} to ${resolved?.name ?? recipientLabel}`,
      });
      if (!pinValue || pinValue.length !== 4) {
        toast.error("PIN required to authorise transfer");
        return;
      }
      setSubmitting(true);
      const body = {
        type,
        recipient: type === "TURBOPAY" ? tpRecipient.trim() : bankAccount.trim(),
        bankCode: type === "BANK" ? bankCode : undefined,
        amountKobo,
        note,
        pin: pinValue,
        saveBeneficiary,
      };
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Transfer failed");
        return;
      }
      // Snapshot for potential template save
      const snapshot = {
        type,
        recipientName: json.recipientName ?? resolved?.name ?? recipientLabel,
        accountNumber:
          type === "TURBOPAY"
            ? tpRecipient.trim() || (tpResolved?.accountNumber ?? "")
            : bankAccount.trim(),
        bankCode: type === "BANK" ? bankCode : null,
        bankName:
          type === "BANK"
            ? bankResolved?.bankName ?? UNIQUE_BANKS.find((b) => b.code === bankCode)?.name ?? null
            : null,
        amountKobo,
        note,
      };
      setLastTransfer(snapshot);
      setResult(json);
      const wantsTemplate = saveTemplate;
      resetForm();
      loadBeneficiaries();
      toast.success("Transfer successful");
      if (wantsTemplate) {
        // Pre-seed the name field and open the save-template dialog
        setTplName(
          `${snapshot.recipientName} — ${nairaPlain(snapshot.amountKobo)}`.slice(0, 60),
        );
        setTplDialogOpen(true);
      }
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleFavorite(b: Beneficiary) {
    const next = !b.isFavorite;
    setBeneficiaries((arr) =>
      arr.map((x) => (x.id === b.id ? { ...x, isFavorite: next } : x)),
    );
    try {
      await fetch(`/api/beneficiaries/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      });
    } catch {
      // revert on failure
      setBeneficiaries((arr) =>
        arr.map((x) => (x.id === b.id ? { ...x, isFavorite: !next } : x)),
      );
    }
  }

  async function deleteBeneficiary(b: Beneficiary) {
    const prev = beneficiaries;
    setBeneficiaries((arr) => arr.filter((x) => x.id !== b.id));
    try {
      const res = await fetch(`/api/beneficiaries/${b.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Beneficiary removed");
    } catch {
      setBeneficiaries(prev);
      toast.error("Could not delete beneficiary");
    }
  }

  function prefill(b: Beneficiary) {
    if (b.type === "TURBOPAY") {
      setType("TURBOPAY");
      setTpRecipient(b.accountNumber);
      setTpResolved({
        name: b.name,
        type: "TURBOPAY",
        accountNumber: b.accountNumber,
        username: b.accountNumber,
      });
    } else {
      setType("BANK");
      setBankCode(b.bankCode ?? "");
      setBankAccount(b.accountNumber);
      setBankResolved({
        name: b.name,
        type: "BANK",
        accountNumber: b.accountNumber,
        bankName: b.bankName,
        source: "mock",
      });
      setBankResolveStatus(true);
      setBankProceedAnyway(false);
    }
    setAmountInput("");
    setNote("");
    setSaveBeneficiary(false);
    toast.success(`Prefilled ${b.name}`);
  }

  function prefillTemplate(t: TransferTemplate) {
    if (t.type === "TURBOPAY") {
      setType("TURBOPAY");
      setTpRecipient(t.accountNumber);
      setTpResolved({
        name: t.recipientName,
        type: "TURBOPAY",
        accountNumber: t.accountNumber,
        username: t.accountNumber,
      });
    } else {
      setType("BANK");
      setBankCode(t.bankCode ?? "");
      setBankAccount(t.accountNumber);
      setBankResolved({
        name: t.recipientName,
        type: "BANK",
        accountNumber: t.accountNumber,
        bankName: t.bankName ?? "",
        source: "mock",
      });
      setBankResolveStatus(true);
      setBankProceedAnyway(false);
    }
    setAmountInput(t.amountKobo ? String(t.amountKobo / 100) : "");
    setNote(t.note ?? "");
    setSaveBeneficiary(false);
    setSaveTemplate(false);
    // Bump lastUsedAt optimistically + persist via PATCH (touch)
    setTemplates((arr) =>
      arr.map((x) => (x.id === t.id ? { ...x, lastUsedAt: new Date().toISOString() } : x)),
    );
    fetch(`/api/transfer-templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ touch: true }),
    }).catch(() => {
      /* non-fatal */
    });
    toast.success(`Template applied: ${t.name}`);
  }

  async function toggleFavoriteTemplate(t: TransferTemplate) {
    const next = !t.isFavorite;
    setTemplates((arr) =>
      arr.map((x) => (x.id === t.id ? { ...x, isFavorite: next } : x)),
    );
    try {
      await fetch(`/api/transfer-templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      });
    } catch {
      setTemplates((arr) =>
        arr.map((x) => (x.id === t.id ? { ...x, isFavorite: !next } : x)),
      );
    }
  }

  async function deleteTemplate(t: TransferTemplate) {
    const prev = templates;
    setTemplates((arr) => arr.filter((x) => x.id !== t.id));
    try {
      const res = await fetch(`/api/transfer-templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Template removed");
    } catch {
      setTemplates(prev);
      toast.error("Could not delete template");
    }
  }

  async function saveTemplateFromSnapshot() {
    if (!lastTransfer) return;
    const name = tplName.trim();
    if (!name) {
      toast.error("Give your template a name");
      return;
    }
    setTplSaving(true);
    try {
      const res = await fetch("/api/transfer-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: lastTransfer.type,
          recipientName: lastTransfer.recipientName,
          accountNumber: lastTransfer.accountNumber,
          bankCode: lastTransfer.bankCode,
          bankName: lastTransfer.bankName,
          amountKobo: lastTransfer.amountKobo,
          note: lastTransfer.note || null,
          isFavorite: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not save template");
        return;
      }
      toast.success("Template saved");
      setTplDialogOpen(false);
      setTplName("");
      loadTemplates();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setTplSaving(false);
    }
  }

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="Transfer"
        subtitle="Send money to Turbopay users or any Nigerian bank account."
      />

      {result ? (
        <SuccessCard
          result={result}
          onNew={() => {
            setResult(null);
            setLastTransfer(null);
          }}
          onViewHistory={() => setView("history")}
          onSaveTemplate={() => {
            // Seed the name from the transfer result and open the dialog
            const r = result;
            const seed = `${r.recipientName ?? r.transaction.counterpartyName ?? "Transfer"} — ${nairaPlain(r.transaction.amountKobo)}`.slice(0, 60);
            setTplName(seed);
            setTplDialogOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column - form */}
          <div className="space-y-6 lg:col-span-2">
            <Card className="p-5">
              <Tabs value={type} onValueChange={(v) => setType(v as TransferType)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="TURBOPAY" className="gap-1.5">
                    <ArrowLeftRight className="h-3.5 w-3.5" /> Turbopay
                  </TabsTrigger>
                  <TabsTrigger value="BANK" className="gap-1.5">
                    <Landmark className="h-3.5 w-3.5" /> Bank
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="TURBOPAY" className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="tp-recipient">Recipient</Label>
                    <div className="flex gap-2">
                      <Input
                        id="tp-recipient"
                        placeholder="@username, phone, email or account no."
                        value={tpRecipient}
                        onChange={(e) => {
                          setTpRecipient(e.target.value);
                          setTpResolved(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") resolveTurbopay();
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={resolveTurbopay}
                        disabled={tpResolving || tpRecipient.trim().length < 3}
                        className="gap-1.5 shrink-0"
                      >
                        {tpResolving ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        Resolve
                      </Button>
                    </div>
                    {tpResolved && (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-sm font-medium">{tpResolved.name}</span>
                        <Badge variant="secondary" className="ml-auto">Turbopay user</Badge>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="BANK" className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank-select">Bank</Label>
                    <Select value={bankCode} onValueChange={(v) => { setBankCode(v); setBankResolved(null); setBankResolveStatus(null); setBankProceedAnyway(false); }}>
                      <SelectTrigger id="bank-select" className="w-full">
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {UNIQUE_BANKS.map((b) => (
                          <SelectItem key={b.code + b.name} value={b.code}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank-account">Account number</Label>
                    <div className="flex gap-2">
                      <Input
                        id="bank-account"
                        inputMode="numeric"
                        placeholder="0123456789"
                        value={bankAccount}
                        onChange={(e) => {
                          setBankAccount(e.target.value.replace(/[^\d]/g, ""));
                          setBankResolved(null);
                          setBankResolveStatus(null);
                          setBankProceedAnyway(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") resolveBank();
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => { void resolveBank(); }}
                        disabled={bankResolving || !bankCode || bankAccount.length < 6}
                        className="gap-1.5 shrink-0"
                      >
                        {bankResolving ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        Re-check
                      </Button>
                    </div>
                    {/* Resolving — inline spinner + hint */}
                    {bankResolving && (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
                        <span className="text-sm text-muted-foreground">Verifying account name…</span>
                      </div>
                    )}
                    {/* Resolved — green confirmation box */}
                    {!bankResolving && bankResolveStatus === true && bankResolved && (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-sm font-medium">{bankResolved.name}</span>
                        <Badge
                          variant="secondary"
                          className="ml-auto gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        >
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </Badge>
                      </div>
                    )}
                    {/* Failed — amber warning + Proceed anyway option */}
                    {!bankResolving && bankResolveStatus === false && (
                      <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                        <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                          <ShieldCheck className="h-4 w-4 shrink-0" />
                          <span>Could not verify account name. Proceed with caution.</span>
                        </div>
                        {!bankProceedAnyway ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 w-full gap-1.5 border-amber-500/40 text-amber-800 hover:bg-amber-500/10 dark:text-amber-300"
                            onClick={() => setBankProceedAnyway(true)}
                          >
                            Proceed anyway
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Continuing without verification.</span>
                            <button
                              type="button"
                              className="ml-auto underline-offset-2 hover:underline"
                              onClick={() => { setBankProceedAnyway(false); void resolveBank(); }}
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Shared fields */}
              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₦)</Label>
                  <Input
                    id="amount"
                    inputMode="numeric"
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[1000, 5000, 10000, 25000, 50000].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAmountInput(String(v))}
                        className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                      >
                        ₦{v.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note">Note (optional)</Label>
                  <Input
                    id="note"
                    placeholder="What's this for?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={100}
                  />
                </div>

                {/* Fee + total */}
                <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Transfer fee</span>
                    <span className="font-medium tabular-nums">
                      {feeKobo > 0 ? naira(feeKobo) : "Free"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t pt-1.5">
                    <span className="font-medium">Total debit</span>
                    <span className="font-bold tabular-nums">{naira(totalKobo)}</span>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={saveBeneficiary}
                    onCheckedChange={(v) => setSaveBeneficiary(v === true)}
                  />
                  Save as beneficiary
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={saveTemplate}
                    onCheckedChange={(v) => setSaveTemplate(v === true)}
                  />
                  <span className="flex items-center gap-1">
                    <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
                    Save as template
                    <span className="text-xs text-muted-foreground">
                      (prompt for name after transfer)
                    </span>
                  </span>
                </label>

                <Button
                  className="w-full gap-1.5"
                  size="lg"
                  disabled={!canContinue() || submitting}
                  onClick={onContinue}
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </div>

          {/* Right column - beneficiaries */}
          <div className="space-y-4">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Beneficiaries</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 px-2"
                  onClick={() => setView("beneficiaries")}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Manage
                </Button>
              </div>
              {benLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : beneficiaries.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title="No beneficiaries yet"
                  description="Saved recipients will appear here."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setView("beneficiaries")}
                    >
                      Add beneficiary
                    </Button>
                  }
                />
              ) : (
                <div className="max-h-96 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
                  {beneficiaries.map((b) => (
                    <div
                      key={b.id}
                      className="group flex items-center gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/40"
                    >
                      <button
                        onClick={() => prefill(b)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <span className="text-xs font-bold">
                            {b.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{b.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {b.accountNumber} · {b.bankName}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => toggleFavorite(b)}
                        className="shrink-0 p-1.5"
                        title={b.isFavorite ? "Unfavorite" : "Favorite"}
                      >
                        <Star
                          className={`h-4 w-4 ${
                            b.isFavorite
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground"
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => deleteBeneficiary(b)}
                        className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold">Safe &amp; secure</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    All transfers require your 4-digit PIN. Bank transfers are
                    protected by name verification.
                  </p>
                </div>
              </div>
            </Card>

            {/* Saved templates */}
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Bookmark className="h-4 w-4 text-primary" /> Templates
                </p>
                <span className="text-xs text-muted-foreground">
                  {templates.length} saved
                </span>
              </div>
              {tplLoading ? (
                <div className="space-y-2">
                  {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : templates.length === 0 ? (
                <EmptyState
                  icon={BookmarkPlus}
                  title="No templates yet"
                  description="Save your recurring transfers for quick access."
                />
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="group rounded-xl border border-transparent p-2.5 transition-colors hover:border-border hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {t.type === "TURBOPAY" ? (
                            <ArrowLeftRight className="h-4 w-4" />
                          ) : (
                            <Landmark className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{t.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {t.recipientName} · {t.accountNumber}
                            {t.bankName ? ` · ${t.bankName}` : ""}
                          </p>
                          {t.amountKobo ? (
                            <p className="mt-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                              {naira(t.amountKobo)}
                              {t.note ? ` · ${t.note}` : ""}
                            </p>
                          ) : null}
                        </div>
                        <button
                          onClick={() => toggleFavoriteTemplate(t)}
                          className="shrink-0 p-1.5"
                          title={t.isFavorite ? "Unfavorite" : "Favorite"}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              t.isFavorite
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground"
                            }`}
                          />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 flex-1 gap-1.5"
                          onClick={() => prefillTemplate(t)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" /> Use
                        </Button>
                        <button
                          onClick={() => deleteTemplate(t)}
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete template"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Save-template dialog */}
      <Dialog open={tplDialogOpen} onOpenChange={setTplDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save transfer template</DialogTitle>
            <DialogDescription>
              Give this transfer a name so you can quickly reuse it next time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                placeholder="e.g. Monthly rent to John"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                maxLength={60}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !tplSaving) saveTemplateFromSnapshot();
                }}
              />
            </div>
            {lastTransfer && (
              <div className="rounded-xl border bg-muted/40 p-3 text-xs">
                <Row label="Recipient" value={lastTransfer.recipientName} />
                <Row
                  label="Account"
                  value={
                    lastTransfer.type === "BANK"
                      ? `${lastTransfer.accountNumber}${lastTransfer.bankName ? ` · ${lastTransfer.bankName}` : ""}`
                      : lastTransfer.accountNumber
                  }
                />
                <Row label="Amount" value={naira(lastTransfer.amountKobo)} />
                {lastTransfer.note && <Row label="Note" value={lastTransfer.note} />}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1" onClick={() => setTplDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 gap-1.5"
              disabled={tplSaving || !tplName.trim()}
              onClick={saveTemplateFromSnapshot}
            >
              {tplSaving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm transfer</DialogTitle>
            <DialogDescription>Review the details before continuing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Row label="Recipient" value={resolved?.name ?? recipientLabel} />
            <Row
              label="Account"
              value={
                type === "TURBOPAY"
                  ? tpResolved?.username ?? tpRecipient
                  : `${bankAccount} · ${bankResolved?.bankName ?? ""}`
              }
            />
            <Row label="Amount" value={naira(amountKobo)} />
            <Row label="Fee" value={feeKobo > 0 ? naira(feeKobo) : "Free"} />
            {note && <Row label="Note" value={note} />}
            <div className="rounded-xl border bg-muted/50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Total debit</span>
                <span className="text-lg font-bold tabular-nums">{naira(totalKobo)}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 gap-1.5"
              disabled={submitting}
              onClick={submitTransfer}
            >
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Enter PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SuccessCard({
  result,
  onNew,
  onViewHistory,
  onSaveTemplate,
}: {
  result: TransferResult;
  onNew: () => void;
  onViewHistory: () => void;
  onSaveTemplate: () => void;
}) {
  const tx = result.transaction;
  return (
    <Card className="mx-auto max-w-md p-6 text-center tp-fade-rise">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h2 className="mt-4 text-xl font-bold">Transfer successful</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {naira(tx.amountKobo)} sent to{" "}
        <span className="font-medium text-foreground">
          {tx.counterpartyName ?? result.recipientName}
        </span>
      </p>

      <div className="mt-5 space-y-2 rounded-xl border bg-muted/40 p-4 text-left text-sm">
        <Row label="Reference" value={tx.reference} />
        <Row label="Amount" value={naira(tx.amountKobo)} />
        {tx.feeKobo > 0 && <Row label="Fee" value={naira(tx.feeKobo)} />}
        {tx.counterpartyBank && <Row label="Bank" value={tx.counterpartyBank} />}
        <Row label="New balance" value={nairaPlain(result.newBalance)} />
        <Row
          label="Date"
          value={new Date(tx.createdAt).toLocaleString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        />
      </div>

      <button
        onClick={onSaveTemplate}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <BookmarkPlus className="h-4 w-4" /> Save as template
      </button>

      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onNew}>
          <ArrowLeftRight className="h-4 w-4" /> New transfer
        </Button>
        <Button className="flex-1 gap-1.5" onClick={onViewHistory}>
          View receipt <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
