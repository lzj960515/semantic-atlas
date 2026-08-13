import type { CodeGraph, Node } from "@colbymchenry/codegraph";

import type { StructuralFactChanges } from "./types.js";

type StructuralFacts = Map<string, string[]>;

export function captureStructuralFacts(graph: CodeGraph): StructuralFacts {
  const facts: StructuralFacts = new Map();
  const nodeIdentities = new Map<string, string>();
  for (const file of graph.getFiles()) {
    for (const node of graph.getNodesInFile(file.path)) {
      nodeIdentities.set(node.id, structuralNodeIdentity(node));
    }
  }
  for (const file of graph.getFiles()) {
    for (const node of graph.getNodesInFile(file.path)) {
      const identity = structuralNodeIdentity(node);
      const { id: _id, updatedAt: _updatedAt, ...content } = node;
      addStructuralFact(facts, `node\0${identity}`, content);
      for (const edge of graph.getOutgoingEdges(node.id)) {
        const source = nodeIdentities.get(edge.source) ?? `backend:${edge.source}`;
        const target = nodeIdentities.get(edge.target) ?? `backend:${edge.target}`;
        const { source: _source, target: _target, ...relationContent } = edge;
        addStructuralFact(
          facts,
          `relation\0${source}\0${edge.kind}\0${target}`,
          { source, target, ...relationContent },
        );
      }
    }
  }
  return facts;
}

export function compareStructuralFacts(
  previous: StructuralFacts,
  current: StructuralFacts,
): StructuralFactChanges {
  const changes = { added: 0, changed: 0, reused: 0, removed: 0 };
  const identities = new Set([...previous.keys(), ...current.keys()]);
  for (const identity of identities) {
    const previousValues = countStructuralValues(previous.get(identity) ?? []);
    const currentValues = countStructuralValues(current.get(identity) ?? []);
    let previousRemaining = 0;
    let currentRemaining = 0;
    for (const value of new Set([...previousValues.keys(), ...currentValues.keys()])) {
      const previousCount = previousValues.get(value) ?? 0;
      const currentCount = currentValues.get(value) ?? 0;
      const reused = Math.min(previousCount, currentCount);
      changes.reused += reused;
      previousRemaining += previousCount - reused;
      currentRemaining += currentCount - reused;
    }
    const changed = Math.min(previousRemaining, currentRemaining);
    changes.changed += changed;
    changes.added += currentRemaining - changed;
    changes.removed += previousRemaining - changed;
  }
  return changes;
}

function structuralNodeIdentity(node: Node): string {
  return [normalizeRepositoryPath(node.filePath), node.kind, node.qualifiedName].join("\0");
}

function addStructuralFact(
  facts: StructuralFacts,
  identity: string,
  content: unknown,
): void {
  const values = facts.get(identity) ?? [];
  values.push(stableStructuralValue(content));
  facts.set(identity, values);
}

function countStructuralValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function stableStructuralValue(value: unknown): string {
  return JSON.stringify(sortStructuralValue(value));
}

function sortStructuralValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortStructuralValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sortStructuralValue(child)]));
}

function normalizeRepositoryPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}
