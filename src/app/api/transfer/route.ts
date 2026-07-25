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
import {
  creditWallet,
  debitWallet,
  transferBetweenWallets,
  LedgerError,
} from "@/lib/ledger";
import { BANKS_BY_CODE } from "@/lib/banks";
import {
  RefType,
  TxDirection,
  TxState,
  TxStatus,
  TxType,
} from "@/lib/constants";
import { generateReference } from "@/lib/money";

const BANK_FEE_KOBO = 5250; // ₦52.50
const TURBOPAY_FEE_KOBO = 0;

type TransferType = "TURBOPAY" | "BANK";

interface TransferBody {
  type?: TransferType;
  recipient?: string;
  bankCode?: string;
  amountKobo?: number;
  note?: string;
  pin?: string;
  saveBeneficiary?: boolean;
}

async function resolveTurbopayUser(query: string) {
  const q = query.trim();
  if (!q) return null;
  // Match by username, email, phone, or virtual account number
  const byAccount = await db.virtualAccount.findUnique({
    where: { accountNumber: q },
    include: { user: true },
  });
  if (byAccount?.user) return byAccount.user;
  const user = await db.user.findFirst({
    where: {
      OR: [
        { username: q },
        { email: q },
        { phone: q },
      ],
    },
  });
  return user ?? null;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as TransferBody;

    const type: TransferType = body.type === "BANK" ? "BANK" : "TURBOPAY";
    const recipient = String(body.recipient ?? "").trim();
    const bankCode = body.bankCode ? String(body.bankCode) : undefined;
    const amountKobo = Math.round(Number(body.amountKobo));
    const note = String(body.note ?? "").trim();
    const pin = String(body.pin ?? "");

    if (!recipient) throw new ServiceError("Recipient is required", 400, "MISSING_RECIPIENT");
    if (!Number.isFinite(amountKobo) || amountKobo <= 0)
      throw new ServiceError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
    if (!pin) throw new ServiceError("PIN is required", 400, "PIN_REQUIRED");

    await verifyPin(user, pin);

    const feeKobo = type === "BANK" ? BANK_FEE_KOBO : TURBOPAY_FEE_KOBO;
    const totalDebitKobo = amountKobo + feeKobo;

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw new ServiceError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const reference = generateReference("TRF");

    if (type === "TURBOPAY") {
      const recipientUser = await resolveTurbopayUser(recipient);
      if (!recipientUser)
        throw new ServiceError("Recipient not found on Turbopay", 404, "RECIPIENT_NOT_FOUND");
      if (recipientUser.id === user.id)
        throw new ServiceError("You cannot transfer to yourself", 400, "SELF_TRANSFER");

      const description = note || `Transfer to ${recipientUser.fullName}`;
      const { debit, credit } = await transferBetweenWallets({
        fromUserId: user.id,
        toUserId: recipientUser.id,
        amountKobo,
        feeKobo,
        description,
        refId: reference,
      });

      // Sender transaction (debit)
      const senderTx = await db.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          reference,
          type: TxType.TRANSFER,
          direction: TxDirection.DEBIT,
          amountKobo,
          feeKobo,
          status: TxStatus.SUCCESS,
          state: TxState.SETTLED,
          counterpartyName: recipientUser.fullName,
          counterpartyAccount: recipientUser.username,
          counterpartyBank: "Turbopay MFB",
          description,
          provider: "turbopay",
          providerRef: reference,
        },
      });

      // Receiver transaction (credit)
      const receiverWallet = await db.wallet.findUnique({
        where: { userId: recipientUser.id },
      });
      if (receiverWallet) {
        await db.transaction.create({
          data: {
            userId: recipientUser.id,
            walletId: receiverWallet.id,
            reference: generateReference("TRF"),
            type: TxType.TRANSFER,
            direction: TxDirection.CREDIT,
            amountKobo,
            feeKobo: 0,
            status: TxStatus.SUCCESS,
            state: TxState.SETTLED,
            counterpartyName: user.fullName,
            counterpartyAccount: user.username,
            counterpartyBank: "Turbopay MFB",
            description: note ? `From ${user.fullName} — ${note}` : `Transfer from ${user.fullName}`,
            provider: "turbopay",
            providerRef: reference,
            metadata: JSON.stringify({ pairRef: reference }),
          },
        });
      }

      // Save beneficiary if requested
      if (body.saveBeneficiary) {
        await saveBeneficiary({
          userId: user.id,
          name: recipientUser.fullName,
          accountNumber: recipientUser.username,
          bankName: "Turbopay MFB",
          bankCode: "000",
          type: "TURBOPAY",
        });
      }

      await audit({
        userId: user.id,
        action: "TRANSFER_TURBOPAY",
        category: "TRANSFER",
        severity: "INFO",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: {
          toUserId: recipientUser.id,
          amountKobo,
          feeKobo,
          reference,
          debitEntryId: debit.entry.id,
          creditEntryId: credit.entry.id,
        },
      });

      return json({
        transaction: senderTx,
        newBalance: debit.newBalance,
        type: "TURBOPAY",
        recipientName: recipientUser.fullName,
      });
    }

    // BANK transfer
    if (!bankCode) throw new ServiceError("Bank code is required", 400, "MISSING_BANK_CODE");
    const bank = BANKS_BY_CODE[bankCode];
    if (!bank) throw new ServiceError("Unknown bank", 400, "UNKNOWN_BANK");

    const description = note || `Transfer to ${recipient} · ${bank.name}`;
    const { newBalance } = await debitWallet({
      userId: user.id,
      amountKobo: totalDebitKobo,
      refType: RefType.TRANSFER,
      refId: reference,
      description: `Bank transfer to ${recipient} (${bank.name}) — ${description}`,
    });

    const senderTx = await db.transaction.create({
      data: {
        userId: user.id,
        walletId: wallet.id,
        reference,
        type: TxType.TRANSFER,
        direction: TxDirection.DEBIT,
        amountKobo,
        feeKobo,
        status: TxStatus.SUCCESS,
        state: TxState.SETTLED,
        counterpartyName: resolvedBankName(recipient),
        counterpartyAccount: recipient,
        counterpartyBank: bank.name,
        description,
        provider: "turbopay-payout",
        providerRef: reference,
      },
    });

    if (body.saveBeneficiary) {
      await saveBeneficiary({
        userId: user.id,
        name: resolvedBankName(recipient),
        accountNumber: recipient,
        bankName: bank.name,
        bankCode: bank.code,
        type: "BANK",
      });
    }

    await audit({
      userId: user.id,
      action: "TRANSFER_BANK",
      category: "TRANSFER",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { recipient, bankCode: bank.code, amountKobo, feeKobo, reference },
    });

    return json({
      transaction: senderTx,
      newBalance,
      type: "BANK",
      recipientName: resolvedBankName(recipient),
    });
  } catch (e) {
    if (e instanceof LedgerError) {
      const msg = e.message.toLowerCase().includes("insufficient")
        ? "Insufficient balance for this transfer"
        : e.message;
      return json({ error: msg, code: "INSUFFICIENT_BALANCE" }, 400);
    }
    return handleError(e);
  }
}

