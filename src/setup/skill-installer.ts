import { createHash, randomUUID } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const skillName = "semantic-atlas";
const insightsSkillName = "semantic-atlas-insights";
const installationMarkerName = ".semantic-atlas-managed.json";

interface InstallationMarker {
  readonly version: string;
  readonly fingerprint: string;
}

export interface SkillInstallerOptions {
  readonly sourceDirectory?: string;
  readonly insightsSourceDirectory?: string;
  readonly userHome?: string;
  readonly version: string;
}

export interface SkillInstallationResult {
  readonly outcome: "installed" | "updated" | "current";
  readonly targetDirectory: string;
  readonly insightsTargetDirectory: string;
  readonly removedLegacyDirectories: readonly string[];
}

export class SkillInstaller {
  readonly #sourceDirectory: string;
  readonly #targetDirectory: string;
  readonly #insightsSourceDirectory: string;
  readonly #insightsTargetDirectory: string;
  readonly #legacyDirectories: readonly string[];
  readonly #version: string;

  constructor(options: SkillInstallerOptions) {
    const userHome = options.userHome ?? homedir();
    this.#sourceDirectory = options.sourceDirectory ?? resolveBundledSkillDirectory();
    this.#targetDirectory = join(userHome, ".agents", "skills", skillName);
    this.#insightsSourceDirectory = options.insightsSourceDirectory
      ?? resolveBundledSkillDirectory(insightsSkillName);
    this.#insightsTargetDirectory = join(userHome, ".agents", "skills", insightsSkillName);
    this.#legacyDirectories = [join(userHome, ".codex", "skills", skillName)];
    this.#version = options.version;
  }

  async install(): Promise<SkillInstallationResult> {
    await requireSemanticAtlasSkill(this.#sourceDirectory, "bundled Skill");
    await requireManagedSkill(this.#insightsSourceDirectory, insightsSkillName, "bundled insights Skill");
    const targetExists = await exists(this.#targetDirectory);
    if (targetExists) {
      await requireSemanticAtlasSkill(this.#targetDirectory, "existing shared Skill");
    }
    const insightsTargetExists = await exists(this.#insightsTargetDirectory);
    if (insightsTargetExists) {
      await requireManagedSkill(
        this.#insightsTargetDirectory,
        insightsSkillName,
        "existing shared insights Skill",
      );
    }
    const existingLegacyDirectories = await this.existingLegacyDirectories();
    for (const directory of existingLegacyDirectories) {
      await requireSemanticAtlasSkill(directory, "legacy Codex Skill");
    }

    const sourceFingerprint = await fingerprintSkill(this.#sourceDirectory);
    const targetCurrent = targetExists
      && await installedSkillIsCurrent(
        this.#targetDirectory,
        this.#version,
        sourceFingerprint,
      );
    if (!targetCurrent || existingLegacyDirectories.length > 0) {
      await installSkillAtomically(
        this.#sourceDirectory,
        this.#targetDirectory,
        { version: this.#version, fingerprint: sourceFingerprint },
      );
    }

    const insights = await installManagedSkill({
      sourceDirectory: this.#insightsSourceDirectory,
      targetDirectory: this.#insightsTargetDirectory,
      version: this.#version,
    });
    for (const directory of existingLegacyDirectories) {
      await rm(directory, { recursive: true, force: true });
    }
    return {
      outcome: targetCurrent && insights === "current" && existingLegacyDirectories.length === 0
        ? "current"
        : targetExists || insightsTargetExists
          ? "updated"
          : "installed",
      targetDirectory: this.#targetDirectory,
      insightsTargetDirectory: this.#insightsTargetDirectory,
      removedLegacyDirectories: existingLegacyDirectories,
    };
  }

  private async existingLegacyDirectories(): Promise<string[]> {
    const result: string[] = [];
    for (const directory of this.#legacyDirectories) {
      if (await exists(directory)) {
        result.push(directory);
      }
    }
    return result;
  }

}

export function resolveBundledSkillDirectory(name = skillName): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return join(moduleDirectory, "..", "..", ".agents", "skills", name);
}

async function installedSkillIsCurrent(
  directory: string,
  version: string,
  sourceFingerprint: string,
): Promise<boolean> {
  const marker = await readInstallationMarker(join(directory, installationMarkerName));
  if (marker?.version !== version || marker.fingerprint !== sourceFingerprint) {
    return false;
  }
  return await fingerprintSkill(directory) === sourceFingerprint;
}

async function requireSemanticAtlasSkill(directory: string, description: string): Promise<void> {
  return requireManagedSkill(directory, skillName, description);
}

async function requireManagedSkill(directory: string, name: string, description: string): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(join(directory, "SKILL.md"), "utf8");
  } catch {
    throw new Error(`Refusing to replace ${description} at ${directory}: SKILL.md is missing`);
  }
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const namePattern = new RegExp(
    `^---\\r?\\n[\\s\\S]*?^name:\\s*["']?${escapedName}["']?\\s*$[\\s\\S]*?^---\\s*$`,
    "mu",
  );
  if (!namePattern.test(contents)) {
    throw new Error(`Refusing to replace unrelated Skill at ${directory}`);
  }
}

async function installManagedSkill(options: {
  readonly sourceDirectory: string;
  readonly targetDirectory: string;
  readonly version: string;
}): Promise<"installed" | "updated" | "current"> {
  const targetExists = await exists(options.targetDirectory);
  const fingerprint = await fingerprintSkill(options.sourceDirectory);
  const current = targetExists && await installedSkillIsCurrent(
    options.targetDirectory,
    options.version,
    fingerprint,
  );
  if (current) return "current";
  await installSkillAtomically(options.sourceDirectory, options.targetDirectory, {
    version: options.version,
    fingerprint,
  });
  return targetExists ? "updated" : "installed";
}

async function installSkillAtomically(
  sourceDirectory: string,
  targetDirectory: string,
  marker: InstallationMarker,
): Promise<void> {
  const parent = dirname(targetDirectory);
  const token = `${process.pid}-${randomUUID()}`;
  const temporary = `${targetDirectory}.installing-${token}`;
  const backup = `${targetDirectory}.backup-${token}`;
  const targetExists = await exists(targetDirectory);
  await mkdir(parent, { recursive: true });
  await rm(temporary, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });
  await cp(sourceDirectory, temporary, { recursive: true });
  await writeFile(
    join(temporary, installationMarkerName),
    `${JSON.stringify(marker, null, 2)}\n`,
    "utf8",
  );

  if (targetExists) await rename(targetDirectory, backup);
  try {
    await rename(temporary, targetDirectory);
  } catch (error) {
    if (targetExists) await rename(backup, targetDirectory);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

async function readInstallationMarker(path: string): Promise<InstallationMarker | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<InstallationMarker>;
    return typeof parsed.version === "string" && /^[a-f0-9]{64}$/u.test(parsed.fingerprint ?? "")
      ? { version: parsed.version, fingerprint: parsed.fingerprint! }
      : undefined;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    return undefined;
  }
}

async function fingerprintSkill(directory: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of await listFiles(directory)) {
    const relativePath = relative(directory, path);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function listFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === installationMarkerName) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...await listFiles(path));
    } else {
      result.push(path);
    }
  }
  return result.sort();
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  });
}
