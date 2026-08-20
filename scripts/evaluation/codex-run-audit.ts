import { isDeepStrictEqual } from "node:util";

import { parseCliArguments } from "../../src/cli/argument-parser.js";
import type {
  EvaluationCase,
  EvaluationRun,
} from "../../src/evaluation/contracts.js";
import type { SkillLoad } from "./skill-trace.js";

interface CodexCommandEvent {
  readonly type: "item.completed";
  readonly item: {
    readonly type: "command_execution";
    readonly command: string;
    readonly aggregated_output?: string;
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
  readonly sourceCommands: readonly SourceCommandEvidence[];
}

interface SourceCommandEvidence {
  readonly commandSequence: number;
  readonly exitCode: number;
  readonly files: readonly string[];
}

export interface FreshAgentSkillDiscoveryAudit {
  readonly delivery: "repository";
  readonly promptInjection: false;
  readonly mainSkillLoaded: true;
  readonly statusBeforeSource: true;
  readonly mapBeforeSource: true;
  readonly decisiveSourceRead: true;
  readonly decisiveSourceFiles: string[];
  readonly knowledgeCaptureDecision: KnowledgeCaptureDecision;
  readonly conditionalReferences: {
    readonly snapshotBootstrap: ConditionalReferenceProof;
    readonly resultRouting: ConditionalReferenceProof;
    readonly graphPatch: GraphPatchReferenceProof;
  };
}

interface FreshAgentSkillDiscoveryEvidence {
  readonly atlasCalls: EvaluationRun["observations"]["atlasCalls"];
  readonly sourceOpens: EvaluationRun["observations"]["sourceOpens"];
  readonly reportedFiles: readonly string[];
  readonly reportedSymbols: readonly { readonly file: string; readonly name: string }[];
  readonly requiredFiles: readonly string[];
  readonly requiredSymbols: readonly { readonly file: string; readonly name: string }[];
  readonly knowledgeCaptureDecision: KnowledgeCaptureDecision;
}

type KnowledgeCaptureDecision = NonNullable<
  EvaluationRun["answer"]["knowledgeCaptureDecision"]
>;

type ConditionalReferenceProof =
  | { readonly outcome: "not-required" }
  | {
    readonly outcome: "loaded-after-trigger";
    readonly triggerCommandSequence: number;
    readonly loadCommandSequence: number;
  };

type GraphPatchReferenceProof =
  | { readonly outcome: "not-loaded" }
  | {
    readonly outcome: "loaded-after-source";
    readonly sourceCommandSequence: number;
    readonly loadCommandSequence: number;
  };

interface TimedOperation {
  readonly text: string;
  readonly kind: CommandKind;
  readonly words: readonly string[];
  readonly commandSequence: number;
}

interface TimedSourceObservation {
  readonly file: string;
  readonly commandSequence: number;
  readonly operation: TimedOperation;
}

interface ParsedAtlasEvidence {
  readonly commandSequence: number;
  readonly commandName: string;
  readonly envelope: Record<string, unknown>;
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
  "map.view",
  "map.search",
  "map.show",
  "code.search",
]);

const EVALUATION_OBSERVER_PARAMETER = "$EVALUATION_OBSERVER";
const MAIN_SKILL_FILE = ".agents/skills/semantic-atlas/SKILL.md";
const SNAPSHOT_BOOTSTRAP_FILE = ".agents/skills/semantic-atlas/references/snapshot-bootstrap.md";
const RESULT_ROUTING_FILE = ".agents/skills/semantic-atlas/references/result-routing.md";
const GRAPH_PATCH_FILE = ".agents/skills/semantic-atlas/references/graph-patch.md";
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

  const commandEvents = events.filter(isCompletedCommandEvent);
  const commands = commandEvents.map((event) => event.item.command);
  const audit = auditCodexCommands(mode, commands);
  let atlasSequence = 0;
  const atlasCalls = commandEvents.flatMap((event, commandIndex) => {
    const operations = parseAllowedShellCommand(event.item.command);
    const atlasOperations = operations.filter((operation) => operation.kind === "atlas");
    if (atlasOperations.length === 0) return [];
    if (operations.length !== 1 || atlasOperations.length !== 1) {
      throw new Error("Fresh Agent Atlas commands must be standalone for replayable evidence");
    }
    if (event.item.exit_code === null) {
      throw new Error("Fresh Agent Atlas command did not retain an exit code");
    }
    atlasSequence += 1;
    return [{
      sequence: atlasSequence,
      command: atlasOperations[0]!.text,
      commandSequence: commandIndex + 1,
      exitCode: event.item.exit_code,
      output: event.item.aggregated_output ?? "",
    }];
  });
  const sourceCommands = commandEvents.flatMap((event, commandIndex) => {
    const operations = parseAllowedShellCommand(event.item.command);
    const sourceOperations = operations.filter((operation) => isSourceObserver(operation.words));
    if (sourceOperations.length === 0) return [];
    if (operations.length !== 1 || sourceOperations.length !== 1) {
      throw new Error("Fresh Agent source observer commands must be standalone for replayable evidence");
    }
    if (event.item.exit_code === null) {
      throw new Error("Fresh Agent source observer command did not retain an exit code");
    }
    return [{
      commandSequence: commandIndex + 1,
      exitCode: event.item.exit_code,
      files: sourceFilesFromObserverOutput(
        sourceOperations[0]!.words,
        event.item.aggregated_output ?? "",
        event.item.exit_code,
      ),
    }];
  });

  return { ...audit, atlasCalls, sourceCommands };
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
    sourceCommands: [],
  };
}

