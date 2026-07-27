import { NextRequest } from "next/server";
import { json, handleError, requireAdmin } from "@/lib/api";
import { simulateRouting } from "@/lib/turbocore/pie";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const result = await simulateRouting(body.request, body.merchantPolicy);
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
