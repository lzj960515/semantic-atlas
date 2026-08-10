# Graph Model

## Ownership

Structural nodes and relations are compiler-owned projections. Business nodes and relations are agent-learned assertions. The graph store may persist both, but their write paths remain separate: indexing replaces structural facts, while GraphPatch changes only business knowledge.

## Node kinds

| Domain | Kind | Meaning |
| --- | --- | --- |
| Structural | `Repository` | The inspected Git repository |
| Structural | `Module` | A compiler or framework composition unit |
| Structural | `File` | A normalized repository-relative source file |
| Structural | `Symbol` | A compiler-qualified declaration |
| Structural | `Test` | A statically identified test declaration |
| Structural | `UnknownBoundary` | A dynamic or unsupported relationship Atlas cannot prove |
| Business | `Capability` | A durable business ability |
| Business | `Scenario` | A user or system scenario within a capability |
| Business | `Operation` | A business action or use-case step |
| Business | `Invariant` | A rule that constrains behavior or data |
| Business | `Interface` | A business-facing API, event, queue, or integration contract |
| Business | `Data` | A business data concept or persisted record |

Repository and snapshot IDs are lowercase SHA-256 values produced by repository inspection. Structural IDs are deterministic, namespaced values derived from normalized repository-relative paths and compiler-qualified names. They have prefixes such as `file:`, `symbol:`, `test:`, and `unknown:`. Business keys are stable slash-separated keys such as `commerce/orders/place-order`; labels and aliases form stable vocabulary while evidence-bound summaries can evolve without changing the key.

## Relation kinds

| Domain | Relation | Meaning |
| --- | --- | --- |
| Structural | `contains` | A structural container owns a child |
| Structural | `declares` | A file or module declares a symbol |
| Structural | `imports` | A file or module imports another unit |
| Structural | `exports` | A file or module exports a symbol |
| Structural | `references` | A symbol or file references another symbol |
| Structural | `calls` | A symbol invokes another symbol |
| Structural | `extends` | A declaration extends another declaration |
| Structural | `implements` | A declaration implements a contract |
| Structural | `decorated_by` | A declaration has a statically resolved decorator |
| Business | `part_of` | A business node belongs to another business node |
| Business | `realized_by` | A business node is implemented by a structural node |
| Business | `reads` | A business action reads business data |
| Business | `writes` | A business action writes business data |
| Business | `publishes` | A business action publishes an interface or data contract |
| Business | `consumes` | A business action consumes an interface or data contract |
| Business | `constrained_by` | A business node is governed by an invariant |
| Business | `verified_by` | A business node is checked by a structural test |

All learned relations originate at a business node. `realized_by` and `verified_by` target structural nodes; the other business relations target business nodes.

## Evidence, certainty, and validity

Every learned business node summary and learned relation has a certainty and one or more evidence records containing:

- a structural symbol ID;
- a normalized repository-relative source path;
- a one-based source range;
- the SHA-256 content hash observed at learning time.

Certainty and validity are independent:

- `exact` means the evidence uniquely proves the node summary or relation;
- `inferred` means evidence supports the assertion but includes an agent inference;
- `hypothesis` is exploratory and is never a verified fact;
- `valid` means all bound evidence still matches the current snapshot;
- `stale` means at least one bound evidence item changed or disappeared;
- `unknown` means the system has an explicit boundary rather than a supported assertion.

Validity is derived state and is never accepted as GraphPatch input. Reindexing compares each assertion's evidence with the new snapshot: changed or missing evidence makes that node summary or relation `stale`, while unchanged assertions remain `valid`. Stable node identity remains navigable, but every map result exposes `certainty`, `validity`, and evidence so stale or hypothesis content cannot appear exact.

## Unknown boundaries

An `UnknownBoundary` records the unresolved operation, reason, location, and any finite candidates. It is a first-class query result, not a warning to discard. Map responses preserve it through traversal and never convert it into an exact edge. Examples include reflection, runtime dependency lookup, dynamic imports, and non-unique string tokens.

## Traversal

`map roots` returns business capabilities when present and structural module roots otherwise. `map children` follows `part_of` and `contains`. `map show` traverses evidence-rich neighbors with depth 1 by default and at most 3. Lexical search ranks labels, aliases, summaries, compiler symbols, and paths; it does not perform semantic inference.