export function bindSourceOpensToCommands(
  sourceOpens: EvaluationRun["observations"]["sourceOpens"],
  sourceCommands: readonly SourceCommandEvidence[],
): EvaluationRun["observations"]["sourceOpens"] {
  const observedFiles = sourceCommands.flatMap((command) => (
    command.exitCode === 0
      ? command.files.map((file) => ({
        file,
        commandSequence: command.commandSequence,
        exitCode: command.exitCode,
      }))
      : []
  ));
  if (
    sourceOpens.length !== observedFiles.length
    || sourceOpens.some((sourceOpen, index) => sourceOpen.file !== observedFiles[index]?.file)
  ) {
    throw new Error("Fresh Agent source trace disagrees with successful observer commands");
  }

  return sourceOpens.map((sourceOpen, index) => ({
    ...sourceOpen,
    commandSequence: observedFiles[index]!.commandSequence,
    exitCode: observedFiles[index]!.exitCode,
  }));
}

export function auditFreshAgentSkillDiscovery(
  commands: readonly string[],
  skillLoads: readonly SkillLoad[],
  evidence: FreshAgentSkillDiscoveryEvidence,
): FreshAgentSkillDiscoveryAudit {
  if (skillLoads[0]?.file !== MAIN_SKILL_FILE) {
    throw new Error("Fresh Agent did not load the discovered Semantic Atlas Skill");
  }

  const operations = buildTimedOperations(commands);
  verifyStandaloneDiscoveryOperations(commands);
  verifySkillTrace(operations, skillLoads);
  const atlasEvidence = parseAtlasEvidence(operations, evidence.atlasCalls);
  const skillIndex = operations.findIndex((operation) => (
    operation.kind === "observer" && observerReadFile(operation.words) === MAIN_SKILL_FILE
  ));
  const statusIndex = operations.findIndex((operation) => (
    operation.kind === "atlas" && atlasCommandName(operation.words) === "status"
  ));
  const mapIndex = operations.findIndex((operation) => (
    operation.kind === "atlas" && atlasCommandName(operation.words).startsWith("map.")
  ));
  const sourceObservations = verifySourceObservations(operations, evidence.sourceOpens);
  const firstSourceSequence = sourceObservations[0]?.commandSequence;

  if (skillIndex < 0 || statusIndex < 0 || skillIndex >= statusIndex) {
    throw new Error("Fresh Agent must load the repository Skill before Atlas status");
  }
  if (
    statusIndex < 0
    || firstSourceSequence === undefined
    || operations[statusIndex]!.commandSequence >= firstSourceSequence
  ) {
    throw new Error("Fresh Agent must run Atlas status before opening source");
  }
  if (mapIndex < 0 || operations[mapIndex]!.commandSequence >= firstSourceSequence) {
    throw new Error("Fresh Agent must use an Atlas map query before opening source");
  }

  const decisiveSourceOperations = findDecisiveSourceOperations(sourceObservations, evidence);
  if (decisiveSourceOperations.length === 0) {
    throw new Error(
      "Fresh Agent did not open decisive source shared by the source trace, answer, and oracle",
    );
  }

  const sourceSequences = uniqueInOrder(
    sourceObservations.map((observation) => observation.commandSequence),
  );
  const targetFiles = new Set([
    ...evidence.reportedFiles,
    ...evidence.reportedSymbols.map((symbol) => symbol.file),
    ...evidence.requiredFiles,
    ...evidence.requiredSymbols.map((symbol) => symbol.file),
  ]);
  const bootstrapTriggers = atlasEvidence
    .filter((item) => requiresSnapshotBootstrap(item, targetFiles))
    .map((item) => item.commandSequence);
  const routingTriggers = atlasEvidence
    .filter(requiresResultRouting)
    .map((item) => item.commandSequence);
  const snapshotBootstrap = proveConditionalReference({
    label: "snapshot bootstrap",
    referenceFile: SNAPSHOT_BOOTSTRAP_FILE,
    operations,
    triggerSequences: bootstrapTriggers,
    sourceSequences,
  });
  const resultRouting = proveConditionalReference({
    label: "result routing",
    referenceFile: RESULT_ROUTING_FILE,
    operations,
    triggerSequences: routingTriggers,
    sourceSequences,
  });
  const graphPatch = proveGraphPatchReference(
    operations,
    decisiveSourceOperations,
    evidence.knowledgeCaptureDecision,
  );

  return {
    delivery: "repository",
    promptInjection: false,
    mainSkillLoaded: true,
    statusBeforeSource: true,
    mapBeforeSource: true,
    decisiveSourceRead: true,
    decisiveSourceFiles: uniqueInOrder(
      decisiveSourceOperations.map((observation) => observation.file),
    ),
    knowledgeCaptureDecision: evidence.knowledgeCaptureDecision,
    conditionalReferences: {
      snapshotBootstrap,
      resultRouting,
      graphPatch,
    },
  };
}

