// DELETE /api/auth/devices/[id]
//
// Revoke + remove a device from the user's device list. Ownership-checked: the
// device must belong to the authenticated user. On success returns { deleted: true }.

import { NextRequest } from "next/server";
import { json, errorJson, handleError, requireUser, getClientIp, getUserAgent } from "@/lib/api";
import { deleteDevice, revokeDevice } from "@/lib/device";
import { logSecurityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    // First revoke (un-trust), then hard-delete. We log the revocation event
    // for the audit trail even if the device is then deleted.
    const revoked = await revokeDevice(user.id, id);
    if (!revoked) {
      return errorJson("Device not found", 404, "DEVICE_NOT_FOUND");
    }

    await logSecurityEvent({
      userId: user.id,
      type: "DEVICE_REVOKED",
      ip,
      userAgent: ua,
      metadata: {
        deviceId: revoked.id,
        deviceName: revoked.deviceName,
        deviceType: revoked.deviceType,
      },
    });

    await deleteDevice(user.id, id);

    return json({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
