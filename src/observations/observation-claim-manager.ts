import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  open,
  readFile,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import path from "node:path";

const processInstanceId = randomUUID();
const incompleteClaimRecoveryGraceMs = 50;

export interface ObservationClaim {
  readonly schemaVersion: 1;
  readonly pid: number;
  readonly processInstanceId: string;
  readonly claimId: string;
}

interface LegacyClaimOwner {
  readonly pid: number;
}

export class ObservationClaimManager {
  public async acquire(claimPath: string): Promise<ObservationClaim | undefined> {
    const claim = createObservationClaim();
    return await publishClaim(claimPath, claim) ? claim : undefined;
  }

  public async recoverAbandoned(claimPath: string): Promise<boolean> {
    let claimStatus;
    try {
      claimStatus = await lstat(claimPath);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return true;
      throw error;
    }
    if (claimStatus.isDirectory()) {
      return recoverLegacyClaim(claimPath, claimStatus.mtimeMs);
    }
    if (!claimStatus.isFile()) return false;

    const owner = await readClaim(claimPath);
    if (owner === undefined) {
      if (claimIsWithinRecoveryGrace(claimStatus.mtimeMs)) return false;
      return quarantineAbandonedFileClaim(claimPath, undefined);
    }
    if (isClaimOwnerRunning(owner)) return false;
    return quarantineAbandonedFileClaim(claimPath, owner);
  }

  public async assertOwnership(
    claimPath: string,
    expectedOwner: ObservationClaim,
  ): Promise<void> {
    const currentOwner = await readClaim(claimPath);
    if (sameClaimOwner(currentOwner, expectedOwner)) return;
    throw new Error("Observation claim ownership changed before publication");
  }

  public async release(
    claimPath: string,
    expectedOwner: ObservationClaim,
  ): Promise<void> {
    const currentOwner = await readClaim(claimPath);
    if (!sameClaimOwner(currentOwner, expectedOwner)) return;
    await rm(claimPath, { force: true });
  }
}

function createObservationClaim(): ObservationClaim {
  return {
    schemaVersion: 1,
    pid: process.pid,
    processInstanceId,
    claimId: randomUUID(),
  };
}

async function publishClaim(
  claimPath: string,
  owner: ObservationClaim,
): Promise<boolean> {
  const stagedClaimPath = path.join(
    path.dirname(claimPath),
    `.${path.basename(claimPath)}.${owner.claimId}.tmp`,
  );
  try {
    const stagedClaim = await open(stagedClaimPath, "wx", 0o600);
    try {
      await stagedClaim.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
      await stagedClaim.sync();
    } finally {
      await stagedClaim.close();
    }
    // A hard link exposes synced metadata and ownership in one non-overwriting step.
    try {
      await link(stagedClaimPath, claimPath);
      return true;
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) return false;
      throw error;
    }
  } finally {
    await rm(stagedClaimPath, { force: true });
  }
}

async function recoverLegacyClaim(
  claimDirectory: string,
  directoryModifiedAt: number,
): Promise<boolean> {
  const ownerPath = path.join(claimDirectory, "owner.json");
  let ownerDocument: string;
  try {
    ownerDocument = await readFile(ownerPath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      if (claimIsWithinRecoveryGrace(directoryModifiedAt)) return false;
      return removeLegacyClaimDirectory(claimDirectory);
    }
    throw error;
  }

  const owner = parseLegacyClaimOwner(ownerDocument);
  if (owner === undefined) {
    let ownerStatus;
    try {
      ownerStatus = await lstat(ownerPath);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return true;
      throw error;
    }
    if (claimIsWithinRecoveryGrace(ownerStatus.mtimeMs)) return false;
    return removeLegacyClaimDirectory(claimDirectory, ownerPath);
  }
  if (isProcessRunning(owner.pid)) return false;
  return removeLegacyClaimDirectory(claimDirectory, ownerPath);
}

async function removeLegacyClaimDirectory(
  claimDirectory: string,
  ownerPath?: string,
): Promise<boolean> {
  if (ownerPath) await rm(ownerPath, { force: true });
  try {
    await rmdir(claimDirectory);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return true;
    if (hasErrorCode(error, "ENOTDIR") || hasErrorCode(error, "ENOTEMPTY")) {
      return false;
    }
    throw error;
  }
}

async function quarantineAbandonedFileClaim(
  claimPath: string,
  expectedOwner: ObservationClaim | undefined,
): Promise<boolean> {
  const quarantinePath = `${claimPath}.${randomUUID()}.abandoned`;
  try {
    await rename(claimPath, quarantinePath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return true;
    throw error;
  }

  // A competing recovery may have moved a replacement claim, so verify it again.
  const quarantinedOwner = await readClaim(quarantinePath);
  const movedExpectedClaim = expectedOwner === undefined
    ? quarantinedOwner === undefined
    : sameClaimOwner(quarantinedOwner, expectedOwner);
  if (movedExpectedClaim && !isClaimOwnerRunning(quarantinedOwner)) {
    await rm(quarantinePath, { force: true });
    return true;
  }

  await restoreQuarantinedClaim(quarantinePath, claimPath);
  return false;
}

async function restoreQuarantinedClaim(
  quarantinePath: string,
  claimPath: string,
): Promise<void> {
  try {
    await link(quarantinePath, claimPath);
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) throw error;
  } finally {
    await rm(quarantinePath, { force: true });
  }
}

function claimIsWithinRecoveryGrace(modifiedAt: number): boolean {
  return Date.now() - modifiedAt < incompleteClaimRecoveryGraceMs;
}

async function readClaim(
  claimPath: string,
): Promise<ObservationClaim | undefined> {
  let document: string;
  try {
    document = await readFile(claimPath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return undefined;
    throw error;
  }
  return parseObservationClaim(document);
}

function parseObservationClaim(document: string): ObservationClaim | undefined {
  const owner = parseClaimDocument(document);
  if (
    !isRecord(owner)
    || owner.schemaVersion !== 1
    || !isProcessId(owner.pid)
    || typeof owner.processInstanceId !== "string"
    || owner.processInstanceId.length === 0
    || typeof owner.claimId !== "string"
    || owner.claimId.length === 0
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    pid: owner.pid,
    processInstanceId: owner.processInstanceId,
    claimId: owner.claimId,
  };
}

function parseLegacyClaimOwner(document: string): LegacyClaimOwner | undefined {
  const owner = parseClaimDocument(document);
  if (!isRecord(owner) || !isProcessId(owner.pid)) return undefined;
  return { pid: owner.pid };
}

function parseClaimDocument(document: string): unknown {
  try {
    return JSON.parse(document) as unknown;
  } catch {
    return undefined;
  }
}

function isClaimOwnerRunning(owner: ObservationClaim | undefined): boolean {
  if (owner === undefined) return false;
  if (owner.pid === process.pid) {
    return owner.processInstanceId === processInstanceId;
  }
  return isProcessRunning(owner.pid);
}

function sameClaimOwner(
  left: ObservationClaim | undefined,
  right: ObservationClaim,
): boolean {
  return left?.claimId === right.claimId
    && left.processInstanceId === right.processInstanceId
    && left.pid === right.pid;
}

function isProcessId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !hasErrorCode(error, "ESRCH");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}
