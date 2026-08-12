import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fileSystemConstants,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { basename, dirname, join } from "node:path";

import {
  currentProcessInstance,
  inspectProcessInstance,
  isProcessAlive,
  processStartedAfter,
  type ProcessInstanceProof,
} from "./process-instance.js";

const OWNERSHIP_FILE_MARKER = ".owner-";

interface LockOwnership {
  readonly pid: number;
  readonly token: string;
  readonly instanceId?: string;
  readonly instanceProof?: ProcessInstanceProof;
}

interface ObservedLock {
  readonly identity: Stats;
  readonly ownership: LockOwnership;
}

export class StructuralWriteLock {
  readonly #path: string;
  readonly #identity: Stats;
  readonly #ownership: LockOwnership;
  readonly #ownershipPath: string;
  readonly #ownershipDescriptor: number | undefined;

  private constructor(
    path: string,
    identity: Stats,
    ownership: LockOwnership,
    ownershipPath: string,
    ownershipDescriptor?: number,
  ) {
    this.#path = path;
    this.#identity = identity;
    this.#ownership = ownership;
    this.#ownershipPath = ownershipPath;
    this.#ownershipDescriptor = ownershipDescriptor;
  }

  static acquire(path: string): StructuralWriteLock | undefined {
    if (hasCompetingOwnershipLease(path)) {
      return undefined;
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const acquired = StructuralWriteLock.create(path);
      if (acquired !== undefined) {
        return acquired;
      }
      const existing = observeLock(path);
      if (existing === undefined || isObservedOwnershipActive(path, existing)) {
        return undefined;
      }
      if (!removeObservedLock(path, existing)) {
        return undefined;
      }
    }
    return undefined;
  }

  release(): void {
    try {
      removeObservedLock(this.#path, {
        identity: this.#identity,
        ownership: this.#ownership,
      });
    } finally {
      try {
        removeObservedLock(this.#ownershipPath, {
          identity: this.#identity,
          ownership: this.#ownership,
        });
      } finally {
        if (this.#ownershipDescriptor !== undefined) {
          closeSync(this.#ownershipDescriptor);
        }
      }
    }
  }

  private static create(path: string): StructuralWriteLock | undefined {
    const processInstance = currentProcessInstance();
    const ownership = {
      pid: process.pid,
      token: randomUUID(),
      instanceId: processInstance.id,
      instanceProof: processInstance.proof,
    };
    const ownershipPath = ownershipFilePath(path, ownership);
    let ownershipFileCreated = false;
    let ownershipLeaseRetained = false;
    let ownershipDescriptor: number | undefined;
    try {
      const noFollow = fileSystemConstants.O_NOFOLLOW ?? 0;
      ownershipDescriptor = openSync(
        ownershipPath,
        fileSystemConstants.O_CREAT |
          fileSystemConstants.O_EXCL |
          fileSystemConstants.O_RDWR |
          noFollow,
        0o600,
      );
      ownershipFileCreated = true;
      writeFileSync(ownershipDescriptor, serializeOwnership(ownership), { encoding: "utf8" });
      persistOwnershipFile(ownershipDescriptor);
      if (ownership.instanceProof !== "open-file") {
        closeSync(ownershipDescriptor);
        ownershipDescriptor = undefined;
      }
      if (hasCompetingOwnershipLease(path, ownershipPath)) {
        return undefined;
      }
      // Publish only a complete owner record at the contested lock path.
      try {
        linkSync(ownershipPath, path);
      } catch (error) {
        if (isFileSystemError(error, "EEXIST")) {
          return undefined;
        }
        throw error;
      }
      const identity = lstatSync(path);
      try {
        persistDirectory(dirname(path));
      } catch (error) {
        removeObservedLock(path, { identity, ownership });
        throw error;
      }
      if (
        hasCompetingOwnershipLease(path, ownershipPath) ||
        !matchesObservedLock(path, { identity, ownership })
      ) {
        removeObservedLock(path, { identity, ownership });
        return undefined;
      }
      ownershipLeaseRetained = true;
      return new StructuralWriteLock(
        path,
        identity,
        ownership,
        ownershipPath,
        ownershipDescriptor,
      );
    } finally {
      if (ownershipFileCreated && !ownershipLeaseRetained) {
        try {
          removeRegularFile(ownershipPath);
        } finally {
          if (ownershipDescriptor !== undefined) {
            closeSync(ownershipDescriptor);
          }
        }
      }
    }
  }
}

