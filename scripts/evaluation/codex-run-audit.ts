import { parseCliArguments } from "../../src/cli/argument-parser.js";
import type { EvaluationRun } from "../../src/evaluation/contracts.js";
import type { SkillLoad } from "./skill-trace.js";

interface CodexCommandEvent {
  readonly type: "item.completed";
  readonly item: {
    readonly type: "command_execution";
    readonly command: string;
    readonly exit_code: number | null;
  };
}

interface CodexTurnCompletedEvent {
  readonly type: "turn.completed";
}

export interface CodexRunAudit {
  readonly commandCount: number;
  readonly commands: string[];
  readonly atlasCalls: EvaluationRun["observations"]["atlasCalls"];
}

export interface FreshAgentSkillDiscoveryAudit {
  readonly delivery: "repository";
  readonly promptInjection: false;
  readonly mainSkillLoaded: true;
  readonly statusBeforeSource: true;
  readonly mapBeforeSource: true;
  readonly decisiveSourceRead: true;
}

type CommandKind =
  | "atlas"
  | "command-lookup"
  | "file-list"
  | "file-list-filter"
  | "observer"
  | "observer-environment"
  | "true";

type ShellOperator = "&&" | "||" | ";" | "|" | "newline";

interface ShellCommand {
  readonly text: string;
  readonly operatorBefore: ShellOperator | null;
}

const EXTERNAL_INSTRUCTION_MARKERS = [
  "/.agents/skills/",
  "/.codex/skills/",
  "/.codex/plugins/",
  "/etc/codex/skills/",
];

const COMMAND_LOOKUP_TARGETS = new Set([
  "$EVALUATION_OBSERVER",
  "atlas",
  "semantic-atlas",
]);

const FIXTURE_LOCAL_ATLAS_COMMANDS = new Set([
  "status",
  "changes",
  "map.roots",
  "map.children",
  "map.search",
  "map.show",
]);

const EVALUATION_OBSERVER_PARAMETER = "$EVALUATION_OBSERVER";
const UNQUOTED_WORD_GENERATION_CHARACTERS = new Set([
  "!",
  "#",
  "(",
  ")",
  "*",
  "?",
  "[",
  "]",
  "^",
  "{",
  "}",
  "~",
]);

export function auditCodexRun(
  mode: EvaluationRun["mode"],
  jsonLines: string,
): CodexRunAudit {
  const events = jsonLines
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
  if (!events.some(isTurnCompletedEvent)) {
    throw new Error("Fresh Agent Codex turn did not complete");
  }
  if (events.some(isFileChangeEvent)) {
    throw new Error("Fresh Agent modified the fixture");
  }

  const commands = events.filter(isCompletedCommandEvent).map((event) => event.item.command);
  return auditCodexCommands(mode, commands);
}

export function auditCodexCommands(
  mode: EvaluationRun["mode"],
  commands: readonly string[],
): CodexRunAudit {
  const atlasCommands: string[] = [];
  for (const command of commands) {
    atlasCommands.push(...auditShellCommand(command));
  }
  if (mode === "no-atlas" && atlasCommands.length > 0) {
    throw new Error("A no-atlas run invoked Semantic Atlas");
  }

  return {
    commandCount: commands.length,
    commands: [...commands],
    atlasCalls: atlasCommands.map((command, index) => ({
      sequence: index + 1,
      command,
    })),
  };
}

