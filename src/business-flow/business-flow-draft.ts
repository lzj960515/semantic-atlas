import { createHash } from "node:crypto";

import type {
  AssertionCertainty,
  BusinessNodeInput,
  BusinessRelationInput,
  Evidence,
} from "../graph/types.js";
import { graphPatchV1Schema } from "../contracts/graph.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
import type { StructuralNode } from "../structural-backend/types.js";
import type {
  BusinessFlowBoundary,
  DerivedBusinessFlow,
  SupportedBusinessFramework,
} from "./types.js";

export class BusinessFlowDraft {
  readonly #snapshot: RepositorySnapshot;
  readonly #capabilityKey: string;
  readonly #nodes = new Map<string, BusinessNodeInput>();
  readonly #relations = new Map<string, BusinessRelationInput>();
  readonly #boundaries = new Map<string, BusinessFlowBoundary>();

  constructor(snapshot: RepositorySnapshot, capabilityKey: string) {
    this.#snapshot = snapshot;
    this.#capabilityKey = capabilityKey;
  }

  addNode(node: BusinessNodeInput): void {
    const existing = this.#nodes.get(node.key);
    if (existing === undefined) {
      this.#nodes.set(node.key, node);
      return;
    }
    if (existing.kind !== node.kind) {
      throw new Error(`Business concept ${node.key} has conflicting kinds`);
    }
    this.#nodes.set(node.key, {
      ...existing,
      aliases: uniqueStrings([...existing.aliases, ...node.aliases]),
      evidence: uniqueEvidence([...existing.evidence, ...node.evidence]),
      certainty: lowerCertainty(existing.certainty, node.certainty),
    });
  }

  addRelation(relation: BusinessRelationInput): void {
    const identity = relationIdentity(relation);
    const existing = this.#relations.get(identity);
    if (existing === undefined) {
      this.#relations.set(identity, relation);
      return;
    }
    this.#relations.set(identity, {
      ...existing,
      evidence: uniqueEvidence([...existing.evidence, ...relation.evidence]),
      certainty: lowerCertainty(existing.certainty, relation.certainty),
    });
  }

  addBoundary(
    framework: SupportedBusinessFramework,
    operation: string,
    reason: string,
    owner: StructuralNode,
    candidates: readonly string[] = [],
  ): void {
    const id = `business-boundary:${digest([
      framework,
      operation,
      owner.reference.id,
      reason,
    ].join("\0"))}`;
    this.#boundaries.set(id, {
      id,
      framework,
      operation,
      reason,
      owner: { domain: "structural", id: owner.reference.id },
      location: locationFor(owner, this.#snapshot),
      candidates: uniqueStrings(candidates),
      resolution: "source_fallback",
    });
  }

  evidenceFor(node: StructuralNode): Evidence {
    const location = locationFor(node, this.#snapshot);
    if (!/^(?:symbol|test):/u.test(node.reference.id)) {
      throw new Error(`Structural node ${node.reference.id} cannot be GraphPatch evidence`);
    }
    return {
      symbolId: node.reference.id,
      file: location.file,
      range: location.range,
      contentHash: location.contentHash,
    };
  }

  finish(): DerivedBusinessFlow {
    this.addCapabilityOwnership();
    const patch = graphPatchV1Schema.parse({
      schemaVersion: 1,
      baseSnapshotId: this.#snapshot.snapshotId,
      nodeOperations: [...this.#nodes.values()]
        .sort((left, right) => left.key.localeCompare(right.key))
        .map((node) => ({ op: "upsert" as const, node })),
      relationOperations: [...this.#relations.values()]
        .sort((left, right) => relationIdentity(left).localeCompare(relationIdentity(right)))
        .map((relation) => ({ op: "upsert" as const, relation })),
    });
    return {
      patch,
      boundaries: [...this.#boundaries.values()]
        .sort((left, right) => left.id.localeCompare(right.id)),
    };
  }

  private addCapabilityOwnership(): void {
    const capability = this.#nodes.get(this.#capabilityKey);
    if (capability?.kind !== "Capability") {
      throw new Error(`Business flow capability ${this.#capabilityKey} is missing from its draft`);
    }
    for (const node of this.#nodes.values()) {
      if (node.key === this.#capabilityKey) {
        continue;
      }
      this.addRelation({
        from: { domain: "business", key: node.key },
        type: "part_of",
        to: { domain: "business", key: this.#capabilityKey },
        certainty: lowerCertainty(node.certainty, capability.certainty),
        evidence: node.evidence,
      });
    }
  }
}

export function businessKeySegment(value: string, identity: string = value): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 56);
  const prefix = normalized.length > 0 ? normalized : "concept";
  return `${prefix}-${digest(identity).slice(0, 8)}`;
}

function locationFor(node: StructuralNode, snapshot: RepositorySnapshot) {
  const source = snapshot.files.find((file) => file.path === node.path)?.worktree;
  if (source === null || source === undefined) {
    throw new Error(`Structural source ${node.path} is absent from snapshot ${snapshot.snapshotId}`);
  }
  return {
    file: node.path,
    range: node.range,
    contentHash: source.contentHash,
  };
}

function relationIdentity(relation: BusinessRelationInput): string {
  const target = relation.to.domain === "business" ? relation.to.key : relation.to.id;
  return [relation.from.key, relation.type, relation.to.domain, target].join("\0");
}

function uniqueEvidence(evidence: readonly Evidence[]): Evidence[] {
  return [...new Map(evidence.map((item) => [
    [item.symbolId, item.file, JSON.stringify(item.range), item.contentHash].join("\0"),
    item,
  ])).values()];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function lowerCertainty(
  left: AssertionCertainty,
  right: AssertionCertainty,
): AssertionCertainty {
  const rank: Record<AssertionCertainty, number> = { hypothesis: 0, inferred: 1, exact: 2 };
  return rank[left] <= rank[right] ? left : right;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
