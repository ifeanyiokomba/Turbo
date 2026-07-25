// POST /api/celo/withdraw
// Body: { amountHuman, token, pin, chainId? }
//
// PIN-verified cUSD withdrawal: debits the user's NGN wallet, then sends an
// ERC-20 transfer from the treasury wallet to the user's MiniPay address.
// In sandbox mode (no TURBOPAY_TREASURY_PRIVATE_KEY) we record a SIMULATED
// success. On broadcast failure we auto-reverse the debit.

import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  verifyPin,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { creditWallet, debitWallet, LedgerError } from "@/lib/ledger";
import { RefType, TxDirection, TxState, TxStatus, TxType } from "@/lib/constants";
import { generateReference } from "@/lib/money";
import { getPublicClient, getServerWalletClient, hasTreasuryKey } from "@/lib/wagmi";
import {
  TREASURY_ADDRESS,
  getToken,
  CELO_MAINNET_CHAIN_ID,
} from "@/lib/minipay";
import {
  erc20Abi,
  parseUnits,
  encodeFunctionData,
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
  if (recent) return { rate: recent.rate, source: recent.source, fetchedAt: recent.fetchedAt };

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
    const amountHuman = String(body?.amountHuman ?? "").trim();
    const tokenSymbol = String(body?.token ?? "USDm").toUpperCase();
    const pin = String(body?.pin ?? "");
    const chainId = Number(body?.chainId ?? CELO_MAINNET_CHAIN_ID);

    if (!amountHuman || !/^\d+(\.\d+)?$/.test(amountHuman))
      throw new ServiceError("Invalid amount", 400, "INVALID_AMOUNT");
    if (Number(amountHuman) <= 0)
      throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    const token = getToken(tokenSymbol, chainId);
    if (!token)
      throw new ServiceError("Unsupported token: " + tokenSymbol, 400, "TOKEN_NOT_FOUND");

    // Require linked CeloWallet — this is the recipient of the onchain transfer.
    const celoWallet = await db.celoWallet.findUnique({ where: { userId: user.id } });
    if (!celoWallet)
      throw new ServiceError("Link your MiniPay wallet first", 400, "WALLET_NOT_LINKED");

    await verifyPin(user, pin);

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const { rate: usdNgnRate, source, fetchedAt } = await fetchUsdNgnRate();
    const usdmAmount = Number(amountHuman);
    const amountKobo = Math.round(usdmAmount * usdNgnRate * 100);
    if (amountKobo <= 0)
      throw new ServiceError("Computed debit amount is zero", 400, "AMOUNT_TOO_SMALL");

    const amountWei = parseUnits(amountHuman, token.decimals);
    const reference = generateReference("CWD");
    const description = `cUSD withdrawal (${amountHuman} ${token.symbol})`;
    const userAddress = getAddress(celoWallet.address) as Address;

    // SANDBOX MODE: no treasury private key configured.
    if (!hasTreasuryKey()) {
      const sandboxHash = "0x" + "0".repeat(63) + "1"; // mock 64-hex hash

      try {
        await debitWallet({
          userId: user.id,
          amountKobo,
          refType: RefType.CELO_WITHDRAW,
          refId: reference,
          description,
        });
      } catch (e) {
        if (e instanceof LedgerError) {
          return json({ error: e.message, code: "INSUFFICIENT_BALANCE" }, 400);
        }
        throw e;
      }

      const onchain = await db.onChainTransaction.create({
        data: {
          userId: user.id,
          celoWalletId: celoWallet.id,
          hash: sandboxHash,
          type: "WITHDRAW",
          direction: TxDirection.DEBIT,
          tokenSymbol: token.symbol,
          tokenAddress: token.address,
          amountHuman,
          amountWei: amountWei.toString(),
          amountKoboEquiv: amountKobo,
          counterpartyAddress: userAddress,
          status: "SIMULATED",
          feeCurrency: "CELO",
          metadata: JSON.stringify({ sandbox: true, usdNgnRate, source }),
        },
      });

      await db.celoBridgeEvent.create({
        data: {
          userId: user.id,
          onchainTxId: onchain.id,
          direction: "NGN_TO_CUSD",
          status: "COMPLETED",
          amountKobo,
          amountUsdm: amountHuman,
          fxRate: usdNgnRate,
          completedAt: new Date(),
        },
      });

      // Also create a regular Transaction record for the user's history.
      await db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.CELO_WITHDRAW,
          direction: TxDirection.DEBIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          description,
          counterpartyName: "MiniPay cUSD withdrawal (simulated)",
          provider: "celo-minipay",
          providerRef: sandboxHash,
          metadata: JSON.stringify({
            hash: sandboxHash,
            token: token.symbol,
            amountHuman,
            onchainTxId: onchain.id,
            simulated: true,
          }),
        },
      });

      await audit({
        userId: user.id,
        action: "CELO_WITHDRAW_SIMULATED",
        category: "WALLET",
        severity: "WARN",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: {
          hash: sandboxHash,
          token: token.symbol,
          amountHuman,
          amountKobo,
          usdNgnRate,
          onchainTxId: onchain.id,
        },
      });

      const newWallet = await db.wallet.findUnique({ where: { userId: user.id } });

      return json({
        success: true,
        simulated: true,
        hash: sandboxHash,
        transaction: onchain,
        newBalanceKobo: newWallet?.balanceKobo ?? 0,
      });
    }

    // PROD MODE: real onchain send from treasury.
    // 1) Debit first (optimistic) — reverse on failure.
    let debitResult: { newBalance: number };
    try {
      debitResult = await debitWallet({
        userId: user.id,
        amountKobo,
        refType: RefType.CELO_WITHDRAW,
        refId: reference,
        description,
      });
    } catch (e) {
      if (e instanceof LedgerError) {
        return json({ error: e.message, code: "INSUFFICIENT_BALANCE" }, 400);
      }
      throw e;
    }

    const publicClient = getPublicClient(chainId);
    const walletClient = getServerWalletClient(chainId);

    // 2) Create a PENDING OnChainTransaction row before sending.
    let onchain = await db.onChainTransaction.create({
      data: {
        userId: user.id,
        celoWalletId: celoWallet.id,
        hash: "0x" + "0".repeat(63) + "p", // placeholder, updated after send
        type: "WITHDRAW",
        direction: TxDirection.DEBIT,
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        amountHuman,
        amountWei: amountWei.toString(),
        amountKoboEquiv: amountKobo,
        counterpartyAddress: userAddress,
        status: "PENDING",
        feeCurrency: "CELO",
        metadata: JSON.stringify({
          reference,
          usdNgnRate,
          source,
          fetchedAt: fetchedAt.toISOString(),
        }),
      },
    });

    let txHash: Hash;
    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [userAddress, amountWei],
      });
      txHash = await walletClient.sendTransaction({
        to: token.address as Address,
        data,
        account: walletClient.account,
        chain: walletClient.chain,
      });

      // 3) Wait for receipt.
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // 4) Update the OnChainTransaction row + create bridge event + audit.
      onchain = await db.onChainTransaction.update({
        where: { id: onchain.id },
        data: {
          hash: txHash,
          status: "SUCCESS",
          blockNumber: receipt.blockNumber ? BigInt(receipt.blockNumber) : null,
          gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed) : null,
        },
      });

      await db.celoBridgeEvent.create({
        data: {
          userId: user.id,
          onchainTxId: onchain.id,
          direction: "NGN_TO_CUSD",
          status: "COMPLETED",
          amountKobo,
          amountUsdm: amountHuman,
          fxRate: usdNgnRate,
          completedAt: new Date(),
        },
      });

      await db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.CELO_WITHDRAW,
          direction: TxDirection.DEBIT,
          amountKobo,
          feeKobo: 0,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          description,
          counterpartyName: "MiniPay cUSD withdrawal",
          provider: "celo-minipay",
          providerRef: txHash,
          metadata: JSON.stringify({
            hash: txHash,
            token: token.symbol,
            amountHuman,
            onchainTxId: onchain.id,
          }),
        },
      });

      await audit({
        userId: user.id,
        action: "CELO_WITHDRAW",
        category: "WALLET",
        severity: "INFO",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: {
          hash: txHash,
          token: token.symbol,
          amountHuman,
          amountKobo,
          usdNgnRate,
          onchainTxId: onchain.id,
          reference,
        },
      });

      return json({
        success: true,
        hash: txHash,
        transaction: onchain,
        newBalanceKobo: debitResult.newBalance,
      });
    } catch (sendErr) {
      // 5) AUTO-REVERSE: refund the debited NGN + mark OnChainTransaction FAILED.
      console.error("[celo/withdraw] send failed — auto-reversing", sendErr);

      await creditWallet({
        userId: user.id,
        amountKobo,
        refType: RefType.REVERSAL,
        refId: reference + "-REV",
        description: `Reversal: cUSD withdrawal failed (${amountHuman} ${token.symbol})`,
      });

      onchain = await db.onChainTransaction.update({
        where: { id: onchain.id },
        data: {
          status: "FAILED",
          metadata: JSON.stringify({
            reference,
            usdNgnRate,
            source,
            error: sendErr instanceof Error ? sendErr.message : String(sendErr),
            reversed: true,
          }),
        },
      });

      await audit({
        userId: user.id,
        action: "CELO_WITHDRAW_REVERSED",
        category: "WALLET",
        severity: "ERROR",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: {
          token: token.symbol,
          amountHuman,
          amountKobo,
          onchainTxId: onchain.id,
          reference,
          error: sendErr instanceof Error ? sendErr.message : String(sendErr),
        },
      });

      return json(
        {
          success: false,
          error: "Withdrawal failed — your NGN wallet has been refunded",
          code: "WITHDRAW_FAILED",
          transaction: onchain,
          reversed: true,
        },
        502,
      );
    }
  } catch (e) {
    return handleError(e);
  }
}
