import type { EvaluationRun } from "../../src/evaluation/contracts.js";

const MAX_BUSINESS_NODES_PER_CALL = 50;
const MAX_EVIDENCE_FILES_PER_NODE = 20;

type AdjudicationEvidenceRun = Pick<
  EvaluationRun,
  "protocol" | "observations"
>;

export function buildKnowledgeCaptureAdjudicationEvidence(
  run: AdjudicationEvidenceRun,
) {
  return {
    skillDiscovery: run.protocol.skillDiscovery,
    atlasCalls: run.observations.atlasCalls.map(summarizeAtlasCall),
    atlasHandling: run.observations.atlasHandling,
    successfulSourceOpens: run.observations.sourceOpens
      .filter((sourceOpen) => sourceOpen.exitCode === 0)
      .map((sourceOpen) => ({
        sequence: sourceOpen.sequence,
        commandSequence: sourceOpen.commandSequence,
        file: sourceOpen.file,
      })),
  };
}

function summarizeAtlasCall(
  call: EvaluationRun["observations"]["atlasCalls"][number],
) {
  const envelope = parseAtlasEnvelope(call.output);
  const nodes = collectGraphNodes(envelope.data);
  const matchedBusinessNodes = nodes
    .filter((node) => node.domain === "business")
    .map((node) => ({
      key: stringValue(node.key),
      kind: stringValue(node.kind),
      label: stringValue(node.label),
      certainty: stringValue(node.certainty),
      validity: stringValue(node.validity),
      evidenceFiles: collectEvidenceFiles(node.evidence),
    }));
  const structuralNodes = nodes.filter((node) => node.domain === "structural");

  return {
    sequence: call.sequence,
    command: call.command,
    exitCode: call.exitCode,
    status: stringValue(envelope.status),
    resultCommand: isRecord(envelope.data)
      ? stringValue(envelope.data.command)
      : undefined,
    freshness: isRecord(envelope.data)
      ? stringValue(envelope.data.freshness)
      : undefined,
    backendCompleteness: isRecord(envelope.data) && isRecord(envelope.data.backend)
      ? stringValue(envelope.data.backend.completeness)
      : undefined,
    businessNodeCount: matchedBusinessNodes.length,
    businessNodes: matchedBusinessNodes.slice(0, MAX_BUSINESS_NODES_PER_CALL),
    businessNodesTruncated: matchedBusinessNodes.length > MAX_BUSINESS_NODES_PER_CALL,
    structuralNodeCount: structuralNodes.length,
    unknownBoundaryCount: structuralNodes.filter(
      (node) => node.kind === "UnknownBoundary",
    ).length,
    warningCodes: Array.isArray(envelope.warnings)
      ? envelope.warnings.flatMap((warning) => (
        isRecord(warning) && typeof warning.code === "string" ? [warning.code] : []
      ))
      : [],
  };
}

function parseAtlasEnvelope(output: string | undefined): Record<string, unknown> {
  if (output === undefined) return {};
  const value = JSON.parse(output) as unknown;
  if (!isRecord(value)) throw new Error("Retained Atlas output must be an object");
  return value;
}

function collectGraphNodes(value: unknown): Record<string, unknown>[] {
  const nodes = new Map<string, Record<string, unknown>>();
  visit(value);
  return [...nodes.values()];

  function visit(candidate: unknown): void {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (!isRecord(candidate)) return;

    const domain = candidate.domain;
    const identity = candidate.key ?? candidate.id;
    if (
      (domain === "business" || domain === "structural")
      && typeof identity === "string"
    ) {
      nodes.set(`${domain}:${identity}`, candidate);
    }
    for (const nested of Object.values(candidate)) visit(nested);
  }
}

function collectEvidenceFiles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => (
    isRecord(item) && typeof item.file === "string" ? [item.file] : []
  )))].sort().slice(0, MAX_EVIDENCE_FILES_PER_NODE);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
