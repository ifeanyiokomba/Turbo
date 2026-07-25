// Turbopay money utilities — all amounts in kobo (1 NGN = 100 kobo)

export function naira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kobo / 100);
}

export function nairaCompact(kobo: number): string {
  const n = kobo / 100;
  if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toFixed(0)}`;
}

export function nairaPlain(kobo: number): string {
  return (kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseKobo(input: string | number): number {
  if (typeof input === "number") return Math.round(input);
  const cleaned = input.replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function maskAccount(acc: string): string {
  if (!acc || acc.length < 4) return acc;
  return `••••${acc.slice(-4)}`;
}

export function maskPan(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export function formatDate(date: Date | string, withTime = false): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  };
  return d.toLocaleDateString("en-NG", opts);
}

export function generateReference(prefix = "TP"): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}

export function generateAccountNumber(): string {
  // 10-digit NUBAN-style number
  let n = "";
  for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10).toString();
  return n;
}

export function generatePan(): { pan: string; last4: string } {
  // Luhn-valid 16-digit PAN prefixed 4 (Visa-ish) — demo only
  const prefix = "4";
  let pan = prefix;
  while (pan.length < 15) pan += Math.floor(Math.random() * 10).toString();
  // Luhn check digit
  let sum = 0;
  let alt = true;
  for (let i = pan.length - 1; i >= 0; i--) {
    let d = parseInt(pan[i], 10);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  const check = (10 - (sum % 10)) % 10;
  pan += check.toString();
  return { pan, last4: pan.slice(-4) };
}

export function generateExpiry(): string {
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const year = String(new Date().getFullYear() + 4 - 2000);
  return `${month}/${year}`;
}
