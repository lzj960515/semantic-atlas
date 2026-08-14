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

The implementation contains no Atlas-owned structural projection tables. Keeping those tables would duplicate CodeGraph data and restore the two-graph problem this design resolves.

## Stable Atlas contracts

The adapter exposes only the structural operations required by business understanding:

```ts
interface StructuralIndexBackend {
  inspect(): Promise<StructuralIndexState>;
  build(): Promise<StructuralBuildResult>;
  sync(): Promise<StructuralBuildResult>;
  listRoots(): Promise<StructuralNode[]>;
  readProjectGraph(query: StructuralProjectGraphQuery): Promise<StructuralTraversalResult>;
  search(query: StructuralSearchQuery): Promise<StructuralSearchResult[]>;
  getNode(reference: StructuralReference): Promise<StructuralNode | undefined>;
  traverse(query: StructuralTraversalQuery): Promise<StructuralTraversalResult>;
  getCallers(reference: StructuralReference): Promise<StructuralCallRelation[]>;
  getCallees(reference: StructuralReference): Promise<StructuralCallRelation[]>;
  getFileDependencies(path: string): Promise<StructuralFileDependency[]>;
}
```

These are domain-level capabilities rather than a mirror of every CodeGraph API. The adapter may use `CodeGraph.init`, `open`, `indexAll`, `sync`, search, callers, callees, call graph, impact, and file-dependency APIs internally.

Business-flow derivation requests one bounded project graph containing only the
declaration kinds used by its framework strategies. A caller supplies explicit
capability roots; Atlas follows exact ownership and execution relations from
those roots and uses same-file framework declarations only as interpretation
context. The adapter returns normalized declaration kinds, decorator names,
supported relations, and unknown boundaries in one query so Node 22
private-worker execution does not degenerate into a process-per-node traversal.

`WorldModelService` owns orchestration. `BusinessKnowledgeStore` owns Atlas tables and transactions. `WorldGraphQuery` resolves cross-domain references and returns the existing versioned CLI graph contract.

`WorldGraphQuery` is the only read coordinator used by map and change workflows. It requires one published world snapshot, combines business hierarchy and evidence relations with backend traversal, and verifies that the published snapshot did not change while an asynchronous structural query was running. Structural results retain normalized support and provenance; business results retain certainty, validity, and evidence.

Lexical search uses deterministic reciprocal-rank fusion across Atlas business vocabulary and CodeGraph structural search. Raw backend scores are not compared across domains because their scales are implementation-specific. The query layer performs no embeddings, model calls, or natural-language inference.

When CodeGraph has no explicit module or namespace nodes, the adapter exposes deterministic top-directory module roots with Atlas `module:` references. These roots are computed from the current backend file manifest and traverse to backend file nodes; they are not stored in Atlas tables or presented as business facts.

## Evidence references

Atlas business knowledge does not own CodeGraph rows. An evidence record contains:

- an optional backend node locator for fast rebinding;
- a normalized repository-relative source path;
- a structural kind and qualified symbol identity when available;
- a one-based source range;
- a source content hash;
- the Atlas snapshot and structural-backend version observed at learning time.

No cascading foreign key points from `atlas_*` evidence to a CodeGraph structural table. CodeGraph may clear and recreate its structural rows during a supported rebuild. After every successful index, Atlas attempts to rebind evidence from the durable locator tuple. A unique match is current, a missing or ambiguous match is stale, and certainty remains unchanged.

Structural relation targets own the same kind of durable locator independently from their supporting evidence. A relation may target one structural node while its evidence cites another; Atlas resolves both locators separately and marks the relation stale when either one is missing or ambiguous.

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

All Semantic Atlas commands use one Atlas-owned worktree lock. Its PID, operating-system process-instance proof, and ownership token cover the complete publication lifecycle, do not expire while that process instance is alive, and permit recovery after that instance exits even if its PID is later reused. Linux and Windows use high-resolution OS process-start identities. On macOS and other POSIX hosts without `/proc`, owners keep the authoritative lease inode open for the full lifecycle; process exit closes that kernel-held proof, which cannot be inherited by a later process reusing the PID. Structural writes complete before Atlas knowledge writes. Read commands require a `current` snapshot or return explicit stale/failed state.

Normal updates use CodeGraph incremental sync. A full structural rebuild uses `CodeGraph.clear()` followed by `indexAll()` because the current SDK clears only structural rows. The adapter never calls:

