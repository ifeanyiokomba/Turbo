"use client";

// TurboCore — Plug-and-Play Provider Onboarding Tab
//
// The spec: "Adding a provider should never require modifying business logic.
// A new provider should only require: entering credentials, selecting countries,
// selecting services supported, mapping endpoints, saving configuration.
// After that the provider becomes immediately available throughout TurboPay."
//
// 3-step wizard: Verify → Discover → Finalize

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { toast } from "sonner";
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Rocket,
  Plug,
  Check,
  X,
  Globe,
  Shield,
} from "lucide-react";

const ADAPTERS = [
  { code: "paystack", name: "Paystack", authType: "BEARER" },
  { code: "flutterwave", name: "Flutterwave", authType: "BEARER" },
  { code: "monnify", name: "Monnify", authType: "BASIC" },
  { code: "mpesa", name: "M-Pesa", authType: "OAUTH2" },
  { code: "mtn-momo", name: "MTN MoMo", authType: "OAUTH2" },
  { code: "airtel-money", name: "Airtel Money", authType: "OAUTH2" },
  { code: "smartcash", name: "Smart Cash", authType: "API_KEY" },
  { code: "paga", name: "Paga", authType: "HMAC" },
  { code: "baxi", name: "Baxi", authType: "BEARER" },
  { code: "remita", name: "Remita", authType: "API_KEY" },
  { code: "quickteller", name: "Quickteller", authType: "HMAC" },
  { code: "dojah", name: "Dojah", authType: "API_KEY" },
  { code: "termii", name: "Termii", authType: "API_KEY" },
  { code: "resend", name: "Resend", authType: "BEARER" },
  { code: "wise", name: "Wise", authType: "API_KEY" },
  { code: "stripe", name: "Stripe", authType: "BEARER" },
  { code: "turbopay", name: "TurboPay (Mock)", authType: "API_KEY" },
];

interface VerifyResult {
  verified: boolean;
  displayName?: string;
  authType?: string;
  detectedCapabilities?: string[];
  detectedCountries?: string[];
  detectedCurrencies?: string[];
  webhookSupported?: boolean;
  settlementCycle?: string;
  testLatencyMs?: number;
  error?: string;
  requiredFields?: string[];
}

interface DiscoverResult {
  displayName: string;
  mapped: Array<{
    capabilityId: string;
    capabilityName: string;
    direction: string;
    maturity: string;
    countries: string[];
  }>;
  unmapped: Array<{ manifestCapability: string; direction: string }>;
  countrySupport: Array<{ country: string; capabilities: string[]; count: number }>;
  recommended: Array<{
    capabilityId: string;
    capabilityName: string;
    direction: string;
    maturity: string;
    countries: string[];
  }>;
  summary: {
    totalCapabilities: number;
    totalCountries: number;
    totalCurrencies: number;
    webhookSupported: boolean;
    settlementCycle: string;
  };
}

