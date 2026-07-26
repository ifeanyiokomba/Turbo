// Turbopay — short-lived in-memory challenge store for WebAuthn flows.
// Challenges are written by the /options route and consumed by the /verify route.
// Module-scoped Map with TTL; entries auto-expire after 5 minutes.

import { randomBytes } from "crypto";

interface Entry {
  challenge: string;
  createdAt: number;
  // optional metadata to anchor a challenge to a user
  userId?: string;
  username?: string;
}

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 500;

const store = new Map<string, Entry>();

function randomToken(): string {
  // 32 hex chars (16 random bytes)
  return randomBytes(16).toString("hex");
}

function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.createdAt > TTL_MS) store.delete(k);
  }
}

/** Save a challenge keyed by a random token. Returns the token (send to client). */
export function saveChallenge(opts: {
  challenge: string;
  userId?: string;
  username?: string;
}): string {
  purgeExpired();
  if (store.size >= MAX_ENTRIES) {
    // drop oldest
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of store) {
      if (v.createdAt < oldestTs) {
        oldestTs = v.createdAt;
        oldestKey = k;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }
  const token = randomToken();
  store.set(token, {
    challenge: opts.challenge,
    createdAt: Date.now(),
    userId: opts.userId,
    username: opts.username,
  });
  return token;
}

/** Consume a challenge (one-shot). Returns null if missing/expired. */
export function consumeChallenge(token: string): Entry | null {
  purgeExpired();
  const entry = store.get(token);
  if (!entry) return null;
  store.delete(token);
  return entry;
}

import { randomBytes } from "crypto";

function randomToken(): string {
  // 32 hex chars (16 random bytes)
  return randomBytes(16).toString("hex");
}
