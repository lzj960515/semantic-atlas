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
const installationMarkerName = ".semantic-atlas-managed.json";

interface InstallationMarker {
  readonly version: string;
  readonly fingerprint: string;
}

export interface SkillInstallerOptions {
  readonly sourceDirectory?: string;
  readonly userHome?: string;
  readonly version: string;
}

export interface SkillInstallationResult {
  readonly outcome: "installed" | "updated" | "current";
  readonly targetDirectory: string;
  readonly removedLegacyDirectories: readonly string[];
}

export class SkillInstaller {
  readonly #sourceDirectory: string;
  readonly #targetDirectory: string;
  readonly #legacyDirectories: readonly string[];
  readonly #version: string;

  constructor(options: SkillInstallerOptions) {
    const userHome = options.userHome ?? homedir();
    this.#sourceDirectory = options.sourceDirectory ?? resolveBundledSkillDirectory();
    this.#targetDirectory = join(userHome, ".agents", "skills", skillName);
    this.#legacyDirectories = [join(userHome, ".codex", "skills", skillName)];
    this.#version = options.version;
  }

  async install(): Promise<SkillInstallationResult> {
    await requireSemanticAtlasSkill(this.#sourceDirectory, "bundled Skill");
    const targetExists = await exists(this.#targetDirectory);
    if (targetExists) {
      await requireSemanticAtlasSkill(this.#targetDirectory, "existing shared Skill");
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
    if (targetCurrent && existingLegacyDirectories.length === 0) {
      return {
        outcome: "current",
        targetDirectory: this.#targetDirectory,
        removedLegacyDirectories: [],
      };
    }

    await this.installAtomically({ version: this.#version, fingerprint: sourceFingerprint });
    for (const directory of existingLegacyDirectories) {
      await rm(directory, { recursive: true, force: true });
    }
    return {
      outcome: targetExists ? "updated" : "installed",
      targetDirectory: this.#targetDirectory,
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

  private async installAtomically(marker: InstallationMarker): Promise<void> {
    const parent = dirname(this.#targetDirectory);
    const token = `${process.pid}-${randomUUID()}`;
    const temporary = `${this.#targetDirectory}.installing-${token}`;
    const backup = `${this.#targetDirectory}.backup-${token}`;
    const targetExists = await exists(this.#targetDirectory);
    await mkdir(parent, { recursive: true });
    await rm(temporary, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    await cp(this.#sourceDirectory, temporary, { recursive: true });
    await writeFile(
      join(temporary, installationMarkerName),
      `${JSON.stringify(marker, null, 2)}\n`,
      "utf8",
    );

    if (targetExists) {
      await rename(this.#targetDirectory, backup);
    }
    try {
      await rename(temporary, this.#targetDirectory);
    } catch (error) {
      if (targetExists) {
        await rename(backup, this.#targetDirectory);
      }
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
  }
}

export function resolveBundledSkillDirectory(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return join(moduleDirectory, "..", "..", ".agents", "skills", skillName);
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
  let contents: string;
  try {
    contents = await readFile(join(directory, "SKILL.md"), "utf8");
  } catch {
    throw new Error(`Refusing to replace ${description} at ${directory}: SKILL.md is missing`);
  }
  if (!/^---\r?\n[\s\S]*?^name:\s*["']?semantic-atlas["']?\s*$[\s\S]*?^---\s*$/mu.test(contents)) {
    throw new Error(`Refusing to replace unrelated Skill at ${directory}`);
  }
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
