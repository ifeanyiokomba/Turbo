import { NextRequest } from "next/server";
import { json, handleError, requireAdmin } from "@/lib/api";
import { getDLQEntries, retryDLQEntry, processDLQ } from "@/lib/turbocore/upl";

export async function GET() {
  try {
    await requireAdmin();
    const entries = getDLQEntries(50);
    return json({ entries, total: entries.length });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();

    if (body.action === "process") {
      const result = await processDLQ();
      return json(result);
    }

    if (body.action === "retry" && body.id) {
      const result = await retryDLQEntry(body.id);
      return json(result);
    }

    return json({ error: "Specify action=process or action=retry&id=..." }, 400);
  } catch (e) {
    return handleError(e);
  }
}
