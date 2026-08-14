import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { CliEnvelope } from "../src/contracts/cli.js";
import type {
  StructuralGraphNode,
  StructuralRelationType,
  WorldGraphView,
} from "../src/graph/types.js";

const executeFile = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const sourceFiles = representativeFixtureSources();
const ordersServiceSource = fixtureSource("src/orders.service.ts");
const structuralProbes = {
  graphqlRoute: {
    query: "MUTATION createOrder",
    file: "src/orders.resolver.ts",
    label: "MUTATION createOrder",
  },
  graphqlHandler: {
    query: "createOrder",
    file: "src/orders.resolver.ts",
    label: "createOrder",
  },
  httpRoute: {
    query: "POST orders",
    file: "src/orders.controller.ts",
    label: "POST /orders",
  },
  httpHandler: {
    query: "create",
    file: "src/orders.controller.ts",
    label: "create",
  },
  service: {
    query: "createOrder",
    file: "src/orders.service.ts",
    label: "createOrder",
  },
  entity: { query: "Order", file: "src/order.entity.ts", label: "Order" },
  producer: {
    query: "publishCreated",
    file: "src/orders.service.ts",
    label: "publishCreated",
  },
  consumer: {
    query: "handleCreated",
    file: "src/orders.processor.ts",
    label: "handleCreated",
  },
  invariant: {
    query: "assertValid",
    file: "src/orders.service.ts",
    label: "assertValid",
  },
  test: {
    query: "createsOrder",
    file: "tests/orders.service.spec.ts",
    label: "createsOrder",
  },
} as const satisfies Readonly<Record<string, StructuralProbe>>;
const requiredStructuralRelations = [
  { from: "graphqlRoute", type: "references", to: "graphqlHandler" },
  { from: "httpRoute", type: "references", to: "httpHandler" },
  { from: "service", type: "calls", to: "invariant" },
] as const satisfies readonly StructuralRelationExpectation[];
const allowedExactCallRelations = [
  { from: "graphqlHandler", type: "calls", to: "service" },
  { from: "httpHandler", type: "calls", to: "service" },
  { from: "service", type: "calls", to: "invariant" },
] as const satisfies readonly StructuralRelationExpectation[];
const options = await validationOptions();
const sourceDependencyState = await readSourceDependencyState();
const temporaryRoot = await mkdtemp(join(tmpdir(), "semantic-atlas-backend-validation-"));

try {
  const artifact = await packAtlas(temporaryRoot);
  const pinnedInstallation = await installPackagedAtlas(
    temporaryRoot,
    "pinned",
    artifact,
    options.pinnedVersion,
    options.allowNetwork,
  );
  const seededFixture = await seedPinnedFixture(pinnedInstallation, temporaryRoot, options);
  const candidateInstallation = await installPackagedAtlas(
    temporaryRoot,
    "candidate",
    artifact,
    options.candidateSpecifier,
    options.allowNetwork,
  );
  const report = await validateCandidateUpgrade(
    candidateInstallation,
    seededFixture,
    temporaryRoot,
    options,
  );
  assert.deepEqual(
    await readSourceDependencyState(),
    sourceDependencyState,
    "Candidate validation must not change the source manifest or lockfile",
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

interface ValidationOptions {
  readonly pinnedVersion: string;
  readonly candidateSpecifier: string;
  readonly allowNetwork: boolean;
}

interface PackageInstallation {
  readonly tarballName: string;
  readonly consumerRoot: string;
  readonly cliPath: string;
  readonly api: typeof import("../src/index.js");
  readonly resolvedBackendVersion: string;
}

interface PackageArtifact {
  readonly filename: string;
  readonly tarballName: string;
}

interface SeededFixture {
  readonly repositoryRoot: string;
  readonly databasePath: string;
  readonly initialGitStatus: string;
  readonly initialIndex: CliResult;
  readonly business: RepresentativeBusinessFlow;
  readonly structuralQuality: StructuralQualityReport;
  readonly persistedState: PersistedAtlasState;
}

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly envelope: CliEnvelope;
}

interface StructuralProbe {
  readonly query: string;
  readonly file: string;
  readonly label: string;
}

type StructuralProbeKey = keyof typeof structuralProbes;
type StructuralProbeNodes = Readonly<Record<StructuralProbeKey, StructuralGraphNode>>;

interface StructuralRelationExpectation {
  readonly from: StructuralProbeKey;
  readonly type: StructuralRelationType;
  readonly to: StructuralProbeKey;
}

interface StructuralRelationEndpoint extends StructuralRelationExpectation {
  readonly fromId: string;
  readonly toId: string;
}

interface StructuralQualityFinding extends StructuralRelationEndpoint {
  readonly support: {
    readonly status: string;
    readonly provenance: string;
  };
}

type StructuralMiss =
  | { readonly kind: "node"; readonly key: StructuralProbeKey; readonly file: string; readonly label: string }
  | ({ readonly kind: "relation" } & StructuralRelationEndpoint);

interface StructuralQualityReport {
  readonly structuralMisses: {
    readonly count: number;
    readonly details: readonly StructuralMiss[];
  };
  readonly falseLinks: {
    readonly count: number;
    readonly details: readonly StructuralQualityFinding[];
  };
  readonly observedRelations: readonly StructuralQualityFinding[];
}

interface RepresentativeBusinessFlow {
  readonly businessKinds: readonly string[];
  readonly relationTypes: readonly string[];
  readonly boundaryCount: number;
  readonly sourceEvidenceCount: number;
}

type PersistedRow = Readonly<Record<string, string | number | null>>;

interface PersistedAtlasState {
  readonly businessNodes: readonly PersistedRow[];
  readonly evidence: readonly PersistedRow[];
  readonly publications: readonly PersistedRow[];
  readonly worldState: PersistedRow;
  readonly atlasSchema: readonly PersistedRow[];
  readonly foreignKeyViolations: readonly PersistedRow[];
}

async function readSourceDependencyState() {
  return {
    packageDocument: await readFile(join(projectRoot, "package.json"), "utf8"),
    lockfile: await readFile(join(projectRoot, "pnpm-lock.yaml"), "utf8"),
  };
}

async function validationOptions(): Promise<ValidationOptions> {
  const packageDocument = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
    readonly dependencies: Record<string, string>;
  };
  const pinnedVersion = packageDocument.dependencies["@colbymchenry/codegraph"];
  assert.ok(pinnedVersion, "package.json must pin @colbymchenry/codegraph");
  assert.match(pinnedVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u,
    "The CodeGraph dependency must remain an exact version");

  let candidateSpecifier = pinnedVersion;
  let allowNetwork = false;
  const arguments_ = process.argv.slice(2);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--candidate") {
      const candidate = arguments_[index + 1];
      assert.ok(candidate, "--candidate requires a package version or specifier");
      candidateSpecifier = candidate;
      index += 1;
      continue;
    }
    if (argument === "--allow-network") {
      allowNetwork = true;
      continue;
    }
    throw new Error(`Unknown validation option ${argument}`);
  }
  return { pinnedVersion, candidateSpecifier, allowNetwork };
}

