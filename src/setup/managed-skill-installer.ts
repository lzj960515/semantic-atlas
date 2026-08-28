import { createHash, randomUUID } from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PackageIdentity } from "./package-identity.js";

const primarySkillName = "semantic-atlas";
const managedSkillNames = [primarySkillName, "semantic-atlas-maintenance"] as const;
const managerName = "semantic-atlas";
const installationMarkerName = ".semantic-atlas-managed.json";
const fingerprintPattern = /^[a-f0-9]{64}$/u;

export type ManagedSkillOutcome =
  | "installed"
  | "current"
  | "repaired"
  | "upgraded"
  | "recovered";

export type ManagedSkillName = typeof managedSkillNames[number];

export interface ManagedSkillIdentity {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly skillName: ManagedSkillName;
  readonly fingerprint: string;
}

export interface ManagedSkillInstallation {
  readonly outcome: ManagedSkillOutcome;
  readonly targetDirectory: string;
  readonly identity: ManagedSkillIdentity;
}

export interface ManagedSkillInstallerOptions {
  readonly packageIdentity: PackageIdentity;
  readonly sourceDirectory?: string;
  readonly userHome?: string;
  readonly skillName?: ManagedSkillName;
}

export interface ManagedSkillsInstallerOptions {
  readonly packageIdentity: PackageIdentity;
  readonly sourceRoot?: string;
  readonly userHome?: string;
}

export interface ManagedSkillsInstallation {
  readonly skills: readonly ManagedSkillInstallation[];
}

export interface ManagedSkillInstallerDependencies {
  readonly moveDirectory?: (source: string, target: string) => Promise<void>;
}

interface ManagedSkillMarker extends ManagedSkillIdentity {
  readonly schemaVersion: 1;
  readonly managedBy: typeof managerName;
}

export class ManagedSkillConflictError extends Error {
  public override readonly name = "ManagedSkillConflictError";

  public constructor(public readonly directory: string) {
    super(
      `Refusing to replace '${directory}' because it is not a recognized managed Semantic Atlas Skill`,
    );
  }
}

export class ManagedSkillInstaller {
  private readonly skillName: ManagedSkillName;
  private readonly sourceDirectory: string;
  private readonly targetDirectory: string;
  private readonly moveDirectory: (source: string, target: string) => Promise<void>;
  private readonly replacer: AtomicDirectoryReplacer;

  public constructor(
    private readonly options: ManagedSkillInstallerOptions,
    dependencies: ManagedSkillInstallerDependencies = {},
  ) {
    this.skillName = options.skillName ?? primarySkillName;
    this.sourceDirectory = options.sourceDirectory
      ?? resolveBundledSkillDirectory(this.skillName);
    this.targetDirectory = path.join(
      options.userHome ?? homedir(),
      ".agents",
      "skills",
      this.skillName,
    );
    this.moveDirectory = dependencies.moveDirectory ?? rename;
    this.replacer = new AtomicDirectoryReplacer(this.moveDirectory);
  }

  public async install(): Promise<ManagedSkillInstallation> {
    await requireSkillIdentity(
      this.sourceDirectory,
      "bundled Skill",
      this.skillName,
    );
    const fingerprint = await fingerprintSkill(this.sourceDirectory);
    const marker = this.createMarker(fingerprint);
    const recovered = await this.recoverInterruptedReplacement();
    const existing = await this.readExistingManagedSkill();

    if (!existing) {
      await this.replacer.replace(this.sourceDirectory, this.targetDirectory, marker);
      return this.result("installed", fingerprint);
    }

    const current = markerMatches(existing, marker)
      && await fingerprintSkill(this.targetDirectory) === fingerprint;
    if (current) {
      await this.removeRecoveryArtifacts();
      return this.result(recovered ? "recovered" : "current", fingerprint);
    }

    const outcome = existing.packageName !== marker.packageName
      || existing.packageVersion !== marker.packageVersion
      ? "upgraded"
      : "repaired";
    await this.removeRecoveryArtifacts();
    await this.replacer.replace(this.sourceDirectory, this.targetDirectory, marker);
    return this.result(outcome, fingerprint);
  }

  private createMarker(fingerprint: string): ManagedSkillMarker {
    return {
      schemaVersion: 1,
      managedBy: managerName,
      packageName: this.options.packageIdentity.name,
      packageVersion: this.options.packageIdentity.version,
      skillName: this.skillName,
      fingerprint,
    };
  }

