# Graph Model

## One graph, two ownership domains

Semantic Atlas exposes one world graph. Its two domains have different authorities and write lifecycles:

- structural nodes and relations are normalized from the embedded CodeGraph backend and are replaced or synchronized by indexing;
- business nodes and relations are evidence-bound Atlas assertions changed only through GraphPatch;
- evidence relations connect the domains and are rebound after indexing.

The domains are physically separated by lifecycle: CodeGraph structure lives in the current worktree's disposable `.atlas/codegraph.db`, while repository-wide Atlas knowledge and snapshot bindings live in `~/.semantic-atlas/repositories/<repository-id>/atlas.db`. Atlas does not copy CodeGraph nodes and edges into parallel structural tables. The world-graph query layer composes both stores in memory and returns one versioned Atlas contract.

## Node kinds

| Domain | Kind | Meaning |
| --- | --- | --- |
| Structural | `Repository` | The indexed worktree |
| Structural | `Module` | A code or framework composition unit |
| Structural | `File` | A normalized repository-relative source file |
| Structural | `Symbol` | A normalized CodeGraph declaration such as a class, function, method, field, interface, route, or component |
| Structural | `Test` | A backend-statically identified test declaration when such identity is available |
| Structural | `UnknownBoundary` | An unresolved or unsupported structural relationship |
| Business | `Capability` | A durable business ability |
| Business | `Scenario` | A user or system scenario within a capability |
| Business | `Operation` | A business action or use-case step |
| Business | `Invariant` | A rule that constrains behavior or data |
| Business | `Interface` | A business-facing API, event, queue, or integration contract |
| Business | `Data` | A business data concept or persisted record |

Repository and snapshot IDs are content identifiers produced by Atlas repository inspection. Public structural IDs are deterministic Atlas references derived from normalized backend identity, path, kind, and qualified name. Backend row IDs remain internal locators and may change after a CodeGraph upgrade or rebuild.

Business keys are stable slash-separated keys such as `commerce/orders/place-order`. Labels and aliases form stable vocabulary while evidence-bound summaries can evolve without changing the key.

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
| Structural | `instantiates` | A symbol creates an instance |
| Structural | `decorated_by` | A declaration has a resolved decorator |
| Business | `part_of` | A business node belongs to another business node |
| Business | `invokes` | A scenario or operation invokes another operation |
| Business | `realized_by` | A business node is implemented by a structural node |
| Business | `reads` | A business action reads business data |
| Business | `writes` | A business action writes business data |
| Business | `publishes` | A business action publishes an interface or data contract |
| Business | `consumes` | A business action consumes an interface or data contract |
| Business | `constrained_by` | A business node is governed by an invariant |
| Business | `verified_by` | A business node is checked by an agent-verified structural declaration |

All learned relations originate at a business node. `realized_by` and `verified_by` target structural nodes; the other business relations target business nodes. A test directory or filename is structural context only. Atlas exposes a declaration in `map.show.tests` after an agent verifies it through `verified_by`; the declaration remains a `Symbol` when the structural backend cannot identify a test case independently.

## Structural support

Structural results preserve backend provenance. Direct syntax and uniquely resolved relations can be reported as exact structural support. CodeGraph relations with heuristic provenance remain visibly inferred. Unresolved references become `UnknownBoundary` results rather than exact edges.

Structural support and business certainty are separate concepts. A structurally exact call edge does not by itself prove a business assertion, and an agent may create an inferred business relation from several exact structural facts.

## Evidence, certainty, and validity

Every learned business node summary and learned relation has a certainty and one or more evidence records containing:

- a public Atlas structural reference and optional internal backend locator;
- a normalized repository-relative source path;
- a qualified symbol identity and structural kind when available;
- a one-based source range;
- the SHA-256 content hash observed at learning time;
- the Atlas snapshot and structural-backend version observed at learning time.

Evidence does not have a cascading foreign key to CodeGraph rows. Its original locator is repository-wide; every successful worktree publication records a separate snapshot binding. Indexing one branch therefore cannot overwrite another branch's resolved reference or validity.

Certainty and validity are independent:

- `exact` means the evidence uniquely proves the business assertion;
- `inferred` means the evidence supports the assertion and includes agent inference;
- `hypothesis` is exploratory and is never a verified fact;
- `valid` means every evidence record uniquely rebinds and its source hash still matches;
- `stale` means at least one evidence record changed, disappeared, or became ambiguous;
- `unknown` describes an explicit structural boundary rather than a business assertion.

Validity is derived state and is never accepted as GraphPatch input. Stable business identity remains navigable while stale summaries and relations stay visibly stale. Certainty never upgrades automatically.

## Unknown boundaries

An `UnknownBoundary` records the unresolved operation, backend reason, location, and any finite candidates. It is a first-class query result. Map responses preserve it through traversal and never convert it into an exact edge. Examples include unresolved references, reflection, runtime dependency lookup, dynamic imports, and non-unique string tokens.

## Traversal

`map roots` returns business capabilities when present and structural module roots otherwise. Every business concept produced by one capability-scoped derivation has a direct `part_of` relation to that capability, so entry scenarios, operations, invariants, interfaces, and data remain reachable even when the flow has no route. `map children` follows `part_of` and `contains`. `map show` composes Atlas business neighbors, evidence links, and CodeGraph structural neighbors with depth 1 by default and at most 3.

Lexical search combines Atlas business vocabulary with CodeGraph structural search. The calling AI performs natural-language interpretation; the CLI does not add a language model or pretend lexical scores are business inference.

The two search domains are combined with deterministic reciprocal-rank fusion. Scores express ordering inside the combined result only; they do not convert structural relevance into business certainty.

Structural nodes and relations include normalized `support.status` and `support.provenance`. Business assertions use `certainty`, `validity`, and evidence instead. Unknown boundaries keep their structural owner, unresolved operation, support, reason, source location, and finite candidates.
