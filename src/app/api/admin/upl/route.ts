import { NextRequest } from "next/server";
import { json, handleError, requireAdmin } from "@/lib/api";
import {
  buildTimeline,
  UPL_V1,
  UPL_V2,
  getDefaultWorkflow,
  getWorkflow,
} from "@/lib/turbocore/upl";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const txId = url.searchParams.get("transactionId");

    if (action === "timeline" && txId) {
      const timeline = await buildTimeline(txId);
      return json({ transactionId: txId, timeline, entries: timeline.length });
    }

    if (action === "workflows") {
      return json({ workflows: [UPL_V1, UPL_V2], default: getDefaultWorkflow().version });
    }

    if (action === "workflow" && url.searchParams.get("version")) {
      const wf = getWorkflow(url.searchParams.get("version")!);
      return json({ workflow: wf });
    }

    return json({ error: "Specify action=timeline&transactionId= or action=workflows" }, 400);
  } catch (e) {
    return handleError(e);
  }
}
