// Admin — detailed provider health, circuit reset, and test ping.
//
// GET  : single-provider deep dive — current health score, circuit state, last 50
//        ProviderHealthCheck samples (for sparklines), success rate, avg latency,
//        total call count, and a failure breakdown by error code.
// POST {action: "reset_circuit"}: force-clears the in-memory circuit breaker for
//        this provider. Returns the new breaker state.
// POST {action: "test"}: invokes the provider's adapter via listBanks or listBillers
//        (whichever contract is registered for the provider) and records the result
//        as a ProviderHealthCheck sample. Updates the EMA health score + breaker.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";
import { registry, getBreakerStates, resetCircuitBreaker } from "@/lib/turbocore/registry";
import { invalidateHealthCache } from "@/lib/turbocore/routing-engine";
import { ALL_CONTRACTS, type ContractName } from "@/lib/turbocore/result";

export const dynamic = "force-dynamic";

interface HealthSample {
  id: string;
  ok: boolean;
  latencyMs: number;
  errorCode: string | null;
  healthScore: number;
  sampledAt: string;
}

interface ProviderDetailResponse {
  providerCode: string;
  exists: boolean;
  healthScore: number;
  healthUpdatedAt: string;
  circuit: { state: string; failures: number; successes: number };
  successRate: number; // 0-100 over the sample window
  avgLatencyMs: number;
  totalSamples: number;
  failureBreakdown: Record<string, number>;
  samples: HealthSample[];
}

const SAMPLE_WINDOW_HOURS = 24;