async function packAtlas(root: string): Promise<PackageArtifact> {
  await run("pnpm", ["build"], projectRoot);
  const packageDirectory = join(root, "package");
  await mkdir(packageDirectory, { recursive: true });
  const packed = await run(
    "pnpm",
    ["pack", "--pack-destination", packageDirectory, "--json"],
    projectRoot,
  );
  const packageResult = JSON.parse(packed.stdout) as { readonly filename: string };
  return {
    filename: packageResult.filename,
    tarballName: basename(packageResult.filename),
  };
}

async function installPackagedAtlas(
  root: string,
  phase: "pinned" | "candidate",
  artifact: PackageArtifact,
  backendSpecifier: string,
  allowNetwork: boolean,
): Promise<PackageInstallation> {
  const consumerRoot = join(root, `${phase}-consumer`);
  await mkdir(consumerRoot, { recursive: true });
  await writeFile(join(consumerRoot, "package.json"), `${JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "@colbymchenry/codegraph": backendSpecifier,
      "semantic-atlas": `file:${artifact.filename}`,
    },
    pnpm: {
      overrides: {
        "@colbymchenry/codegraph": backendSpecifier,
      },
    },
  }, null, 2)}\n`);
  await run("pnpm", [
    "install",
    "--frozen-lockfile=false",
    ...allowNetwork ? [] : ["--offline"],
  ], consumerRoot);

  const codeGraphPackage = JSON.parse(await readFile(join(
    consumerRoot,
    "node_modules",
    "@colbymchenry",
    "codegraph",
    "package.json",
  ), "utf8")) as { readonly version: string };
  const packageEntry = join(consumerRoot, "node_modules", "semantic-atlas", "dist", "index.js");
  const api = await import(pathToFileURL(packageEntry).href) as typeof import("../src/index.js");
  return {
    tarballName: artifact.tarballName,
    consumerRoot,
    cliPath: join(consumerRoot, "node_modules", ".bin", "semantic-atlas"),
    api,
    resolvedBackendVersion: codeGraphPackage.version,
  };
}

