// GET /api/auth/passkey/list
// Returns the logged-in user's registered passkeys (safe projection).

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    const passkeys = await db.passkey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
    return json({ passkeys });
  } catch (e) {
    return handleError(e);
  }
}
