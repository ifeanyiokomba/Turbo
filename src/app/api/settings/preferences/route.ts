import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
} from "@/lib/api";
import { z } from "zod";

// Default preferences (mirror schema defaults) used when creating the row.
const DEFAULTS = {
  emailEnabled: true,
  smsEnabled: true,
  pushEnabled: true,
  whatsappEnabled: false,
  transactionAlerts: true,
  securityAlerts: true,
  marketingAlerts: false,
  weeklySummary: true,
};

function publicPrefs(p: {
  id: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
  transactionAlerts: boolean;
  securityAlerts: boolean;
  marketingAlerts: boolean;
  weeklySummary: boolean;
  updatedAt: Date;
}) {
  return {
    emailEnabled: p.emailEnabled,
    smsEnabled: p.smsEnabled,
    pushEnabled: p.pushEnabled,
    whatsappEnabled: p.whatsappEnabled,
    transactionAlerts: p.transactionAlerts,
    securityAlerts: p.securityAlerts,
    marketingAlerts: p.marketingAlerts,
    weeklySummary: p.weeklySummary,
    updatedAt: p.updatedAt,
  };
}

// GET /api/settings/preferences — return the user's CommunicationPreference,
// creating a default row if none exists yet (lazy initialize).
export async function GET() {
  try {
    const user = await requireUser();
    let prefs = await db.communicationPreference.findUnique({
      where: { userId: user.id },
    });
    if (!prefs) {
      prefs = await db.communicationPreference.create({
        data: { userId: user.id, ...DEFAULTS },
      });
    }
    return json({ preferences: publicPrefs(prefs) });
  } catch (e) {
    return handleError(e);
  }
}

const putSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  transactionAlerts: z.boolean().optional(),
  securityAlerts: z.boolean().optional(),
  marketingAlerts: z.boolean().optional(),
  weeklySummary: z.boolean().optional(),
});

// PUT /api/settings/preferences — upsert (create-with-defaults + update) the row.
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid input";
      return errorJson(msg, 400, "VALIDATION");
    }
    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return errorJson("No fields to update", 400, "NO_FIELDS");
    }

    const prefs = await db.communicationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...DEFAULTS, ...data },
      update: data,
    });

    await audit({
      userId: user.id,
      action: "COMM_PREFERENCES_UPDATE",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { fields: Object.keys(data) },
    });

    return json({ preferences: publicPrefs(prefs) });
  } catch (e) {
    return handleError(e);
  }
}