async function seedPinnedFixture(
  installation: PackageInstallation,
  root: string,
  validation: ValidationOptions,
): Promise<SeededFixture> {
  assert.equal(installation.resolvedBackendVersion, validation.pinnedVersion);
  const fixtureRoot = join(root, "representative-pietra-fixture");
  await createRepresentativeFixture(fixtureRoot);
  const repositoryRoot = await realpath(fixtureRoot);
  const initialGitStatus = await git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all");
  assert.equal(initialGitStatus, " M README.md");

  const missing = await runCli(installation.cliPath, ["status"], repositoryRoot);
  assert.equal(missing.exitCode, 0);
  assert.equal(commandData(missing, "status").freshness, "missing");

  const initialIndex = await runCli(installation.cliPath, ["index"], repositoryRoot, 120_000);
  const initialIndexData = commandData(initialIndex, "index");
  assert.equal(initialIndex.exitCode, 0, initialIndex.stderr);
  assert.equal(initialIndexData.backendVersion, installation.resolvedBackendVersion);
  assert.match(String(initialIndexData.snapshotId), /^[0-9a-f]{64}$/u);
  const databasePath = join(repositoryRoot, ".atlas", "codegraph.db");
  assert.equal(await fileExists(databasePath), true);
  assert.equal(initialIndex.envelope.repository?.root, repositoryRoot);
  assert.equal(await git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all"), initialGitStatus);

  const repository = await installation.api.inspectGitRepository(repositoryRoot);
  const structure = await inspectRepresentativeStructure(installation.api, repository);
  const business = await deriveAndLearnRepresentativeFlow(installation.api, repository, structure.nodes);
  const initialView = await showCapability(installation.api, repository);
  assertRepresentativeBusinessView(initialView);
  return {
    repositoryRoot,
    databasePath,
    initialGitStatus,
    initialIndex,
    business,
    structuralQuality: structure.quality,
    persistedState: capturePersistedAtlasState(databasePath),
  };
}

async function validateCandidateUpgrade(
  installation: PackageInstallation,
  seeded: SeededFixture,
  root: string,
  validation: ValidationOptions,
) {
  const { repositoryRoot, databasePath, initialGitStatus } = seeded;
  const preUpgradeStatus = await runCli(installation.cliPath, ["status"], repositoryRoot);
  assert.equal(preUpgradeStatus.exitCode, 0, preUpgradeStatus.stderr);
  assert.equal(commandData(preUpgradeStatus, "status").freshness, "current");

  const unchangedIndex = await runCli(installation.cliPath, ["index"], repositoryRoot, 120_000);
  const unchangedData = commandData(unchangedIndex, "index");
  assert.equal(unchangedData.backendVersion, installation.resolvedBackendVersion);
  const unchangedFacts = factCounts(commandData(unchangedIndex, "index"));
  assert.deepEqual({
    added: unchangedFacts.added,
    changed: unchangedFacts.changed,
    removed: unchangedFacts.removed,
  }, { added: 0, changed: 0, removed: 0 });
  assert.ok(unchangedFacts.reused > 0);

  const repository = await installation.api.inspectGitRepository(repositoryRoot);
  const structure = await inspectRepresentativeStructure(installation.api, repository);
  assertStructuralQualityNotRegressed(seeded.structuralQuality, structure.quality);
  const upgradedView = await showCapability(installation.api, repository);
  assertRepresentativeBusinessView(upgradedView);
  assertPersistedAtlasStatePreserved(
    seeded.persistedState,
    capturePersistedAtlasState(databasePath),
    "candidate incremental index",
  );

  await writeFile(join(repositoryRoot, "src", "temporary.ts"), "export const temporary = true;\n");
  const addedIndex = await runCli(installation.cliPath, ["index"], repositoryRoot, 120_000);
  assert.ok(factCounts(commandData(addedIndex, "index")).added > 0);
  await unlink(join(repositoryRoot, "src", "temporary.ts"));
  const removedIndex = await runCli(installation.cliPath, ["index"], repositoryRoot, 120_000);
  assert.ok(factCounts(commandData(removedIndex, "index")).removed > 0);

  const rebuilt = await new installation.api.WorldModelService(repository).build();
  assert.equal(rebuilt.structural.completeness, "complete");
  assert.equal(rebuilt.structural.mode, "full");
  assert.equal((await showCapability(installation.api, repository)).node.validity, "valid");
  assertPersistedAtlasStatePreserved(
    seeded.persistedState,
    capturePersistedAtlasState(databasePath),
    "candidate full rebuild",
  );

  await writeFile(
    join(repositoryRoot, "src", "orders.service.ts"),
    ordersServiceSource.replaceAll("createOrder", "createOrderV2"),
  );
  const staleIndex = await runCli(installation.cliPath, ["index"], repositoryRoot, 120_000);
  const staleData = commandData(staleIndex, "index");
  assert.ok(asStringArray(staleData.staleAssertions).includes("commerce/orders"));
  assert.equal((await showCapability(installation.api, repository)).node.validity, "stale");

  await writeFile(join(repositoryRoot, "src", "orders.service.ts"), ordersServiceSource);
  const restoredIndex = await runCli(installation.cliPath, ["index"], repositoryRoot, 120_000);
  assert.equal(restoredIndex.exitCode, 0, restoredIndex.stderr);
  assert.equal((await showCapability(installation.api, repository)).node.validity, "valid");

  createReconciliationFailure(databasePath);
  const recoveryProbe = join(repositoryRoot, "src", "recovery-probe.ts");
  await writeFile(recoveryProbe, "export const recoveryProbe = true;\n");
  const failedIndex = await runCli(installation.cliPath, ["index"], repositoryRoot, 120_000);
  assert.equal(failedIndex.exitCode, 1);
  assert.equal(failedIndex.envelope.status, "error");
  removeReconciliationFailure(databasePath);
  const recoveredIndex = await runCli(installation.cliPath, ["index"], repositoryRoot, 120_000);
  assert.equal(recoveredIndex.exitCode, 0, recoveredIndex.stderr);
  assert.equal((await showCapability(installation.api, repository)).node.validity, "valid");
  await unlink(recoveryProbe);
  const settledIndex = await runCli(installation.cliPath, ["index"], repositoryRoot, 120_000);
  assert.equal(settledIndex.exitCode, 0, settledIndex.stderr);

  const linkedWorktree = join(root, "representative-pietra-linked-worktree");
  await git(repositoryRoot, "worktree", "add", "-b", "validation-linked", linkedWorktree);
  const linkedIndex = await runCli(installation.cliPath, ["index"], linkedWorktree, 120_000);
  assert.equal(linkedIndex.exitCode, 0, linkedIndex.stderr);
  const linkedDatabase = join(linkedWorktree, ".atlas", "codegraph.db");
  assert.equal(await fileExists(linkedDatabase), true);
  assert.notEqual(linkedDatabase, databasePath);
  assert.equal(await git(linkedWorktree, "status", "--porcelain=v1", "--untracked-files=all"), "");

  const schema = schemaOwnership(databasePath);
  assert.ok(schema.codeGraphObjects > 0);
  assert.ok(schema.atlasObjects > 0);
  assert.equal(schema.nonNamespacedAtlasObjects, 0);
  const queryMeasurements = await measureQueries(installation.api, repository);
  const finalGitStatus = await git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all");
  assert.equal(finalGitStatus, initialGitStatus);

  return {
    schemaVersion: 1,
    package: {
      tarball: installation.tarballName,
      pinnedBackendVersion: validation.pinnedVersion,
      seededBackendVersion: validation.pinnedVersion,
      candidateSpecifier: validation.candidateSpecifier,
      resolvedBackendVersion: installation.resolvedBackendVersion,
      pinUnchanged: true,
    },
    contract: {
      directoryPlacement: true,
      sdkOperations: ["initial", "incremental", "full", "search", "traverse"],
      schemaCoexistence: schema,
      upgradeFromPinnedStore: true,
      upgradeState: {
        businessKeysPreserved: seeded.persistedState.businessNodes.length,
        evidenceRecordsPreserved: seeded.persistedState.evidence.length,
        priorPublicationsPreserved: seeded.persistedState.publications.length,
        atlasSchemaObjectsPreserved: seeded.persistedState.atlasSchema.length,
        falseLinkRegression: false,
        incrementalIndex: "preserved",
        fullRebuild: "preserved",
      },
      businessKnowledgePreserved: true,
      normalizedSupport: Object.values(structure.nodes).every((node) => (
        ["exact", "inferred", "unresolved", "unsupported"].includes(node.support.status)
        && ["tree-sitter", "scip", "heuristic", "backend"].includes(node.support.provenance)
      )),
      evidenceRebinding: {
        structuralRebuild: "valid",
        changedEvidence: "stale",
        restoredEvidence: "valid",
      },
      failedIndexRecovery: true,
      linkedWorktreeIsolation: true,
      trackedRepositoryIntrusion: false,
    },
    representativeFlow: {
      requiredFiles: [...new Set(Object.values(structure.nodes).flatMap((node) => (
        node.locations.map((item) => item.file)
      )))].sort(),
      requiredSymbols: Object.entries(structure.nodes).map(([key, node]) => ({
        key,
        file: node.locations[0]!.file,
        label: node.label,
        id: node.id,
      })),
      structuralMisses: structure.quality.structuralMisses,
      pinnedFalseLinks: seeded.structuralQuality.falseLinks,
      falseLinks: structure.quality.falseLinks,
      observedRelations: structure.quality.observedRelations,
      businessKinds: seeded.business.businessKinds,
      relationTypes: seeded.business.relationTypes,
      unresolvedBoundaries: seeded.business.boundaryCount,
      sourceEvidenceCount: seeded.business.sourceEvidenceCount,
      repeatedTaskReusedBusinessNodes: upgradedView.neighbors.filter(({ node }) => (
        node.domain === "business"
      )).length,
    },
    measurements: {
      indexMilliseconds: {
        initial: rounded(seeded.initialIndex.durationMs),
        unchanged: rounded(unchangedIndex.durationMs),
        recovered: rounded(recoveredIndex.durationMs),
      },
      databaseBytes: (await stat(databasePath)).size,
      queryMilliseconds: queryMeasurements,
    },
  };
}

async function deriveAndLearnRepresentativeFlow(
  api: typeof import("../src/index.js"),
  repository: import("../src/repository/types.js").GitRepository,
  probes: StructuralProbeNodes,
): Promise<RepresentativeBusinessFlow> {
  const { graphqlRoute, httpRoute, service, entity, producer, consumer, invariant, test } = probes;
  const reference = (node: StructuralGraphNode) => ({ id: node.id });
  const derived = await new api.BusinessFlowDerivationService(repository).derive({
    capability: {
      key: "commerce/orders",
      label: "Orders",
      summary: "Creates, validates, persists, publishes, and verifies customer orders.",
      roots: Object.values(probes).map(reference),
    },
    messageFlows: [{
      channel: "orders.created",
      producer: reference(producer),
      consumer: reference(consumer),
    }],
    invariants: [{
      key: "commerce/orders/valid-order",
      label: "Valid order",
      summary: "Only orders with an identifier can be persisted.",
      evidence: reference(invariant),
      constrains: [reference(service)],
    }],
    verifications: [{ operation: reference(service), test: reference(test) }],
  });
  const nodes = derived.patch.nodeOperations.flatMap((operation) => (
    operation.op === "upsert" ? [operation.node] : []
  ));
  const relations = derived.patch.relationOperations.flatMap((operation) => (
    operation.op === "upsert" ? [operation.relation] : []
  ));
  const businessKinds = [...new Set(nodes.map((node) => node.kind))].sort();
  for (const requiredKind of ["Capability", "Scenario", "Operation", "Invariant", "Interface", "Data"]) {
    assert.ok(businessKinds.includes(requiredKind as typeof businessKinds[number]));
  }
  const relationTypes = [...new Set(relations.map((relation) => relation.type))].sort();
  for (const requiredType of [
    "consumes",
    "constrained_by",
    "part_of",
    "publishes",
    "realized_by",
    "verified_by",
  ]) {
    assert.ok(relationTypes.includes(requiredType as typeof relationTypes[number]));
  }
  assert.ok(derived.boundaries.length > 0);
  assert.ok(nodes.every((node) => node.evidence.length > 0));

  const graph = new api.GraphStore(repository);
  try {
    await new api.BusinessKnowledgeService(repository, graph).learn(derived.patch);
  } finally {
    graph.close();
  }
  return {
    businessKinds,
    relationTypes,
    boundaryCount: derived.boundaries.length,
    sourceEvidenceCount: nodes.reduce((total, node) => total + node.evidence.length, 0),
  };
}

async function inspectRepresentativeStructure(
  api: typeof import("../src/index.js"),
  repository: import("../src/repository/types.js").GitRepository,
): Promise<{ readonly nodes: StructuralProbeNodes; readonly quality: StructuralQualityReport }> {
  const query = new api.WorldGraphQuery(repository);
  try {
    const probeEntries = Object.entries(structuralProbes) as [StructuralProbeKey, StructuralProbe][];
    const discovered: Partial<Record<StructuralProbeKey, StructuralGraphNode>> = {};
    const nodeMisses: StructuralMiss[] = [];
    for (const [key, probe] of probeEntries) {
      const node = await findStructuralNode(query, probe);
      if (node === undefined) {
        nodeMisses.push({ kind: "node", key, file: probe.file, label: probe.label });
      } else {
        discovered[key] = node;
      }
    }
    assert.equal(nodeMisses.length, 0, `Structural node misses: ${JSON.stringify(nodeMisses)}`);
    const nodes = discovered as StructuralProbeNodes;
    const keysById = new Map(Object.entries(nodes).map(([key, node]) => (
      [node.id, key as StructuralProbeKey] as const
    )));
    const observedByIdentity = new Map<string, StructuralQualityFinding>();
    for (const [from, node] of Object.entries(nodes) as [StructuralProbeKey, StructuralGraphNode][]) {
      const traversal = await query.traverse(
        { domain: "structural", id: node.id },
        { maxDepth: 1, direction: "outgoing" },
      );
      for (const neighbor of traversal.neighbors) {
        if (neighbor.relation.domain !== "structural" || neighbor.relation.from.id !== node.id) {
          continue;
        }
        const to = keysById.get(neighbor.relation.to.id);
        if (to === undefined) {
          continue;
        }
        const finding: StructuralQualityFinding = {
          from,
          type: neighbor.relation.type,
          to,
          fromId: node.id,
          toId: neighbor.relation.to.id,
          support: neighbor.relation.support,
        };
        observedByIdentity.set(relationExpectationIdentity(finding), finding);
      }
    }
    const relationMisses = requiredStructuralRelations.flatMap((expectation) => {
      const endpoint = structuralRelationEndpoint(expectation, nodes);
      const observed = observedByIdentity.get(relationExpectationIdentity(endpoint));
      return observed?.support.status === "exact"
        ? []
        : [{ kind: "relation" as const, ...endpoint }];
    });
    const allowedExactCalls = new Set(allowedExactCallRelations.map(relationExpectationIdentity));
    const falseLinks = [...observedByIdentity.values()].filter((observed) => (
      observed.type === "calls"
      && observed.support.status === "exact"
      && !allowedExactCalls.has(relationExpectationIdentity(observed))
    ));
    const structuralMisses = [...nodeMisses, ...relationMisses];
    const quality = {
      structuralMisses: { count: structuralMisses.length, details: structuralMisses },
      falseLinks: { count: falseLinks.length, details: falseLinks },
      observedRelations: [...observedByIdentity.values()].sort(compareStructuralFindings),
    } satisfies StructuralQualityReport;
    assert.equal(quality.structuralMisses.count, 0,
      `Structural misses: ${JSON.stringify(quality.structuralMisses.details)}`);
    return { nodes, quality };
  } finally {
    query.close();
  }
}

async function findStructuralNode(
  query: import("../src/world/world-graph-query.js").WorldGraphQuery,
  probe: StructuralProbe,
): Promise<StructuralGraphNode | undefined> {
  const results = await query.search(probe.query, { limit: 50 });
  return results.map((result) => result.node).find((node): node is StructuralGraphNode => (
    node.domain === "structural"
    && node.kind !== "UnknownBoundary"
    && node.label === probe.label
    && node.locations.some((location) => location.file === probe.file)
  ));
}

function structuralRelationEndpoint(
  expectation: StructuralRelationExpectation,
  nodes: StructuralProbeNodes,
): StructuralRelationEndpoint {
  return {
    ...expectation,
    fromId: nodes[expectation.from].id,
    toId: nodes[expectation.to].id,
  };
}

function relationExpectationIdentity(expectation: StructuralRelationExpectation): string {
  return `${expectation.from}\u0000${expectation.type}\u0000${expectation.to}`;
}

function compareStructuralFindings(
  left: StructuralQualityFinding,
  right: StructuralQualityFinding,
): number {
  return relationExpectationIdentity(left).localeCompare(relationExpectationIdentity(right));
}

function assertStructuralQualityNotRegressed(
  pinned: StructuralQualityReport,
  candidate: StructuralQualityReport,
): void {
  const pinnedFalseLinks = new Set(pinned.falseLinks.details.map(relationExpectationIdentity));
  const addedFalseLinks = candidate.falseLinks.details.filter((finding) => (
    !pinnedFalseLinks.has(relationExpectationIdentity(finding))
  ));
  assert.deepEqual(addedFalseLinks, [],
    `Candidate introduced false exact links: ${JSON.stringify(addedFalseLinks)}`);
}

async function showCapability(
  api: typeof import("../src/index.js"),
  repository: import("../src/repository/types.js").GitRepository,
): Promise<WorldGraphView> {
  const query = new api.WorldGraphQuery(repository);
  try {
    const view = await query.show({ domain: "business", key: "commerce/orders" }, { maxDepth: 3 });
    assert.ok(view, "Expected the learned Orders capability");
    return view;
  } finally {
    query.close();
  }
}

function assertRepresentativeBusinessView(view: WorldGraphView): void {
  assert.equal(view.node.domain, "business");
  assert.equal(view.node.validity, "valid");
  const kinds = new Set(view.neighbors.map(({ node }) => node.kind));
  for (const kind of ["Scenario", "Operation", "Invariant", "Interface", "Data", "Symbol"] as const) {
    assert.ok(kinds.has(kind), `Business view is missing ${kind}`);
  }
  assert.ok(view.invariants.length > 0);
  assert.ok(view.tests.length > 0);
  assert.ok(view.unknowns.length > 0);
}

async function measureQueries(
  api: typeof import("../src/index.js"),
  repository: import("../src/repository/types.js").GitRepository,
) {
  const durations: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    const query = new api.WorldGraphQuery(repository);
    const startedAt = performance.now();
    try {
      await query.search("orders", { limit: 20 });
      await query.show({ domain: "business", key: "commerce/orders" }, { maxDepth: 2 });
    } finally {
      durations.push(performance.now() - startedAt);
      query.close();
    }
  }
  const sorted = [...durations].sort((left, right) => left - right);
  return {
    samples: durations.map(rounded),
    median: rounded(sorted[Math.floor(sorted.length / 2)]!),
  };
}

