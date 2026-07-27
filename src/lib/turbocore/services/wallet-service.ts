// TurboCore Bounded Service — Wallet Service
//
// Thin facade over the double-entry ledger + Wallet/CurrencyWallet tables.
// Provides a clean API for funding, withdrawing, transferring, freezing and
// inspecting wallet balances. All money movements go through the ledger so
// every entry is paired + immutable + reconcilable.
//
// NOTE: withdraw() requires the user's transaction PIN. The PIN is verified
// by the orchestrator inside TurboPay.pay() for real provider calls; this
// method is for internal/platform debits (e.g. card funding reversals) and
// accepts the pin purely so we can thread it through to ledger helpers if
// needed in future. It does NOT verify the PIN here — that stays in the
// orchestrator so we never duplicate PIN-check logic.

import { db } from "@/lib/db";
import { creditWallet, debitWallet, transferBetweenWallets } from "@/lib/ledger";
import { RefType } from "@/lib/constants";
import { generateReference } from "@/lib/money";

type LedgerResult = Awaited<ReturnType<typeof creditWallet>>;

export interface FundInput {
  userId: string;
  amountKobo: number;
  method: string; // CARD | BANK_TRANSFER | VIRTUAL_ACCOUNT | MOBILE_MONEY ...
  refId?: string;
  description?: string;
}

export interface WithdrawInput {
  userId: string;
  amountKobo: number;
  pin: string; // unused here — orchestrator enforces; kept for API symmetry
  method?: string;
  refId?: string;
  description?: string;
}

export interface TransferInput {
  fromUserId: string;
  toUserId: string;
  amountKobo: number;
  feeKobo?: number;
  description: string;
  refId?: string;
}

export const walletService = {
  /** Get the user's primary wallet (NGN by default). */
  async getBalance(userId: string) {
    return db.wallet.findUnique({ where: { userId } });
  },

  /** Credit the wallet (funding, reversals, rewards). Writes a CREDIT ledger entry. */
  async fund(input: FundInput): Promise<LedgerResult> {
    return creditWallet({
      userId: input.userId,
      amountKobo: input.amountKobo,
      refType: RefType.FUNDING,
      refId: input.refId,
      description: input.description ?? `Funding via ${input.method}`,
    });
  },

  /** Debit the wallet (internal/platform debits — provider-bound payouts go through TurboPay.pay). */
  async withdraw(input: WithdrawInput): Promise<LedgerResult> {
    return debitWallet({
      userId: input.userId,
      amountKobo: input.amountKobo,
      refType: RefType.TRANSFER,
      refId: input.refId,
      description: input.description ?? `Withdrawal via ${input.method ?? "BANK_TRANSFER"}`,
    });
  },

  /** Atomic DEBIT + CREDIT pair between two Turbopay wallets. Optional fee debited from sender. */
  async transfer(input: TransferInput) {
    return transferBetweenWallets({
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amountKobo: input.amountKobo,
      feeKobo: input.feeKobo,
      description: input.description,
      refId: input.refId ?? generateReference("TRF"),
    });
  },

  /** Freeze a wallet — blocks all debits. Used by AML HIGH-severity flags + admin actions. */
  async freeze(userId: string) {
    return db.wallet.update({
      where: { userId },
      data: { status: "FROZEN" },
    });
  },

  /** Unfreeze a wallet — restores ACTIVE status. Admin/compliance action. */
  async unfreeze(userId: string) {
    return db.wallet.update({
      where: { userId },
      data: { status: "ACTIVE" },
    });
  },

  /** List all multi-currency wallets for a user (USD, GHS, KES, etc.). */
  async getMultiCurrencyWallets(userId: string) {
    return db.currencyWallet.findMany({
      where: { userId },
      orderBy: { currency: "asc" },
    });
  },
};
