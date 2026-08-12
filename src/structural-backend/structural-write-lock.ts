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

const OWNERSHIP_FILE_MARKER = ".owner-";

interface LockOwnership {
  readonly pid: number;
  readonly token: string;
}

interface ObservedLock {
  readonly identity: Stats;
  readonly ownership: LockOwnership;
}

export class StructuralWriteLock {
  readonly #path: string;
  readonly #identity: Stats;
  readonly #ownership: LockOwnership;

  private constructor(path: string, identity: Stats, ownership: LockOwnership) {
    this.#path = path;
    this.#identity = identity;
    this.#ownership = ownership;
  }

  static acquire(path: string): StructuralWriteLock | undefined {
    cleanupAbandonedOwnershipFiles(path);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const acquired = StructuralWriteLock.create(path);
      if (acquired !== undefined) {
        return acquired;
      }
      const existing = observeLock(path);
      if (existing === undefined || isProcessAlive(existing.ownership.pid)) {
        return undefined;
      }
      if (!removeObservedLock(path, existing)) {
        return undefined;
      }
    }
    return undefined;
  }

  release(): void {
    removeObservedLock(this.#path, {
      identity: this.#identity,
      ownership: this.#ownership,
    });
  }

  private static create(path: string): StructuralWriteLock | undefined {
    const ownership = { pid: process.pid, token: randomUUID() };
    const ownershipPath = ownershipFilePath(path, ownership);
    let ownershipFileCreated = false;
    try {
      writeFileSync(ownershipPath, serializeOwnership(ownership), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      ownershipFileCreated = true;
      persistOwnershipFile(ownershipPath);
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
      return new StructuralWriteLock(path, identity, ownership);
    } finally {
      if (ownershipFileCreated) {
        removeRegularFile(ownershipPath);
      }
    }
  }
}

function persistOwnershipFile(path: string): void {
  const noFollow = fileSystemConstants.O_NOFOLLOW ?? 0;
  const descriptor = openSync(path, fileSystemConstants.O_RDONLY | noFollow);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
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
  return `${path}${OWNERSHIP_FILE_MARKER}${ownership.pid}-${ownership.token}`;
}

function cleanupAbandonedOwnershipFiles(lockPath: string): void {
  const directory = dirname(lockPath);
  const prefix = `${basename(lockPath)}${OWNERSHIP_FILE_MARKER}`;
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    const ownership = parseOwnershipFileName(entry, prefix);
    if (ownership !== undefined && !isProcessAlive(ownership.pid)) {
      removeRegularFile(join(directory, entry));
    }
  }
}

function parseOwnershipFileName(
  name: string,
  prefix: string,
): LockOwnership | undefined {
  if (!name.startsWith(prefix)) {
    return undefined;
  }
  const separator = name.indexOf("-", prefix.length);
  if (separator === -1) {
    return undefined;
  }
  const serializedPid = name.slice(prefix.length, separator);
  const pid = /^\d+$/u.test(serializedPid)
    ? Number.parseInt(serializedPid, 10)
    : Number.NaN;
  const token = name.slice(separator + 1);
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    !isUuid(token)
  ) {
    return undefined;
  }
  return { pid, token };
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
  const current = observeLock(path);
  if (
    current === undefined ||
    current.identity.dev !== expected.identity.dev ||
    current.identity.ino !== expected.identity.ino ||
    current.ownership.pid !== expected.ownership.pid ||
    current.ownership.token !== expected.ownership.token
  ) {
    return false;
  }

  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
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
    if (
      typeof pid !== "number" ||
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      typeof token !== "string" ||
      token.length === 0
    ) {
      return undefined;
    }
    return { pid, token };
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isFileSystemError(error, "ESRCH");
  }
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
