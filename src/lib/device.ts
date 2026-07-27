// Turbopay — device tracking + fingerprinting.
//
// A device "fingerprint" is a SHA-256 of:
//   • the User-Agent string (stable per browser/version/OS combo)
//   • the client IP's /24 subnet (groups users behind the same NAT)
//
// The fingerprint is intentionally coarse — it can't uniquely identify a
// device the way a hardware ID would, but it lets us:
//   • list "devices this account has signed in from" in the Security Center
//   • mark a device as trusted (skip step-up OTP for low-risk actions)
//   • surface "Sign in from a new device" alerts
//
// Fingerprint stability: the same browser + same /24 subnet → same fingerprint.
// Roaming between cells or upgrading the browser will create a new entry —
// this is by design (the old entry stays in the device list until revoked).

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { getClientIp, getUserAgent } from "@/lib/api";
import type { Device } from "@prisma/client";

/** Compute the /24 subnet of an IPv4 address (e.g. 192.168.1.42 → 192.168.1.0). */
function ipToSubnet(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  // IPv4 dotted quad
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  // IPv6 — use the first hextet as a coarse subnet (less stable but works)
  const v6 = ip.match(/^([0-9a-fA-F:]+)::?/);
  if (v6) return `${ip.split(":").slice(0, 4).join(":")}::/64`;
  return ip;
}

/**
 * Compute a stable device fingerprint from a Request.
 * SHA-256(userAgent + "|" + subnet).
 */
export function getDeviceFingerprint(req: Request): string {
  const ua = getUserAgent(req);
  const ip = getClientIp(req);
  const subnet = ipToSubnet(ip);
  return createHash("sha256").update(`${ua}|${subnet}`).digest("hex");
}

/**
 * Parse a User-Agent string into structured device info. Lightweight regex —
 * not a full UA parser (we don't need version accuracy for display).
 */
export function getDeviceInfo(req: Request): {
  fingerprint: string;
  deviceName: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  os: string;
  browser: string;
  ip: string;
} {
  const ua = getUserAgent(req);
  const ip = getClientIp(req);
  const fingerprint = getDeviceFingerprint(req);

  // OS
  let os = "Unknown";
  if (/Windows NT 10/.test(ua)) os = "Windows";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/iPhone/.test(ua)) os = "iOS";
  else if (/iPad/.test(ua)) os = "iPadOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Linux/.test(ua)) os = "Linux";
  else if (/CrOS/.test(ua)) os = "ChromeOS";

  // Browser (order matters — Edg must precede Chrome; Firefox precedes Safari)
  let browser = "Unknown";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = "Opera";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/Chromium\//.test(ua)) browser = "Chromium";
  else if (/Safari\//.test(ua)) browser = "Safari";

  // Device type + name
  let deviceType: "desktop" | "mobile" | "tablet" | "unknown" = "desktop";
  let deviceName = "This device";
  if (/iPad/.test(ua)) {
    deviceType = "tablet";
    deviceName = "iPad";
  } else if (/iPhone/.test(ua)) {
    deviceType = "mobile";
    deviceName = "iPhone";
  } else if (/Android/.test(ua) && /Mobile/.test(ua)) {
    deviceType = "mobile";
    deviceName = "Android phone";
  } else if (/Android/.test(ua)) {
    deviceType = "tablet";
    deviceName = "Android tablet";
  } else if (/Mac OS X/.test(ua)) {
    deviceType = "desktop";
    deviceName = "Mac";
  } else if (/Windows/.test(ua)) {
    deviceType = "desktop";
    deviceName = "Windows PC";
  } else if (/Linux/.test(ua)) {
    deviceType = "desktop";
    deviceName = "Linux PC";
  } else if (ua === "unknown") {
    deviceType = "unknown";
    deviceName = "Unknown device";
  }

  return { fingerprint, deviceName, deviceType, os, browser, ip };
}

/**
 * Upsert a Device record for (userId, fingerprint). Updates `lastSeenAt` and
 * (if previously unknown) sets `firstSeenAt`. Does not change `trusted`
 * status — that's a separate explicit action.
 */
export async function trackDevice(userId: string, req: Request): Promise<Device> {
  const info = getDeviceInfo(req);
  const now = new Date();

  // Race-safe upsert: if the row exists, update lastSeenAt; else create.
  const existing = await db.device.findUnique({
    where: { userId_fingerprint: { userId, fingerprint: info.fingerprint } },
  });

  if (existing) {
    return db.device.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        ip: info.ip,
      },
    });
  }

  return db.device.create({
    data: {
      userId,
      fingerprint: info.fingerprint,
      deviceName: info.deviceName,
      deviceType: info.deviceType,
      os: info.os,
      browser: info.browser,
      ip: info.ip,
      trusted: false,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });
}

/**
 * List all devices a user has signed in from, newest first.
 */
export async function listDevices(userId: string): Promise<Device[]> {
  return db.device.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  });
}

/**
 * Mark a device as trusted (skip step-up OTP for low-risk actions on this device).
 */
export async function trustDevice(userId: string, fingerprint: string): Promise<Device | null> {
  const device = await db.device.findUnique({
    where: { userId_fingerprint: { userId, fingerprint } },
  });
  if (!device) return null;
  return db.device.update({
    where: { id: device.id },
    data: { trusted: true },
  });
}

/**
 * Revoke a device: mark it as un-trusted (it can still be re-trusted later).
 * To fully remove a device from the list, use `deleteDevice`.
 */
export async function revokeDevice(userId: string, deviceId: string): Promise<Device | null> {
  const device = await db.device.findFirst({
    where: { id: deviceId, userId },
  });
  if (!device) return null;
  return db.device.update({
    where: { id: device.id },
    data: { trusted: false },
  });
}

/**
 * Hard-delete a device record (the user no longer wants it tracked).
 */
export async function deleteDevice(userId: string, deviceId: string): Promise<boolean> {
  const device = await db.device.findFirst({
    where: { id: deviceId, userId },
  });
  if (!device) return false;
  await db.device.delete({ where: { id: device.id } });
  return true;
}

/**
 * Check whether a device fingerprint is trusted for the given user.
 */
export async function isTrustedDevice(userId: string, fingerprint: string): Promise<boolean> {
  const device = await db.device.findUnique({
    where: { userId_fingerprint: { userId, fingerprint } },
    select: { trusted: true },
  });
  return !!device?.trusted;
}
