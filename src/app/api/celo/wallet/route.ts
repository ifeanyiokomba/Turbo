// GET /api/celo/wallet — link / fetch the user's CeloWallet
// Optional ?address=0x...&chainId=42220 to upsert the wallet.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  requireUser,
  json,
  errorJson,
  audit,
  handleError,
  getClientIp,
  getUserAgent,
} from "@/lib/api";
import { isValidAddress, CELO_MAINNET_CHAIN_ID } from "@/lib/minipay";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const addressParam = url.searchParams.get("address")?.trim();
    const chainIdParam = Number(url.searchParams.get("chainId") ?? CELO_MAINNET_CHAIN_ID);
    const chainId = Number.isFinite(chainIdParam) ? chainIdParam : CELO_MAINNET_CHAIN_ID;

    // Try to find an existing wallet first.
    let wallet = await db.celoWallet.findUnique({ where: { userId: user.id } });

    // If we received an address and either no wallet exists, or the stored wallet
    // has a stale address, upsert it.
    if (addressParam && isValidAddress(addressParam)) {
      const normalized = addressParam as string;
      if (!wallet) {
        wallet = await db.celoWallet.create({
          data: { userId: user.id, address: normalized, chainId, lastSeenAt: new Date() },
        });
        await audit({
          userId: user.id,
          action: "CELO_WALLET_LINKED",
          category: "WALLET",
          severity: "INFO",
          metadata: { address: normalized, chainId },
        });
      } else if (wallet.address.toLowerCase() !== normalized.toLowerCase()) {
        // Address changed — update the linked wallet.
        wallet = await db.celoWallet.update({
          where: { id: wallet.id },
          data: { address: normalized, chainId, lastSeenAt: new Date() },
        });
      } else {
        wallet = await db.celoWallet.update({
          where: { id: wallet.id },
          data: { lastSeenAt: new Date() },
        });
      }
    }

    if (!wallet) {
      return json({
        wallet: null,
        linked: false,
        message: "No Celo wallet linked. Open this app inside MiniPay to auto-link.",
      });
    }

    return json({
      wallet: {
        id: wallet.id,
        address: wallet.address,
        chainId: wallet.chainId,
        linkedAt: wallet.linkedAt,
        lastSeenAt: wallet.lastSeenAt,
      },
      linked: true,
      chainName: wallet.chainId === 42220 ? "Celo Mainnet" : "Celo Sepolia",
    });
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/celo/wallet — link or update the user's MiniPay wallet address.
// Body: { address, chainId? }
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const address = String(body?.address ?? "").trim();
    const chainIdParam = Number(body?.chainId ?? CELO_MAINNET_CHAIN_ID);
    const chainId = Number.isFinite(chainIdParam) ? chainIdParam : CELO_MAINNET_CHAIN_ID;

    if (!isValidAddress(address)) {
      return errorJson("Invalid wallet address", 400, "INVALID_ADDRESS");
    }

    // userId is @unique, address is @unique — if another wallet already owns
    // this address we must fail cleanly instead of crashing on a constraint.
    const existingByAddress = await db.celoWallet.findUnique({
      where: { address: address },
    });
    if (existingByAddress && existingByAddress.userId !== user.id) {
      return errorJson("Wallet address already linked to another account", 409, "ADDRESS_TAKEN");
    }

    const wallet = await db.celoWallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, address, chainId, lastSeenAt: new Date() },
      update: { address, chainId, lastSeenAt: new Date() },
    });

    await audit({
      userId: user.id,
      action: "CELO_WALLET_LINKED",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { address, chainId, walletId: wallet.id },
    });

    return json({
      wallet: {
        id: wallet.id,
        address: wallet.address,
        chainId: wallet.chainId,
        linkedAt: wallet.linkedAt,
        lastSeenAt: wallet.lastSeenAt,
      },
      linked: true,
      chainName: wallet.chainId === 42220 ? "Celo Mainnet" : "Celo Sepolia",
    });
  } catch (e) {
    return handleError(e);
  }
}
