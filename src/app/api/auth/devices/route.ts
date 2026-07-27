// GET  /api/auth/devices      — list current user's devices
// POST /api/auth/devices      — trust the current device (by fingerprint)
//
// Both routes require an authenticated user (requireUser). The "current
// device" is identified by computing the device fingerprint from the request
// (User-Agent + /24 subnet) and matching it against the user's Device rows.

import { NextRequest } from "next/server";
import { json, errorJson, handleError, requireUser, getClientIp, getUserAgent } from "@/lib/api";
import { listDevices, trustDevice, trackDevice, getDeviceFingerprint } from "@/lib/device";
import { logSecurityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const devices = await listDevices(user.id);
    const currentFingerprint = getDeviceFingerprint(req);

    return json({
      devices: devices.map((d) => ({
        id: d.id,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        os: d.os,
        browser: d.browser,
        ip: d.ip,
        trusted: d.trusted,
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
        isCurrent: d.fingerprint === currentFingerprint,
        fingerprint: d.fingerprint,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    // Track (upsert) the current device — POST also serves as a "remember this device" call.
    const device = await trackDevice(user.id, req);

    // Optionally the body can carry an explicit { fingerprint } to trust a
    // different device; otherwise trust the current one.
    const body = await req.json().catch(() => ({}));
    const fingerprint: string =
      typeof body?.fingerprint === "string" && body.fingerprint.length > 0
        ? body.fingerprint
        : device.fingerprint;

    const trusted = await trustDevice(user.id, fingerprint);
    if (!trusted) {
      return errorJson("Device not found", 404, "DEVICE_NOT_FOUND");
    }

    await logSecurityEvent({
      userId: user.id,
      type: "DEVICE_TRUSTED",
      ip,
      userAgent: ua,
      metadata: {
        deviceId: trusted.id,
        deviceName: trusted.deviceName,
        deviceType: trusted.deviceType,
      },
    });

    return json({
      device: {
        id: trusted.id,
        deviceName: trusted.deviceName,
        deviceType: trusted.deviceType,
        os: trusted.os,
        browser: trusted.browser,
        ip: trusted.ip,
        trusted: trusted.trusted,
        firstSeenAt: trusted.firstSeenAt,
        lastSeenAt: trusted.lastSeenAt,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
