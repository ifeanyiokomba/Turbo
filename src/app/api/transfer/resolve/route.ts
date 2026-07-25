import { db } from "@/lib/db";
import { json, handleError, requireUser, ServiceError } from "@/lib/api";
import { BANKS_BY_CODE } from "@/lib/banks";

interface ResolveResponse {
  name: string;
  type: "TURBOPAY" | "BANK";
  accountNumber?: string;
  bankName?: string;
  username?: string;
}

function mockBankName(seed: string): string {
  const names = [
    "JOHN DOE", "MARY JANE", "CHIKA OBIAJULU", "ADEKUNLE BELLO",
    "FATIMA ABUBAKAR", "EMEKA NWANKWO", "GRACE OKAFOR", "TUNDE BALOGUN",
    "NUHU SANI", "BOLA AHMED", "IFENYI OKOYE", "ZAINAB YUSUF",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return names[hash % names.length];
}

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const query = (url.searchParams.get("query") ?? "").trim();
    const bankCode = (url.searchParams.get("bankCode") ?? "").trim();

    if (!query)
      throw new ServiceError("Query is required", 400, "MISSING_QUERY");
    if (query.length < 3)
      throw new ServiceError("Query is too short", 400, "QUERY_TOO_SHORT");

    // If bankCode is provided → bank account resolution (mock)
    if (bankCode) {
      const bank = BANKS_BY_CODE[bankCode];
      if (!bank) throw new ServiceError("Unknown bank code", 400, "UNKNOWN_BANK");
      // Account number should be 10 digits for NUBAN
      if (!/^\d{6,10}$/.test(query))
        throw new ServiceError("Account number must be 6–10 digits", 400, "INVALID_ACCOUNT");
      const name = mockBankName(query + bankCode);
      const result: ResolveResponse = {
        name,
        type: "BANK",
        accountNumber: query,
        bankName: bank.name,
      };
      return json(result);
    }

    // Otherwise — Turbopay user resolution by username/phone/email/virtualAccount
    const byAccount = await db.virtualAccount.findUnique({
      where: { accountNumber: query },
      include: { user: true },
    });
    if (byAccount?.user) {
      const result: ResolveResponse = {
        name: byAccount.user.fullName,
        type: "TURBOPAY",
        accountNumber: byAccount.accountNumber,
        username: byAccount.user.username,
      };
      return json(result);
    }

    const user = await db.user.findFirst({
      where: {
        OR: [
          { username: query },
          { email: query },
          { phone: query },
        ],
      },
    });
    if (user) {
      const result: ResolveResponse = {
        name: user.fullName,
        type: "TURBOPAY",
        username: user.username,
      };
      return json(result);
    }

    throw new ServiceError(
      "No Turbopay user found. Check the username, phone, email or account number.",
      404,
      "RECIPIENT_NOT_FOUND",
    );
  } catch (e) {
    return handleError(e);
  }
}
