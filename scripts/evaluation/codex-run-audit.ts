import type { EvaluationRun } from "../../src/evaluation/contracts.js";

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
  readonly atlasCalls: EvaluationRun["observations"]["atlasCalls"];
}

const SOURCE_OBSERVER_MARKERS = [
  "$EVALUATION_OBSERVER",
  "evaluation-source-observer.mjs",
];

const EXTERNAL_INSTRUCTION_MARKERS = [
  "/.agents/skills/",
  "/.codex/skills/",
  "/.codex/plugins/",
];

const DIRECT_SOURCE_COMMANDS = [
  /\b(?:cat|sed|head|tail|less|more|awk|perl|python\d*|ruby)\b/u,
  /\b(?:grep|git\s+(?:show|diff|grep|blame))\b/u,
  /\bnode\s+(?:--eval|-e)\b/u,
];

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
  const atlasCommands = commands.flatMap(extractAtlasCommand);
  if (mode === "no-atlas" && atlasCommands.length > 0) {
    throw new Error("A no-atlas run invoked Semantic Atlas");
  }
  for (const command of commands) {
    requireObservedSourceAccess(command);
  }

  return {
    commandCount: commands.length,
    atlasCalls: atlasCommands.map((command, index) => ({
      sequence: index + 1,
      command,
    })),
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

function extractAtlasCommand(command: string): string[] {
  const match = command.match(/semantic-atlas\s+(?:(?:--repo|--pretty)\s+(?:'[^']*'|"[^"]*"|\S+)\s+)*(?:status|index|map|changes|learn)\b[^;&|]*/u);
  if (match === null) return [];
  return [match[0]!.replace(/["']+$/u, "").trim()];
}

function requireObservedSourceAccess(command: string): void {
  const composesShellCommands = /[;&|]/u.test(command);
  if (
    !composesShellCommands
    && SOURCE_OBSERVER_MARKERS.some((marker) => command.includes(marker))
  ) return;
  if (
    !composesShellCommands
    && EXTERNAL_INSTRUCTION_MARKERS.some((marker) => command.includes(marker))
  ) return;
  const usesRipgrep = /\brg\b/u.test(command);
  const ripgrepSegments = command
    .split(/[;&|]+/u)
    .filter((segment) => /\brg\b/u.test(segment));
  const listsFilesOnly = ripgrepSegments.length > 0
    && ripgrepSegments.every((segment) => /\brg\b[^;&|]*\s--files(?:\s|['"]|$)/u.test(segment));
  const expandsListedFiles = /\b(?:xargs|cat|awk|perl|python\d*|ruby)\b/u.test(command);
  if (listsFilesOnly && !expandsListedFiles) return;
  if (usesRipgrep) {
    throw new Error(`Fresh Agent command produced unobserved source output: ${command}`);
  }
  if (DIRECT_SOURCE_COMMANDS.some((pattern) => pattern.test(command))) {
    throw new Error(`Fresh Agent command produced unobserved source output: ${command}`);
  }
}