export function verifyFreshAgentSkillDiscovery(
  run: EvaluationRun,
  evaluationCase: EvaluationCase,
): FreshAgentSkillDiscoveryAudit | undefined {
  if (run.protocol.runnerVersion !== "fresh-agent-runner-v5" || run.mode !== "atlas") {
    return undefined;
  }
  const knowledgeCaptureDecision = run.answer.knowledgeCaptureDecision;
  if (knowledgeCaptureDecision === undefined) {
    throw new Error("Fresh Agent did not retain a structured knowledge-capture decision");
  }
  const derived = auditFreshAgentSkillDiscovery(
    run.protocol.commandAudit.commands,
    run.observations.skillLoads ?? [],
    {
      atlasCalls: run.observations.atlasCalls,
      sourceOpens: run.observations.sourceOpens,
      reportedFiles: run.answer.reportedFiles,
      reportedSymbols: run.answer.reportedSymbols,
      requiredFiles: evaluationCase.oracle.requiredFiles,
      requiredSymbols: evaluationCase.oracle.requiredSymbols,
      knowledgeCaptureDecision,
    },
  );
  if (!isDeepStrictEqual(derived, run.protocol.skillDiscovery)) {
    throw new Error(`Published Skill discovery proof disagrees with retained evidence for ${run.runId}`);
  }
  return derived;
}

function buildTimedOperations(commands: readonly string[]): readonly TimedOperation[] {
  return commands.flatMap((command, commandIndex) => (
    parseAllowedShellCommand(command).map((operation) => ({
      text: operation.text,
      kind: operation.kind,
      words: operation.words,
      commandSequence: commandIndex + 1,
    }))
  ));
}

function verifyStandaloneDiscoveryOperations(commands: readonly string[]): void {
  for (const command of commands) {
    const operations = parseAllowedShellCommand(command);
    const containsDiscoveryOperation = operations.some((operation) => (
      operation.kind === "atlas" || operation.kind === "observer"
    ));
    if (containsDiscoveryOperation && operations.length !== 1) {
      throw new Error(
        "Fresh Agent Atlas and observer commands must be standalone for replayable discovery evidence",
      );
    }
  }
}

function verifySkillTrace(
  operations: readonly TimedOperation[],
  skillLoads: readonly SkillLoad[],
): void {
  const commandFiles = operations.flatMap((operation) => {
    const file = observerReadFile(operation.words);
    return file !== undefined && isCandidateSkillFile(file) ? [file] : [];
  });
  const traceFiles = skillLoads.map((load) => load.file);
  const validSequences = skillLoads.every((load, index) => load.sequence === index + 1);
  if (!validSequences || !isDeepStrictEqual(commandFiles, traceFiles)) {
    throw new Error("Fresh Agent Skill trace disagrees with retained commands");
  }
}

