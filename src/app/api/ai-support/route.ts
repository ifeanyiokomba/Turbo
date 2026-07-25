import { json, handleError, requireUser } from "@/lib/api";
import ZAI from "z-ai-web-dev-sdk";

interface IncomingMessage {
  role?: string;
  content?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = (await req.json().catch(() => ({}))) as {
      messages?: IncomingMessage[];
    };

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];

    // Keep only valid user/assistant turns, most recent ~10
    const history = rawMessages
      .filter(
        (m): m is { role: "user" | "assistant"; content: string } =>
          !!m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-10);

    const systemPrompt =
      "You are the Turbopay AI assistant, a helpful support agent for a Nigerian fintech wallet app called Turbopay. " +
      "You help users with: funding their wallet (via virtual account number, card, USSD), " +
      "transfers (free to other Turbopay users, \u20A652.50 to banks), " +
      "airtime & data (MTN/Glo/Airtel/9mobile), " +
      "bill payments (electricity, cable, internet, water), virtual cards, " +
      "savings (up to 18% p.a.), investments, " +
      "KYC tiers (Tier 1: \u20A650K/tx, Tier 2 NIN: \u20A6500K/tx, Tier 3 BVN: \u20A65M/tx), " +
      "and security (transaction PIN, sessions). " +
      "Be concise, friendly, and accurate. If asked about something outside Turbopay, politely redirect. " +
      `Current user: ${user.username} (KYC tier ${user.kycTier}).`;

    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
      thinking: { type: "disabled" },
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I'm not sure how to help with that right now. Could you rephrase?";

    return json({ content: reply });
  } catch (e) {
    return handleError(e);
  }
}