export function auditFreshAgentSkillDiscovery(
  commands: readonly string[],
  skillLoads: readonly SkillLoad[],
): FreshAgentSkillDiscoveryAudit {
  if (skillLoads[0]?.file !== ".agents/skills/semantic-atlas/SKILL.md") {
    throw new Error("Fresh Agent did not load the discovered Semantic Atlas Skill");
  }

  const operations = commands.flatMap(parseAuditedShellCommand);
  const skillIndex = operations.findIndex((operation) => (
    operation.kind === "observer" && isCandidateSkillRead(operation.words)
  ));
  const statusIndex = operations.findIndex((operation) => (
    operation.kind === "atlas" && atlasCommandName(operation.words) === "status"
  ));
  const mapIndex = operations.findIndex((operation) => (
    operation.kind === "atlas" && atlasCommandName(operation.words).startsWith("map.")
  ));
  const sourceIndex = operations.findIndex((operation) => (
    operation.kind === "observer" && !isCandidateSkillRead(operation.words)
  ));

  if (skillIndex < 0 || statusIndex < 0 || skillIndex >= statusIndex) {
    throw new Error("Fresh Agent must load the repository Skill before Atlas status");
  }
  if (statusIndex < 0 || sourceIndex < 0 || statusIndex >= sourceIndex) {
    throw new Error("Fresh Agent must run Atlas status before opening source");
  }
  if (mapIndex < 0 || mapIndex >= sourceIndex) {
    throw new Error("Fresh Agent must use an Atlas map query before opening source");
  }

  return {
    delivery: "repository",
    promptInjection: false,
    mainSkillLoaded: true,
    statusBeforeSource: true,
    mapBeforeSource: true,
    decisiveSourceRead: true,
  };
}

function isCompletedCommandEvent(event: unknown): event is CodexCommandEvent {
  return typeof event === "object"
    && event !== null
    && "type" in event
    && event.type === "item.completed"
    && "item" in event
    && typeof event.item === "object"
    && event.item !== null
    && "type" in event.item
    && event.item.type === "command_execution"
    && "command" in event.item
    && typeof event.item.command === "string";
}

function isTurnCompletedEvent(event: unknown): event is CodexTurnCompletedEvent {
  return typeof event === "object"
    && event !== null
    && "type" in event
    && event.type === "turn.completed";
}

function isFileChangeEvent(event: unknown): boolean {
  return typeof event === "object"
    && event !== null
    && "type" in event
    && event.type === "item.completed"
    && "item" in event
    && typeof event.item === "object"
    && event.item !== null
    && "type" in event.item
    && event.item.type === "file_change";
}

function auditShellCommand(command: string): string[] {
  if (EXTERNAL_INSTRUCTION_MARKERS.some((marker) => command.includes(marker))) {
    throw new Error(`Fresh Agent command read an external instruction: ${command}`);
  }

  try {
    return parseAuditedShellCommand(command).flatMap((operation) => (
      operation.kind === "atlas" ? [operation.text] : []
    ));
  } catch (error) {
    throw commandPolicyError(command, error);
  }
}

function parseAuditedShellCommand(command: string): readonly {
  readonly text: string;
  readonly kind: CommandKind;
  readonly words: readonly string[];
}[] {
  const script = unwrapCodexShellCommand(command);
  rejectShellWordGeneration(script);
  const shellCommands = splitShellCommands(script);
  const operations = shellCommands.map((shellCommand) => {
    const words = parseShellWords(shellCommand.text);
    return {
      text: shellCommand.text.trim(),
      kind: classifyCommand(words),
      words,
      operatorBefore: shellCommand.operatorBefore,
    };
  });
  for (const [index, operation] of operations.entries()) {
    validateComposition(
      operation.operatorBefore,
      operations[index - 1]?.kind,
      operation.kind,
    );
  }
  return operations;
}

function atlasCommandName(words: readonly string[]): string {
  if (words[0] !== "semantic-atlas") return "";
  return parseCliArguments(words.slice(1), ".").command.name;
}

function isCandidateSkillRead(words: readonly string[]): boolean {
  const offset = words[0] === "node" ? 1 : 0;
  return words[offset] === EVALUATION_OBSERVER_PARAMETER
    && words[offset + 1] === "read"
    && /^\.agents\/skills\/semantic-atlas\//u.test(words[offset + 2] ?? "");
}

