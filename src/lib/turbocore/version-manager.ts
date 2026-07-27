// TurboCore Version Manager
//
// Every plugin follows semantic versioning (Major.Minor.Patch).
// TurboCore can roll back safely.
//
// Version history is tracked per provider. When a new version is
// installed, the old version is archived. If the new version fails
// certification or causes issues, the admin can roll back.

export interface ProviderVersion {
  provider: string;
  version: string; // semver: "2.0.0"
  major: number;
  minor: number;
  patch: number;
  installedAt: string;
  certified: boolean;
  status: "ACTIVE" | "ARCHIVED" | "ROLLBACK";
  changelog?: string;
}

export interface VersionHistory {
  provider: string;
  current: string;
  versions: ProviderVersion[];
}

// ===== Version Store =====

const versionStore = new Map<string, VersionHistory>();

// ===== Parse Semver =====

export function parseSemver(version: string): { major: number; minor: number; patch: number } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return { major: 0, minor: 0, patch: 0 };
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
  };
}

export function compareVersions(a: string, b: string): number {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

export function isBreakingChange(oldVersion: string, newVersion: string): boolean {
  const old = parseSemver(oldVersion);
  const next = parseSemver(newVersion);
  return next.major > old.major;
}

// ===== Version Management =====

export function registerVersion(
  provider: string,
  version: string,
  changelog?: string
): ProviderVersion {
  const parsed = parseSemver(version);
  const entry: ProviderVersion = {
    provider,
    version,
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    installedAt: new Date().toISOString(),
    certified: false,
    status: "ACTIVE",
    changelog,
  };

  const history = versionStore.get(provider);
  if (history) {
    // Archive previous active version
    history.versions.forEach((v) => {
      if (v.status === "ACTIVE") v.status = "ARCHIVED";
    });
    history.versions.push(entry);
    history.current = version;
  } else {
    versionStore.set(provider, {
      provider,
      current: version,
      versions: [entry],
    });
  }

  return entry;
}

export function markCertified(provider: string, version: string): void {
  const history = versionStore.get(provider);
  if (!history) return;
  const entry = history.versions.find((v) => v.version === version);
  if (entry) entry.certified = true;
}

export function rollback(provider: string, targetVersion?: string): ProviderVersion | null {
  const history = versionStore.get(provider);
  if (!history || history.versions.length < 2) return null;

  // Find the target version (or the previous one)
  let target: ProviderVersion | undefined;
  if (targetVersion) {
    target = history.versions.find((v) => v.version === targetVersion);
  } else {
    // Find the most recent archived version
    const archived = history.versions.filter((v) => v.status === "ARCHIVED");
    target = archived[archived.length - 1];
  }

  if (!target) return null;

  // Archive current
  history.versions.forEach((v) => {
    if (v.status === "ACTIVE") v.status = "ARCHIVED";
  });

  // Activate target
  target.status = "ACTIVE";
  target.status = "ROLLBACK"; // Mark as rollback for audit
  history.current = target.version;

  return target;
}

export function getVersionHistory(provider: string): VersionHistory | null {
  return versionStore.get(provider) ?? null;
}

export function getCurrentVersion(provider: string): string | null {
  return versionStore.get(provider)?.current ?? null;
}

export function getAllVersionHistory(): VersionHistory[] {
  return Array.from(versionStore.values());
}

export function isVersionCertified(provider: string, version?: string): boolean {
  const history = versionStore.get(provider);
  if (!history) return false;
  if (version) {
    return history.versions.find((v) => v.version === version)?.certified ?? false;
  }
  return history.versions.find((v) => v.version === history.current)?.certified ?? false;
}