function capturePersistedAtlasState(databasePath: string): PersistedAtlasState {
  using database = new DatabaseSync(databasePath, { readOnly: true });
  const worldStates = databaseRows(database, `
    SELECT status, current_snapshot_id, current_publication_id
    FROM atlas_world_state
    ORDER BY repository_id
  `);
  assert.equal(worldStates.length, 1, "Expected one Atlas world state");
  return {
    businessNodes: databaseRows(database, `
      SELECT node_key, kind, label, certainty
      FROM atlas_business_nodes
      ORDER BY node_key
    `),
    evidence: databaseRows(database, `
      SELECT
        'node' AS owner_kind,
        node.node_key AS owner_key,
        evidence.position,
        evidence.file,
        evidence.qualified_symbol,
        evidence.content_hash
      FROM atlas_business_node_evidence AS evidence
      JOIN atlas_business_nodes AS node ON node.node_id = evidence.node_id
      UNION ALL
      SELECT
        'relation' AS owner_kind,
        relation.from_key || ':' || relation.relation_type || ':' ||
          relation.to_domain || ':' || relation.to_key AS owner_key,
        evidence.position,
        evidence.file,
        evidence.qualified_symbol,
        evidence.content_hash
      FROM atlas_business_relation_evidence AS evidence
      JOIN atlas_business_relations AS relation ON relation.relation_id = evidence.relation_id
      ORDER BY owner_kind, owner_key, position
    `),
    publications: databaseRows(database, `
      SELECT
        publication_id,
        previous_publication_id,
        snapshot_id,
        added_paths,
        modified_paths,
        removed_paths,
        stale_assertions
      FROM atlas_world_publications
      ORDER BY publication_id
    `),
    worldState: worldStates[0]!,
    atlasSchema: databaseRows(database, `
      SELECT type, name, sql
      FROM sqlite_master
      WHERE name LIKE 'atlas_%'
      ORDER BY type, name
    `),
    foreignKeyViolations: databaseRows(database, "PRAGMA foreign_key_check"),
  };
}

