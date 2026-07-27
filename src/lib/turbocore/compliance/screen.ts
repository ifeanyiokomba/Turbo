// TurboCore compliance — sanctions screening + AML rules + per-country KYC.

import { db } from "@/lib/db";

// --- Sanctions screening (Jaro-Winkler fuzzy match) ---
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const a = s1.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = s2.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (a.length === 0 || b.length === 0) return 0;
  const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (aMatches[i]) {
      while (!bMatches[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

export async function screenEntity(req: {
  name: string;
  entityType?: string;
  transactionId?: string;
  userId?: string;
}): Promise<{ hit: boolean; score: number; matchedEntryId?: string }> {
  const entries = await db.sanctionsEntry.findMany({ take: 5000 });
  let best = { score: 0, matchedEntryId: undefined as string | undefined };
  for (const entry of entries) {
    const score = jaroWinkler(req.name, entry.primaryName);
    if (score > best.score) best = { score, matchedEntryId: entry.id };
  }
  const hit = best.score >= 0.85;
  await db.screeningResult
    .create({
      data: {
        entityType: req.entityType ?? "TRANSACTION",
        entityName: req.name,
        transactionId: req.transactionId ?? null,
        userId: req.userId ?? null,
        hit,
        score: best.score,
        matchedEntryId: best.matchedEntryId ?? null,
      },
    })
    .catch(() => {});
  return { hit, score: best.score, matchedEntryId: best.matchedEntryId };
}

// --- AML rules ---
export async function runAmlRules(req: {
  userId: string;
  amountMinor: number;
  direction: string; // CREDIT | DEBIT
  kycTier: number;
}): Promise<{ flagged: boolean; rule?: string; severity?: string; description?: string }> {
  const now = new Date();
  const tenMinAgo = new Date(now.getTime() - 10 * 60_000);
  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);

  // VELOCITY: >5 tx in 10 min
  const recentCount = await db.transaction.count({
    where: { userId: req.userId, createdAt: { gte: tenMinAgo }, status: "SUCCESS" },
  });
  if (recentCount >= 5) {
    await flagAml({
      userId: req.userId,
      rule: "VELOCITY",
      severity: "MEDIUM",
      description: `${recentCount} transactions in 10 minutes`,
    });
    return {
      flagged: true,
      rule: "VELOCITY",
      severity: "MEDIUM",
      description: "High velocity detected",
    };
  }

  // LARGE_AMOUNT
  const thresholds = [50_000_000, 500_000_000, 5_000_000_000]; // tier 1/2/3 in kobo
  const threshold = thresholds[Math.min(req.kycTier - 1, 2)];
  if (req.amountMinor >= threshold) {
    await flagAml({
      userId: req.userId,
      rule: "LARGE_AMOUNT",
      severity: "HIGH",
      description: `Transaction ≥ ${threshold} kobo`,
    });
    return {
      flagged: true,
      rule: "LARGE_AMOUNT",
      severity: "HIGH",
      description: "Large transaction",
    };
  }

  // RAPID_TRANSFER: 3+ outgoing within 60s of funding
  if (req.direction === "DEBIT") {
    const recentDebits = await db.transaction.count({
      where: {
        userId: req.userId,
        direction: "DEBIT",
        createdAt: { gte: hourAgo },
        status: "SUCCESS",
      },
    });
    const recentCredits = await db.transaction.findFirst({
      where: {
        userId: req.userId,
        direction: "CREDIT",
        createdAt: { gte: new Date(now.getTime() - 5 * 60_000) },
      },
    });
    if (recentDebits >= 3 && recentCredits) {
      await flagAml({
        userId: req.userId,
        rule: "RAPID_TRANSFER",
        severity: "HIGH",
        description: "Rapid transfers after funding",
      });
      return {
        flagged: true,
        rule: "RAPID_TRANSFER",
        severity: "HIGH",
        description: "Rapid transfer pattern",
      };
    }
  }

  // STRUCTURING: 3+ deposits of 490k-500k in 7 days
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const structuring = await db.transaction.count({
    where: {
      userId: req.userId,
      direction: "CREDIT",
      amountKobo: { gte: 49_000_000, lte: 50_000_000 },
      createdAt: { gte: weekAgo },
      status: "SUCCESS",
    },
  });
  if (structuring >= 3) {
    await flagAml({
      userId: req.userId,
      rule: "STRUCTURING",
      severity: "HIGH",
      description: "Possible smurfing pattern",
    });
    return {
      flagged: true,
      rule: "STRUCTURING",
      severity: "HIGH",
      description: "Structuring pattern detected",
    };
  }

  return { flagged: false };
}

async function flagAml(opts: {
  userId: string;
  rule: string;
  severity: string;
  description: string;
}) {
  await db.amlFlag.create({
    data: {
      userId: opts.userId,
      rule: opts.rule,
      severity: opts.severity,
      description: opts.description,
      resolved: false,
    },
  });
  if (opts.severity === "HIGH") {
    await db.wallet.updateMany({ where: { userId: opts.userId }, data: { status: "FROZEN" } });
    await db.user.update({ where: { id: opts.userId }, data: { status: "FROZEN" } });
    await db.complianceCase.create({
      data: {
        userId: opts.userId,
        type: "AML",
        status: "OPEN",
        summary: `${opts.rule}: ${opts.description}`,
        metadataJSON: JSON.stringify({ rule: opts.rule, severity: opts.severity }),
      },
    });
  }
}

// --- Per-country KYC validation ---
export function validateKycId(
  country: string,
  idType: string,
  idValue: string
): { valid: boolean; error?: string } {
  const cleaned = idValue.replace(/\s/g, "");
  switch (idType) {
    case "NIN":
    case "BVN":
      if (!/^\d{11}$/.test(cleaned)) return { valid: false, error: `${idType} must be 11 digits` };
      break;
    case "KRA_PIN":
      if (!/^[A-Z]\d{9}[A-Z]$/.test(cleaned.toUpperCase()))
        return { valid: false, error: "KRA PIN format invalid (e.g. A123456789B)" };
      break;
    case "GHANA_CARD":
      if (!/^GHA-\d{9}-\d$/.test(cleaned.toUpperCase()))
        return { valid: false, error: "Ghana Card format: GHA-XXXXXXXXX-X" };
      break;
    case "SA_ID":
      if (!/^\d{13}$/.test(cleaned)) return { valid: false, error: "SA ID must be 13 digits" };
      break;
    case "PASSPORT":
      if (cleaned.length < 6) return { valid: false, error: "Passport number too short" };
      break;
    default:
      if (cleaned.length < 5) return { valid: false, error: "Invalid ID" };
  }
  return { valid: true };
}
