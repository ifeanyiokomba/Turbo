"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { useApp } from "../store";
import { PageHeader } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  QrCode,
  Copy,
  Check,
  Share2,
  ScanLine,
  ArrowRight,
  RefreshCw,
  Wallet,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface VirtualAccount {
  accountNumber: string;
  accountName: string;
  bankName: string;
}

interface QrPayload {
  acc: string;
  name: string;
  bank: string;
}

function buildPayload(acc: VirtualAccount): string {
  const payload: QrPayload = {
    acc: acc.accountNumber,
    name: acc.accountName.toUpperCase(),
    bank: "Turbopay",
  };
  return JSON.stringify(payload);
}

function parsePayload(raw: string): QrPayload | null {
  try {
    const trimmed = raw.trim();
    const parsed = JSON.parse(trimmed) as Partial<QrPayload>;
    if (
      parsed &&
      typeof parsed.acc === "string" &&
      typeof parsed.name === "string" &&
      parsed.acc.length >= 6
    ) {
      return {
        acc: parsed.acc,
        name: parsed.name,
        bank: typeof parsed.bank === "string" ? parsed.bank : "Turbopay",
      };
    }
    return null;
  } catch {
    return null;
  }
}

export default function QrView() {
  const { setView, user } = useApp();
  const [account, setAccount] = React.useState<VirtualAccount | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [payloadInput, setPayloadInput] = React.useState("");
  const [parsed, setParsed] = React.useState<QrPayload | null>(null);
  const [parsing, setParsing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.virtualAccount) {
          setAccount(data.virtualAccount as VirtualAccount);
        } else if (user?.fullName) {
          // Fallback synthetic account if user has no virtual account yet
          setAccount({
            accountNumber: "0000000000",
            accountName: user.fullName,
            bankName: "Turbopay MFB",
          });
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.fullName]);

  React.useEffect(() => {
    load();
  }, [load]);

  const payload = account ? buildPayload(account) : "";
  const shareLink = account
    ? `turbopay://pay?acc=${encodeURIComponent(account.accountNumber)}&name=${encodeURIComponent(account.accountName)}`
    : "";

  async function copyAccount() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.accountNumber);
      setCopied(true);
      toast.success("Account number copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function handleShare() {
    if (!account) return;
    const shareData = {
      title: "Turbopay account",
      text: `Pay to ${account.accountName} · ${account.accountNumber} (${account.bankName})`,
      url: shareLink || undefined,
    };
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(
        `${shareData.text}${shareData.url ? " — " + shareData.url : ""}`,
      );
      toast.success("Share link copied");
    } catch {
      // User cancelled or unsupported — fall back to copy
      try {
        await navigator.clipboard.writeText(
          `${shareData.text}${shareData.url ? " — " + shareData.url : ""}`,
        );
        toast.success("Share link copied");
      } catch {
        toast.error("Sharing not supported on this device");
      }
    }
  }

  function handleParse() {
    setParsing(true);
    const result = parsePayload(payloadInput);
    setParsing(false);
    if (!result) {
      toast.error("Invalid QR payload. Paste the JSON you scanned.");
      setParsed(null);
      return;
    }
    setParsed(result);
    toast.success(`Resolved: ${result.name}`);
  }

  function handlePay() {
    if (!parsed) return;
    try {
      sessionStorage.setItem(
        "tp_prefill_qr",
        JSON.stringify({
          acc: parsed.acc,
          name: parsed.name,
          bank: parsed.bank,
        }),
      );
    } catch {
      // ignore — fall back to no prefill
    }
    setView("transfer");
  }

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="QR Pay"
        subtitle="Receive money with your QR code or pay by scanning one."
      />

      <Tabs defaultValue="receive" className="space-y-5">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="receive" className="gap-1.5">
            <QrCode className="h-3.5 w-3.5" /> Receive
          </TabsTrigger>
          <TabsTrigger value="scan" className="gap-1.5">
            <ScanLine className="h-3.5 w-3.5" /> Scan
          </TabsTrigger>
        </TabsList>

        {/* ============== RECEIVE TAB ============== */}
        <TabsContent value="receive" className="space-y-5">
          {loading ? (
            <Card className="mx-auto max-w-md p-8">
              <div className="mx-auto h-64 w-64 animate-pulse rounded-2xl bg-muted" />
              <div className="mt-6 h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
            </Card>
          ) : !account ? (
            <Card className="mx-auto max-w-md p-8 text-center">
              <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 font-semibold">No virtual account yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Fund your wallet to generate a virtual account and unlock QR receiving.
              </p>
              <Button className="mt-4 gap-1.5" onClick={() => setView("wallet")}>
                Fund wallet <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          ) : (
            <Card className="mx-auto max-w-md p-6 sm:p-8">
              {/* QR card */}
              <div className="flex flex-col items-center text-center">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <QRCodeSVG
                      value={payload}
                      size={208}
                      level="M"
                      includeMargin={false}
                      bgColor="#ffffff"
                      fgColor="#0d6348"
                    />
                  </div>
                </div>
                <p className="mt-4 text-sm font-semibold">
                  Show this QR to receive money
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Any Turbopay user can scan this to send you funds instantly — no
                  account number needed.
                </p>
              </div>

              {/* Account details */}
              <div className="mt-6 space-y-3 rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    Account number
                  </span>
                  <button
                    onClick={copyAccount}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-sm font-semibold hover:bg-muted"
                  >
                    {account.accountNumber}
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    Account name
                  </span>
                  <span className="text-right text-sm font-medium">
                    {account.accountName}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Bank</span>
                  <Badge variant="secondary" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> {account.bankName}
                  </Badge>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={copyAccount}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  Copy account
                </Button>
                <Button className="flex-1 gap-1.5" onClick={handleShare}>
                  <Share2 className="h-4 w-4" /> Share
                </Button>
              </div>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Encoded as JSON ·{" "}
                <span className="font-mono">{payload.length} chars</span>
              </p>
            </Card>
          )}
        </TabsContent>

        {/* ============== SCAN TAB ============== */}
        <TabsContent value="scan" className="space-y-5">
          <Card className="mx-auto max-w-md p-6 sm:p-8">
            {/* Simulated scanner frame */}
            <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-slate-900">
              {/* Corner brackets */}
              <span className="pointer-events-none absolute left-3 top-3 h-7 w-7 rounded-tl-lg border-l-2 border-t-2 border-emerald-400" />
              <span className="pointer-events-none absolute right-3 top-3 h-7 w-7 rounded-tr-lg border-r-2 border-t-2 border-emerald-400" />
              <span className="pointer-events-none absolute bottom-3 left-3 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-emerald-400" />
              <span className="pointer-events-none absolute bottom-3 right-3 h-7 w-7 rounded-br-lg border-b-2 border-r-2 border-emerald-400" />
              {/* Animated scan line */}
              <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-400/80 shadow-[0_0_12px_2px_oklch(0.72_0.14_162_/_0.6)] tp-pulse-dot" />
              {/* Center icon */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white/80">
                <ScanLine className="h-10 w-10" />
                <p className="px-8 text-xs">
                  Camera scanning is coming soon. Paste a QR payload below to pay.
                </p>
              </div>
            </div>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Ask the recipient to open{" "}
              <span className="font-medium text-foreground">Turbopay → QR Pay → Receive</span>{" "}
              and share their QR payload with you.
            </p>

            {/* Manual payload entry */}
            <div className="mt-5 space-y-2">
              <Label htmlFor="qr-payload">Enter QR payload (JSON)</Label>
              <Input
                id="qr-payload"
                placeholder='{"acc":"0123456789","name":"JOHN DOE","bank":"Turbopay"}'
                value={payloadInput}
                onChange={(e) => {
                  setPayloadInput(e.target.value);
                  setParsed(null);
                }}
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={handleParse}
                  disabled={parsing || payloadInput.trim().length === 0}
                >
                  {parsing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ScanLine className="h-4 w-4" />
                  )}
                  Validate
                </Button>
                <Button
                  className="flex-1 gap-1.5"
                  onClick={handlePay}
                  disabled={!parsed}
                >
                  Pay <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Parsed preview */}
            {parsed && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Recipient verified
                </p>
                <p className="mt-1.5 text-sm font-medium">{parsed.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {parsed.acc} · {parsed.bank}
                </p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
