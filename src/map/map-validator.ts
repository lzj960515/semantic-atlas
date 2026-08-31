import path from "node:path";
import type { ZodIssue } from "zod";
import {
  mapDocumentSchema,
  type BusinessFlow,
  type BusinessNode,
  type BusinessNodeKind,
  type BusinessRelation,
  type BusinessRelationKind,
  type LoadedMapDocument,
  type MapIssue,
  type ParsedMapDocument,
  type RepositoryMapSource,
  type ValidatedBusinessMap,
} from "../contracts/map.js";
import { validateBusinessFlows } from "./business-flow-validator.js";

export type MapValidationResult =
  | {
      readonly valid: true;
      readonly map: ValidatedBusinessMap;
    }
  | {
      readonly valid: false;
      readonly issues: readonly MapIssue[];
    };

export class MapValidator {
  public validate(
    source: RepositoryMapSource,
    loadedDocuments: readonly LoadedMapDocument[],
    loadIssues: readonly MapIssue[],
  ): MapValidationResult {
    const parsedDocuments: ParsedMapDocument[] = [];
    const shapeIssues = [...loadIssues];

    for (const loadedDocument of loadedDocuments) {
      const parsed = mapDocumentSchema.safeParse(loadedDocument.value);
      if (!parsed.success) {
        shapeIssues.push(...parsed.error.issues.map((issue) =>
          schemaIssue(loadedDocument.fileName, issue)));
        continue;
      }
      parsedDocuments.push({
        fileName: loadedDocument.fileName,
        relativePath: loadedDocument.relativePath,
        document: parsed.data,
      });
    }

    if (shapeIssues.length > 0) {
      return invalid(shapeIssues);
    }

    const nodes = normalizeNodes(parsedDocuments);
    const relations = normalizeRelations(parsedDocuments);
    const flows = normalizeFlows(parsedDocuments);
    const graphIssues = validateGraph(parsedDocuments, nodes, relations, flows);

    if (graphIssues.length > 0) {
      return invalid(graphIssues);
    }

    return {
      valid: true,
      map: {
        source,
        documents: Object.freeze([...parsedDocuments]),
        nodes: Object.freeze(nodes.map(freezeNode)),
        relations: Object.freeze(relations.map(freezeRelation)),
        flows: Object.freeze(flows.map(freezeFlow)),
      },
    };
  }
}

function schemaIssue(document: string, issue: ZodIssue): MapIssue {
  return {
    code: "DOCUMENT_SCHEMA_INVALID",
    document,
    path: issue.path.map(String).join("."),
    message: issue.message,
  };
}

