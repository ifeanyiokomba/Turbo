"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import jsQR from "jsqr";
import { useApp } from "../store";
import { usePin } from "../parts/pin-dialog";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Upload,
  Camera,
  X,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { naira, nairaCompact, formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface VirtualAccount {
  accountNumber: string;
  accountName: string;
  bankName: string;
}

interface GeneratedQr {
  token: string;
  qrPayload: string;
  reference: string;
  expiresAt: string;
  payload: {
    recipientName: string;
    accountNumber: string;
    bankName: string;
    amountKobo: number | null;
    note: string | null;
  };
}

interface ResolvedQr {
  resolved: boolean;
  recipient: {
    id: string;
    name: string;
    accountNumber: string;
    bankName: string;
  };
  amountKobo: number | null;
  note: string | null;
  reference: string | null;
  expiresAt: string;
}

interface QrHistoryItem {
  id: string;
  reference: string;
  qrReference: string | null;
  direction: string;
  amountKobo: number;
  status: string;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  description: string | null;
  note: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export default function QrView() {
  const { setView, user } = useApp();
  const pin = usePin();

  const [account, setAccount] = React.useState<VirtualAccount | null>(null);
  const [loading, setLoading] = React.useState(true);

  // ---- Receive tab: dynamic QR generation ----
  const [amountInput, setAmountInput] = React.useState("");
  const [noteInput, setNoteInput] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [generatedQr, setGeneratedQr] = React.useState<GeneratedQr | null>(null);
  const [copiedAcc, setCopiedAcc] = React.useState(false);

  // ---- Scan tab ----
  const [scanToken, setScanToken] = React.useState("");
  const [resolving, setResolving] = React.useState(false);
  const [resolved, setResolved] = React.useState<ResolvedQr | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [paying, setPaying] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [cameraOn, setCameraOn] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // ---- History tab ----
  const [history, setHistory] = React.useState<QrHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.virtualAccount) {
          setAccount(data.virtualAccount as VirtualAccount);
        } else if (user?.fullName) {
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

  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/qr/history", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setHistory(json.history ?? []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    loadHistory();
  }, [load, loadHistory]);

  const staticPayload = account
    ? JSON.stringify({
        type: "turbopay-qr-static",
        acc: account.accountNumber,
        name: account.accountName.toUpperCase(),
        bank: "Turbopay",
      })
    : "";

  async function generateQr() {
    const amountKobo = amountInput.trim() === "" ? null : Math.round(Number(amountInput) * 100);
    if (amountKobo !== null && (!Number.isFinite(amountKobo) || amountKobo <= 0)) {
      toast.error("Amount must be greater than zero");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/qr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountKobo: amountKobo ?? undefined,
          note: noteInput.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not generate QR");
        return;
      }
      setGeneratedQr(json as GeneratedQr);
      toast.success("Payment QR generated");
    } finally {
      setGenerating(false);
    }
  }

  async function copyAccount() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.accountNumber);
      setCopiedAcc(true);
      toast.success("Account number copied");
      setTimeout(() => setCopiedAcc(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function shareStatic() {
    if (!account) return;
    const shareData = {
      title: "Turbopay account",
      text: `Pay to ${account.accountName} · ${account.accountNumber} (${account.bankName})`,
    };
    try {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share) {
        await nav.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareData.text);
      toast.success("Share text copied");
    } catch {
      // user cancelled
    }
  }

  // ---- Scan flow ----
  async function startCamera() {
    setScanError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play().catch(() => {});
          requestAnimationFrame(tick);
        }
      }, 50);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Camera unavailable";
      setScanError(`Camera unavailable (${msg}). Use the file upload option below.`);
      setCameraOn(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }

  function tick() {
    if (!cameraOn) return;
    const video = videoRef.current;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      requestAnimationFrame(tick);
      return;
    }
    const canvas = document.createElement("canvas");
    const w = video.videoWidth || 480;
    const h = video.videoHeight || 360;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      requestAnimationFrame(tick);
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    try {
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
      if (code && code.data) {
        setScanToken(code.data);
        stopCamera();
        resolveToken(code.data);
        return;
      }
    } catch {
      // getImageData may fail on cross-origin video — fall through
    }
    requestAnimationFrame(tick);
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    try {
      const img = await loadImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const code = jsQR(imageData.data, img.width, img.height, {
        inversionAttempts: "attemptBoth",
      });
      if (!code || !code.data) {
        toast.error("No QR code found in the image");
        return;
      }
      setScanToken(code.data);
      resolveToken(code.data);
    } catch {
      toast.error("Could not read image");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  async function resolveToken(token: string) {
    setResolving(true);
    setResolved(null);
    setScanError(null);
    try {
      const res = await fetch("/api/qr/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) {
        setScanError(json?.error ?? "Could not resolve QR");
        return;
      }
      setResolved(json as ResolvedQr);
      if (json.amountKobo) {
        setPayAmount((json.amountKobo / 100).toFixed(2));
      } else {
        setPayAmount("");
      }
      toast.success(`Resolved: ${json.recipient.name}`);
    } finally {
      setResolving(false);
    }
  }

  async function payResolved() {
    if (!resolved || !scanToken) return;
    const amountKobo =
      resolved.amountKobo && resolved.amountKobo > 0
        ? resolved.amountKobo
        : Math.round(Number(payAmount) * 100);
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setPaying(true);
    try {
      const pinCode = await pin.request({
        title: "Authorize QR payment",
        description: `Pay ${naira(amountKobo)} to ${resolved.recipient.name}`,
      });
      if (!pinCode) {
        setPaying(false);
        return;
      }
      const res = await fetch("/api/qr/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: scanToken, pin: pinCode, amountKobo }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Payment failed");
        return;
      }
      toast.success(`Paid ${naira(amountKobo)} to ${resolved.recipient.name}`);
      setResolved(null);
      setScanToken("");
      setPayAmount("");
      loadHistory();
    } catch {
      toast.error("Payment failed");
    } finally {
      setPaying(false);
    }
  }

  function clearResolved() {
    setResolved(null);
    setScanToken("");
    setPayAmount("");
    setScanError(null);
  }

  React.useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const expiryCountdown = useExpiryCountdown(generatedQr?.expiresAt ?? null);

  return (
    <div className="tp-fade-rise space-y-6">
      <PageHeader
        title="QR Pay"
        subtitle="Receive money with your QR code, scan to pay, and track QR payments."
      />

      <Tabs defaultValue="receive" className="space-y-5">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="receive" className="gap-1.5">
            <QrCode className="h-3.5 w-3.5" /> Receive
          </TabsTrigger>
          <TabsTrigger value="scan" className="gap-1.5">
            <ScanLine className="h-3.5 w-3.5" /> Scan
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* ============== RECEIVE TAB ============== */}
        <TabsContent value="receive" className="space-y-5">
          {loading ? (
            <Card className="mx-auto max-w-md p-8">
              <div className="bg-muted mx-auto h-64 w-64 animate-pulse rounded-2xl" />
              <div className="bg-muted mt-6 h-4 w-2/3 animate-pulse rounded" />
              <div className="bg-muted mt-2 h-3 w-1/2 animate-pulse rounded" />
            </Card>
          ) : !account ? (
            <Card className="mx-auto max-w-md p-8 text-center">
              <Wallet className="text-muted-foreground mx-auto h-10 w-10" />
              <p className="mt-4 font-semibold">No virtual account yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Fund your wallet to generate a virtual account and unlock QR receiving.
              </p>
              <Button className="mt-4 gap-1.5" onClick={() => setView("wallet")}>
                Fund wallet <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          ) : (
            <>
              {/* Persistent "My QR code" card — payment card design */}
              <Card className="mx-auto max-w-md overflow-hidden p-0">
                <div className="tp-emerald-grad tp-sheen relative p-5 text-white">
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold tracking-widest text-white/80 uppercase">
                        Turbopay · Receive
                      </p>
                      <p className="mt-0.5 text-lg font-bold">{account.accountName}</p>
                    </div>
                    <Sparkles className="h-5 w-5 text-white/70" />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-3 p-6">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <QRCodeSVG
                        value={staticPayload}
                        size={180}
                        level="M"
                        includeMargin={false}
                        bgColor="#ffffff"
                        fgColor="#047857"
                      />
                    </div>
                  </div>
                  <div className="bg-muted/30 w-full space-y-2 rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground text-xs">Account number</span>
                      <button
                        onClick={copyAccount}
                        className="hover:text-primary flex items-center gap-1.5 font-mono text-sm font-semibold"
                      >
                        {account.accountNumber}
                        {copiedAcc ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="text-muted-foreground h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground text-xs">Bank</span>
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <ShieldCheck className="h-3 w-3" /> {account.bankName}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex w-full gap-2">
                    <Button variant="outline" className="flex-1 gap-1.5" onClick={copyAccount}>
                      {copiedAcc ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      Copy
                    </Button>
                    <Button className="flex-1 gap-1.5" onClick={shareStatic}>
                      <Share2 className="h-4 w-4" /> Share
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Dynamic payment QR generator */}
              <Card className="mx-auto max-w-md p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Plus className="text-primary h-5 w-5" />
                  <h3 className="text-base font-semibold">Generate payment QR</h3>
                </div>
                <p className="text-muted-foreground mb-4 text-sm">
                  Request a specific amount with an expiring QR. Perfect for invoices and in-person
                  payments — the recipient just scans and pays.
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="qr-amount">Amount (₦)</Label>
                      <Input
                        id="qr-amount"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qr-note">Note (optional)</Label>
                      <Input
                        id="qr-note"
                        placeholder="e.g. Invoice #1042"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        maxLength={120}
                      />
                    </div>
                  </div>
                  <Button className="w-full gap-1.5" onClick={generateQr} disabled={generating}>
                    {generating ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <QrCode className="h-4 w-4" />
                    )}
                    Generate payment QR
                  </Button>
                </div>
              </Card>

              {/* Generated QR dialog */}
              <Dialog open={!!generatedQr} onOpenChange={(o) => !o && setGeneratedQr(null)}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Sparkles className="text-primary h-5 w-5" />
                      Payment QR ready
                    </DialogTitle>
                    <DialogDescription>
                      Show this QR to your customer. It expires in {expiryCountdown}.
                    </DialogDescription>
                  </DialogHeader>
                  {generatedQr && (
                    <div className="space-y-4 py-2">
                      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
                        <div className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-[10px] font-semibold tracking-widest text-white/80 uppercase">
                              Turbopay · Payment request
                            </p>
                            <p className="mt-0.5 text-sm font-bold">
                              {generatedQr.payload.recipientName}
                            </p>
                          </div>
                          <CreditCard className="h-5 w-5 text-white/70" />
                        </div>
                        <div className="flex flex-col items-center gap-2 bg-white/10 p-5 backdrop-blur">
                          <div className="rounded-xl bg-white p-3 shadow-lg">
                            <QRCodeSVG
                              value={generatedQr.qrPayload}
                              size={192}
                              level="M"
                              bgColor="#ffffff"
                              fgColor="#047857"
                            />
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] tracking-widest text-white/70 uppercase">
                              Amount
                            </p>
                            <p className="text-2xl font-bold tabular-nums">
                              {generatedQr.payload.amountKobo
                                ? naira(generatedQr.payload.amountKobo)
                                : "Any amount"}
                            </p>
                            {generatedQr.payload.note && (
                              <p className="mt-0.5 text-xs text-white/85">
                                {generatedQr.payload.note}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2 text-[10px] text-white/80">
                          <span className="font-mono">{generatedQr.reference}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Expires {expiryCountdown}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          This QR expires in 10 minutes. Generate a new one if the customer
                          can&apos;t scan in time.
                        </p>
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setGeneratedQr(null)}>
                      Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </TabsContent>

        {/* ============== SCAN TAB ============== */}
        <TabsContent value="scan" className="space-y-5">
          <Card className="mx-auto max-w-md p-5 sm:p-6">
            {!resolved ? (
              <>
                <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-slate-900">
                  <span className="pointer-events-none absolute top-3 left-3 h-7 w-7 rounded-tl-lg border-t-2 border-l-2 border-emerald-400" />
                  <span className="pointer-events-none absolute top-3 right-3 h-7 w-7 rounded-tr-lg border-t-2 border-r-2 border-emerald-400" />
                  <span className="pointer-events-none absolute bottom-3 left-3 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-emerald-400" />
                  <span className="pointer-events-none absolute right-3 bottom-3 h-7 w-7 rounded-br-lg border-r-2 border-b-2 border-emerald-400" />
                  {cameraOn ? (
                    <>
                      <video
                        ref={videoRef}
                        className="absolute inset-0 h-full w-full object-cover"
                        muted
                        playsInline
                      />
                      <div className="tp-pulse-dot pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-400/80 shadow-[0_0_12px_2px_oklch(0.72_0.14_162_/_0.6)]" />
                      <button
                        onClick={stopCamera}
                        className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                        aria-label="Stop camera"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white/80">
                      <ScanLine className="h-10 w-10" />
                      <p className="px-8 text-xs">
                        Point your camera at a Turbopay QR code, or upload an image.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  {!cameraOn ? (
                    <Button className="flex-1 gap-1.5" onClick={startCamera}>
                      <Camera className="h-4 w-4" /> Start camera
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1 gap-1.5" onClick={stopCamera}>
                      <X className="h-4 w-4" /> Stop camera
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" /> Upload image
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onFileSelected}
                  />
                </div>

                {scanError && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">{scanError}</p>
                  </div>
                )}

                <div className="mt-5 space-y-2 border-t pt-4">
                  <Label htmlFor="qr-token">Or paste QR token manually</Label>
                  <Input
                    id="qr-token"
                    placeholder="turbopay://pay?t=... or raw token"
                    value={scanToken}
                    onChange={(e) => setScanToken(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="secondary"
                    className="w-full gap-1.5"
                    onClick={() => resolveToken(scanToken)}
                    disabled={resolving || scanToken.trim().length === 0}
                  >
                    {resolving ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScanLine className="h-4 w-4" />
                    )}
                    Resolve QR
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                      Recipient verified
                    </p>
                    <p className="truncate text-sm font-bold">{resolved.recipient.name}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {resolved.recipient.accountNumber} · {resolved.recipient.bankName}
                    </p>
                  </div>
                </div>

                {resolved.note && (
                  <div className="bg-muted/30 rounded-xl border p-3">
                    <p className="text-muted-foreground text-xs">Note</p>
                    <p className="mt-0.5 text-sm">{resolved.note}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="pay-amount">
                    {resolved.amountKobo && resolved.amountKobo > 0
                      ? "Amount (locked by QR)"
                      : "Amount to pay (₦)"}
                  </Label>
                  <Input
                    id="pay-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    disabled={!!(resolved.amountKobo && resolved.amountKobo > 0)}
                  />
                  {resolved.amountKobo && resolved.amountKobo > 0 && (
                    <p className="text-muted-foreground text-xs">
                      This QR requires{" "}
                      <span className="text-foreground font-semibold">
                        {naira(resolved.amountKobo)}
                      </span>
                      .
                    </p>
                  )}
                </div>

                <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                  <Clock className="h-3 w-3" />
                  Expires {timeAgo(resolved.expiresAt)}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1.5" onClick={clearResolved}>
                    Cancel
                  </Button>
                  <Button className="flex-1 gap-1.5" onClick={payResolved} disabled={paying}>
                    {paying ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Pay{" "}
                    {payAmount && Number(payAmount) > 0
                      ? naira(Math.round(Number(payAmount) * 100))
                      : ""}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ============== HISTORY TAB ============== */}
        <TabsContent value="history" className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="text-primary h-5 w-5" />
                <h3 className="text-base font-semibold">QR payment history</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={loadHistory} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
            {historyLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No QR payments yet"
                description="Payments you make or receive via QR codes will appear here."
              />
            ) : (
              <ul className="scrollbar-thin max-h-96 space-y-2 overflow-y-auto pr-1">
                {history.map((h) => {
                  const isCredit = h.direction === "CREDIT";
                  return (
                    <li
                      key={h.id}
                      className="hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-3 transition-colors"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          isCredit
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isCredit ? (
                          <ArrowDownLeft className="h-5 w-5" />
                        ) : (
                          <ArrowUpRight className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {isCredit ? "Received from " : "Paid to "}
                          <span className="font-semibold">{h.counterpartyName ?? "Unknown"}</span>
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {h.reference}
                          {h.note && ` · ${h.note}`}
                          {` · ${timeAgo(h.createdAt)}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-semibold tabular-nums ${
                            isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                          }`}
                        >
                          {isCredit ? "+" : "−"}
                          {nairaCompact(h.amountKobo)}
                        </p>
                        <Badge
                          variant="outline"
                          className={`mt-0.5 text-[10px] ${
                            h.status === "SUCCESS"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {h.status}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function useExpiryCountdown(expiresAt: string | null): string {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return "—";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