function rejectShellWordGeneration(script: string): void {
  let quote: "single" | "double" | null = null;
  let escaped = false;
  let wordStarted = false;

  for (let index = 0; index < script.length; index += 1) {
    const character = script[index]!;
    if (escaped) {
      escaped = false;
      wordStarted = true;
      continue;
    }
    if (character === "\\" && quote !== "single") {
      escaped = true;
      wordStarted = true;
      continue;
    }
    if (character === "'" && quote !== "double") {
      quote = quote === "single" ? null : "single";
      wordStarted = true;
      continue;
    }
    if (character === '"' && quote !== "single") {
      quote = quote === "double" ? null : "double";
      wordStarted = true;
      continue;
    }
    if (quote === "single") continue;
    if (character === "$") {
      if (!script.startsWith(EVALUATION_OBSERVER_PARAMETER, index)) {
        throw new Error("shell parameter, command, and arithmetic expansion are not allowed");
      }
      const nextCharacter = script[index + EVALUATION_OBSERVER_PARAMETER.length];
      if (nextCharacter !== undefined && /[A-Za-z0-9_]/u.test(nextCharacter)) {
        throw new Error("only the evaluation observer parameter may be expanded");
      }
      index += EVALUATION_OBSERVER_PARAMETER.length - 1;
      wordStarted = true;
      continue;
    }
    if (quote === "double") continue;
    if (/\s/u.test(character) || character === ";" || character === "|" || character === "&") {
      wordStarted = false;
      continue;
    }
    if ((character === "=" && !wordStarted)
      || UNQUOTED_WORD_GENERATION_CHARACTERS.has(character)) {
      throw new Error("shell word generation is not allowed");
    }
    wordStarted = true;
  }
}

function unwrapCodexShellCommand(command: string): string {
  const words = parseShellWords(command);
  if (words.length !== 3 || words[0] !== "/bin/zsh" || words[1] !== "-lc") {
    throw new Error("expected the Codex /bin/zsh -lc wrapper");
  }
  return words[2]!;
}

function splitShellCommands(script: string): readonly ShellCommand[] {
  const commands: ShellCommand[] = [];
  let current = "";
  let quote: "single" | "double" | null = null;
  let escaped = false;
  let nextOperator: ShellOperator | null = null;

  const finishCommand = (operator: ShellOperator): void => {
    if (current.trim().length > 0) {
      commands.push({ text: current.trim(), operatorBefore: nextOperator });
      current = "";
    }
    nextOperator = operator;
  };

  for (let index = 0; index < script.length; index += 1) {
    const character = script[index]!;
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "single") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === "'" && quote !== "double") {
      quote = quote === "single" ? null : "single";
      current += character;
      continue;
    }
    if (character === '"' && quote !== "single") {
      quote = quote === "double" ? null : "double";
      current += character;
      continue;
    }
    if (quote !== null) {
      if (quote === "double" && character === "$" && script[index + 1] === "(") {
        throw new Error("command substitution is not allowed");
      }
      if (quote === "double" && character === "`") {
        throw new Error("command substitution is not allowed");
      }
      current += character;
      continue;
    }
    if (character === "$" && script[index + 1] === "(") {
      throw new Error("command substitution is not allowed");
    }
    if (character === "`" || character === "<" || character === ">") {
      throw new Error("redirection and command substitution are not allowed");
    }
    if (character === "\n") {
      finishCommand("newline");
      continue;
    }
    if (character === ";") {
      finishCommand(";");
      continue;
    }
    if (character === "&") {
      if (script[index + 1] !== "&") throw new Error("background commands are not allowed");
      finishCommand("&&");
      index += 1;
      continue;
    }
    if (character === "|") {
      if (script[index + 1] === "|") {
        finishCommand("||");
        index += 1;
      } else {
        finishCommand("|");
      }
      continue;
    }
    current += character;
  }
  if (quote !== null || escaped) throw new Error("shell quoting is incomplete");
  if (current.trim().length > 0) {
    commands.push({ text: current.trim(), operatorBefore: nextOperator });
  }
  if (commands.length === 0) throw new Error("empty shell command");
  return commands;
}

