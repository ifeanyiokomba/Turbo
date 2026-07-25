import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
} from "@/lib/api";
import { generateReference } from "@/lib/money";
import { z } from "zod";

const ARTICLES = [
  {
    id: "fund-wallet",
    q: "How do I fund my wallet?",
    a: "Tap Wallet → Fund wallet, choose Bank transfer, Card, or USSD. Virtual account funding settles instantly. Card funding arrives in under a minute.",
  },
  {
    id: "transfer-speed",
    q: "How long do transfers take?",
    a: "Turbopay-to-Turbopay transfers settle instantly. Bank transfers typically arrive within seconds, though first-time recipients may experience a few minutes' delay for bank-side validation.",
  },
  {
    id: "money-safe",
    q: "Is my money safe?",
    a: "Your wallet is held with our CBN-licensed partner MFB. All balances are tracked on a tamper-evident double-entry ledger, and every transaction is PIN-verified and audit-logged.",
  },
  {
    id: "reset-pin",
    q: "How do I reset my PIN?",
    a: "Go to Settings → Transaction PIN → Change PIN. You'll need your old PIN. If you've forgotten it, use the 'Forgot PIN' flow which will verify your identity via BVN.",
  },
  {
    id: "kyc-limits",
    q: "What are KYC limits?",
    a: "Tier 1 (Starter) — ₦50,000/tx, ₦200,000/day. Tier 2 (Verified, NIN) — ₦500,000/tx, ₦2M/day. Tier 3 (Premium, BVN) — ₦5M/tx, ₦20M/day. Upgrade in KYC.",
  },
  {
    id: "virtual-cards",
    q: "How do virtual cards work?",
    a: "Virtual cards are issued by our partner bank and funded from your wallet. They work on any Visa-accepting online merchant. Cards can be frozen, terminated, or revealed (with audit) at any time.",
  },
];

const createSchema = z.object({
  subject: z.string().min(3, "Subject is too short").max(120),
  category: z.enum(["ACCOUNT", "BILLING", "TRANSACTION", "SECURITY", "OTHER"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  message: z.string().min(10, "Please provide more detail").max(4000),
});

export async function GET() {
  try {
    const user = await requireUser();
    const tickets = await db.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return json({ tickets, articles: ARTICLES });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? "Invalid input", 400, "VALIDATION");
    }
    const { subject, category, priority, message } = parsed.data;
    const reference = generateReference("TKT");
    const ticket = await db.supportTicket.create({
      data: {
        userId: user.id,
        subject,
        category,
        priority,
        status: "OPEN",
        message,
        // store reference inside message footer (no dedicated column)
      },
    });
    await audit({
      userId: user.id,
      action: "SUPPORT_TICKET_CREATED",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { ticketId: ticket.id, subject, category, priority, reference },
    });
    return json({ ticket, reference });
  } catch (e) {
    return handleError(e);
  }
}