- `CodeGraph.recreate()`, which removes `codegraph.db` and its sidecars;
- `CodeGraph.uninitialize()`, which removes the entire `.atlas/` directory;
- the CodeGraph CLI rebuild path, which is allowed to choose destructive lifecycle operations.

Before mutating an existing structural index, the adapter captures an online backup of the shared database. Both full rebuild and incremental sync discard that backup only after a complete result; an incomplete result or exception restores the previously published structural graph and colocated `atlas_*` data before the Atlas lock is released.

A future physical-database recovery command must copy or export Atlas-owned tables, replace the structural database, restore Atlas data, and verify evidence before publishing `current`.

## Snapshot semantics

CodeGraph's structural tables represent the current code projection. Atlas snapshots record repository content identity, Git state, relevant file hashes, the CodeGraph package and extraction versions, build outcome, and evidence validity.

Atlas does not preserve a second full historical structural graph. Repository snapshots are content-addressed and may recur, while every successful index/sync creates a distinct immutable Atlas publication occurrence. The current world state points to the latest occurrence; each occurrence points to its predecessor, its content snapshot, target validity metadata, and path-level backend diagnostics. Business assertions remain durable across snapshots and expose validity for the requested current snapshot.

The change query proves the requested source snapshot is an ancestor of the target by following the immutable publication-occurrence chain. Repeated content identities resolve deterministically within the current chain: `to` selects the latest matching occurrence and `from` selects the latest match at or before that target; equal endpoints select the same occurrence. Atlas compares the supported source content stored in the two endpoint snapshots and returns the net added, changed, and removed `file:` references. This endpoint comparison is independent of the structural backend's incremental Git baseline: intermediate additions that are later removed and removals restored with identical content cancel naturally. Stale assertions describe validity at the selected target occurrence rather than the union of intermediate failures. Atlas does not query mutable CodeGraph rows as if they were a historical snapshot or reconstruct unsupported historical node and relation changes.

World publication captures the repository snapshot after acquiring the Atlas write lock, verifies it again after structural indexing, and compares its source hashes with CodeGraph's indexed file manifest. If source changes during that interval, including a transient change that restores the same final snapshot, Atlas rolls the structural database back and leaves the prior world snapshot as the last published revision. Every publication occurrence is immutable, so a later sync of identical content appends a new occurrence instead of replacing earlier path-level diagnostics.

## Failure and upgrade behavior

- A CodeGraph index or sync error fails the Atlas index command and leaves the world snapshot non-current.
- Atlas schema migration failure leaves CodeGraph structural data present but unpublished through Atlas until migration succeeds.
- Unsupported structure is returned as backend support metadata or an unresolved boundary; Atlas does not invent an exact edge.
- The dependency version is pinned exactly rather than selected through a semver range. The compatible host range is Node.js 22.12 through 24. Node.js 22.12 through 22.15 lack the FTS5 module required by CodeGraph 1.5.0, so the adapter runs its private SDK worker with the dependency's bundled Node.js runtime on those hosts; Node.js 22.16 through 24 use the SDK in process. Both paths expose the same Atlas contract and invoke no CodeGraph CLI, MCP, or daemon lifecycle. Upgrades run fixture repositories through index, sync, rebuild, query normalization, schema coexistence, and evidence-rebinding tests before changing the lockfile.
- If an upstream release changes structural IDs, locator-based rebinding preserves stable Atlas business keys and makes unmatched evidence stale.

Run `pnpm validation:backend` to validate the installed tarball against the
current exact dependency. To evaluate a new release before changing the pin,
run `pnpm validation:backend -- --candidate <version> --allow-network`. The
isolated consumer overrides only its installed candidate; the source manifest
and lockfile remain unchanged. The command rejects candidates that change the
database location, SDK lifecycle, schema ownership, normalized support,
business-data preservation, evidence rebinding, recovery, or worktree
isolation contracts, and prints the measured index, database, and query costs.

## Pre-release storage transition

The pre-release external `atlas.sqlite` layout is intentionally reset rather than imported. It contains the superseded duplicate structural projection, was never part of a published release, and cannot be copied into the shared database without violating schema ownership. Rebuild the worktree-local structural index, then relearn any experimental business assertions through GraphPatch.

The shared layout preserves the business node, relation, GraphPatch, evidence, certainty, validity, transaction, and lexical contracts in `atlas_*` objects. Evidence keeps public structural references without foreign keys to CodeGraph rows. The following reconciliation task extends those records with backend locators, qualified names, structural kinds, snapshot/backend versions, and the combined publication state machine.

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
