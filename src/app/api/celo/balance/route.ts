import { json, handleError, requireUser, ServiceError } from "@/lib/api";
import { getPublicClient } from "@/lib/wagmi";
import { getToken, isValidAddress, CELO_MAINNET_CHAIN_ID } from "@/lib/minipay";
import { erc20Abi, formatUnits, getAddress } from "viem";
import type { Address } from "viem";

// GET /api/celo/balance?address=0x...&token=USDm&chainId=42220
// Returns the ERC-20 balanceOf(address) for a single token.
export async function GET(req: Request) {
  try {
    await requireUser();

    const url = new URL(req.url);
    const address = url.searchParams.get("address")?.trim();
    const tokenSymbol = (url.searchParams.get("token") ?? "USDm").toUpperCase();
    const chainId = Number(url.searchParams.get("chainId") ?? CELO_MAINNET_CHAIN_ID);

    if (!address || !isValidAddress(address))
      throw new ServiceError("Invalid address", 400, "INVALID_ADDRESS");

    const token = getToken(tokenSymbol, chainId);
    if (!token) throw new ServiceError("Unsupported token: " + tokenSymbol, 400, "TOKEN_NOT_FOUND");

    const publicClient = getPublicClient(chainId);
    const owner = getAddress(address) as Address;
    const contract = token.address as Address;

    const balanceWei: bigint = (await publicClient.readContract({
      address: contract,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    })) as unknown as bigint;

    const balance = formatUnits(balanceWei, token.decimals);

    return json({
      balance,
      balanceWei: balanceWei.toString(),
      token: token.symbol,
      decimals: token.decimals,
      address: token.address,
    });
  } catch (e) {
    return handleError(e);
  }
}
