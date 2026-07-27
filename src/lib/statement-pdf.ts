// Turbopay statement PDF/CSV generator (server-side).
// Builds a branded account statement with header band, account info,
// transaction table, and a summary footer (total in / out / net).

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

export interface StatementTx {
  id: string;
  reference: string;
  type: string;
  direction: string; // CREDIT | DEBIT
  amountKobo: number;
  feeKobo: number;
  status: string;
  description: string | null;
  counterpartyName: string | null;
  createdAt: Date;
}

export interface StatementAccount {
  fullName: string;
  username: string;
  email: string | null;
  accountNumber: string | null;
  accountName: string | null;
  bankName: string | null;
  currency: string;
  openingBalanceKobo: number;
  closingBalanceKobo: number;
}

export interface StatementPeriod {
  periodStart: Date;
  periodEnd: Date;
}

const TYPE_LABELS: Record<string, string> = {
  FUNDING: "Funding",
  TRANSFER: "Transfer",
  AIRTIME: "Airtime",
  DATA: "Data",
  BILL: "Bill payment",
  CARD_FUND: "Card funding",
  CARD_WITHDRAW: "Card withdrawal",
  REWARD: "Reward",
  REFERRAL: "Referral bonus",
  SAVINGS_DEPOSIT: "Savings deposit",
  SAVINGS_WITHDRAW: "Savings withdrawal",
  INVESTMENT: "Investment",
};

const STATUS_COLORS: Record<string, [number, number, number]> = {
  SUCCESS: [16, 122, 87],
  PENDING: [161, 98, 7],
  FAILED: [185, 28, 28],
  REVERSED: [107, 114, 128],
};

function naira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kobo / 100);
}

function fmtDate(d: Date, withTime = false): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  };
  return d.toLocaleDateString("en-NG", opts);
}

