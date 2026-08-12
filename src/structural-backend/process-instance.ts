import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export type ProcessInstanceStatus = "matching" | "different" | "missing" | "unknown";
export type ProcessInstanceProof = "process-start" | "open-file";

export interface ProcessInstance {
  readonly id: string;
  readonly proof: ProcessInstanceProof;
}

export interface ProcessLeaseIdentity {
  readonly path: string;
  readonly device: number;
  readonly inode: number;
  readonly writtenAtMs: number;
}

const POSIX_OPEN_FILE_INSTANCE_ID = randomBytes(32).toString("hex");

export function currentProcessInstance(): ProcessInstance {
  if (usesOpenFileProof()) {
    return { id: POSIX_OPEN_FILE_INSTANCE_ID, proof: "open-file" };
  }
  const instanceId = readProcessStartInstanceId(process.pid);
  if (instanceId === undefined) {
    throw new Error("The structural backend could not identify its lock-owning process instance");
  }
  return { id: instanceId, proof: "process-start" };
}

export function currentProcessInstanceId(): string {
  return currentProcessInstance().id;
}

export function inspectProcessInstance(
  pid: number,
  expectedInstanceId: string,
  proof: ProcessInstanceProof,
  lease: ProcessLeaseIdentity,
): ProcessInstanceStatus {
  if (!isProcessAlive(pid)) {
    return "missing";
  }
  if (proof === "open-file") {
    return inspectOpenFileProcessInstance(pid, lease);
  }
  const instanceId = readProcessStartInstanceId(pid);
  if (instanceId === undefined) {
    return isProcessAlive(pid) ? "unknown" : "missing";
  }
  if (instanceId !== expectedInstanceId) {
    return "different";
  }
  return processStartedAfter(pid, lease.writtenAtMs) === true ? "different" : "matching";
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

function readProcessStartInstanceId(pid: number): string | undefined {
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
  if (process.platform === "darwin") {
    return readDarwinProcessStartedAtMs(pid);
  }
  const startedAt = readPosixStartedAt(pid);
  const timestampMs = startedAt === undefined ? Number.NaN : Date.parse(`${startedAt} UTC`);
  return Number.isFinite(timestampMs) ? timestampMs : undefined;
}

function inspectOpenFileProcessInstance(
  pid: number,
  lease: ProcessLeaseIdentity,
): ProcessInstanceStatus {
  // The owner keeps this inode open for the entire lease, so PID reuse cannot recreate the proof.
  try {
    const output = execFileSync(process.platform === "darwin" ? "/usr/sbin/lsof" : "lsof", [
      "-a",
      "-p",
      String(pid),
      "-F0pDi",
      "--",
      lease.path,
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 2_000,
    });
    return lsofIdentities(output).some(({ device, inode }) =>
      device === BigInt(lease.device) && inode === BigInt(lease.inode))
      ? "matching"
      : "different";
  } catch (error) {
    if (isEmptyLsofResult(error)) {
      return isProcessAlive(pid) ? "different" : "missing";
    }
    return isProcessAlive(pid) ? "unknown" : "missing";
  }
}

function lsofIdentities(output: string): readonly { readonly device: bigint; readonly inode: bigint }[] {
  const identities: { device?: bigint; inode?: bigint }[] = [];
  let current: { device?: bigint; inode?: bigint } | undefined;
  for (const field of output.split(/[\0\n]/u)) {
    if (field.startsWith("f")) {
      current = {};
      identities.push(current);
    } else if (current !== undefined && field.startsWith("D") && /^0x[0-9a-f]+$/iu.test(field.slice(1))) {
      current.device = BigInt(field.slice(1));
    } else if (current !== undefined && field.startsWith("i") && /^\d+$/u.test(field.slice(1))) {
      current.inode = BigInt(field.slice(1));
    }
  }
  return identities.flatMap((identity) =>
    identity.device === undefined || identity.inode === undefined
      ? []
      : [{ device: identity.device, inode: identity.inode }]);
}

function isEmptyLsofResult(error: unknown): boolean {
  if (!(error instanceof Error) || !("status" in error) || error.status !== 1) {
    return false;
  }
  const stdout = "stdout" in error ? error.stdout : undefined;
  const stderr = "stderr" in error ? error.stderr : undefined;
  return typeof stdout === "string" && stdout.length === 0 &&
    typeof stderr === "string" && stderr.length === 0;
}

function readDarwinProcessStartedAtMs(pid: number): number | undefined {
  try {
    const report = execFileSync("/usr/bin/sample", [
      String(pid),
      "1",
      "10",
      "-file",
      "/dev/stdout",
    ], {
      encoding: "utf8",
      env: { ...process.env, LANG: "C", LC_ALL: "C", TZ: "UTC" },
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    });
    const launchTime = /^Launch Time:\s+(.+)$/mu.exec(report)?.[1];
    const timestampMs = launchTime === undefined ? Number.NaN : Date.parse(launchTime);
    return Number.isFinite(timestampMs) ? timestampMs : undefined;
  } catch {
    return undefined;
  }
}

function usesOpenFileProof(): boolean {
  return process.platform !== "linux" && process.platform !== "win32";
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
