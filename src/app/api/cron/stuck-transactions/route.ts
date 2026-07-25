// Turbopay cron — stuck-transaction recovery.
//
// Finds transactions left in state=INITIATED for more than 5 minutes (i.e.
// the provider returned PENDING at orchestration time and we never heard
// back), polls the provider for the current status, and confirms or
// reverses the transaction accordingly.
//
// Protection: x-cron-secret + CronLock("stuck-transactions"). Each tx is
// wrapped in try/catch so one bad poll doesn't block the rest.

import { db } from "@/lib/db";
import { json, handleError } from "@/lib/api";
import { guardCron } from "@/lib/turbocore/cron-guard";
import { withCronLock } from "@/lib/turbocore/cron-lock";
import { contractForTxType, pollProviderStatus } from "@/lib/turbocore/poll";
import { confirmOrReverseTransaction } from "@/lib/turbocore/recovery";

export const dynamic = "force-dynamic";

const STUCK_THRESHOLD_MS = 5 * 60_000; // 5 minutes
const BATCH_SIZE = 50;

export async function POST(req: Request) {
  try {
    const guard = guardCron(req);
    if (guard) return guard;

    const result = await withCronLock("stuck-transactions", async () => {
      const startedAt = new Date().toISOString();
      console.log(`[cron:stuck-transactions] start at ${startedAt}`);

      const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
      const stuck = await db.transaction.findMany({
        where: {
          state: "INITIATED",
          createdAt: { lt: cutoff },
          providerRef: { not: null },
          provider: { not: null },
        },
        orderBy: { createdAt: "asc" },
        take: BATCH_SIZE,
      });

      let checked = 0;
      let resolved = 0;
      let reversed = 0;
      const errors: string[] = [];

      for (const tx of stuck) {
        checked += 1;
        try {
          const contract = contractForTxType(tx.type);
          if (!contract || !tx.provider || !tx.providerRef) {
            errors.push(`${tx.id}: no contract mapping for type=${tx.type}`);
            continue;
          }
          const status = await pollProviderStatus(contract, tx.provider, tx.providerRef);
          if (status === "UNKNOWN") {
            // Still pending or adapter unavailable — leave alone, next tick retries.
            continue;
          }
          const outcome = await confirmOrReverseTransaction(tx.id, status, "stuck-tx-cron");
          if (outcome.outcome === "CONFIRMED") resolved += 1;
          else if (outcome.outcome === "REVERSED") reversed += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${tx.id}: ${msg}`);
          console.error(`[cron:stuck-transactions] tx ${tx.id} failed:`, e);
        }
      }

      const finishedAt = new Date().toISOString();
      console.log(
        `[cron:stuck-transactions] done at ${finishedAt} — checked=${checked} resolved=${resolved} reversed=${reversed} errors=${errors.length}`,
      );
      return { checked, resolved, reversed, errors: errors.length, startedAt, finishedAt };
    });

    return json(result ?? { checked: 0, resolved: 0, reversed: 0, skipped: true });
  } catch (e) {
    return handleError(e);
  }
}
