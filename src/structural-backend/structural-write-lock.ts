import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fileSystemConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";

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
    try {
      writeFileSync(path, serializeOwnership(ownership), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      return new StructuralWriteLock(path, lstatSync(path), ownership);
    } catch (error) {
      if (isFileSystemError(error, "EEXIST")) {
        return undefined;
      }
      throw error;
    }
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
