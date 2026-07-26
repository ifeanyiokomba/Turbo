// GET /api/celo/balances?address=0x...&chainId=42220
// Reads ALL token balances (USDm, USDC, USDT, NGNm, CELO) for an address
// and returns an approximate USD total.

import { json, handleError, requireUser, ServiceError } from "@/lib/api";
import { getPublicClient } from "@/lib/wagmi";
import {
  getTokens,
  isValidAddress,
  CELO_MAINNET_CHAIN_ID,
} from "@/lib/minipay";
import { erc20Abi, formatUnits, getAddress } from "viem";
import type { Address } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Approximate USD price per token — used only for the optional `totalUsd` field.
// Real conversion happens at deposit/withdraw time using the live FxRateSnapshot.
const PRICE_USD: Record<string, number> = {
  USDm: 1,
  USDC: 1,
  USDT: 1,
  NGNm: 1 / 1480, // naira-pegged Mento token
  CELO: 0.75,
};

export async function GET(req: Request) {
  try {
    await requireUser();

    const url = new URL(req.url);
    const address = url.searchParams.get("address")?.trim();
    const chainId = Number(url.searchParams.get("chainId") ?? CELO_MAINNET_CHAIN_ID);

    if (!address || !isValidAddress(address))
      throw new ServiceError("Invalid address", 400, "INVALID_ADDRESS");

    const tokens = getTokens(chainId);
    const publicClient = getPublicClient(chainId);
    const owner = getAddress(address) as Address;

    const entries = Object.values(tokens);

    const balances = await Promise.all(
      entries.map(async (t) => {
        try {
          const balanceWei: bigint = (await publicClient.readContract({
            address: t.address as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          })) as unknown as bigint;
          const balance = formatUnits(balanceWei, t.decimals);
          return {
            symbol: t.symbol,
            name: t.name,
            balance,
            balanceWei: balanceWei.toString(),
            decimals: t.decimals,
            address: t.address,
          };
        } catch {
          return {
            symbol: t.symbol,
            name: t.name,
            balance: "0",
            balanceWei: "0",
            decimals: t.decimals,
            address: t.address,
          };
        }
      }),
    );

    let totalUsd = 0;
    for (const r of balances) {
      const usd = Number(r.balance) * (PRICE_USD[r.symbol] ?? 0);
      if (Number.isFinite(usd)) totalUsd += usd;
    }

    return json({
      address: owner,
      chainId,
      balances,
      totalUsd: Number(totalUsd.toFixed(6)),
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}
