import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const SKILL_EXCLUDE = ".agents/skills/";

export function buildFreshAgentInstructions(taskPrompt: string): string {
  return [
    "This is one measured Fresh Agent repository-understanding run.",
    "Treat the current working directory as the resolved exact fixture root.",
    "Follow the repository instructions and use only the source observer for source text.",
    "The oracle and paired run are unavailable. Inspect only the fixture, the provided observer, and available CLI.",
    "This comparative case is read-only: do not change source or generated analysis state. Record knowledgeCaptureDecision as persist for new durable verified knowledge, reuse for already represented knowledge, transient for one-off context, or unverified when evidence is insufficient. State a persist decision without submitting the patch.",
    "List every file and qualified symbol that materially supports the answer.",
    "Use atlasHandling to record each stale, hypothesis, unknown, unsupported, partial, or insufficient Atlas result and its source fallback; use [] when none applies or Atlas is unavailable.",
    `Task: ${taskPrompt}`,
  ].join("\n");
}

export async function installCandidateSkill(
  sourceSkillRoot: string,
  repositoryRoot: string,
): Promise<string> {
  const repository = resolve(repositoryRoot);
  const targetRoot = join(repository, ".agents", "skills", "semantic-atlas");
  await mkdir(dirname(targetRoot), { recursive: true });
  await cp(sourceSkillRoot, targetRoot, { recursive: true });
  await ignoreInstalledSkill(repository);
  return join(targetRoot, "SKILL.md");
}

async function ignoreInstalledSkill(repositoryRoot: string): Promise<void> {
  const result = await executeFile("git", ["rev-parse", "--git-path", "info/exclude"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const excludePath = resolve(repositoryRoot, result.stdout.trim());
  const existing = await readFile(excludePath, "utf8").catch(() => "");
  const entries = existing.split(/\r?\n/u);
  if (entries.includes(SKILL_EXCLUDE)) return;

  await mkdir(dirname(excludePath), { recursive: true });
  const prefix = existing.length === 0 || existing.endsWith("\n") ? existing : `${existing}\n`;
  await writeFile(excludePath, `${prefix}${SKILL_EXCLUDE}\n`);
}
