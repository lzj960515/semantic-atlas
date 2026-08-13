import type { BusinessNodeInput } from "../graph/types.js";
import type { GitRepository } from "../repository/types.js";
import { createRepositorySnapshot } from "../snapshots/repository-snapshot.js";
import { CodeGraphStructuralBackend } from "../structural-backend/codegraph-backend.js";
import type { StructuralIndexBackend } from "../structural-backend/types.js";
import { WorldSnapshotStore } from "../world/world-snapshot-store.js";
import { BusinessFlowDraft } from "./business-flow-draft.js";
import type { FrameworkBusinessStrategy } from "./framework-business-strategy.js";
import { BullMqBusinessStrategy } from "./strategies/bullmq-business-strategy.js";
import { GraphqlBusinessStrategy } from "./strategies/graphql-business-strategy.js";
import { NestJsBusinessStrategy } from "./strategies/nestjs-business-strategy.js";
import { TypeOrmBusinessStrategy } from "./strategies/typeorm-business-strategy.js";
import { deriveVerifiedInvariants } from "./strategies/verified-invariant-strategy.js";
import { deriveVerifiedTests } from "./strategies/verified-test-strategy.js";
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
    const projectCatalog = await StructuralFlowCatalog.load(
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
    const roots = derivationRoots(options);
    const catalog = projectCatalog.scopeTo(roots);
    const capabilityEvidence = options.capability.roots.map((root) => requireNode(projectCatalog, root));
    draft.addNode(capabilityNode(options, draft, capabilityEvidence));
    for (const strategy of DEFAULT_STRATEGIES) {
      strategy.derive(catalog, options, draft);
    }
    deriveVerifiedInvariants(catalog, options, draft);
    deriveVerifiedTests(catalog, options, draft);
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
  evidence: readonly Parameters<BusinessFlowDraft["evidenceFor"]>[0][],
): BusinessNodeInput {
  return {
    key: options.capability.key,
    kind: "Capability",
    label: options.capability.label,
    summary: options.capability.summary,
    aliases: [...(options.capability.aliases ?? [])],
    certainty: "inferred",
    evidence: evidence.map((item) => draft.evidenceFor(item)),
  };
}

function requireNode(
  catalog: StructuralFlowCatalog,
  reference: { readonly id: string },
) {
  const node = catalog.node(reference.id);
  if (node === undefined) {
    throw new Error(`Business flow root ${reference.id} references missing evidence`);
  }
  return node;
}

function verifiedEvidenceReferences(
  options: BusinessFlowDerivationOptions,
) {
  return [
    ...options.capability.roots,
    ...(options.messageFlows ?? []).flatMap((flow) => [flow.producer, flow.consumer]),
    ...(options.invariants ?? []).flatMap((invariant) => [
      invariant.evidence,
      ...invariant.constrains,
    ]),
    ...(options.verifications ?? []).flatMap((verification) => [
      verification.operation,
      verification.test,
    ]),
  ];
}

function derivationRoots(options: BusinessFlowDerivationOptions) {
  return verifiedEvidenceReferences(options);
}
