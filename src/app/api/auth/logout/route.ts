import { NextRequest } from "next/server";
import { destroySession } from "@/lib/session";
import { json, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (session) {
      await audit({
        userId: session.userId,
        action: "LOGOUT",
        category: "AUTH",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    }
    await destroySession();
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