function truncate(value: string, max: number): string {
  if (!value) return "—";
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function notEmpty(v: string | null | undefined): v is string {
  return !!v && v.trim().length > 0;
}

export function generateStatementPdf(
  account: StatementAccount,
  period: StatementPeriod,
  transactions: StatementTx[]
): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // ===== Emerald header band =====
  doc.setFillColor(13, 99, 72); // emerald-800
  doc.rect(0, 0, pageWidth, 92, "F");

  // Amber accent stripe under the header
  doc.setFillColor(245, 158, 11); // amber-500
  doc.rect(0, 92, pageWidth, 3, "F");

  // Logo circle (amber) with "T"
  doc.setFillColor(245, 158, 11);
  doc.circle(margin + 14, 44, 14, "F");
  doc.setFillColor(13, 99, 72);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("T", margin + 14, 49, { align: "center" });

  // Wordmark
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Turbopay", margin + 38, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(209, 250, 229); // emerald-100
  doc.text("Account Statement", margin + 38, 58);

  // Period (top-right of header)
  doc.setFontSize(9);
  doc.setTextColor(209, 250, 229);
  doc.text("Period", pageWidth - margin, 32, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `${fmtDate(period.periodStart)} – ${fmtDate(period.periodEnd)}`,
    pageWidth - margin,
    48,
    { align: "right" }
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(209, 250, 229);
  doc.text(`Generated ${new Date().toLocaleString("en-NG")}`, pageWidth - margin, 62, {
    align: "right",
  });

  // ===== Account info card =====
  const infoY = 115;
  doc.setFillColor(243, 250, 247); // emerald-50
  doc.roundedRect(margin, infoY, contentWidth, 76, 4, 4, "F");

  const colX1 = margin + 16;
  const colX2 = margin + contentWidth / 2 + 8;

  doc.setTextColor(107, 114, 128);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("ACCOUNT HOLDER", colX1, infoY + 16);
  doc.text("ACCOUNT NUMBER", colX2, infoY + 16);

  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(truncate(account.fullName, 32), colX1, infoY + 30);
  doc.text(account.accountNumber ?? "—", colX2, infoY + 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text("USERNAME", colX1, infoY + 46);
  doc.text("BANK", colX2, infoY + 46);

  doc.setTextColor(55, 65, 81);
  doc.setFontSize(10);
  doc.text(`@${account.username}`, colX1, infoY + 60);
  doc.text(account.bankName ?? "Turbopay MFB", colX2, infoY + 60);

  // ===== Transaction table =====
  // Compute running balance using opening + signed deltas
  let runningBalance = account.openingBalanceKobo;

  const body = transactions.map((t) => {
    const signed = t.direction === "CREDIT" ? t.amountKobo : -t.amountKobo;
    runningBalance += signed;
    const desc =
      t.description ??
      (notEmpty(t.counterpartyName) ? t.counterpartyName! : (TYPE_LABELS[t.type] ?? t.type));
    return [
      fmtDate(t.createdAt, true),
      t.reference,
      TYPE_LABELS[t.type] ?? t.type,
      truncate(desc, 48),
      t.direction === "CREDIT" ? naira(t.amountKobo) : "—",
      t.direction === "DEBIT" ? naira(t.amountKobo) : "—",
      naira(runningBalance),
    ];
  });

  if (body.length === 0) {
    body.push(["", "—", "—", "No transactions in this period.", "—", "—", "—"]);
  }

  autoTable(doc, {
    startY: infoY + 90,
    margin: { left: margin, right: margin },
    head: [["Date", "Reference", "Type", "Description", "Money In", "Money Out", "Balance"]],
    body,
    theme: "striped",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 5,
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [13, 99, 72],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [243, 250, 247],
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 80, textColor: [55, 65, 81] },
      2: { cellWidth: 55 },
      3: { cellWidth: "auto" },
      4: { cellWidth: 60, halign: "right", textColor: [13, 99, 72] },
      5: { cellWidth: 60, halign: "right", textColor: [161, 98, 7] },
      6: { cellWidth: 65, halign: "right", fontStyle: "bold" },
    },
  });

  // ===== Summary footer =====
  // @ts-expect-error — lastAutoTable is added by the autotable plugin at runtime.
  const afterTableY: number = doc.lastAutoTable?.finalY ?? infoY + 200;

  const totalIn = transactions
    .filter((t) => t.direction === "CREDIT" && t.status === "SUCCESS")
    .reduce((s, t) => s + t.amountKobo, 0);
  const totalOut = transactions
    .filter((t) => t.direction === "DEBIT" && t.status === "SUCCESS")
    .reduce((s, t) => s + t.amountKobo, 0);
  const net = totalIn - totalOut;

  const summaryY = afterTableY + 24;
  doc.setFillColor(13, 99, 72);
  doc.roundedRect(margin, summaryY, contentWidth, 78, 4, 4, "F");

  const summaryColW = contentWidth / 4;
  const summaryItems: [string, string, [number, number, number]][] = [
    ["Opening balance", naira(account.openingBalanceKobo), [209, 250, 229]],
    ["Total money in", naira(totalIn), [209, 250, 229]],
    ["Total money out", naira(totalOut), [254, 243, 199]], // amber-100
    ["Net change", `${net >= 0 ? "+" : "−"}${naira(Math.abs(net))}`, [255, 255, 255]],
  ];

  summaryItems.forEach((item, i) => {
    const cx = margin + summaryColW * i + summaryColW / 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(item[2][0], item[2][1], item[2][2]);
    doc.text(item[0].toUpperCase(), cx, summaryY + 22, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(item[1], cx, summaryY + 42, { align: "center" });
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(209, 250, 229);
  doc.text(`Closing balance: ${naira(account.closingBalanceKobo)}`, pageWidth / 2, summaryY + 66, {
    align: "center",
  });

  // ===== Footer =====
  const footerY = pageHeight - 60;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setTextColor(107, 114, 128);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "This statement was generated electronically by Turbopay MFB and is valid without signature.",
    pageWidth / 2,
    footerY + 16,
    { align: "center" }
  );
  doc.text("Turbopay MFB · Licensed partners · NDPR-aware", pageWidth / 2, footerY + 28, {
    align: "center",
  });
  doc.text(`Page 1 · ${transactions.length} transactions`, pageWidth / 2, footerY + 40, {
    align: "center",
  });

  // Return as Uint8Array (raw PDF bytes)
  return doc.output("arraybuffer") as unknown as Uint8Array;
}

// ===== CSV =====

export function generateStatementCsv(
  account: StatementAccount,
  period: StatementPeriod,
  transactions: StatementTx[]
): Uint8Array {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [];
  lines.push("Turbopay MFB — Account Statement");
  lines.push(`Account holder,${escape(account.fullName)}`);
  lines.push(`Username,@${escape(account.username)}`);
  if (account.email) lines.push(`Email,${escape(account.email)}`);
  lines.push(`Account number,${escape(account.accountNumber ?? "—")}`);
  lines.push(`Bank,${escape(account.bankName ?? "Turbopay MFB")}`);
  lines.push(
    `Period,${escape(fmtDate(period.periodStart))} to ${escape(fmtDate(period.periodEnd))}`
  );
  lines.push(`Opening balance,${(account.openingBalanceKobo / 100).toFixed(2)}`);
  lines.push(`Closing balance,${(account.closingBalanceKobo / 100).toFixed(2)}`);
  lines.push("");

  // Compute running balance
  let runningBalance = account.openingBalanceKobo;
  const rows = transactions.map((t) => {
    const signed = t.direction === "CREDIT" ? t.amountKobo : -t.amountKobo;
    runningBalance += signed;
    const desc =
      t.description ??
      (notEmpty(t.counterpartyName) ? t.counterpartyName! : (TYPE_LABELS[t.type] ?? t.type));
    return [
      new Date(t.createdAt).toISOString(),
      t.reference,
      TYPE_LABELS[t.type] ?? t.type,
      t.direction,
      desc,
      (t.amountKobo / 100).toFixed(2),
      (t.feeKobo / 100).toFixed(2),
      t.status,
      (runningBalance / 100).toFixed(2),
    ]
      .map(escape)
      .join(",");
  });

  lines.push(
    [
      "Date",
      "Reference",
      "Type",
      "Direction",
      "Description",
      "Amount (NGN)",
      "Fee (NGN)",
      "Status",
      "Balance (NGN)",
    ]
      .map(escape)
      .join(",")
  );
  lines.push(...rows);

  // Summary
  const totalIn = transactions
    .filter((t) => t.direction === "CREDIT" && t.status === "SUCCESS")
    .reduce((s, t) => s + t.amountKobo, 0);
  const totalOut = transactions
    .filter((t) => t.direction === "DEBIT" && t.status === "SUCCESS")
    .reduce((s, t) => s + t.amountKobo, 0);
  const net = totalIn - totalOut;

  lines.push("");
  lines.push("Summary");
  lines.push(`Total money in,${(totalIn / 100).toFixed(2)}`);
  lines.push(`Total money out,${(totalOut / 100).toFixed(2)}`);
  lines.push(`Net change,${(net / 100).toFixed(2)}`);

  const csv = lines.join("\n");
  return new TextEncoder().encode(csv);
}

export function buildStatementFilename(
  account: StatementAccount,
  period: StatementPeriod,
  format: "PDF" | "CSV"
): string {
  const safeName = (account.fullName || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  const start = period.periodStart.toISOString().slice(0, 10);
  const end = period.periodEnd.toISOString().slice(0, 10);
  return `turbopay-statement-${safeName}-${start}_to_${end}.${format.toLowerCase()}`;
}

// Re-export for callers needing color tokens
export { STATUS_COLORS };