function persistOwnershipFile(descriptor: number): void {
  fsyncSync(descriptor);
}

function persistDirectory(path: string): void {
  if (process.platform === "win32") {
    return;
  }
  const descriptor = openSync(path, fileSystemConstants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function ownershipFilePath(path: string, ownership: LockOwnership): string {
  if (ownership.instanceId === undefined) {
    throw new Error("The structural lock owner lease requires a process instance identity");
  }
  if (ownership.instanceProof === undefined) {
    throw new Error("The structural lock owner lease requires a process instance proof");
  }
  return `${path}${OWNERSHIP_FILE_MARKER}${ownership.pid}-${ownership.instanceProof}-${ownership.instanceId}-${ownership.token}`;
}

function hasCompetingOwnershipLease(
  lockPath: string,
  ownOwnershipPath?: string,
): boolean {
  const directory = dirname(lockPath);
  const prefix = `${basename(lockPath)}${OWNERSHIP_FILE_MARKER}`;
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return true;
  }

  for (const entry of entries) {
    const path = join(directory, entry);
    if (path === ownOwnershipPath) {
      continue;
    }
    const ownership = parseOwnershipFileName(entry, prefix);
    if (ownership === undefined) {
      continue;
    }
    const observed = observeLock(path);
    if (
      observed === undefined ||
      observed.ownership.pid !== ownership.pid ||
      observed.ownership.token !== ownership.token ||
      observed.ownership.instanceId !== ownership.instanceId ||
      observed.ownership.instanceProof !== ownership.instanceProof
    ) {
      if (
        ownership.instanceId === undefined
          ? isLegacyLeasePathActive(lockPath, path, ownership.pid)
          : isOwnershipActive(ownership, path)
      ) {
        return true;
      }
    } else if (observed.ownership.instanceId === undefined) {
      if (isLegacyLeaseActive(lockPath, observed)) {
        return true;
      }
      if (
        matchesObservedLock(lockPath, observed) &&
        !removeObservedLock(lockPath, observed)
      ) {
        return true;
      }
    } else if (isOwnershipActive(observed.ownership, path, observed.identity)) {
      return true;
    }
    if (!removeRegularFile(path) && pathExists(path)) {
      return true;
    }
  }
  return false;
}

function parseOwnershipFileName(
  name: string,
  prefix: string,
): LockOwnership | undefined {
  if (!name.startsWith(prefix)) {
    return undefined;
  }
  const serializedOwnership = name.slice(prefix.length);
  const match = /^(\d+)-(?:(?<instanceProof>process-start|open-file)-)?(?:(?<instanceId>[0-9a-f]{64})-)?(?<token>[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu
    .exec(serializedOwnership);
  if (match === null) {
    return undefined;
  }
  const serializedPid = match[1] ?? "";
  const pid = /^\d+$/u.test(serializedPid)
    ? Number.parseInt(serializedPid, 10)
    : Number.NaN;
  const token = match.groups?.token ?? "";
  const instanceId = match.groups?.instanceId;
  const instanceProof = match.groups?.instanceProof as ProcessInstanceProof | undefined;
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    !isUuid(token) ||
    (instanceProof !== undefined && instanceId === undefined)
  ) {
    return undefined;
  }
  return {
    pid,
    token,
    ...(instanceId === undefined ? {} : { instanceId }),
    ...(instanceProof === undefined ? {} : { instanceProof }),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function removeRegularFile(path: string): boolean {
  let identity: Stats;
  try {
    identity = lstatSync(path);
  } catch {
    return false;
  }
  if (!identity.isFile() || identity.isSymbolicLink()) {
    return false;
  }

  try {
    const current = lstatSync(path);
    if (current.dev !== identity.dev || current.ino !== identity.ino) {
      return false;
    }
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    return !isFileSystemError(error, "ENOENT");
  }
}

function observeLock(path: string): ObservedLock | undefined {
  let descriptor: number | undefined;
  try {
    const identity = lstatSync(path);
    if (!identity.isFile() || identity.isSymbolicLink()) {
      return undefined;
    }
    descriptor = openSync(
      path,
      fileSystemConstants.O_RDONLY | (fileSystemConstants.O_NOFOLLOW ?? 0),
    );
    const openedIdentity = fstatSync(descriptor);
    if (
      openedIdentity.dev !== identity.dev ||
      openedIdentity.ino !== identity.ino
    ) {
      return undefined;
    }
    const ownership = parseOwnership(readFileSync(descriptor, "utf8"));
    return ownership === undefined ? undefined : { identity: openedIdentity, ownership };
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
}

function removeObservedLock(path: string, expected: ObservedLock): boolean {
  if (!matchesObservedLock(path, expected)) {
    return false;
  }

  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

function matchesObservedLock(path: string, expected: ObservedLock): boolean {
  const current = observeLock(path);
  return current !== undefined &&
    current.identity.dev === expected.identity.dev &&
    current.identity.ino === expected.identity.ino &&
    current.ownership.pid === expected.ownership.pid &&
    current.ownership.token === expected.ownership.token &&
    current.ownership.instanceId === expected.ownership.instanceId &&
    current.ownership.instanceProof === expected.ownership.instanceProof;
}

function serializeOwnership(ownership: LockOwnership): string {
  return `${JSON.stringify(ownership)}\n`;
}

function parseOwnership(value: string): LockOwnership | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    const pid = typeof parsed === "object" && parsed !== null && "pid" in parsed
      ? parsed.pid
      : undefined;
    const token = typeof parsed === "object" && parsed !== null && "token" in parsed
      ? parsed.token
      : undefined;
    const instanceId = typeof parsed === "object" && parsed !== null && "instanceId" in parsed
      ? parsed.instanceId
      : undefined;
    const instanceProof = typeof parsed === "object" && parsed !== null && "instanceProof" in parsed
      ? parsed.instanceProof
      : undefined;
    if (
      typeof pid !== "number" ||
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      typeof token !== "string" ||
      token.length === 0 ||
      (instanceId !== undefined && !isProcessInstanceId(instanceId)) ||
      (instanceProof !== undefined && !isProcessInstanceProof(instanceProof)) ||
      (instanceProof !== undefined && instanceId === undefined)
    ) {
      return undefined;
    }
    return {
      pid,
      token,
      ...(instanceId === undefined ? {} : { instanceId }),
      ...(instanceProof === undefined ? {} : { instanceProof }),
    };
  } catch {
    return undefined;
  }
}

function isOwnershipActive(
  ownership: LockOwnership,
  leasePath: string,
  leaseIdentity?: Stats,
): boolean {
  if (ownership.instanceId === undefined) {
    return isProcessAlive(ownership.pid);
  }
  let identity: Stats;
  try {
    identity = leaseIdentity ?? lstatSync(leasePath);
  } catch {
    return false;
  }
  const status = inspectProcessInstance(
    ownership.pid,
    ownership.instanceId,
    ownership.instanceProof ?? "process-start",
    {
      path: leasePath,
      device: identity.dev,
      inode: identity.ino,
      writtenAtMs: Math.max(identity.birthtimeMs, identity.ctimeMs),
    },
  );
  return status === "matching" || status === "unknown";
}

function isObservedOwnershipActive(lockPath: string, lock: ObservedLock): boolean {
  return lock.ownership.instanceId === undefined
    ? isLegacyLeaseActive(lockPath, lock)
    : isOwnershipActive(lock.ownership, lockPath, lock.identity);
}

function isLegacyLeaseActive(lockPath: string, lease: ObservedLock): boolean {
  return isLegacyLeasePathActive(lockPath, lease.identity, lease.ownership.pid);
}

function isLegacyLeasePathActive(
  lockPath: string,
  leasePathOrIdentity: string | Stats,
  pid: number,
): boolean {
  if (!isProcessAlive(pid)) {
    return false;
  }
  let leaseIdentity: Stats;
  try {
    leaseIdentity = typeof leasePathOrIdentity === "string"
      ? lstatSync(leasePathOrIdentity)
      : leasePathOrIdentity;
  } catch {
    return false;
  }
  try {
    const fixedIdentity = lstatSync(lockPath);
    const sameLease = fixedIdentity.isFile() &&
      !fixedIdentity.isSymbolicLink() &&
      fixedIdentity.dev === leaseIdentity.dev &&
      fixedIdentity.ino === leaseIdentity.ino;
    if (!sameLease) {
      return false;
    }
    const leaseWrittenAtMs = Math.max(leaseIdentity.birthtimeMs, leaseIdentity.ctimeMs);
    return processStartedAfter(pid, leaseWrittenAtMs) !== true;
  } catch {
    return false;
  }
}

function isProcessInstanceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isProcessInstanceProof(value: unknown): value is ProcessInstanceProof {
  return value === "process-start" || value === "open-file";
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
