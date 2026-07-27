"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, StatCard, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck,
  Check,
  AlertCircle,
  Loader2,
  Globe,
  TrendingUp,
  Wallet,
  Award,
} from "lucide-react";
import { naira, nairaCompact, formatDate } from "@/lib/money";
import { toast } from "sonner";

interface IdTypeField {
  name: string;
  label: string;
  required: boolean;
  type?: string;
}

interface IdTypeConfig {
  type: string;
  label: string;
  description: string;
  fields: IdTypeField[];
}

interface TierConfig {
  label: string;
  idTypes: IdTypeConfig[];
  limits: { singleTx: number; daily: number; maxBalance: number };
}

interface CountryInfo {
  code: string;
  name: string;
  currency: string;
  flagEmoji: string;
  tier2: TierConfig;
  tier3: TierConfig;
}

interface KycStatus {
  country: string;
  currentTier: number;
  kycStatus: string;
  countryConfig: { code: string; name: string; currency: string; flagEmoji: string } | null;
  availableUpgrades: {
    tier: 2 | 3;
    idTypes: IdTypeConfig[];
    label: string;
    limits: { singleTx: number; daily: number; maxBalance: number };
  }[];
  verificationHistory: {
    id: string;
    tier: number;
    status: string;
    provider: string;
    createdAt: string;
    verifiedAt: string | null;
  }[];
}