function assertPersistedAtlasStatePreserved(
  seeded: PersistedAtlasState,
  candidate: PersistedAtlasState,
  phase: string,
): void {
  assert.deepEqual(candidate.businessNodes, seeded.businessNodes,
    `${phase} changed Atlas business keys`);
  assert.deepEqual(candidate.evidence, seeded.evidence,
    `${phase} changed durable Atlas evidence`);
  assert.deepEqual(candidate.atlasSchema, seeded.atlasSchema,
    `${phase} changed Atlas-owned schema`);
  assert.deepEqual(candidate.publications.slice(0, seeded.publications.length), seeded.publications,
    `${phase} changed pre-upgrade publications`);
  assert.equal(candidate.worldState.status, "current", `${phase} did not publish a current world`);
  assert.equal(
    candidate.worldState.current_snapshot_id,
    seeded.worldState.current_snapshot_id,
    `${phase} changed the unchanged repository snapshot`,
  );
  assert.ok(candidate.publications.some(({ publication_id: publicationId }) => (
    publicationId === seeded.worldState.current_publication_id
  )), `${phase} removed the pre-upgrade current publication`);
  assert.deepEqual(candidate.foreignKeyViolations, [], `${phase} introduced foreign-key violations`);
}

function databaseRows(database: DatabaseSync, sql: string): readonly PersistedRow[] {
  return database.prepare(sql).all() as unknown as readonly PersistedRow[];
}

