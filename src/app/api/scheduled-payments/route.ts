import { z } from "zod";
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
import { generateReference } from "@/lib/money";

const VALID_TYPES = new Set(["TRANSFER", "BILL", "AIRTIME", "DATA"]);
const VALID_FREQUENCIES = new Set(["ONCE", "DAILY", "WEEKLY", "MONTHLY"]);

interface CreateBody {
  type?: string;
  payload?: Record<string, unknown>;
  frequency?: string;
  nextRunAt?: string;
}

export async function GET() {
  try {
    const user = await requireUser();
    const items = await db.scheduledPayment.findMany({
      where: { userId: user.id },
      orderBy: { nextRunAt: "asc" },
    });
    return json({ scheduled: items });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as CreateBody;

    const type = String(body.type ?? "").toUpperCase();
    const frequency = String(body.frequency ?? "ONCE").toUpperCase();
    const payload = body.payload ?? {};
    const nextRunAtStr = String(body.nextRunAt ?? "");

    if (!VALID_TYPES.has(type)) {
      throw new ServiceError(
        "Type must be one of TRANSFER, BILL, AIRTIME, DATA",
        400,
        "INVALID_TYPE"
      );
    }
    if (!VALID_FREQUENCIES.has(frequency)) {
      throw new ServiceError(
        "Frequency must be ONCE, DAILY, WEEKLY or MONTHLY",
        400,
        "INVALID_FREQUENCY"
      );
    }
    if (!nextRunAtStr) {
      throw new ServiceError("Next run date is required", 400, "MISSING_NEXT_RUN");
    }
    const nextRunAt = new Date(nextRunAtStr);
    if (isNaN(nextRunAt.getTime())) {
      throw new ServiceError("Invalid next run date", 400, "INVALID_NEXT_RUN");
    }
    if (nextRunAt < new Date()) {
      throw new ServiceError("Next run must be in the future", 400, "PAST_NEXT_RUN");
    }

    // Validate payload minimally
    if (!payload || typeof payload !== "object") {
      throw new ServiceError("Payload is required", 400, "MISSING_PAYLOAD");
    }

    const item = await db.scheduledPayment.create({
      data: {
        userId: user.id,
        type,
        payloadJSON: JSON.stringify(payload),
        frequency,
        nextRunAt,
        status: "ACTIVE",
      },
    });

    await audit({
      userId: user.id,
      action: "SCHEDULED_PAYMENT_CREATE",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { scheduledId: item.id, type, frequency, nextRunAt },
    });

    return json({ scheduled: item });
  } catch (e) {
    return handleError(e);
  }
}