export default function KycView() {
  const { user, setUser } = useApp();
  const [status, setStatus] = React.useState<KycStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [verifyModal, setVerifyModal] = React.useState<{
    tier: 2 | 3;
    idType: IdTypeConfig;
  } | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [formValues, setFormValues] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/kyc", { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleVerify() {
    if (!verifyModal) return;
    setVerifying(true);
    try {
      const idValue = formValues[verifyModal.idType.fields[0]?.name ?? "idValue"] ?? "";
      const additionalFields: Record<string, string> = {};
      for (const f of verifyModal.idType.fields) {
        if (f.name !== verifyModal.idType.fields[0]?.name && formValues[f.name]) {
          additionalFields[f.name] = formValues[f.name];
        }
      }

      const res = await fetch("/api/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: verifyModal.tier,
          idType: verifyModal.idType.type,
          idValue,
          additionalFields,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`KYC Tier ${verifyModal.tier} verified!`);
        // Refresh user
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.user) setUser(meData.user);
        }
        setVerifyModal(null);
        setFormValues({});
        load();
      } else {
        toast.error(data.error || "Verification failed");
      }
    } catch {
      toast.error("Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-muted h-8 w-48 animate-pulse rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-muted h-24 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Unable to load KYC status"
        description="Please try again later."
      />
    );
  }

  const country = status.countryConfig;
  const isVerified = status.kycStatus === "VERIFIED";

  return (
    <div className="space-y-6">
      <PageHeader
        title="KYC & Identity Verification"
        subtitle={
          country
            ? `${country.flagEmoji} ${country.name} — ${country.currency}`
            : "Complete verification to unlock higher limits"
        }
      />

      {/* Current status */}
      <Card className="overflow-hidden p-0">
        <div className={`px-6 py-5 ${isVerified ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${isVerified ? "bg-emerald-500/20 text-emerald-600" : "bg-amber-500/20 text-amber-600"}`}
              >
                {isVerified ? (
                  <ShieldCheck className="h-6 w-6" />
                ) : (
                  <AlertCircle className="h-6 w-6" />
                )}
              </div>
              <div>
                <p className="text-lg font-bold">
                  Tier {status.currentTier} — {status.kycStatus}
                </p>
                <p className="text-muted-foreground text-sm">
                  {isVerified
                    ? "Your identity is verified"
                    : "Verify your identity to unlock higher limits"}
                </p>
              </div>
            </div>
            {country && (
              <Badge variant="secondary" className="gap-1.5 text-sm">
                <Globe className="h-3.5 w-3.5" /> {country.flagEmoji} {country.name}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Current tier limits */}
      {status.currentTier > 1 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Per Transaction"
            value={nairaCompact(
              status.availableUpgrades.length > 0
                ? status.currentTier === 2
                  ? 50_000_000
                  : 500_000_000
                : 50_000_000
            )}
            icon={TrendingUp}
            tone="success"
          />
          <StatCard
            label="Daily Limit"
            value={nairaCompact(status.currentTier === 2 ? 200_000_000 : 2_000_000_000)}
            icon={Wallet}
            tone="default"
          />
          <StatCard
            label="Max Balance"
            value={nairaCompact(status.currentTier === 2 ? 500_000_000 : 10_000_000_000)}
            icon={Award}
            tone="warning"
          />
        </div>
      )}

      {/* Available upgrades */}
      {status.availableUpgrades.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Available Upgrades</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {status.availableUpgrades.map((upgrade) => (
              <Card key={upgrade.tier} className="tp-card-hover p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">Tier {upgrade.tier}</h3>
                      <Badge variant="secondary">{upgrade.label}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Per tx: {nairaCompact(upgrade.limits.singleTx)} · Daily:{" "}
                      {nairaCompact(upgrade.limits.daily)} · Balance:{" "}
                      {nairaCompact(upgrade.limits.maxBalance)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Choose an ID type:</p>
                  {upgrade.idTypes.map((idType) => (
                    <div
                      key={idType.type}
                      className="flex items-center justify-between rounded-xl border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{idType.label}</p>
                        <p className="text-muted-foreground text-xs">{idType.description}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setVerifyModal({ tier: upgrade.tier, idType });
                          setFormValues({});
                        }}
                      >
                        Verify
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Verification history */}
      {status.verificationHistory.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Verification History</h2>
          <Card className="p-4">
            <div className="space-y-2">
              {status.verificationHistory.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${v.status === "VERIFIED" ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"}`}
                    >
                      {v.status === "VERIFIED" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Tier {v.tier} — {v.status}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        via {v.provider} · {formatDate(v.createdAt, true)}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={v.status === "VERIFIED" ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {v.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tier comparison */}
      <TierComparison country={country} status={status} />

      {/* Verification dialog */}
      {verifyModal && (
        <Dialog open onOpenChange={() => !verifying && setVerifyModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Verify with {verifyModal.idType.label}</DialogTitle>
              <DialogDescription>
                {verifyModal.idType.description}. Your data is encrypted and verified securely.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {verifyModal.idType.fields.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && " *"}
                  </Label>
                  <Input
                    id={field.name}
                    type={field.type === "date" ? "date" : "text"}
                    value={formValues[field.name] ?? ""}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    placeholder={field.label}
                  />
                </div>
              ))}
              <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <ShieldCheck className="mb-1 inline h-3.5 w-3.5" /> Your ID is encrypted
                (AES-256-GCM) and verified through our secure provider. We never store raw ID
                documents.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVerifyModal(null)} disabled={verifying}>
                Cancel
              </Button>
              <Button
                onClick={handleVerify}
                disabled={verifying || !formValues[verifyModal.idType.fields[0]?.name ?? ""]}
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  "Verify Identity"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function TierComparison({
  country,
  status,
}: {
  country: { code: string; name: string; currency: string; flagEmoji: string } | null;
  status: KycStatus;
}) {
  const [countries, setCountries] = React.useState<CountryInfo[]>([]);
  const [selectedCountry, setSelectedCountry] = React.useState(country?.code ?? "NG");

  React.useEffect(() => {
    fetch("/api/kyc/countries", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCountries(d.countries ?? []))
      .catch(() => {});
  }, []);

  const cfg = countries.find((c) => c.code === selectedCountry);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tier Comparison</h2>
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          className="border-input rounded-md border bg-transparent px-3 py-1.5 text-sm"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flagEmoji} {c.name}
            </option>
          ))}
        </select>
      </div>

      {cfg && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              tier: 1,
              label: "Starter",
              limits: { singleTx: 5_000_000, daily: 15_000_000, maxBalance: 30_000_000 },
              idTypes: [{ type: "PHONE", label: "Phone only", description: "No ID required" }],
            },
            {
              tier: 2,
              label: cfg.tier2.label,
              limits: cfg.tier2.limits,
              idTypes: cfg.tier2.idTypes,
            },
            {
              tier: 3,
              label: cfg.tier3.label,
              limits: cfg.tier3.limits,
              idTypes: cfg.tier3.idTypes,
            },
          ].map((t) => {
            const isCurrent = status.currentTier === t.tier;
            return (
              <Card
                key={t.tier}
                className={`p-5 ${isCurrent ? "border-primary ring-primary/20 ring-2" : ""}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold">Tier {t.tier}</h3>
                    {isCurrent && <Badge className="text-[10px]">Current</Badge>}
                  </div>
                  <span className="text-muted-foreground text-xs">{t.label}</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Per tx:</span>
                    <span className="font-medium tabular-nums">
                      {nairaCompact(t.limits.singleTx)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Daily:</span>
                    <span className="font-medium tabular-nums">{nairaCompact(t.limits.daily)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max balance:</span>
                    <span className="font-medium tabular-nums">
                      {nairaCompact(t.limits.maxBalance)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 border-t pt-3">
                  <p className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                    Required ID:
                  </p>
                  {t.idTypes.map((id) => (
                    <p key={id.type} className="text-xs">
                      {id.label}
                    </p>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