export default function OnboardingTab() {
  const [step, setStep] = React.useState(1);
  const [adapterType, setAdapterType] = React.useState("paystack");
  const [providerCode, setProviderCode] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [environment, setEnvironment] = React.useState<"sandbox" | "production">("sandbox");
  const [credentials, setCredentials] = React.useState<Record<string, string>>({});
  const [verifying, setVerifying] = React.useState(false);
  const [verifyResult, setVerifyResult] = React.useState<VerifyResult | null>(null);
  const [discovering, setDiscovering] = React.useState(false);
  const [discoverResult, setDiscoverResult] = React.useState<DiscoverResult | null>(null);
  const [selectedCapabilities, setSelectedCapabilities] = React.useState<Set<string>>(new Set());
  const [selectedCountries, setSelectedCountries] = React.useState<Set<string>>(new Set());
  const [finalizing, setFinalizing] = React.useState(false);
  const [finalizeResult, setFinalizeResult] = React.useState<{
    success: boolean;
    message: string;
    details?: Record<string, unknown>;
  } | null>(null);

  const selectedAdapter = ADAPTERS.find((a) => a.code === adapterType);
  const authType = selectedAdapter?.authType ?? "BEARER";

  const credFields = React.useMemo(() => {
    switch (authType) {
      case "BEARER":
        return [
          { key: "secretKey", label: "Secret Key", type: "password", placeholder: "sk_live_..." },
        ];
      case "BASIC":
        return [
          { key: "username", label: "Username", type: "text", placeholder: "API username" },
          { key: "password", label: "Password", type: "password", placeholder: "API password" },
        ];
      case "HMAC":
        return [
          { key: "secretKey", label: "Secret Key", type: "password", placeholder: "HMAC secret" },
          { key: "merchantId", label: "Merchant ID", type: "text", placeholder: "X-Merchant-Id" },
        ];
      case "OAUTH2":
        return [
          { key: "clientId", label: "Client ID", type: "text", placeholder: "OAuth client ID" },
          {
            key: "clientSecret",
            label: "Client Secret",
            type: "password",
            placeholder: "OAuth client secret",
          },
        ];
      case "API_KEY":
        return [{ key: "apiKey", label: "API Key", type: "password", placeholder: "Your API key" }];
      default:
        return [{ key: "secretKey", label: "Secret Key", type: "password", placeholder: "sk_..." }];
    }
  }, [authType]);

  const handleVerify = React.useCallback(async () => {
    if (!providerCode || !adapterType) {
      toast.error("Provider code and adapter are required");
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/admin/onboarding/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerCode, adapterType, credentials, environment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyResult({ verified: false, error: data.error ?? "Verification failed" });
        toast.error(data.error ?? "Verification failed");
        return;
      }
      setVerifyResult(data);
      if (data.verified) {
        toast.success("Connection verified!");
        if (data.detectedCountries) {
          setSelectedCountries(new Set(data.detectedCountries));
        }
      } else {
        toast.error(data.error ?? "Verification failed");
      }
    } catch {
      toast.error("Network error during verification");
    } finally {
      setVerifying(false);
    }
  }, [providerCode, adapterType, credentials, environment]);

  const handleDiscover = React.useCallback(async () => {
    setDiscovering(true);
    try {
      const res = await fetch("/api/admin/onboarding/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerCode, adapterType }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Discovery failed");
        return;
      }
      setDiscoverResult(data);
      // Auto-select all mapped capabilities
      setSelectedCapabilities(
        new Set(data.mapped.map((m: { capabilityId: string }) => m.capabilityId))
      );
      setStep(2);
      toast.success(`Discovered ${data.mapped.length} capabilities`);
    } catch {
      toast.error("Network error during discovery");
    } finally {
      setDiscovering(false);
    }
  }, [providerCode, adapterType]);

  const handleFinalize = React.useCallback(async () => {
    setFinalizing(true);
    try {
      const res = await fetch("/api/admin/onboarding/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerCode,
          adapterType,
          displayName: displayName || verifyResult?.displayName || providerCode,
          credentials,
          environment,
          selectedCapabilities: Array.from(selectedCapabilities),
          selectedCountries: Array.from(selectedCountries),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFinalizeResult({ success: false, message: data.error ?? "Failed to go live" });
        toast.error(data.error ?? "Failed to go live");
        return;
      }
      setFinalizeResult({ success: true, message: data.message, details: data.details });
      toast.success("Provider is now LIVE!");
      setStep(3);
    } catch {
      toast.error("Network error during finalization");
    } finally {
      setFinalizing(false);
    }
  }, [
    providerCode,
    adapterType,
    displayName,
    verifyResult,
    credentials,
    environment,
    selectedCapabilities,
    selectedCountries,
  ]);

  const resetWizard = () => {
    setStep(1);
    setProviderCode("");
    setDisplayName("");
    setCredentials({});
    setVerifyResult(null);
    setDiscoverResult(null);
    setSelectedCapabilities(new Set());
    setSelectedCountries(new Set());
    setFinalizeResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
          <Plug className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Plug &amp; Play Provider Onboarding</h2>
          <p className="text-muted-foreground text-sm">
            Add a new provider without writing code. Verify → Discover → Go Live.
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { num: 1, label: "Verify" },
          { num: 2, label: "Discover" },
          { num: 3, label: "Go Live" },
        ].map((s, i) => (
          <React.Fragment key={s.num}>
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                step >= s.num
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  step > s.num
                    ? "bg-emerald-500 text-white"
                    : step === s.num
                      ? "bg-emerald-500/20 text-emerald-600"
                      : "bg-muted-foreground/20"
                }`}
              >
                {step > s.num ? <Check className="h-3 w-3" /> : s.num}
              </span>
              {s.label}
            </div>
            {i < 2 && <ArrowRight className="text-muted-foreground h-4 w-4" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Verify */}
      {step === 1 && (
        <Card className="space-y-5 p-6">
          <div>
            <h3 className="text-lg font-semibold">
              Step 1: Choose Adapter &amp; Enter Credentials
            </h3>
            <p className="text-muted-foreground text-sm">
              Select a provider adapter and enter your credentials. We&apos;ll verify the
              connection.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider Adapter</Label>
              <Select value={adapterType} onValueChange={setAdapterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADAPTERS.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.name} ({a.authType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="providerCode">Provider Code (custom)</Label>
              <Input
                id="providerCode"
                placeholder="e.g. paystack_ng"
                value={providerCode}
                onChange={(e) =>
                  setProviderCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="e.g. Paystack Nigeria"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  checked={environment === "production"}
                  onCheckedChange={(c) => setEnvironment(c ? "production" : "sandbox")}
                />
                <span className="text-sm">
                  {environment === "production" ? "Production" : "Sandbox"}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Credentials ({authType})</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {credFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key} className="text-xs">
                    {f.label}
                  </Label>
                  <Input
                    id={f.key}
                    type={f.type}
                    placeholder={f.placeholder}
                    value={credentials[f.key] ?? ""}
                    onChange={(e) => setCredentials({ ...credentials, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleVerify} disabled={verifying || !providerCode} className="gap-2">
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              Verify Connection
            </Button>
          </div>

          {/* Verify result */}
          {verifyResult && (
            <div
              className={`rounded-lg border p-4 ${
                verifyResult.verified
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-rose-500/40 bg-rose-500/5"
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                {verifyResult.verified ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-rose-600" />
                )}
                <span className="font-semibold">
                  {verifyResult.verified ? "Connection Verified" : "Verification Failed"}
                </span>
                {verifyResult.testLatencyMs && (
                  <Badge variant="secondary" className="ml-auto">
                    {verifyResult.testLatencyMs}ms
                  </Badge>
                )}
              </div>
              {verifyResult.error && (
                <p className="mb-2 text-sm text-rose-600">{verifyResult.error}</p>
              )}
              {verifyResult.verified && (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-muted-foreground">Capabilities:</span>
                    {verifyResult.detectedCapabilities?.slice(0, 8).map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">
                        {c}
                      </Badge>
                    ))}
                    {(verifyResult.detectedCapabilities?.length ?? 0) > 8 && (
                      <Badge variant="outline" className="text-xs">
                        +{(verifyResult.detectedCapabilities?.length ?? 0) - 8} more
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-muted-foreground">Countries:</span>
                    {verifyResult.detectedCountries?.map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">
                        {c}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-muted-foreground flex gap-3 text-xs">
                    <span>Webhook: {verifyResult.webhookSupported ? "✓" : "✗"}</span>
                    <span>Settlement: {verifyResult.settlementCycle}</span>
                    <span>Auth: {verifyResult.authType}</span>
                  </div>
                </div>
              )}
              {verifyResult.verified && (
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleDiscover} disabled={discovering} className="gap-2">
                    {discovering ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Discover Capabilities
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Step 2: Discover */}
      {step === 2 && discoverResult && (
        <Card className="space-y-5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Step 2: Select Capabilities &amp; Countries</h3>
              <p className="text-muted-foreground text-sm">
                {discoverResult.mapped.length} capabilities discovered. Select what to enable.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSelectedCapabilities(new Set(discoverResult.mapped.map((m) => m.capabilityId)))
                }
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCapabilities(new Set())}
              >
                Deselect All
              </Button>
            </div>
          </div>

          <div className="grid max-h-96 gap-2 overflow-y-auto">
            {discoverResult.mapped.map((cap) => {
              const selected = selectedCapabilities.has(cap.capabilityId);
              const isRecommended = discoverResult.recommended.some(
                (r) => r.capabilityId === cap.capabilityId
              );
              return (
                <div
                  key={cap.capabilityId}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selected ? "border-emerald-500/40 bg-emerald-500/5" : "hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    const next = new Set(selectedCapabilities);
                    if (selected) next.delete(cap.capabilityId);
                    else next.add(cap.capabilityId);
                    setSelectedCapabilities(next);
                  }}
                >
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      selected ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/30"
                    }`}
                  >
                    {selected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{cap.capabilityName}</span>
                      {isRecommended && (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-xs text-emerald-700"
                        >
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground text-xs">{cap.capabilityId}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {cap.direction}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {cap.maturity}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <Label>Countries ({selectedCountries.size} selected)</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelectedCountries(
                      new Set(discoverResult.countrySupport.map((c) => c.country))
                    )
                  }
                >
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedCountries(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {discoverResult.countrySupport.map((c) => {
                const selected = selectedCountries.has(c.country);
                return (
                  <div
                    key={c.country}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors ${
                      selected ? "border-emerald-500/40 bg-emerald-500/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => {
                      const next = new Set(selectedCountries);
                      if (selected) next.delete(c.country);
                      else next.add(c.country);
                      setSelectedCountries(next);
                    }}
                  >
                    <Globe className="text-muted-foreground h-3 w-3" />
                    <span className="text-sm font-medium">{c.country}</span>
                    <Badge variant="outline" className="text-xs">
                      {c.count} caps
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={selectedCapabilities.size === 0}
              className="gap-2"
            >
              Review &amp; Finalize <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Go Live */}
      {step === 3 && (
        <Card className="space-y-5 p-6">
          {finalizeResult?.success ? (
            <div className="space-y-4 py-8 text-center">
              <div className="flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
                  <Rocket className="h-10 w-10 text-emerald-600" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-emerald-600">Provider is LIVE!</h3>
                <p className="text-muted-foreground mt-1">{finalizeResult.message}</p>
              </div>
              {finalizeResult.details && (
                <div className="mx-auto max-w-md space-y-1 rounded-lg border p-4 text-left text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Config ID:</span>
                    <span className="font-mono">{String(finalizeResult.details.configId)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credential Version:</span>
                    <span>{String(finalizeResult.details.credentialVersion)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capabilities:</span>
                    <span>{String(finalizeResult.details.capabilitiesOnboarded)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Countries:</span>
                    <span>{String(finalizeResult.details.countriesSelected)}</span>
                  </div>
                </div>
              )}
              <Button onClick={resetWizard} className="gap-2">
                <Plug className="h-4 w-4" /> Onboard Another Provider
              </Button>
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-lg font-semibold">Step 3: Review &amp; Go Live</h3>
                <p className="text-muted-foreground text-sm">
                  Review the configuration. Click &quot;Go Live&quot; to activate the provider.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border p-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-muted-foreground">Provider Code:</span>
                    <p className="font-mono font-medium">{providerCode}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Display Name:</span>
                    <p className="font-medium">
                      {displayName || verifyResult?.displayName || providerCode}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Adapter:</span>
                    <p className="font-medium">{adapterType}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Environment:</span>
                    <p className="font-medium">{environment}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Capabilities:</span>
                    <p className="font-medium">{selectedCapabilities.size} selected</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Countries:</span>
                    <p className="font-medium">{selectedCountries.size} selected</p>
                  </div>
                </div>
              </div>

              {finalizeResult && !finalizeResult.success && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-4">
                  <X className="h-5 w-5 text-rose-600" />
                  <span className="text-sm text-rose-600">{finalizeResult.message}</span>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {finalizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  Go Live
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
