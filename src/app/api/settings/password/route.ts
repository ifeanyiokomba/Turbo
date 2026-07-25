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
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  old: z.string().min(1, "Old password is required"),
  new: z.string().min(1, "New password is required"),
});

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const fresh = await db.user.findUnique({ where: { id: user.id } });
    if (!fresh) return errorJson("User not found", 404);

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? "Invalid input", 400, "VALIDATION");
    }
    const { old: oldPwd, new: newPwd } = parsed.data;

    if (!verifyPassword(oldPwd, fresh.passwordHash)) {
      await audit({
        userId: user.id,
        action: "PASSWORD_CHANGE_FAILED",
        category: "AUTH",
        severity: "WARN",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      return errorJson("Old password is incorrect", 400, "INVALID_PASSWORD");
    }
    if (oldPwd === newPwd) {
      return errorJson("New password must be different from old password", 400, "SAME_PASSWORD");
    }
    const validationError = validatePassword(newPwd);
    if (validationError) {
      return errorJson(validationError, 400, "WEAK_PASSWORD");
    }
    const hash = hashPassword(newPwd);
    await db.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    await audit({
      userId: user.id,
      action: "PASSWORD_CHANGED",
      category: "AUTH",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
