import { readPackageVersion } from "../package-metadata.js";
import { SkillInstaller } from "../setup/skill-installer.js";
import type { CliIo } from "./types.js";

const helpText = `Usage: semantic-atlas <command> [options]

Project understanding:
  status                              Report Atlas state and freshness
  index                               Publish the current project world
  map view [business-key]             View or zoom into business regions
  map search <business-term>          Search learned business vocabulary
  map show <business-key>             Show one business concept and evidence
  code search <structural-term>       Find bounded structural source evidence
  learn --stdin                       Apply one GraphPatch JSON value
  changes [--from id] [--to id]       Report semantic changes

Installation and information:
  setup                               Install or update the bundled user Skill
  -h, --help                          Show this help
  --version                           Print the installed package version

Global project options:
  --repo <path>                       Select a Git worktree (default: cwd)
  --pretty                            Indent JSON project-command output
`;

export async function runStandaloneCli(
  arguments_: readonly string[],
  io: CliIo,
): Promise<number | undefined> {
  const [command, ...rest] = arguments_;
  if (command === "help" || command === "--help" || command === "-h") {
    return writeArgumentFreeResult(rest, io, () => helpText);
  }
  if (command === "version" || command === "--version" || command === "-v") {
    return writeArgumentFreeResult(rest, io, async () => `${await readPackageVersion()}\n`);
  }
  if (command === "setup") {
    if (rest.length > 0) {
      io.stderr.write("semantic-atlas setup does not accept arguments.\n");
      return 2;
    }
    try {
      const version = await readPackageVersion();
      const result = await new SkillInstaller({ version }).install();
      const action = result.outcome === "current"
        ? "Semantic Atlas Skill is already current at"
        : result.outcome === "installed"
          ? "Installed Semantic Atlas Skill at"
          : "Updated Semantic Atlas Skill at";
      io.stdout.write(`${action} ${result.targetDirectory}\n`);
      for (const directory of result.removedLegacyDirectories) {
        io.stdout.write(`Removed legacy Semantic Atlas Skill at ${directory}\n`);
      }
      return 0;
    } catch (error) {
      io.stderr.write(
        `Semantic Atlas setup failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return 1;
    }
  }
  return undefined;
}

async function writeArgumentFreeResult(
  rest: readonly string[],
  io: CliIo,
  contents: () => string | Promise<string>,
): Promise<number> {
  if (rest.length > 0) {
    io.stderr.write("The command does not accept arguments.\n");
    return 2;
  }
  io.stdout.write(await contents());
  return 0;
}
