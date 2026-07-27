import { NextRequest } from "next/server";
import { json, handleError, requireAdmin } from "@/lib/api";
import {
  getRecentExplanations,
  getExplanation,
  explainRouting,
} from "@/lib/turbocore/routing-explainability";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const requestId = url.searchParams.get("requestId");
    const explain = url.searchParams.get("explain") === "true";

    if (requestId) {
      const explanation = getExplanation(requestId);
      if (!explanation) return json({ error: "Not found" }, 404);
      if (explain) return json({ explanation, humanReadable: explainRouting(explanation) });
      return json({ explanation });
    }

    const recent = getRecentExplanations(20);
    return json({ explanations: recent });
  } catch (e) {
    return handleError(e);
  }
}