function parseAtlasEvidence(
  operations: readonly TimedOperation[],
  atlasCalls: EvaluationRun["observations"]["atlasCalls"],
): readonly ParsedAtlasEvidence[] {
  const atlasOperations = operations.filter((operation) => operation.kind === "atlas");
  if (atlasOperations.length !== atlasCalls.length) {
    throw new Error("Fresh Agent Atlas envelopes disagree with retained commands");
  }

  return atlasOperations.map((operation, index) => {
    const call = atlasCalls[index]!;
    const commandName = atlasCommandName(operation.words);
    if (
      call.sequence !== index + 1
      || call.command !== operation.text
      || call.commandSequence !== operation.commandSequence
      || call.exitCode === undefined
      || call.output === undefined
    ) {
      throw new Error("Fresh Agent Atlas envelope metadata disagrees with retained commands");
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(call.output) as unknown;
    } catch (error) {
      throw new Error("Fresh Agent retained an invalid Atlas JSON envelope", { cause: error });
    }
    if (!isRecord(envelope) || envelope.schemaVersion !== 1) {
      throw new Error("Fresh Agent retained an unsupported Atlas envelope");
    }
    if (
      !["ok", "partial", "error"].includes(String(envelope.status))
      || !Array.isArray(envelope.warnings)
      || envelope.warnings.some((warning) => (
        !isRecord(warning) || typeof warning.code !== "string"
      ))
    ) {
      throw new Error("Fresh Agent retained a malformed Atlas envelope");
    }
    const successfulEnvelope = envelope.status === "ok" || envelope.status === "partial";
    if ((successfulEnvelope && call.exitCode !== 0) || (!successfulEnvelope && call.exitCode === 0)) {
      throw new Error("Fresh Agent Atlas envelope status disagrees with its exit code");
    }
    const data = isRecord(envelope.data) ? envelope.data : undefined;
    if (data?.command !== commandName) {
      throw new Error("Fresh Agent Atlas envelope command disagrees with retained commands");
    }
    return {
      commandSequence: operation.commandSequence,
      commandName,
      envelope,
    };
  });
}

function verifySourceObservations(
  operations: readonly TimedOperation[],
  sourceOpens: EvaluationRun["observations"]["sourceOpens"],
): readonly TimedSourceObservation[] {
  let previousCommandSequence = 0;
  return sourceOpens.map((sourceOpen) => {
    if (sourceOpen.commandSequence === undefined || sourceOpen.exitCode !== 0) {
      throw new Error(
        "Fresh Agent source observations must identify a successful observer command",
      );
    }
    const operation = operations.find((candidate) => (
      candidate.commandSequence === sourceOpen.commandSequence
    ));
    if (operation === undefined || !observerCommandCoversFile(operation.words, sourceOpen.file)) {
      throw new Error("Fresh Agent source trace disagrees with retained observer commands");
    }
    if (sourceOpen.commandSequence < previousCommandSequence) {
      throw new Error("Fresh Agent source trace is not ordered by retained observer commands");
    }
    previousCommandSequence = sourceOpen.commandSequence;
    return {
      file: sourceOpen.file,
      commandSequence: sourceOpen.commandSequence,
      operation,
    };
  });
}

function findDecisiveSourceOperations(
  sourceObservations: readonly TimedSourceObservation[],
  evidence: FreshAgentSkillDiscoveryEvidence,
): readonly TimedSourceObservation[] {
  const reportedFiles = new Set([
    ...evidence.reportedFiles,
    ...evidence.reportedSymbols.map((symbol) => symbol.file),
  ]);
  const requiredFiles = new Set([
    ...evidence.requiredFiles,
    ...evidence.requiredSymbols.map((symbol) => symbol.file),
  ]);

  return sourceObservations.filter((observation) => (
    reportedFiles.has(observation.file) && requiredFiles.has(observation.file)
  ));
}