function classifyCommand(words: readonly string[]): CommandKind {
  if (isObserverCommand(words)) return "observer";
  if (isAtlasCommand(words)) return "atlas";
  if (isFileListing(words)) return "file-list";
  if (isFileListingFilter(words)) return "file-list-filter";
  if (words.length === 3 && words[0] === "command" && words[1] === "-v"
    && COMMAND_LOOKUP_TARGETS.has(words[2]!)) return "command-lookup";
  if (words.length === 2 && words[0] === "printenv" && words[1] === "EVALUATION_OBSERVER") {
    return "observer-environment";
  }
  if (words.length === 3 && words[0] === "printf" && words[1] === "%s\\n"
    && words[2] === "$EVALUATION_OBSERVER") return "observer-environment";
  if (words.length === 1 && words[0] === "true") return "true";
  throw new Error("unsupported command");
}

function isObserverCommand(words: readonly string[]): boolean {
  const offset = words[0] === "node" ? 1 : 0;
  if (words[offset] !== "$EVALUATION_OBSERVER") return false;
  const operation = words[offset + 1];
  if (operation === "read") {
    const path = words[offset + 2];
    const lineValues = words.slice(offset + 3);
    return path !== undefined
      && isFixturePath(path)
      && lineValues.length <= 2
      && lineValues.every((value) => /^\d+$/u.test(value));
  }
  if (operation === "search") {
    const pattern = words[offset + 2];
    const paths = words.slice(offset + 3);
    return pattern !== undefined
      && pattern.length > 0
      && paths.every(isFixturePath);
  }
  return false;
}

function isAtlasCommand(words: readonly string[]): boolean {
  if (words[0] !== "semantic-atlas") return false;
  const arguments_ = words.slice(1);
  if (arguments_.includes("--repo")) return false;
  try {
    const invocation = parseCliArguments(arguments_, ".");
    return FIXTURE_LOCAL_ATLAS_COMMANDS.has(invocation.command.name);
  } catch {
    return false;
  }
}

function isFileListing(words: readonly string[]): boolean {
  if (words[0] !== "rg" || words[1] !== "--files") return false;
  for (let index = 2; index < words.length; index += 2) {
    if (!["-g", "--glob"].includes(words[index] ?? "") || words[index + 1] === undefined) {
      return false;
    }
  }
  return true;
}

function isFileListingFilter(words: readonly string[]): boolean {
  return words.length === 3
    && words[0] === "sed"
    && words[1] === "-n"
    && /^\d+,\d+p$/u.test(words[2] ?? "");
}

function isFixturePath(value: string): boolean {
  return !value.startsWith("/")
    && !value.split("/").includes("..");
}

function validateComposition(
  operator: ShellOperator | null,
  previous: CommandKind | undefined,
  current: CommandKind,
): void {
  if (operator === null) {
    if (current === "file-list-filter" || current === "true") throw new Error("orphan helper command");
    return;
  }
  if (operator === "|") {
    if (previous !== "file-list" || current !== "file-list-filter") {
      throw new Error("only file-name listing may be piped through sed");
    }
    return;
  }
  if (operator === "||") {
    if (previous !== "command-lookup" || current !== "true") {
      throw new Error("only command lookup may fall back to true");
    }
    return;
  }
  if (current === "file-list-filter" || current === "true") throw new Error("orphan helper command");
}

function parseShellWords(value: string): readonly string[] {
  const words: string[] = [];
  let current = "";
  let active = false;
  let quote: "single" | "double" | null = null;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      active = true;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "single") {
      escaped = true;
      active = true;
      continue;
    }
    if (character === "'" && quote !== "double") {
      quote = quote === "single" ? null : "single";
      active = true;
      continue;
    }
    if (character === '"' && quote !== "single") {
      quote = quote === "double" ? null : "double";
      active = true;
      continue;
    }
    if (/\s/u.test(character) && quote === null) {
      if (active) words.push(current);
      current = "";
      active = false;
      continue;
    }
    current += character;
    active = true;
  }
  if (quote !== null || escaped) throw new Error("shell quoting is incomplete");
  if (active) words.push(current);
  return words;
}

function commandPolicyError(command: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`Fresh Agent command is not allowed by the evaluation command policy: ${command} (${detail})`);
}