function resolvedBankName(accountNumber: string): string {
  // Deterministic mock name from account number hash
  const names = [
    "JOHN DOE", "MARY JANE", "CHIKA OBIAJULU", "ADEKUNLE BELLO",
    "FATIMA ABUBAKAR", "EMEKA NWANKWO", "GRACE OKAFOR", "TUNDE BALOGUN",
  ];
  let hash = 0;
  for (let i = 0; i < accountNumber.length; i++) {
    hash = (hash * 31 + accountNumber.charCodeAt(i)) >>> 0;
  }
  return names[hash % names.length];
}

async function saveBeneficiary(opts: {
  userId: string;
  name: string;
  accountNumber: string;
  bankName: string;
  bankCode: string;
  type: string;
}) {
  // Upsert by (userId, accountNumber, bankCode)
  const existing = await db.beneficiary.findFirst({
    where: {
      userId: opts.userId,
      accountNumber: opts.accountNumber,
      bankCode: opts.bankCode,
    },
  });
  if (existing) {
    await db.beneficiary.update({
      where: { id: existing.id },
      data: { name: opts.name, lastUsedAt: new Date() },
    });
    return existing.id;
  }
  const created = await db.beneficiary.create({
    data: {
      userId: opts.userId,
      name: opts.name,
      accountNumber: opts.accountNumber,
      bankName: opts.bankName,
      bankCode: opts.bankCode,
      type: opts.type,
      lastUsedAt: new Date(),
    },
  });
  return created.id;
}
