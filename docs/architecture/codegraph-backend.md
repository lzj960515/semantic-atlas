# CodeGraph Backend Architecture

## Decision

Semantic Atlas embeds the verified `@colbymchenry/codegraph` 1.5.0 package as its initial structural-index SDK. It sets `CODEGRAPH_DIR=.atlas` and accepts `.atlas/codegraph.db` as the v0.1 physical database path.

This decision produces one product, one index command, one durable SQLite database, and one logical world graph. It avoids waiting for an upstream database-path option and avoids copying a large language-analysis implementation into Atlas.

## System model

```text
Calling AI
    |
Semantic Atlas Skill
    |
semantic-atlas CLI
    |
WorldModelService
    |-- CodeGraphBackend ------ @colbymchenry/codegraph SDK
    |                             |-- extraction and resolution
    |                             |-- structural search and traversal
    |
    |-- BusinessKnowledgeStore -- capabilities, flows, data, rules, evidence
    |
    `-- WorldGraphQuery -------- normalizes and composes both domains
                                  |
                         .atlas/codegraph.db
```

`CodeGraphBackend` is an anti-corruption layer, not a second public API. Atlas domain code depends on Atlas structural query types. Backend node kinds, edge kinds, identifiers, errors, and version metadata are translated at this boundary.

## Physical and logical ownership

The SQLite file contains multiple table families because they have different writers and lifecycles. They are one database, not two exported datasets.

| Owner | Table family | Lifecycle |
| --- | --- | --- |
| CodeGraph | `nodes`, `edges`, `files`, `unresolved_refs`, FTS, schema and backend metadata | Rebuilt or incrementally synchronized from source |
| Atlas | `atlas_metadata`, `atlas_snapshots`, `atlas_business_nodes`, `atlas_business_relations`, `atlas_evidence`, `atlas_assertion_validity` | Migrated and updated by Atlas only |

Atlas accesses structural behavior through the CodeGraph public SDK. Atlas SQL migrations and repositories access only `atlas_*` objects. The world graph is composed in `WorldGraphQuery`; the public CLI never exposes table origin.

The implementation removes the current Atlas-owned structural projection tables after the adapter can satisfy the world-graph contract. Keeping those tables would duplicate CodeGraph data and restore the two-graph problem this design resolves.

## Stable Atlas contracts

The adapter exposes only the structural operations required by business understanding:

```ts
interface StructuralIndexBackend {
  inspect(): Promise<StructuralIndexState>;
  build(options: StructuralBuildOptions): Promise<StructuralBuildResult>;
  sync(options: StructuralSyncOptions): Promise<StructuralBuildResult>;
  search(query: StructuralSearchQuery): Promise<StructuralNode[]>;
  getNode(reference: StructuralReference): Promise<StructuralNode | undefined>;
  getNeighbors(query: StructuralTraversalQuery): Promise<StructuralNeighbor[]>;
  getCallers(reference: StructuralReference): Promise<StructuralReference[]>;
  getCallees(reference: StructuralReference): Promise<StructuralReference[]>;
  getFileDependencies(path: string): Promise<StructuralFileDependency[]>;
}
```

These are domain-level capabilities rather than a mirror of every CodeGraph API. The adapter may use `CodeGraph.init`, `open`, `indexAll`, `sync`, search, callers, callees, call graph, impact, and file-dependency APIs internally.

`WorldModelService` owns orchestration. `BusinessKnowledgeStore` owns Atlas tables and transactions. `WorldGraphQuery` resolves cross-domain references and returns the existing versioned CLI graph contract.

## Evidence references

Atlas business knowledge does not own CodeGraph rows. An evidence record contains:

- an optional backend node locator for fast rebinding;
- a normalized repository-relative source path;
- a structural kind and qualified symbol identity when available;
- a one-based source range;
- a source content hash;
- the Atlas snapshot and structural-backend version observed at learning time.

No cascading foreign key points from `atlas_*` evidence to a CodeGraph structural table. CodeGraph may clear and recreate its structural rows during a supported rebuild. After every successful index, Atlas attempts to rebind evidence from the durable locator tuple. A unique match is current, a missing or ambiguous match is stale, and certainty remains unchanged.

## Directory lifecycle

Atlas owns directory preparation:

1. resolve the current Git worktree root;
2. create `<worktree>/.atlas/` when needed;
3. create an Atlas-owned `.atlas/.gitignore` that ignores the directory contents, including itself, so generated state remains invisible to normal Git status;
4. run CodeGraph in a scoped environment where `CODEGRAPH_DIR` is `.atlas`;
5. verify the resolved CodeGraph database path is exactly `<worktree>/.atlas/codegraph.db` before writing.

The environment override is contained inside `CodeGraphBackend`; callers do not configure CodeGraph. Each worktree has its own `.atlas/` because CodeGraph's index, SQLite locks, and dirty source state are worktree- and operating-system-specific.

## Index state machine

```text
missing -> building -> current
             |           |
             v           v
           failed <- building