export async function GET(req: Request, { params }: { params: Promise<{ providerCode: string }> }) {
  try {
    const user = await requireAdmin();
    const { providerCode } = await params;
    const code = providerCode.toLowerCase();

    const config = await db.providerConfig.findUnique({ where: { code } });
    const breaker = getBreakerStates()[code] ?? { state: "CLOSED", failures: 0, score: 100 };
    const health = registry.getHealth(code);

    const since = new Date(Date.now() - SAMPLE_WINDOW_HOURS * 60 * 60 * 1000);
    const samples = await db.providerHealthCheck.findMany({
      where: { providerCode: code, sampledAt: { gte: since } },
      orderBy: { sampledAt: "desc" },
      take: 50,
    });

    const total = samples.length;
    const okCount = samples.filter((s) => s.ok).length;
    const successRate = total > 0 ? Math.round((okCount / total) * 100) : 100;
    const avgLatencyMs = total > 0 ? Math.round(samples.reduce((sum, s) => sum + s.latencyMs, 0) / total) : 0;

    const failureBreakdown: Record<string, number> = {};
    for (const s of samples) {
      if (!s.ok) {
        const k = s.errorCode ?? "UNKNOWN";
        failureBreakdown[k] = (failureBreakdown[k] ?? 0) + 1;
      }
    }

    await audit({
      userId: user.id,
      action: "ADMIN_PROVIDER_HEALTH_VIEWED",
      category: "ADMIN",
      ip: getClientIp(req),
      metadata: { providerCode: code, successRate, sampleCount: total },
    });

    const response: ProviderDetailResponse = {
      providerCode: code,
      exists: !!config,
      healthScore: health.score,
      healthUpdatedAt: new Date(health.lastUpdated).toISOString(),
      circuit: {
        state: breaker.state,
        failures: breaker.failures,
        successes: 0,
      },
      successRate,
      avgLatencyMs,
      totalSamples: total,
      failureBreakdown,
      samples: samples.map((s) => ({
        id: s.id,
        ok: s.ok,
        latencyMs: s.latencyMs,
        errorCode: s.errorCode,
        healthScore: s.healthScore,
        sampledAt: s.sampledAt.toISOString(),
      })),
    };

    return json(response);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ providerCode: string }> }) {
  try {
    const user = await requireAdmin();
    const { providerCode } = await params;
    const code = providerCode.toLowerCase();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "").toLowerCase();

    if (action === "reset_circuit") {
      const didReset = resetCircuitBreaker(code);
      const newBreaker = getBreakerStates()[code] ?? { state: "CLOSED", failures: 0, score: 100 };
      await audit({
        userId: user.id,
        action: "ADMIN_CIRCUIT_RESET",
        category: "ADMIN",
        severity: "WARN",
        ip: getClientIp(req),
        metadata: { providerCode: code, didReset, newState: newBreaker.state },
      });
      return json({
        ok: true,
        providerCode: code,
        didReset,
        circuit: { state: newBreaker.state, failures: newBreaker.failures },
      });
    }

    if (action === "test") {
      const config = await db.providerConfig.findUnique({ where: { code } });
      if (!config) {
        return json({ error: "Provider not found", code: "NOT_FOUND" }, 404);
      }

      // Find a contract registered for this provider that supports a "list" method.
      // Prefer BANK_TRANSFER (listBanks) then BILL_PAYMENT (listBillers), falling
      // back to whatever's first.
      const contractsForProvider = ALL_CONTRACTS.filter((c) =>
        registry.list(c).includes(code),
      );

      const preferredOrder: ContractName[] = [
        "BANK_TRANSFER",
        "BILL_PAYMENT",
        "VIRTUAL_ACCOUNT",
        "AIRTIME",
        "CARD_PAYMENT",
        "MOBILE_MONEY",
      ];
      const contract =
        preferredOrder.find((c) => contractsForProvider.includes(c)) ??
        contractsForProvider[0];

      if (!contract) {
        return json({ error: "Provider has no testable contract", code: "NO_CONTRACT" }, 400);
      }

      const country = String(body.country ?? "NG").toUpperCase();
      const adapter = await registry.resolve(contract, code).catch(() => null);

      let ok = false;
      let latencyMs = 0;
      let errorCode: string | null = null;
      let detail: unknown = null;

      if (!adapter) {
        ok = false;
        errorCode = "PROVIDER_DOWN";
      } else {
        const start = Date.now();
        try {
          let result: any;
          if (contract === "BANK_TRANSFER" && typeof adapter.listBanks === "function") {
            result = await adapter.listBanks(country);
          } else if (contract === "BILL_PAYMENT" && typeof adapter.listBillers === "function") {
            result = await adapter.listBillers({ country });
          } else if (contract === "VIRTUAL_ACCOUNT" && typeof adapter.listSupportedBanks === "function") {
            result = await adapter.listSupportedBanks(country);
          } else if (contract === "AIRTIME" && typeof adapter.listNetworks === "function") {
            result = await adapter.listNetworks(country);
          } else if (typeof adapter.listBanks === "function") {
            result = await adapter.listBanks(country);
          } else if (typeof adapter.listBillers === "function") {
            result = await adapter.listBillers({ country });
          } else {
            // No list-style method — synthesize a "test" by checking the adapter exists.
            result = { ok: true, data: { tested: true }, latencyMs: 0 };
          }

          latencyMs = Date.now() - start;
          ok = !!result?.ok;
          if (!ok) {
            errorCode = result?.error?.code ?? "UNKNOWN";
            detail = result?.error?.message ?? null;
          } else {
            const data = result?.data;
            detail =
              Array.isArray(data) ? `${data.length} items`
              : (data && typeof data === "object" && "length" in data) ? `${(data as any).length} items`
              : "ok";
          }
        } catch (e: any) {
          latencyMs = Date.now() - start;
          ok = false;
          errorCode = "UPSTREAM_ERROR";
          detail = e?.message ?? "Test call threw";
        }
      }

      const health = registry.getHealth(code);
      const sample = await db.providerHealthCheck.create({
        data: {
          providerCode: code,
          ok,
          latencyMs,
          errorCode,
          healthScore: health.score,
        },
      });
      invalidateHealthCache();

      await audit({
        userId: user.id,
        action: "ADMIN_PROVIDER_TEST",
        category: "ADMIN",
        severity: ok ? "INFO" : "WARN",
        ip: getClientIp(req),
        metadata: {
          providerCode: code,
          contract,
          ok,
          latencyMs,
          errorCode,
          detail,
        },
      });

      return json({
        ok: true,
        providerCode: code,
        contract,
        result: { ok, latencyMs, errorCode, detail },
        sample: {
          id: sample.id,
          ok: sample.ok,
          latencyMs: sample.latencyMs,
          errorCode: sample.errorCode,
          healthScore: sample.healthScore,
          sampledAt: sample.sampledAt.toISOString(),
        },
        healthScore: health.score,
        circuit: getBreakerStates()[code] ?? { state: "CLOSED", failures: 0, score: 100 },
      });
    }

    return json({ error: `Unknown action: ${action}`, code: "INVALID_ACTION" }, 400);
  } catch (e) {
    return handleError(e);
  }
}