function normalizeNodes(documents: readonly ParsedMapDocument[]): BusinessNode[] {
  return documents
    .flatMap(({ document, relativePath }) => document.nodes.map((node) => ({
      ...node,
      aliases: [...node.aliases],
      anchors: node.anchors.map((anchor) => ({ ...anchor })),
      documentId: document.map.id,
      documentPath: relativePath,
    })))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeRelations(documents: readonly ParsedMapDocument[]): BusinessRelation[] {
  return documents
    .flatMap(({ document, relativePath }) => document.relations.map((relation) => ({
      ...relation,
      documentId: document.map.id,
      documentPath: relativePath,
    })))
    .sort(compareRelations);
}

function normalizeFlows(documents: readonly ParsedMapDocument[]): BusinessFlow[] {
  return documents
    .flatMap(({ document, relativePath }) => document.flows.map((flow) => ({
      ...flow,
      steps: flow.steps
        .map((step) => ({ ...step }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      transitions: flow.transitions
        .map((transition) => ({ ...transition }))
        .sort((left, right) => flowTransitionKey(left).localeCompare(flowTransitionKey(right))),
      documentId: document.map.id,
      documentPath: relativePath,
    })))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function validateGraph(
  documents: readonly ParsedMapDocument[],
  nodes: readonly BusinessNode[],
  relations: readonly BusinessRelation[],
  flows: readonly BusinessFlow[],
): MapIssue[] {
  const issues: MapIssue[] = [];
  validateDocumentIds(documents, issues);
  validateNodeIdentities(nodes, issues);

  const nodeById = new Map<string, BusinessNode>();
  for (const node of nodes) {
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
    validateAliases(node, issues);
    validateAnchors(node, issues);
  }

  validateRelations(relations, nodeById, issues);
  validateContainment(relations, nodeById, issues);
  issues.push(...validateBusinessFlows(flows, nodeById));
  return issues;
}

function validateDocumentIds(
  documents: readonly ParsedMapDocument[],
  issues: MapIssue[],
): void {
  const ownerById = new Map<string, string>();
  for (const { fileName, document } of documents) {
    const existing = ownerById.get(document.map.id);
    if (existing) {
      issues.push({
        code: "DUPLICATE_DOCUMENT_ID",
        document: fileName,
        subject: document.map.id,
        message: `Document ID '${document.map.id}' is also declared by ${existing}`,
      });
    } else {
      ownerById.set(document.map.id, fileName);
    }
  }
}

function validateNodeIdentities(nodes: readonly BusinessNode[], issues: MapIssue[]): void {
  const ownerById = new Map<string, BusinessNode>();
  for (const node of nodes) {
    const existing = ownerById.get(node.id);
    if (existing) {
      issues.push({
        code: "DUPLICATE_NODE_ID",
        document: node.documentPath,
        subject: node.id,
        message: `Node '${node.id}' is also declared by ${existing.documentPath}`,
      });
    } else {
      ownerById.set(node.id, node);
    }
  }
}

function validateAliases(node: BusinessNode, issues: MapIssue[]): void {
  const aliases = new Set<string>();
  for (const alias of node.aliases) {
    const normalized = normalizeTerm(alias);
    if (aliases.has(normalized)) {
      issues.push({
        code: "DUPLICATE_NODE_ALIAS",
        document: node.documentPath,
        subject: node.id,
        message: `Node '${node.id}' declares duplicate alias '${alias}'`,
      });
    }
    aliases.add(normalized);
  }
}

function validateAnchors(node: BusinessNode, issues: MapIssue[]): void {
  for (const [index, anchor] of node.anchors.entries()) {
    if (!isFileLikeAnchor(anchor.kind)) continue;
    if (isNormalizedRelativePath(anchor.value)) continue;
    issues.push({
      code: "ANCHOR_PATH_INVALID",
      document: node.documentPath,
      path: `nodes.${node.id}.anchors.${index}.value`,
      subject: node.id,
      message: `Anchor '${anchor.value}' must be a normalized repository-relative path`,
    });
  }
}

function validateRelations(
  relations: readonly BusinessRelation[],
  nodeById: ReadonlyMap<string, BusinessNode>,
  issues: MapIssue[],
): void {
  const knownRelations = new Map<string, BusinessRelation>();
  for (const relation of relations) {
    const key = relationKey(relation);
    const existing = knownRelations.get(key);
    if (existing) {
      issues.push({
        code: "DUPLICATE_RELATION",
        document: relation.documentPath,
        subject: key,
        message: `Relation '${key}' is also declared by ${existing.documentPath}`,
      });
    } else {
      knownRelations.set(key, relation);
    }

    const from = nodeById.get(relation.from);
    const to = nodeById.get(relation.to);
    for (const endpoint of [relation.from, relation.to]) {
      if (nodeById.has(endpoint)) continue;
      issues.push({
        code: "RELATION_ENDPOINT_MISSING",
        document: relation.documentPath,
        subject: key,
        message: `Relation '${key}' references missing node '${endpoint}'`,
      });
    }
    if (from && to && !relationKindsMatch(relation.type, from.kind, to.kind)) {
      issues.push({
        code: "RELATION_KIND_MISMATCH",
        document: relation.documentPath,
        subject: key,
        message: `Relation '${key}' cannot connect ${from.kind} to ${to.kind}`,
      });
    }
  }
}

function validateContainment(
  relations: readonly BusinessRelation[],
  nodeById: ReadonlyMap<string, BusinessNode>,
  issues: MapIssue[],
): void {
  const containment = relations.filter((relation) => relation.type === "part_of");
  const parentByChild = new Map<string, string>();

  for (const relation of containment) {
    const child = nodeById.get(relation.from);
    if (child?.kind === "domain") {
      issues.push({
        code: "DOMAIN_HAS_PARENT",
        document: relation.documentPath,
        subject: relation.from,
        message: `Domain '${relation.from}' cannot have a part_of parent`,
      });
    }
    const existingParent = parentByChild.get(relation.from);
    if (existingParent && existingParent !== relation.to) {
      issues.push({
        code: "MULTIPLE_CONTAINMENT_PARENTS",
        document: relation.documentPath,
        subject: relation.from,
        message: `Node '${relation.from}' has parents '${existingParent}' and '${relation.to}'`,
      });
    } else if (!existingParent) {
      parentByChild.set(relation.from, relation.to);
    }
  }

  issues.push(...findContainmentCycles(containment, nodeById));
}

function findContainmentCycles(
  containment: readonly BusinessRelation[],
  nodeById: ReadonlyMap<string, BusinessNode>,
): MapIssue[] {
  const parentsByChild = new Map<string, string[]>();
  for (const relation of containment) {
    const parents = parentsByChild.get(relation.from) ?? [];
    parents.push(relation.to);
    parentsByChild.set(relation.from, parents);
  }

  const completed = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const issues: MapIssue[] = [];

  const visit = (nodeId: string): void => {
    if (completed.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      const start = stack.indexOf(nodeId);
      const cycle = [...stack.slice(start), nodeId];
      const cycleKey = canonicalCycleKey(cycle.slice(0, -1));
      if (!reported.has(cycleKey)) {
        reported.add(cycleKey);
        const documentPath = nodeById.get(nodeId)?.documentPath;
        issues.push({
          code: "CONTAINMENT_CYCLE",
          ...(documentPath ? { document: documentPath } : {}),
          subject: cycleKey,
          message: `Containment cycle: ${cycle.join(" -> ")}`,
        });
      }
      return;
    }

    visiting.add(nodeId);
    stack.push(nodeId);
    for (const parentId of parentsByChild.get(nodeId) ?? []) visit(parentId);
    stack.pop();
    visiting.delete(nodeId);
    completed.add(nodeId);
  };

  for (const nodeId of [...nodeById.keys()].sort()) visit(nodeId);
  return issues;
}

function canonicalCycleKey(cycle: readonly string[]): string {
  if (cycle.length === 0) return "";
  const rotations = cycle.map((_, index) => [
    ...cycle.slice(index),
    ...cycle.slice(0, index),
  ].join(" -> "));
  return rotations.sort()[0] ?? "";
}

function relationKindsMatch(
  relation: BusinessRelationKind,
  from: BusinessNodeKind,
  to: BusinessNodeKind,
): boolean {
  const actions: readonly BusinessNodeKind[] = ["scenario", "operation"];
  const boundaryOwners: readonly BusinessNodeKind[] = ["capability", "scenario", "operation"];
  switch (relation) {
    case "part_of":
      return from !== "domain";
    case "invokes":
      return actions.includes(from) && actions.includes(to);
    case "reads":
    case "writes":
      return actions.includes(from) && to === "data";
    case "publishes":
    case "consumes":
      return boundaryOwners.includes(from) && to === "interface";
    case "constrained_by":
      return to === "invariant";
  }
}

function isFileLikeAnchor(kind: string): boolean {
  return kind === "file" || kind === "directory" || kind === "document";
}

function isNormalizedRelativePath(value: string): boolean {
  if (value.includes("\\") || path.posix.isAbsolute(value)) return false;
  if (value === "." || value === ".." || value.startsWith("../")) return false;
  return path.posix.normalize(value) === value;
}

function relationKey(relation: Pick<BusinessRelation, "from" | "type" | "to">): string {
  return `${relation.from} ${relation.type} ${relation.to}`;
}

function compareRelations(left: BusinessRelation, right: BusinessRelation): number {
  return relationKey(left).localeCompare(relationKey(right));
}

function flowTransitionKey(
  transition: BusinessFlow["transitions"][number],
): string {
  return `${transition.from}\0${transition.when ?? ""}\0${transition.to}`;
}

function normalizeTerm(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function freezeNode(node: BusinessNode): BusinessNode {
  return Object.freeze({
    ...node,
    aliases: Object.freeze([...node.aliases]),
    anchors: Object.freeze(node.anchors.map((anchor) => Object.freeze({ ...anchor }))),
  });
}

function freezeRelation(relation: BusinessRelation): BusinessRelation {
  return Object.freeze({ ...relation });
}

function freezeFlow(flow: BusinessFlow): BusinessFlow {
  return Object.freeze({
    ...flow,
    steps: Object.freeze(flow.steps.map((step) => Object.freeze({ ...step }))),
    transitions: Object.freeze(
      flow.transitions.map((transition) => Object.freeze({ ...transition })),
    ),
  });
}

function invalid(issues: readonly MapIssue[]): MapValidationResult {
  return {
    valid: false,
    issues: Object.freeze([...issues].sort(compareIssues)),
  };
}

function compareIssues(left: MapIssue, right: MapIssue): number {
  const leftKey = `${left.document ?? ""}\0${left.code}\0${left.subject ?? ""}\0${left.path ?? ""}`;
  const rightKey = `${right.document ?? ""}\0${right.code}\0${right.subject ?? ""}\0${right.path ?? ""}`;
  return leftKey.localeCompare(rightKey);
}
