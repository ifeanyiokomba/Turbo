import { json, handleError, requireAdmin } from "@/lib/api";
import { getProviderHeatMap } from "@/lib/turbocore/pie";

export async function GET() {
  try {
    await requireAdmin();
    const heatmap = await getProviderHeatMap();
    return json({ heatmap, total: heatmap.length });
  } catch (e) {
    return handleError(e);
  }
}