function requiresSnapshotBootstrap(
  item: ParsedAtlasEvidence,
  targetFiles: ReadonlySet<string>,
): boolean {
  const data = isRecord(item.envelope.data) ? item.envelope.data : undefined;
  if (item.commandName === "status") {
    const freshness = data?.freshness;
    const backend = isRecord(data?.backend) ? data.backend : undefined;
    return freshness === "missing"
      || freshness === "stale"
      || (backend?.completeness !== undefined && backend.completeness !== "complete");
  }
  if (!item.commandName.startsWith("map.") || data === undefined) return false;

  const nodes = collectNodeRecords(data);
  const hasRelevantStructuralNode = nodes.some((node) => (
    node.domain === "structural"
    && nodeSourceFiles(node).some((file) => targetFiles.has(file))
  ));
  const hasRelevantBusinessNode = nodes.some((node) => (
    node.domain === "business"
    && nodeSourceFiles(node).some((file) => targetFiles.has(file))
  ));
  return hasRelevantStructuralNode && !hasRelevantBusinessNode;
}

function requiresResultRouting(item: ParsedAtlasEvidence): boolean {
  if (item.envelope.status === "partial" || item.envelope.status === "error") return true;
  if (Array.isArray(item.envelope.warnings) && item.envelope.warnings.length > 0) return true;

  const data = isRecord(item.envelope.data) ? item.envelope.data : undefined;
  if (data === undefined) return false;
  if (
    ((item.commandName === "map.search" || item.commandName === "code.search")
      && isEmptyArray(data.results))
    || (item.commandName === "map.view" && isEmptyArray(data.regions))
  ) {
    return true;
  }
  return collectRecords(data).some((record) => (
    record.kind === "UnknownBoundary"
    || record.validity === "stale"
    || record.certainty === "hypothesis"
    || (isRecord(record.support)
      && ["unknown", "unsupported", "partial"].includes(String(record.support.status)))
  ));
}

function proveConditionalReference(options: {
  readonly label: string;
  readonly referenceFile: string;
  readonly operations: readonly TimedOperation[];
  readonly triggerSequences: readonly number[];
  readonly sourceSequences: readonly number[];
}): ConditionalReferenceProof {
  const loadSequences = options.operations.flatMap((operation) => (
    observerReadFile(operation.words) === options.referenceFile
      ? [operation.commandSequence]
      : []
  ));
  if (options.triggerSequences.length === 0) {
    if (loadSequences.length > 0) {
      throw new Error(`Fresh Agent loaded ${options.label} without matching Atlas state`);
    }
    return { outcome: "not-required" };
  }

  for (const loadSequence of loadSequences) {
    if (!options.triggerSequences.some((triggerSequence) => triggerSequence < loadSequence)) {
      throw new Error(`Fresh Agent loaded ${options.label} before its matching Atlas state`);
    }
  }

  let proof: { readonly triggerSequence: number; readonly loadSequence: number } | undefined;
  for (const triggerSequence of options.triggerSequences) {
    const referenceAlreadyLoaded = loadSequences.some((candidate) => candidate < triggerSequence);
    if (referenceAlreadyLoaded) continue;

    const loadSequence = loadSequences.find((candidate) => candidate > triggerSequence);
    if (loadSequence === undefined) {
      throw new Error(
        `Fresh Agent must load ${options.label} after its matching Atlas state`,
      );
    }
    const nextSourceSequence = options.sourceSequences.find(
      (sourceSequence) => sourceSequence > triggerSequence,
    );
    if (nextSourceSequence !== undefined && loadSequence >= nextSourceSequence) {
      throw new Error(
        `Fresh Agent must load ${options.label} after its matching Atlas state and before opening source`,
      );
    }
    proof ??= { triggerSequence, loadSequence };
  }

  if (proof === undefined) {
    throw new Error(`Fresh Agent did not retain a ${options.label} trigger/load proof`);
  }
  return {
    outcome: "loaded-after-trigger",
    triggerCommandSequence: proof.triggerSequence,
    loadCommandSequence: proof.loadSequence,
  };
}

