import { readPackageVersion } from "../package-metadata.js";
import { SemanticAtlasPackageUpgrader } from "../setup/package-upgrader.js";
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
  feedback report --stdin              Record confirmed product friction

Installation and information:
  insights summary [--period period]  Summarize local Atlas product signals
  insights feedback [options]          List local Agent feedback reports
  insights feedback update --stdin     Record a feedback triage decision
  setup                               Install or update the bundled user Skills
  upgrade                             Install the latest release and sync its Skills
  -h, --help                          Show this help
  --version                           Print the installed package version

Global project options:
  --repo <path>                       Select a Git worktree (default: cwd)
  --pretty                            Indent JSON project or insights output
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
        ? "Semantic Atlas Skills are already current at"
        : result.outcome === "installed"
          ? "Installed Semantic Atlas Skills at"
          : "Updated Semantic Atlas Skills at";
      io.stdout.write(`${action} ${result.targetDirectory}\n`);
      io.stdout.write(`Semantic Atlas Insights Skill is synchronized at ${result.insightsTargetDirectory}\n`);
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
  if (command === "upgrade") {
    if (rest.length > 0) {
      io.stderr.write("semantic-atlas upgrade does not accept arguments.\n");
      return 2;
    }
    try {
      const currentVersion = await readPackageVersion();
      io.stdout.write("Checking the latest stable Semantic Atlas release...\n");
      const result = await new SemanticAtlasPackageUpgrader({ currentVersion }).upgrade();
      if (result.outcome === "current") {
        io.stdout.write(`Semantic Atlas ${result.targetVersion} is already current.\n`);
        io.stdout.write(`Semantic Atlas Skills are synchronized at ${result.skillDirectory}\n`);
      } else {
        io.stdout.write(
          `Upgraded Semantic Atlas from ${result.previousVersion} to ${result.targetVersion}.\n`,
        );
        io.stdout.write(`Semantic Atlas Skills are synchronized at ${result.skillDirectory}\n`);
      }
      return 0;
    } catch (error) {
      io.stderr.write(
        `Semantic Atlas upgrade failed: ${error instanceof Error ? error.message : String(error)}\n`,
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