function createReconciliationFailure(databasePath: string): void {
  using database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TRIGGER atlas_validation_reconciliation_failure
    BEFORE UPDATE OF status ON atlas_world_state
    WHEN NEW.status = 'current'
    BEGIN
      SELECT RAISE(ABORT, 'forced packaged reconciliation failure');
    END;
  `);
}

function removeReconciliationFailure(databasePath: string): void {
  using database = new DatabaseSync(databasePath);
  database.exec("DROP TRIGGER atlas_validation_reconciliation_failure");
}

function schemaOwnership(databasePath: string) {
  using database = new DatabaseSync(databasePath, { readOnly: true });
  const objects = database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
  `).all() as unknown as { readonly name: string }[];
  const atlasObjects = objects.filter(({ name }) => name.startsWith("atlas_"));
  const knownCodeGraphObjects = objects.filter(({ name }) => (
    ["nodes", "edges", "files", "schema_versions", "unresolved_refs"].includes(name)
    || name.startsWith("fts_")
  ));
  const legacyAtlasObjects = new Set([
    "repository_snapshots",
    "graph_node_identities",
    "structural_nodes",
    "structural_relations",
    "structural_node_locations",
  ]);
  return {
    codeGraphObjects: knownCodeGraphObjects.length,
    atlasObjects: atlasObjects.length,
    nonNamespacedAtlasObjects: objects.filter(({ name }) => legacyAtlasObjects.has(name)).length,
  };
}