function proveGraphPatchReference(
  operations: readonly TimedOperation[],
  decisiveSourceOperations: readonly TimedSourceObservation[],
  decision: KnowledgeCaptureDecision,
): GraphPatchReferenceProof {
  const loadSequences = operations.flatMap((operation) => (
    observerReadFile(operation.words) === GRAPH_PATCH_FILE
      ? [operation.commandSequence]
      : []
  ));
  if (decision.outcome !== "persist") {
    if (loadSequences.length > 0) {
      throw new Error("Fresh Agent loaded GraphPatch authoring without a persist decision");
    }
    return { outcome: "not-loaded" };
  }
  if (loadSequences.length === 0) {
    throw new Error("Fresh Agent persist decision requires GraphPatch authoring");
  }

  for (const loadSequence of loadSequences) {
    if (!decisiveSourceOperations.some((source) => source.commandSequence < loadSequence)) {
      throw new Error("Fresh Agent loaded GraphPatch authoring before decisive source confirmation");
    }
  }
  const loadSequence = loadSequences[0]!;
  const sourceCommandSequence = decisiveSourceOperations.findLast(
    (source) => source.commandSequence < loadSequence,
  )!.commandSequence;
  return {
    outcome: "loaded-after-source",
    sourceCommandSequence,
    loadCommandSequence: loadSequence,
  };
}

function collectNodeRecords(value: unknown): readonly Record<string, unknown>[] {
  return collectRecords(value).filter((record) => (
    record.domain === "structural" || record.domain === "business"
  ));
}

function collectRecords(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(collectRecords);
  if (!isRecord(value)) return [];
  return [value, ...Object.values(value).flatMap(collectRecords)];
}

function nodeSourceFiles(node: Record<string, unknown>): readonly string[] {
  const locations = Array.isArray(node.locations) ? node.locations : [];
  const evidence = Array.isArray(node.evidence) ? node.evidence : [];
  return [...locations, ...evidence].flatMap((item) => (
    isRecord(item) && typeof item.file === "string" ? [item.file] : []
  ));
}

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function uniqueInOrder<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    && typeof event.item.command === "string"
    && "exit_code" in event.item
    && (event.item.exit_code === null || typeof event.item.exit_code === "number")
    && (!("aggregated_output" in event.item)
      || typeof event.item.aggregated_output === "string");
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

  return parseAllowedShellCommand(command).flatMap((operation) => (
    operation.kind === "atlas" ? [operation.text] : []
  ));
}

function parseAllowedShellCommand(command: string) {
  try {
    return parseAuditedShellCommand(command);
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
  const file = observerReadFile(words);
  return file !== undefined && isCandidateSkillFile(file);
}

function isSourceObserver(words: readonly string[]): boolean {
  const invocation = observerInvocation(words);
  return invocation !== undefined
    && (invocation.operation === "read" || invocation.operation === "search")
    && !isCandidateSkillRead(words);
}

function observerCommandCoversFile(words: readonly string[], file: string): boolean {
  const invocation = observerInvocation(words);
  if (invocation?.operation === "read") {
    return invocation.arguments[0] === file && !isCandidateSkillFile(file);
  }
  if (invocation?.operation !== "search") return false;

  const paths = invocation.arguments.slice(1);
  return (paths.length === 0 ? ["."] : paths).some((path) => {
    const normalized = path.replace(/^\.\//u, "").replace(/\/+$/u, "");
    return normalized === "." || file === normalized || file.startsWith(`${normalized}/`);
  });
}

function sourceFilesFromObserverOutput(
  words: readonly string[],
  output: string,
  exitCode: number,
): readonly string[] {
  if (exitCode !== 0) return [];
  const files = [...output.matchAll(/^=== (.+):(?:\d+-\d+|matches) ===$/gmu)]
    .map((match) => match[1]!);
  const invocation = observerInvocation(words);
  if (invocation?.operation === "read") {
    const expectedFile = invocation.arguments[0];
    if (expectedFile === undefined || files.length !== 1 || files[0] !== expectedFile) {
      throw new Error("Fresh Agent source read output disagrees with its observer command");
    }
  }
  if (files.some((file) => !observerCommandCoversFile(words, file))) {
    throw new Error("Fresh Agent source search output escaped its observer command scope");
  }
  return files;
}

function observerReadFile(words: readonly string[]): string | undefined {
  const invocation = observerInvocation(words);
  return invocation?.operation === "read" ? invocation.arguments[0] : undefined;
}

function observerInvocation(words: readonly string[]): {
  readonly operation: string;
  readonly arguments: readonly string[];
} | undefined {
  const offset = words[0] === "node" ? 1 : 0;
  if (words[offset] !== EVALUATION_OBSERVER_PARAMETER || words[offset + 1] === undefined) {
    return undefined;
  }
  return {
    operation: words[offset + 1]!,
    arguments: words.slice(offset + 2),
  };
}

function isCandidateSkillFile(file: string): boolean {
  return /^\.agents\/skills\/semantic-atlas\//u.test(file);
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
