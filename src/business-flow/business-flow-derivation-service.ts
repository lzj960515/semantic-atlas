import type { BusinessNodeInput } from "../graph/types.js";
import type { GitRepository } from "../repository/types.js";
import { createRepositorySnapshot } from "../snapshots/repository-snapshot.js";
import { CodeGraphStructuralBackend } from "../structural-backend/codegraph-backend.js";
import type { StructuralIndexBackend } from "../structural-backend/types.js";
import { WorldSnapshotStore } from "../world/world-snapshot-store.js";
import { BusinessFlowDraft } from "./business-flow-draft.js";
import type { FrameworkBusinessStrategy } from "./framework-business-strategy.js";
import {
  findBullMqAnchors,
  BullMqBusinessStrategy,
} from "./strategies/bullmq-business-strategy.js";
import { GraphqlBusinessStrategy } from "./strategies/graphql-business-strategy.js";
import { NestJsBusinessStrategy } from "./strategies/nestjs-business-strategy.js";
import {
  findTypeOrmEntities,
  TypeOrmBusinessStrategy,
} from "./strategies/typeorm-business-strategy.js";
import { deriveVerifiedInvariants } from "./strategies/verified-invariant-strategy.js";
import { StructuralFlowCatalog } from "./structural-flow-catalog.js";
import type {
  BusinessFlowDerivationOptions,
  DerivedBusinessFlow,
} from "./types.js";

const DEFAULT_STRATEGIES: readonly FrameworkBusinessStrategy[] = [
  new NestJsBusinessStrategy(),
  new GraphqlBusinessStrategy(),
  new TypeOrmBusinessStrategy(),
  new BullMqBusinessStrategy(),
];

export class BusinessFlowDerivationService {
  constructor(
    private readonly repository: GitRepository,
    private readonly structural: StructuralIndexBackend = new CodeGraphStructuralBackend(repository),
  ) {}

  async derive(options: BusinessFlowDerivationOptions): Promise<DerivedBusinessFlow> {
    const currentWorld = this.currentWorld();
    const snapshot = await createRepositorySnapshot(this.repository);
    if (snapshot.snapshotId !== currentWorld.snapshot.snapshotId) {
      throw new Error("Business flow derivation requires a current world snapshot");
    }
    const catalog = await StructuralFlowCatalog.load(
      this.structural,
      verifiedEvidenceReferences(options),
    );
    const verifiedWorld = this.currentWorld();
    const verifiedSnapshot = await createRepositorySnapshot(this.repository);
    if (
      verifiedWorld.publicationId !== currentWorld.publicationId
      || verifiedSnapshot.snapshotId !== snapshot.snapshotId
    ) {
      throw new Error("The repository or world publication changed during business flow derivation");
    }
    const draft = new BusinessFlowDraft(snapshot);
    const capabilityEvidence = resolveCapabilityEvidence(catalog, options);
    if (capabilityEvidence === undefined) {
      throw new Error("Business flow derivation requires framework or agent-verified evidence");
    }
    draft.addNode(capabilityNode(options, draft, capabilityEvidence));
    for (const strategy of DEFAULT_STRATEGIES) {
      strategy.derive(catalog, options, draft);
    }
    deriveVerifiedInvariants(catalog, options, draft);
    return draft.finish();
  }

  private currentWorld(): ReturnType<WorldSnapshotStore["requireCurrentWorld"]> {
    using store = new WorldSnapshotStore(this.repository);
    return store.requireCurrentWorld();
  }
}

function capabilityNode(
  options: BusinessFlowDerivationOptions,
  draft: BusinessFlowDraft,
  evidence: Parameters<BusinessFlowDraft["evidenceFor"]>[0],
): BusinessNodeInput {
  return {
    key: options.capability.key,
    kind: "Capability",
    label: options.capability.label,
    summary: options.capability.summary,
    aliases: [...(options.capability.aliases ?? [])],
    certainty: "inferred",
    evidence: [draft.evidenceFor(evidence)],
  };
}

function resolveCapabilityEvidence(
  catalog: StructuralFlowCatalog,
  options: BusinessFlowDerivationOptions,
) {
  if (options.capability.evidence !== undefined) {
    const evidence = catalog.node(options.capability.evidence.id);
    if (evidence === undefined) {
      throw new Error(`Capability ${options.capability.key} references missing evidence`);
    }
    return evidence;
  }

  return catalog.nodes.find((node) => (
    node.declarationKind === "route"
    || node.decorators.some((decorator) => [
      "Entity",
      "Processor",
      "InjectQueue",
    ].includes(decoratorName(decorator)))
  )) ?? findTypeOrmEntities(catalog)[0]
    ?? findBullMqAnchors(catalog)[0]
    ?? firstVerifiedEvidence(catalog, options);
}

function firstVerifiedEvidence(
  catalog: StructuralFlowCatalog,
  options: BusinessFlowDerivationOptions,
) {
  const references = [
    ...(options.messageFlows ?? []).flatMap((flow) => [flow.producer, flow.consumer]),
    ...(options.invariants ?? []).map((invariant) => invariant.evidence),
  ];
  return references.map((reference) => catalog.node(reference.id))
    .find((node) => node !== undefined);
}

function verifiedEvidenceReferences(
  options: BusinessFlowDerivationOptions,
) {
  return [
    ...(options.capability.evidence === undefined ? [] : [options.capability.evidence]),
    ...(options.messageFlows ?? []).flatMap((flow) => [flow.producer, flow.consumer]),
    ...(options.invariants ?? []).flatMap((invariant) => [
      invariant.evidence,
      ...invariant.constrains,
    ]),
  ];
}

function decoratorName(decorator: string): string {
  return decorator.replace(/^@/u, "").split("(", 1)[0]!.split(".").at(-1)!;
}
