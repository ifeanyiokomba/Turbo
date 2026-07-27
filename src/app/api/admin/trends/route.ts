import { json, handleError, requireAdmin } from "@/lib/api";
import { getProviderTrends } from "@/lib/turbocore/pie";

export async function GET() {
  try {
    await requireAdmin();
    const trends = await getProviderTrends();
    return json({ trends });
  } catch (e) {
    return handleError(e);
  }
}
