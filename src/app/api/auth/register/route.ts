import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, validatePassword, generateReferralCode } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { json, errorJson, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { generateAccountNumber, generateReference } from "@/lib/money";
import { z } from "zod";

const schema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/i, "Letters, numbers, underscore only"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  country: z.string().default("NG"),
  password: z.string().min(8),
  referral: z.string().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  try {
    await ensureSeed();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorJson(parsed.error.issues[0].message, 422);
    const { firstName, lastName, username, email, phone, country, password, referral } = parsed.data;

    if (!email && !phone) return errorJson("Provide an email or phone number", 400);
    const pwdError = validatePassword(password);
    if (pwdError) return errorJson(pwdError, 400);

    // Uniqueness
    const existingUsername = await db.user.findUnique({ where: { username: username.toLowerCase() } });
    if (existingUsername) return errorJson("Username already taken", 409);
    if (email) {
      const e = await db.user.findUnique({ where: { email } });
      if (e) return errorJson("Email already registered", 409);
    }
    if (phone) {
      const p = await db.user.findUnique({ where: { phone } });
      if (p) return errorJson("Phone already registered", 409);
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const passwordHash = hashPassword(password);

    const user = await db.user.create({
      data: {
        fullName,
        username: username.toLowerCase(),
        email: email || null,
        phone: phone || null,
        country,
        passwordHash,
        role: "USER",
        kycTier: 1,
        kycStatus: "UNVERIFIED",
        emailVerified: false,
        phoneVerified: false,
      },
    });

    // Wallet + virtual account
    await db.wallet.create({ data: { userId: user.id, balanceKobo: 0 } });
    const accountNumber = generateAccountNumber();
    await db.virtualAccount.create({
      data: {
        userId: user.id,
        accountNumber,
        accountName: fullName.toUpperCase(),
        provider: "turbopay",
      },
    });

    // Referral bonus (welcome ₦500 to referrer, ₦500 to new user)
    if (referral) {
      const referrer = await db.user.findUnique({ where: { username: referral.toLowerCase().replace(/^@/, "") } });
      if (referrer) {
        await db.user.update({ where: { id: user.id }, data: {} });
        await db.transaction.create({
          data: {
            userId: user.id,
            reference: generateReference("TP"),
            type: "REFERRAL",
            direction: "CREDIT",
            amountKobo: 50_000,
            feeKobo: 0,
            status: "SUCCESS",
            state: "SETTLED",
            counterpartyName: "Welcome bonus",
            description: "Welcome bonus via referral",
            provider: "turbopay",
          },
        });
        // credit wallet via ledger
        const { creditWallet } = await import("@/lib/ledger");
        await creditWallet({
          userId: user.id,
          amountKobo: 50_000,
          refType: "REFERRAL",
          refId: user.id,
          description: "Welcome bonus via referral",
        });
      }
    }

    const session = await createSession({
      userId: user.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    await audit({
      userId: user.id,
      action: "REGISTER",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { username, email, referral: !!referral },
    });

    return json({
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        country: user.country,
        role: user.role,
        kycTier: user.kycTier,
        kycStatus: user.kycStatus,
        status: user.status,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        hasPin: !!user.transactionPinHash,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