```

- `missing` means no completed Atlas world snapshot exists.
- `building` is written before structural mutation begins.
- `current` is published only after CodeGraph completes and Atlas snapshot/evidence reconciliation commits.
- `failed` records the last failure while preventing a partial structural graph from being reported as current.

All Semantic Atlas commands use one Atlas-owned worktree lock. Its ownership token covers the complete publication lifecycle, does not expire while the holder process is alive, and is reclaimed only after that process has exited. Structural writes complete before Atlas knowledge writes. Read commands require a `current` snapshot or return explicit stale/failed state.

Normal updates use CodeGraph incremental sync. A full structural rebuild uses `CodeGraph.clear()` followed by `indexAll()` because the current SDK clears only structural rows. The adapter never calls:

- `CodeGraph.recreate()`, which removes `codegraph.db` and its sidecars;
- `CodeGraph.uninitialize()`, which removes the entire `.atlas/` directory;
- the CodeGraph CLI rebuild path, which is allowed to choose destructive lifecycle operations.

Before mutating an existing structural index, the adapter captures an online backup of the shared database. Both full rebuild and incremental sync discard that backup only after a complete result; an incomplete result or exception restores the previously published structural graph and colocated `atlas_*` data before the Atlas lock is released.

A future physical-database recovery command must copy or export Atlas-owned tables, replace the structural database, restore Atlas data, and verify evidence before publishing `current`.

## Snapshot semantics

CodeGraph's structural tables represent the current code projection. Atlas snapshots record repository content identity, Git state, relevant file hashes, the CodeGraph package and extraction versions, build outcome, and evidence validity.

Atlas does not preserve a second full historical structural graph. `changes` is derived during index/sync from the previous completed state and persisted as Atlas-owned change metadata. Business assertions remain durable across snapshots and expose validity for the requested current snapshot.

## Failure and upgrade behavior

- A CodeGraph index or sync error fails the Atlas index command and leaves the world snapshot non-current.
- Atlas schema migration failure leaves CodeGraph structural data present but unpublished through Atlas until migration succeeds.
- Unsupported structure is returned as backend support metadata or an unresolved boundary; Atlas does not invent an exact edge.
- The dependency version is pinned exactly rather than selected through a semver range. The compatible host range is Node.js 22.12 through 24. Node.js 22.12 through 22.15 lack the FTS5 module required by CodeGraph 1.5.0, so the adapter runs its private SDK worker with the dependency's bundled Node.js runtime on those hosts; Node.js 22.16 through 24 use the SDK in process. Both paths expose the same Atlas contract and invoke no CodeGraph CLI, MCP, or daemon lifecycle. Upgrades run fixture repositories through index, sync, rebuild, query normalization, schema coexistence, and evidence-rebinding tests before changing the lockfile.
- If an upstream release changes structural IDs, locator-based rebinding preserves stable Atlas business keys and makes unmatched evidence stale.

## Transition from the current implementation

The repository currently contains useful business/evidence contracts and an Atlas-owned structural projection. Migration work is divided by responsibility:

1. preserve business node, relation, GraphPatch, evidence, certainty, validity, and unified CLI concepts;
2. replace external user-data storage with worktree-local `.atlas/codegraph.db` storage;
3. introduce `CodeGraphBackend` and contract fixtures against the pinned package;
4. replace the custom TypeScript/JavaScript analyzer and structural storage write path with backend indexing and normalization;
5. rename Atlas-owned tables into the `atlas_*` namespace and remove duplicate structural tables;
6. implement evidence rebinding and the index state machine;
7. update map/change queries and evaluation around business retrieval rather than open-ended JavaScript runtime conformance.

The existing analyzer candidate remains an experiment until this transition is planned. It is not merged merely to become an intermediate implementation that the new architecture immediately removes.

## Alternatives considered

### Wait for an upstream database-path option

This would permit an `atlas.db` filename, but the filename has no product value and waiting creates schedule risk. `.atlas/codegraph.db` already satisfies the single-directory and single-database boundary.

### Run CodeGraph as a separate CLI or MCP product

This would force agents to coordinate two tools, two public contracts, and two failure models. It conflicts with the single Semantic Atlas workflow.

### Store a CodeGraph database and an Atlas database

This creates duplicate lifecycle, backup, freshness, and joining problems. Co-locating the schemas in one SQLite file provides clear ownership without creating data islands.

### Copy CodeGraph source into Semantic Atlas

This imports a large parser, resolver, database, CLI, MCP, and maintenance surface. Direct SDK use preserves the boundary with much lower ownership cost. A thin fork remains available only if a demonstrated SDK limitation blocks the product contract.

### Extend CodeGraph node and edge enums with business concepts

CodeGraph structural rows require code-centric fields and are legitimately disposable during structural rebuilds. Business assertions have different identity, evidence, certainty, and validity lifecycles, so they remain Atlas-owned and are composed at the query boundary.
