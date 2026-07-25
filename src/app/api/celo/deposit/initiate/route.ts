import { db } from "@/lib/db";
import { json, handleError, requireUser, ServiceError, audit, getClientIp, getUserAgent } from "@/lib/api";
import {
  TREASURY_ADDRESS,
  getToken,
  CELO_MAINNET_CHAIN_ID,
} from "@/lib/minipay";
import { generateReference } from "@/lib/money";
import { parseUnits } from "viem";

// POST /api/celo/deposit/initiate
// Body: { token, amountHuman }
// Returns the treasury address + parsed amount the frontend should send via MiniPay.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const tokenSymbol = String(body?.token ?? "USDm").toUpperCase();
    const amountHuman = String(body?.amountHuman ?? "").trim();
    const chainId = Number(body?.chainId ?? CELO_MAINNET_CHAIN_ID);

    if (!amountHuman || !/^\d+(\.\d+)?$/.test(amountHuman))
      throw new ServiceError("Invalid amount", 400, "INVALID_AMOUNT");

    const token = getToken(tokenSymbol, chainId);
    if (!token)
      throw new ServiceError("Unsupported token: " + tokenSymbol, 400, "TOKEN_NOT_FOUND");

    const amountWei = parseUnits(amountHuman, token.decimals).toString();
    const reference = generateReference("CELO");

    // Track initiation (helps reconciliation + analytics). Non-blocking.
    await audit({
      userId: user.id,
      action: "CELO_DEPOSIT_INITIATE",
      category: "WALLET",
      metadata: { token: token.symbol, amountHuman, reference, chainId },
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    }).catch(() => {});

    return json({
      treasuryAddress: TREASURY_ADDRESS,
      token: {
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
      },
      amountHuman,
      amountWei,
      reference,
      chainId,
    });
  } catch (e) {
    return handleError(e);
  }
}