function factCounts(data: Record<string, unknown>) {
  const facts = data.facts;
  assert.ok(isRecord(facts), "Index data must include structural fact counts");
  return {
    added: numericField(facts, "added"),
    changed: numericField(facts, "changed"),
    reused: numericField(facts, "reused"),
    removed: numericField(facts, "removed"),
  };
}

function commandData(result: CliResult, command: string): Record<string, unknown> {
  const data = result.envelope.data as unknown;
  assert.ok(isRecord(data));
  assert.equal(data.command, command);
  assert.equal("error" in data, false, result.stderr);
  return data;
}

function numericField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new Error(`${key} must be numeric`);
  }
  return value;
}

function asStringArray(value: unknown): readonly string[] {
  assert.ok(Array.isArray(value) && value.every((item) => typeof item === "string"));
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runCli(
  cliPath: string,
  arguments_: readonly string[],
  cwd: string,
  timeout = 30_000,
): Promise<CliResult> {
  const startedAt = performance.now();
  const processResult = await runSpawned(cliPath, arguments_, cwd, timeout);
  const envelope = JSON.parse(processResult.stdout) as CliEnvelope;
  return {
    ...processResult,
    durationMs: performance.now() - startedAt,
    envelope,
  };
}

async function runSpawned(
  command: string,
  arguments_: readonly string[],
  cwd: string,
  timeout: number,
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  const child = spawn(command, arguments_, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeout}ms`));
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolveExit(code ?? 1);
    });
  });
  return { exitCode, stdout, stderr };
}

async function run(command: string, arguments_: readonly string[], cwd: string) {
  return executeFile(command, arguments_, {
    cwd,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

async function git(cwd: string, ...arguments_: string[]): Promise<string> {
  return (await run("git", arguments_, cwd)).stdout.trimEnd();
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  });
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function fixtureSource(path: string): string {
  const source = sourceFiles[path];
  assert.ok(source, `Representative fixture is missing ${path}`);
  return source;
}

async function createRepresentativeFixture(repositoryRoot: string): Promise<void> {
  await mkdir(repositoryRoot, { recursive: true });
  await git(repositoryRoot, "init", "--initial-branch=main");
  await git(repositoryRoot, "config", "user.name", "Semantic Atlas Validation");
  await git(repositoryRoot, "config", "user.email", "validation@semantic-atlas.invalid");
  for (const [path, contents] of Object.entries(sourceFiles)) {
    const absolutePath = join(repositoryRoot, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  await git(repositoryRoot, "add", ".");
  await git(repositoryRoot, "commit", "-m", "test: initialize representative Pietra fixture");
  await writeFile(join(repositoryRoot, "README.md"), "# Representative Pietra fixture\n\nPre-existing work.\n");
}

function representativeFixtureSources(): Readonly<Record<string, string>> {
  return {
    "package.json": `${JSON.stringify({
      type: "module",
      dependencies: {
        "@nestjs/bullmq": "11.0.0",
        "@nestjs/common": "11.0.0",
        "@nestjs/graphql": "13.0.0",
        "bullmq": "5.0.0",
        "typeorm": "0.3.26",
      },
    }, null, 2)}\n`,
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "README.md": "# Representative Pietra fixture\n",
    "src/order.entity.ts": [
      "import { Entity, PrimaryColumn } from 'typeorm';",
      "@Entity()",
      "export class Order {",
      "  @PrimaryColumn() id!: string;",
      "}",
      "",
    ].join("\n"),
    "src/orders.service.ts": [
      "import type { Queue } from 'bullmq';",
      "import type { Repository } from 'typeorm';",
      "import type { Order } from './order.entity.js';",
      "export function assertValid(order: Order): void {",
      "  if (!order.id) throw new Error('Order id is required');",
      "}",
      "export async function publishCreated(queue: Queue, order: Order) {",
      "  return queue.add('orders.created', order);",
      "}",
      "export class OrdersService {",
      "  constructor(private readonly orders: Repository<Order>) {}",
      "  async createOrder(order: Order) {",
      "    assertValid(order);",
      "    return this.orders.save(order);",
      "  }",
      "}",
      "",
    ].join("\n"),
    "src/orders.resolver.ts": [
      "import { Args, Mutation, Resolver } from '@nestjs/graphql';",
      "import type { Order } from './order.entity.js';",
      "import { OrdersService } from './orders.service.js';",
      "@Resolver()",
      "export class OrdersResolver {",
      "  constructor(private readonly orders: OrdersService) {}",
      "  @Mutation() createOrder(@Args('order') order: Order) {",
      "    return this.orders.createOrder(order);",
      "  }",
      "}",
      "",
    ].join("\n"),
    "src/orders.controller.ts": [
      "import { Body, Controller, Post } from '@nestjs/common';",
      "import type { Order } from './order.entity.js';",
      "import { OrdersService } from './orders.service.js';",
      "@Controller('orders')",
      "export class OrdersController {",
      "  constructor(private readonly orders: OrdersService) {}",
      "  @Post() create(@Body() order: Order) {",
      "    return this.orders.createOrder(order);",
      "  }",
      "}",
      "",
    ].join("\n"),
    "src/orders.processor.ts": [
      "import { Processor } from '@nestjs/bullmq';",
      "import type { Job } from 'bullmq';",
      "@Processor('orders.created')",
      "export class OrdersProcessor {",
      "  handleCreated(job: Job) { return job.data; }",
      "}",
      "",
    ].join("\n"),
    "tests/orders.service.spec.ts": [
      "import { OrdersService } from '../src/orders.service.js';",
      "export function createsOrder(): boolean {",
      "  return typeof OrdersService === 'function';",
      "}",
      "",
    ].join("\n"),
  };
}
