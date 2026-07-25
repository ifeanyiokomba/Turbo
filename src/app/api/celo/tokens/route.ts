import { json, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { seedCeloTokens, CELO_MAINNET_CHAIN_ID } from "@/lib/minipay";

// GET /api/celo/tokens — list active CeloTokenConfig rows (public, no auth).
// Seeds the token table on first call (idempotent upsert).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const chainId = Number(url.searchParams.get("chainId") ?? CELO_MAINNET_CHAIN_ID);

    await seedCeloTokens();

    const tokens = await db.celoTokenConfig.findMany({
      where: { chainId, isActive: true },
      orderBy: { displayOrder: "asc" },
    });

    return json({
      tokens: tokens.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        chainId: t.chainId,
        isActive: t.isActive,
        isBridgeable: t.isBridgeable,
        displayOrder: t.displayOrder,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
