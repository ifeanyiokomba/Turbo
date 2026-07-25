"use client";

// Turbopay receipt PDF generator — client-side, uses jsPDF + autoTable.
// Generates a branded transaction receipt and triggers a browser download.

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { naira, formatDate } from "@/lib/money";

interface ReceiptTx {
  id?: string;
  reference: string;
  type: string;
  direction?: string;
  amountKobo: number;
  feeKobo?: number | null;
  status: string;
  state?: string | null;
  description?: string | null;
  counterpartyName?: string | null;
  counterpartyAccount?: string | null;
  counterpartyBank?: string | null;
  provider?: string | null;
  providerRef?: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  FUNDING: "Wallet funding",
  TRANSFER: "Transfer",
  AIRTIME: "Airtime purchase",
  DATA: "Data bundle",
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
  SUCCESS: [16, 122, 87], // emerald-700
  PENDING: [161, 98, 7], // amber-700
  FAILED: [185, 28, 28], // red-700
  REVERSED: [107, 114, 128], // gray-500
};

function truncate(value: string, max: number): string {
  if (!value) return "—";
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function notEmpty(v: string | null | undefined): v is string {
  return !!v && v.trim().length > 0;
}

export function downloadReceipt(tx: ReceiptTx): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // ===== Emerald header band =====
  doc.setFillColor(13, 99, 72); // emerald-800
  doc.rect(0, 0, pageWidth, 90, "F");

  // Amber accent stripe under the header
  doc.setFillColor(245, 158, 11); // amber-500
  doc.rect(0, 90, pageWidth, 3, "F");

  // Logo lightning bolt (amber)
  doc.setFillColor(245, 158, 11);
  doc.circle(margin + 14, 42, 14, "F");
  doc.setFillColor(13, 99, 72);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("T", margin + 14, 47, { align: "center" });

  // Logo wordmark
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Turbopay", margin + 38, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(209, 250, 229); // emerald-100
  doc.text("Transaction Receipt", margin + 38, 56);

  // Reference (top-right of header)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(209, 250, 229);
  doc.text("Reference", pageWidth - margin, 32, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(tx.reference, pageWidth - margin, 48, { align: "right" });

  // ===== Status banner =====
  const bannerY = 110;
  const statusColor = STATUS_COLORS[tx.status] ?? STATUS_COLORS.PENDING;
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(margin, bannerY, contentWidth, 26, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    `${tx.status} · ${TYPE_LABELS[tx.type] ?? tx.type}`,
    margin + 14,
    bannerY + 17,
  );

  // ===== Amount headline =====
  const isCredit = tx.direction === "CREDIT";
  const amountY = bannerY + 60;
  doc.setTextColor(107, 114, 128); // gray-500
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("AMOUNT", margin, amountY);
  doc.setTextColor(isCredit ? 13 : 33, isCredit ? 99 : 33, isCredit ? 72 : 33);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(`${isCredit ? "+" : "−"}${naira(tx.amountKobo)}`, margin, amountY + 24);

  if (tx.feeKobo && tx.feeKobo > 0) {
    doc.setTextColor(107, 114, 128);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Fee: ${naira(tx.feeKobo)}`, pageWidth - margin, amountY + 24, {
      align: "right",
    });
  }

  // ===== Details table =====
  const dateLabel = formatDate(tx.createdAt, true);

  const rows: [string, string][] = [
    ["Reference", tx.reference],
    ["Type", TYPE_LABELS[tx.type] ?? tx.type],
    ["Date", dateLabel],
    ["Amount", `${isCredit ? "+" : "−"}${naira(tx.amountKobo)}`],
  ];

  if (tx.feeKobo && tx.feeKobo > 0) {
    rows.push(["Fee", naira(tx.feeKobo)]);
  } else {
    rows.push(["Fee", "Free"]);
  }

  rows.push(["Status", tx.status]);

  if (notEmpty(tx.counterpartyName)) {
    rows.push(["Counterparty", truncate(tx.counterpartyName!, 60)]);
  }
  if (notEmpty(tx.counterpartyAccount)) {
    rows.push(["Account number", tx.counterpartyAccount!]);
  }
  if (notEmpty(tx.counterpartyBank)) {
    rows.push(["Bank", tx.counterpartyBank!]);
  }
  if (notEmpty(tx.provider)) {
    rows.push(["Provider", tx.provider!]);
  }
  if (notEmpty(tx.providerRef)) {
    rows.push(["Provider reference", truncate(tx.providerRef!, 50)]);
  }
  if (notEmpty(tx.description)) {
    rows.push(["Description", truncate(tx.description!, 80)]);
  }
  if (tx.state && tx.state !== "SETTLED") {
    rows.push(["State", tx.state]);
  }

  autoTable(doc, {
    startY: amountY + 50,
    margin: { left: margin, right: margin },
    head: [["Field", "Value"]],
    body: rows,
    theme: "striped",
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 7,
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [13, 99, 72], // emerald-800
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: [243, 250, 247], // emerald-50
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [55, 65, 81], cellWidth: 160 },
      1: { textColor: [17, 24, 39] },
    },
  });

  // ===== Footer =====
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 60;

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  // Thank you note
  doc.setTextColor(13, 99, 72);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Thank you for using Turbopay.", pageWidth / 2, footerY + 20, {
    align: "center",
  });

  doc.setTextColor(107, 114, 128);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "Turbopay MFB · Licensed partners · NDPR-aware",
    pageWidth / 2,
    footerY + 34,
    { align: "center" },
  );
  doc.text(
    `Generated ${new Date().toLocaleString("en-NG")}`,
    pageWidth / 2,
    footerY + 46,
    { align: "center" },
  );

  const safeRef = (tx.reference || "receipt").replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`turbopay-receipt-${safeRef}.pdf`);
}
