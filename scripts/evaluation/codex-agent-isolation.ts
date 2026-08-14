import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DISABLED_CODEX_FEATURES = [
  "plugins",
  "remote_plugin",
  "apps",
  "hooks",
  "skill_search",
] as const;

const MCP_SERVER_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;

export function buildCodexIsolationArguments(
  hostSkillFiles: readonly string[],
  mcpServerIds: readonly string[],
): readonly string[] {
  const arguments_: string[] = ["--ignore-rules"];
  for (const feature of DISABLED_CODEX_FEATURES) {
    arguments_.push("--disable", feature);
  }
  for (const serverId of [...new Set(mcpServerIds)].sort()) {
    if (!MCP_SERVER_ID_PATTERN.test(serverId)) {
      throw new Error(`Unsupported Codex MCP server ID: ${serverId}`);
    }
    arguments_.push(
      "--config",
      `mcp_servers.${serverId}.enabled=false`,
    );
  }
  const skills = [...new Set(hostSkillFiles)].sort();
  if (skills.length > 0) {
    const config = skills
      .map((path) => `{path=${JSON.stringify(path)},enabled=false}`)
      .join(",");
    arguments_.push("--config", `skills.config=[${config}]`);
  }
  return arguments_;
}

export async function discoverHostSkillFiles(): Promise<readonly string[]> {
  const userHome = homedir();
  const codexHome = process.env.CODEX_HOME ?? join(userHome, ".codex");
  const roots = [
    join(userHome, ".agents", "skills"),
    join(codexHome, "skills"),
    "/etc/codex/skills",
  ];
  const skillFiles = new Set<string>();
  const visitedDirectories = new Set<string>();
  for (const root of roots) {
    await collectSkillFiles(root, skillFiles, visitedDirectories);
  }
  return [...skillFiles].sort();
}

async function collectSkillFiles(
  directory: string,
  skillFiles: Set<string>,
  visitedDirectories: Set<string>,
): Promise<void> {
  const resolvedDirectory = await realpath(directory).catch(() => undefined);
  if (resolvedDirectory === undefined || visitedDirectories.has(resolvedDirectory)) return;
  visitedDirectories.add(resolvedDirectory);

  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.name === "SKILL.md") {
      skillFiles.add(path);
      continue;
    }
    if (entry.isDirectory()) {
      await collectSkillFiles(path, skillFiles, visitedDirectories);
      continue;
    }
    if (entry.isSymbolicLink() && (await stat(path).catch(() => undefined))?.isDirectory()) {
      await collectSkillFiles(path, skillFiles, visitedDirectories);
    }
  }
}
