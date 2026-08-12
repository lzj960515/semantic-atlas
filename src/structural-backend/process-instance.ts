import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type ProcessInstanceStatus = "matching" | "different" | "missing" | "unknown";

export function currentProcessInstanceId(): string {
  const instanceId = readProcessInstanceId(process.pid);
  if (instanceId === undefined) {
    throw new Error("The structural backend could not identify its lock-owning process instance");
  }
  return instanceId;
}

export function inspectProcessInstance(
  pid: number,
  expectedInstanceId: string,
): ProcessInstanceStatus {
  if (!isProcessAlive(pid)) {
    return "missing";
  }
  const instanceId = readProcessInstanceId(pid);
  if (instanceId === undefined) {
    return isProcessAlive(pid) ? "unknown" : "missing";
  }
  return instanceId === expectedInstanceId ? "matching" : "different";
}

export function processStartedAfter(pid: number, timestampMs: number): boolean | undefined {
  const startedAtMs = readProcessStartedAtMs(pid);
  return startedAtMs === undefined ? undefined : startedAtMs > timestampMs;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isFileSystemError(error, "ESRCH");
  }
}

function readProcessInstanceId(pid: number): string | undefined {
  const fingerprint = process.platform === "linux"
    ? readLinuxProcessFingerprint(pid)
    : process.platform === "win32"
      ? readWindowsProcessFingerprint(pid)
      : readPosixProcessFingerprint(pid);
  return fingerprint === undefined
    ? undefined
    : createHash("sha256").update(fingerprint).digest("hex");
}

function readProcessStartedAtMs(pid: number): number | undefined {
  if (process.platform === "win32") {
    const ticks = readWindowsStartedAtTicks(pid);
    return ticks === undefined ? undefined : Number((ticks - 621_355_968_000_000_000n) / 10_000n);
  }
  const startedAt = readPosixStartedAt(pid);
  const timestampMs = startedAt === undefined ? Number.NaN : Date.parse(`${startedAt} UTC`);
  return Number.isFinite(timestampMs) ? timestampMs : undefined;
}

function readLinuxProcessFingerprint(pid: number): string | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const commandEnd = stat.lastIndexOf(")");
    if (commandEnd === -1) {
      return undefined;
    }
    const fieldsFromState = stat.slice(commandEnd + 2).trim().split(/\s+/u);
    const startTimeTicks = fieldsFromState[19];
    const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    return startTimeTicks === undefined || bootId.length === 0
      ? undefined
      : `linux:${bootId}:${startTimeTicks}`;
  } catch {
    return undefined;
  }
}

function readPosixProcessFingerprint(pid: number): string | undefined {
  const startedAt = readPosixStartedAt(pid);
  return startedAt === undefined ? undefined : `${process.platform}:${startedAt}`;
}

function readPosixStartedAt(pid: number): string | undefined {
  try {
    const startedAt = execFileSync("ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8",
      env: { ...process.env, LANG: "C", LC_ALL: "C", TZ: "UTC" },
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return startedAt.length === 0 ? undefined : startedAt;
  } catch {
    return undefined;
  }
}

function readWindowsProcessFingerprint(pid: number): string | undefined {
  const startedAt = readWindowsStartedAtTicks(pid);
  return startedAt === undefined ? undefined : `win32:${startedAt}`;
}

function readWindowsStartedAtTicks(pid: number): bigint | undefined {
  try {
    const startedAt = execFileSync("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^\d+$/u.test(startedAt) ? BigInt(startedAt) : undefined;
  } catch {
    return undefined;
  }
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
