// POST /api/celo/deposit/confirm
// Body: { hash, token, amountHuman, chainId? }
//
// THE CRITICAL VERIFICATION ROUTE:
// Re-verifies an on-chain ERC-20 transfer(user -> treasury) by decoding the
// transaction input data, then credits the user's NGN wallet via the ledger
// (CELO_DEPOSIT). Idempotent on `hash` (OnChainTransaction.hash is @unique).

import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { creditWallet } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";
import { getPublicClient } from "@/lib/wagmi";
import {
  TREASURY_ADDRESS,
  getToken,
  isValidTxHash,
  CELO_MAINNET_CHAIN_ID,
} from "@/lib/minipay";
import {
  erc20Abi,
  parseUnits,
  decodeFunctionData,
  getAddress,
} from "viem";
import type { Address, Hash } from "viem";

export const runtime = "nodejs";

const FALLBACK_USD_NGN = 1480;

async function fetchUsdNgnRate(): Promise<{ rate: number; source: string; fetchedAt: Date }> {
  const recent = await db.fxRateSnapshot.findFirst({
    where: { base: "USD", quote: "NGN", expiresAt: { gt: new Date() } },
    orderBy: { fetchedAt: "desc" },
  });
  if (recent) {
    return { rate: recent.rate, source: recent.source, fetchedAt: recent.fetchedAt };
  }
  // Try the inverse pair (NGN -> USD) and invert.
  const inverse = await db.fxRateSnapshot.findFirst({
    where: { base: "NGN", quote: "USD" },
    orderBy: { fetchedAt: "desc" },
  });
  if (inverse && inverse.rate > 0) {
    return {
      rate: 1 / inverse.rate,
      source: inverse.source + "(inverted)",
      fetchedAt: inverse.fetchedAt,
    };
  }
  return { rate: FALLBACK_USD_NGN, source: "fallback", fetchedAt: new Date() };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const hash = String(body?.hash ?? "").trim();
    const tokenSymbol = String(body?.token ?? "USDm").toUpperCase();
    const amountHuman = String(body?.amountHuman ?? "").trim();
    const chainId = Number(body?.chainId ?? CELO_MAINNET_CHAIN_ID);

    if (!isValidTxHash(hash))
      throw new ServiceError("Invalid transaction hash", 400, "INVALID_HASH");
    if (!amountHuman || !/^\d+(\.\d+)?$/.test(amountHuman))
      throw new ServiceError("Invalid amount", 400, "INVALID_AMOUNT");

    const token = getToken(tokenSymbol, chainId);
    if (!token)
      throw new ServiceError("Unsupported token: " + tokenSymbol, 400, "TOKEN_NOT_FOUND");

    // Idempotency: if we already recorded this hash as SUCCESS, return it.
    const existing = await db.onChainTransaction.findUnique({
      where: { hash },
      include: { celoWallet: true },
    });
    if (existing) {
      if (existing.status === "SUCCESS" && existing.userId === user.id) {
        const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
        return json({
          success: true,
          transaction: existing,
          newBalanceKobo: wallet?.balanceKobo ?? 0,
          idempotent: true,
        });
      }
      if (existing.userId !== user.id) {
        throw new ServiceError("Transaction belongs to another user", 403, "TX_OWNER_MISMATCH");
      }
      // Otherwise (PENDING/FAILED) fall through and re-attempt verification.
    }

    // Require a linked CeloWallet — we need the user's onchain address to verify `from`.
    const celoWallet = await db.celoWallet.findUnique({ where: { userId: user.id } });
    if (!celoWallet)
      throw new ServiceError("Link your MiniPay wallet first", 400, "WALLET_NOT_LINKED");

    const publicClient = getPublicClient(chainId);

    // 1) Fetch the receipt — confirms inclusion + success status.
    let receipt: any;
    try {
      receipt = await publicClient.getTransactionReceipt({ hash: hash as Hash });
    } catch {
      throw new ServiceError(
        "Transaction not found onchain (it may still be confirming)",
        404,
        "TX_NOT_FOUND",
      );
    }
    if (receipt?.status !== "success") {
      throw new ServiceError("Onchain transaction failed or was reverted", 400, "TX_REVERTED");
    }

    // 2) Fetch full tx to get from / to / input data.
    const tx = await publicClient.getTransaction({ hash: hash as Hash });
    if (!tx || !tx.input || tx.input === "0x") {
      throw new ServiceError(
        "Transaction has no calldata (not an ERC-20 transfer)",
        400,
        "NOT_TOKEN_TRANSFER",
      );
    }

    const tokenContractAddr = getAddress(token.address);
    const txTo = tx.to ? getAddress(tx.to as string) : null;
    const txFrom = tx.from ? getAddress(tx.from as string) : null;

    if (!txTo || txTo.toLowerCase() !== tokenContractAddr.toLowerCase()) {
      throw new ServiceError(
        "Transaction target is not the expected token contract",
        400,
        "WRONG_TOKEN_CONTRACT",
      );
    }
    if (!txFrom || txFrom.toLowerCase() !== celoWallet.address.toLowerCase()) {
      throw new ServiceError(
        "Transaction sender does not match your linked wallet",
        400,
        "WRONG_SENDER",
      );
    }

    // 3) Decode the ERC-20 transfer(address,uint256) calldata.
    let decoded: { functionName: string; args: readonly unknown[] };
    try {
      decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input as `0x${string}` });
    } catch {
      throw new ServiceError(
        "Could not decode calldata as ERC-20 transfer",
        400,
        "DECODE_FAILED",
      );
    }
    if (decoded.functionName !== "transfer") {
      throw new ServiceError(
        "Expected ERC-20 transfer(), got " + decoded.functionName,
        400,
        "NOT_TRANSFER",
      );
    }
    const [recipientRaw, amountRaw] = decoded.args as [Address, bigint];
    const recipient = getAddress(recipientRaw);
    const expectedAmountWei = parseUnits(amountHuman, token.decimals);

    if (recipient.toLowerCase() !== TREASURY_ADDRESS.toLowerCase()) {
      throw new ServiceError(
        "Transfer recipient is not the Turbopay treasury",
        400,
        "WRONG_RECIPIENT",
      );
    }
    if (amountRaw !== expectedAmountWei) {
      throw new ServiceError(
        `Transfer amount (${amountRaw.toString()}) does not match declared ${amountHuman} ${token.symbol}`,
        400,
        "AMOUNT_MISMATCH",
      );
    }

    // 4) Get USD/NGN rate and compute the naira equivalent.
    const { rate: usdNgnRate, source, fetchedAt } = await fetchUsdNgnRate();
    const usdmAmount = Number(amountHuman);
    const amountKobo = Math.round(usdmAmount * usdNgnRate * 100);

    if (amountKobo <= 0)
      throw new ServiceError("Computed credit amount is zero", 400, "AMOUNT_TOO_SMALL");

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("CDP");
    const description = `cUSD deposit (${amountHuman} ${token.symbol})`;
    const blockNumber = receipt.blockNumber ? BigInt(receipt.blockNumber) : null;
    const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed) : null;

    // 5) Atomic ledger credit + OnChainTransaction + Transaction + CeloBridgeEvent
    const result = await db.$transaction(async (tx) => {
      const credit = await creditWallet({
        tx,
        userId: user.id,
        amountKobo,
        refType: RefType.CELO_DEPOSIT,
        refId: reference,
        description,
      });

      // Replace any prior PENDING/FAILED row for this hash with the SUCCESS row.
      if (existing) {
        await tx.onChainTransaction.delete({ where: { id: existing.id } }).catch(() => {});
      }

      const onchain = await tx.onChainTransaction.create({
        data: {
          userId: user.id,
          celoWalletId: celoWallet.id,
          hash,
          type: "DEPOSIT",
          direction: TxDirection.CREDIT,
          tokenSymbol: token.symbol,
          tokenAddress: token.address,
          amountHuman,
          amountWei: expectedAmountWei.toString(),
          amountKoboEquiv: amountKobo,
          counterpartyAddress: TREASURY_ADDRESS,
          status: "SUCCESS",
          blockNumber,
          gasUsed,
          feeCurrency: "CELO",
          metadata: JSON.stringify({
            usdNgnRate,
            source,
            fetchedAt: fetchedAt.toISOString(),
          }),
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.CELO_DEPOSIT,
          direction: TxDirection.CREDIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          description,
          counterpartyName: "MiniPay cUSD deposit",
          provider: "celo-minipay",
          providerRef: hash,
          metadata: JSON.stringify({
            hash,
            token: token.symbol,
            amountHuman,
            onchainTxId: onchain.id,
          }),
        },
      });

      const bridgeEvent = await tx.celoBridgeEvent.create({
        data: {
          userId: user.id,
          onchainTxId: onchain.id,
          direction: "CUSD_TO_NGN",
          status: "COMPLETED",
          amountKobo,
          amountUsdm: amountHuman,
          fxRate: usdNgnRate,
          completedAt: new Date(),
        },
      });

      return { credit, onchain, transaction, bridgeEvent };
    });

    await audit({
      userId: user.id,
      action: "CELO_DEPOSIT",
      category: "WALLET",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        hash,
        token: token.symbol,
        amountHuman,
        amountKobo,
        usdNgnRate,
        onchainTxId: result.onchain.id,
        reference,
      },
    });

    return json({
      success: true,
      transaction: result.onchain,
      ledgerTransaction: result.transaction,
      bridgeEvent: result.bridgeEvent,
      newBalanceKobo: result.credit.newBalance,
    });
  } catch (e) {
    return handleError(e);
  }
}
