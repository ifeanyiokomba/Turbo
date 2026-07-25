// TurboCore — provider registry. Lazy-initialized, memoized adapters.
// Adapters call registry.register() at module load; orchestrator calls registry.resolve().

import type { ContractName } from "./result";

type AsyncResolver = () => Promise<any>;

interface RegistryEntry {
  contract: ContractName;
  providerCode: string;
  resolver: AsyncResolver;
  instance: any | null;
  options: { priority?: number; sandbox?: boolean };
}

class ProviderRegistry {
  private entries = new Map<string, RegistryEntry>(); // key: `${contract}:${providerCode}`
  private healthCache = new Map<string, { score: number; lastUpdated: number }>();

  register(
    contract: ContractName,
    providerCode: string,
    resolver: AsyncResolver,
    options: { priority?: number; sandbox?: boolean } = {},
  ): void {
    const key = `${contract}:${providerCode}`;
    if (this.entries.has(key)) return;
    this.entries.set(key, { contract, providerCode, resolver, instance: null, options });
  }

  async resolve<T = any>(contract: ContractName, providerCode: string): Promise<T> {
    const key = `${contract}:${providerCode}`;
    const entry = this.entries.get(key);
    if (!entry) throw new Error(`Provider not registered: ${key}`);
    if (!entry.instance) {
      const raw = await entry.resolver();
      entry.instance = wrapWithHealthTracking(raw, providerCode);
    }
    return entry.instance as T;
  }

  list(contract: ContractName): string[] {
    const codes: string[] = [];
    for (const e of this.entries.values()) {
      if (e.contract === contract) codes.push(e.providerCode);
    }
    return codes;
  }

  listAll(): { contract: ContractName; providerCode: string; priority?: number }[] {
    return Array.from(this.entries.values()).map((e) => ({
      contract: e.contract,
      providerCode: e.providerCode,
      priority: e.options.priority,
    }));
  }

  getHealth(providerCode: string): { score: number; lastUpdated: number } {
    return this.healthCache.get(providerCode) ?? { score: 100, lastUpdated: Date.now() };
  }

  setHealth(providerCode: string, score: number): void {
    this.healthCache.set(providerCode, { score, lastUpdated: Date.now() });
  }
}

export const registry = new ProviderRegistry();

// Health-tracking Proxy wrapper — records ok/latency/errorCode, updates EMA health score,
// and trips the circuit breaker. Wraps thrown exceptions into ProviderResult<error>.
function wrapWithHealthTracking<T extends object>(adapter: T, providerCode: string): T {
  const breaker = getCircuitBreaker(providerCode);
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== "function") return original;
      return async (...args: any[]) => {
        // Circuit breaker guard
        const breakerState = breaker.getState();
        if (breakerState === "OPEN") {
          return {
            ok: false,
            error: { code: "PROVIDER_DOWN", message: `${providerCode} circuit open`, retryable: true },
          };
        }
        const start = Date.now();
        try {
          const result = await original.apply(target, args);
          const latencyMs = Date.now() - start;
          const ok = !result || result.ok !== false;
          breaker.recordResult(ok);
          updateHealth(providerCode, ok, latencyMs);
          return result;
        } catch (e) {
          const latencyMs = Date.now() - start;
          breaker.recordResult(false);
          updateHealth(providerCode, false, latencyMs);
          return {
            ok: false,
            error: {
              code: "UPSTREAM_ERROR",
              message: e instanceof Error ? e.message : "Provider call failed",
              providerCode,
              retryable: true,
              raw: undefined,
            },
          };
        }
      };
    },
  });
}

function updateHealth(providerCode: string, ok: boolean, latencyMs: number): void {
  const prev = registry.getHealth(providerCode);
  // EMA: score = 0.7*old + 0.3*(ok?100:0). Penalize slow calls.
  const latencyPenalty = latencyMs > 5000 ? 20 : latencyMs > 2000 ? 10 : 0;
  const sample = (ok ? 100 : 0) - latencyPenalty;
  const score = Math.max(0, Math.round(0.7 * prev.score + 0.3 * sample));
  registry.setHealth(providerCode, score);
}

// --- In-memory circuit breaker (prod: swap for Redis backend) ---
interface BreakerState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  successes: number;
  openedAt: number;
}

const breakers = new Map<string, BreakerState>();
const THRESHOLD = 5;
const COOLDOWN_MS = 30_000;

function getCircuitBreaker(providerCode: string) {
  if (!breakers.has(providerCode)) {
    breakers.set(providerCode, { state: "CLOSED", failures: 0, successes: 0, openedAt: 0 });
  }
  const s = breakers.get(providerCode)!;
  return {
    getState() {
      // Auto-transition OPEN -> HALF_OPEN after cooldown
      if (s.state === "OPEN" && Date.now() - s.openedAt > COOLDOWN_MS) {
        s.state = "HALF_OPEN";
        s.successes = 0;
      }
      return s.state;
    },
    recordResult(ok: boolean) {
      if (s.state === "CLOSED") {
        if (ok) {
          s.failures = 0;
        } else {
          s.failures++;
          if (s.failures >= THRESHOLD) {
            s.state = "OPEN";
            s.openedAt = Date.now();
          }
        }
      } else if (s.state === "HALF_OPEN") {
        if (ok) {
          s.successes++;
          if (s.successes >= 2) {
            s.state = "CLOSED";
            s.failures = 0;
          }
        } else {
          s.state = "OPEN";
          s.openedAt = Date.now();
        }
      }
    },
  };
}

export function getBreakerStates(): Record<string, { state: string; failures: number; score: number }> {
  const out: Record<string, { state: string; failures: number; score: number }> = {};
  for (const [code, s] of breakers.entries()) {
    out[code] = { state: s.state, failures: s.failures, score: registry.getHealth(code).score };
  }
  return out;
}