  private async recoverInterruptedReplacement(): Promise<boolean> {
    const backupDirectory = backupPath(this.targetDirectory);
    if (!await exists(backupDirectory) || await exists(this.targetDirectory)) {
      return false;
    }
    if (!await readManagedMarker(backupDirectory, this.skillName)) {
      throw new ManagedSkillConflictError(backupDirectory);
    }
    await mkdir(path.dirname(this.targetDirectory), { recursive: true });
    await this.moveDirectory(backupDirectory, this.targetDirectory);
    return true;
  }

  private async readExistingManagedSkill(): Promise<ManagedSkillMarker | undefined> {
    if (!await exists(this.targetDirectory)) return undefined;
    const marker = await readManagedMarker(this.targetDirectory, this.skillName);
    if (!marker) throw new ManagedSkillConflictError(this.targetDirectory);
    return marker;
  }

  private async removeRecoveryArtifacts(): Promise<void> {
    const parentDirectory = path.dirname(this.targetDirectory);
    const targetName = path.basename(this.targetDirectory);
    const backupDirectory = backupPath(this.targetDirectory);
    if (await exists(backupDirectory)) {
      if (!await readManagedMarker(backupDirectory, this.skillName)) {
        throw new ManagedSkillConflictError(backupDirectory);
      }
      await rm(backupDirectory, { recursive: true, force: true });
    }
    if (!await exists(parentDirectory)) return;
    const entries = await readdir(parentDirectory, { withFileTypes: true });
    const ownedStages: string[] = [];
    for (const entry of entries) {
      if (!entry.name.startsWith(`${targetName}.installing-`)) continue;
      const stageDirectory = path.join(parentDirectory, entry.name);
      if (await readManagedMarker(stageDirectory, this.skillName)) {
        ownedStages.push(stageDirectory);
      }
    }
    await Promise.all(ownedStages.map((directory) =>
      rm(directory, { recursive: true, force: true })
    ));
    if (!await exists(this.targetDirectory)) {
      throw new Error(`Managed Skill recovery lost '${this.targetDirectory}'`);
    }
  }

  private result(
    outcome: ManagedSkillOutcome,
    fingerprint: string,
  ): ManagedSkillInstallation {
    return {
      outcome,
      targetDirectory: this.targetDirectory,
      identity: {
        packageName: this.options.packageIdentity.name,
        packageVersion: this.options.packageIdentity.version,
        skillName: this.skillName,
        fingerprint,
      },
    };
  }
}

export class ManagedSkillsInstaller {
  public constructor(private readonly options: ManagedSkillsInstallerOptions) {}

  public async install(): Promise<ManagedSkillsInstallation> {
    const sourceRoot = this.options.sourceRoot ?? resolveBundledSkillsRoot();
    const skills: ManagedSkillInstallation[] = [];
    for (const skillName of managedSkillNames) {
      skills.push(await new ManagedSkillInstaller({
        packageIdentity: this.options.packageIdentity,
        sourceDirectory: path.join(sourceRoot, skillName),
        ...(this.options.userHome ? { userHome: this.options.userHome } : {}),
        skillName,
      }).install());
    }
    return { skills };
  }
}

class AtomicDirectoryReplacer {
  public constructor(
    private readonly moveDirectory: (source: string, target: string) => Promise<void>,
  ) {}

  public async replace(
    sourceDirectory: string,
    targetDirectory: string,
    marker: ManagedSkillMarker,
  ): Promise<void> {
    const parentDirectory = path.dirname(targetDirectory);
    const stageDirectory = `${targetDirectory}.installing-${process.pid}-${randomUUID()}`;
    const backupDirectory = backupPath(targetDirectory);
    await mkdir(parentDirectory, { recursive: true });
    await rm(stageDirectory, { recursive: true, force: true });

    try {
      await cp(sourceDirectory, stageDirectory, { recursive: true });
      await writeFile(
        path.join(stageDirectory, installationMarkerName),
        `${JSON.stringify(marker, null, 2)}\n`,
        "utf8",
      );
      const targetExists = await exists(targetDirectory);
      if (await exists(backupDirectory)) {
        throw new Error(`Managed Skill recovery backup still exists at '${backupDirectory}'`);
      }
      if (targetExists) await this.moveDirectory(targetDirectory, backupDirectory);
      try {
        await this.moveDirectory(stageDirectory, targetDirectory);
      } catch (error) {
        if (!await exists(targetDirectory) && await exists(backupDirectory)) {
          await this.moveDirectory(backupDirectory, targetDirectory);
        }
        throw error;
      }
      await rm(backupDirectory, { recursive: true, force: true });
    } finally {
      await rm(stageDirectory, { recursive: true, force: true });
    }
  }
}

