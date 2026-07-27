import { NextRequest } from "next/server";
import { json, handleError, requireAdmin } from "@/lib/api";
import {
  syncAllProviders,
  refreshProvider,
  getPendingApprovals,
  approveChange,
  rejectChange,
  getAllProviderMetadata,
} from "@/lib/turbocore/sync-engine";

export async function GET() {
  try {
    await requireAdmin();
    const metadata = getAllProviderMetadata();
    const pending = getPendingApprovals();
    return json({ providers: metadata, pendingApprovals: pending });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (body.provider) {
      const result = await refreshProvider(body.provider);
      return json(result);
    }
    const result = await syncAllProviders();
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (body.action === "approve" && body.provider && body.field) {
      approveChange(body.provider, body.field);
      return json({ ok: true });
    }
    if (body.action === "reject" && body.provider && body.field) {
      rejectChange(body.provider, body.field);
      return json({ ok: true });
    }
    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    return handleError(e);
  }
}
