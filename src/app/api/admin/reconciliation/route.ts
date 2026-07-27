import { NextRequest } from "next/server";
import { json, handleError, requireAdmin } from "@/lib/api";
import { runReconciliation, getReconciliationRuns } from "@/lib/turbocore/fle";

export async function GET() {
  try {
    await requireAdmin();
    const runs = await getReconciliationRuns(20);
    return json({ runs });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const result = await runReconciliation(body);
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