export function resolveBundledSkillDirectory(
  skillName: ManagedSkillName = primarySkillName,
): string {
  return path.join(resolveBundledSkillsRoot(), skillName);
}

function resolveBundledSkillsRoot(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDirectory, "..", "..", ".agents", "skills");
}

async function requireSkillIdentity(
  directory: string,
  description: string,
  skillName: ManagedSkillName,
): Promise<void> {
  let skillDocument: string;
  try {
    skillDocument = await readFile(path.join(directory, "SKILL.md"), "utf8");
  } catch {
    throw new Error(`The ${description} at '${directory}' has no SKILL.md`);
  }
  const nameLine = new RegExp(
    `^name:\\s*["']?${escapeRegularExpression(skillName)}["']?\\s*$`,
    "mu",
  );
  const frontmatter = /^---\r?\n([\s\S]*?)^---\s*$/mu.exec(skillDocument)?.[1];
  if (!frontmatter || !nameLine.test(frontmatter)) {
    throw new Error(`The ${description} at '${directory}' is not the '${skillName}' Skill`);
  }
}

async function readManagedMarker(
  directory: string,
  skillName: ManagedSkillName,
): Promise<ManagedSkillMarker | undefined> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(directory, installationMarkerName), "utf8"),
    ) as Record<string, unknown>;
    if (
      parsed.schemaVersion === 1
      && parsed.managedBy === managerName
      && typeof parsed.packageName === "string"
      && parsed.packageName.length > 0
      && typeof parsed.packageVersion === "string"
      && parsed.packageVersion.length > 0
      && parsed.skillName === skillName
      && typeof parsed.fingerprint === "string"
      && fingerprintPattern.test(parsed.fingerprint)
    ) {
      return {
        schemaVersion: 1,
        managedBy: managerName,
        packageName: parsed.packageName,
        packageVersion: parsed.packageVersion,
        skillName,
        fingerprint: parsed.fingerprint,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function markerMatches(current: ManagedSkillMarker, expected: ManagedSkillMarker): boolean {
  return current.packageName === expected.packageName
    && current.packageVersion === expected.packageVersion
    && current.skillName === expected.skillName
    && current.fingerprint === expected.fingerprint;
}

async function fingerprintSkill(directory: string): Promise<string> {
  const hash = createHash("sha256");
  const entries = await listFingerprintEntries(directory);
  for (const entry of entries) {
    hash.update(entry.relativePath);
    hash.update("\0");
    hash.update(entry.kind);
    hash.update("\0");
    hash.update(entry.contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

interface FingerprintEntry {
  readonly relativePath: string;
  readonly kind: "file" | "link" | "other";
  readonly contents: string | Buffer;
}

async function listFingerprintEntries(
  rootDirectory: string,
  directory = rootDirectory,
): Promise<readonly FingerprintEntry[]> {
  const result: FingerprintEntry[] = [];
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  for (const directoryEntry of directoryEntries) {
    const entryPath = path.join(directory, directoryEntry.name);
    const relativePath = path.relative(rootDirectory, entryPath).split(path.sep).join("/");
    if (relativePath === installationMarkerName) continue;
    if (directoryEntry.isDirectory()) {
      result.push(...await listFingerprintEntries(rootDirectory, entryPath));
      continue;
    }
    const status = await lstat(entryPath);
    if (status.isFile()) {
      result.push({ relativePath, kind: "file", contents: await readFile(entryPath) });
    } else if (status.isSymbolicLink()) {
      result.push({ relativePath, kind: "link", contents: await readlink(entryPath) });
    } else {
      result.push({ relativePath, kind: "other", contents: "" });
    }
  }
  return result.sort((left, right) => {
    if (left.relativePath < right.relativePath) return -1;
    return left.relativePath > right.relativePath ? 1 : 0;
  });
}

function backupPath(targetDirectory: string): string {
  return `${targetDirectory}.backup`;
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
