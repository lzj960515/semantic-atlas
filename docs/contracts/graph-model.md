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

Business keys are stable slash-separated keys such as `commerce/orders/place-order`. The slash-separated text is a readable namespace, not hierarchy authority. Labels and aliases form stable vocabulary while evidence-bound summaries and `part_of` placement can evolve without changing the key.

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

All learned relations originate at a business node. `realized_by` and `verified_by` target structural nodes; the other business relations target business nodes. A test directory or filename is structural context only. `map show` exposes an agent-verified declaration as a direct `verified_by` relation; the declaration remains a `Symbol` when the structural backend cannot identify a test case independently.

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

An `UnknownBoundary` records the unresolved operation, backend reason, location, and any finite candidates. Index results report unresolved-boundary counts and warnings; Atlas never converts a boundary into an exact edge. When a task reaches warned dynamic behavior, the Agent uses bounded `code search` results and authoritative source rather than assuming a missing relationship. Examples include unresolved references, reflection, runtime dependency lookup, dynamic imports, and non-unique string tokens.

## Business navigation and structural fallback

`map view` projects one canonical business graph into a visible frontier. Without a focus it exposes all current business nodes with no outgoing `part_of` relation as root regions. With a focus it exposes the focus's direct children, its root-to-focus breadcrumb, and the nearest visible external branches connected to its subtree. Any business kind may be a provisional root; an empty business graph returns no regions rather than structural directories.

`part_of` is the current business navigation hierarchy. Each business node has at most one outgoing `part_of` parent, and the hierarchy is acyclic. A later GraphPatch can atomically remove an old parent and add a broader parent while preserving the moved node's key, evidence, descendants, and non-hierarchy relationships. Structural nodes remain a separate evidence and source-navigation domain.

Non-hierarchy relations are stored only at the endpoints the Agent verified. A view lifts deeper endpoints to the visible frontier, hides relations that collapse inside one region, and groups the rest by visible endpoints and relation type. Every summary separates direct and aggregated contributor counts and preserves certainty and validity distributions. These connections are query projections and are never accepted as GraphPatch facts.

`map show` accepts one business key and returns only its direct learned relations, including direct `realized_by` and `verified_by` structural evidence. It has no depth option and does not recursively expand the CodeGraph projection.

Lexical search has two explicit domains. `map search` ranks Atlas business vocabulary and always returns business nodes. `code search` ranks CodeGraph symbols and paths and always returns structural nodes with current source locations and support. The calling AI uses structural search only when business knowledge is absent or insufficient, then opens source directly. The CLI does not add a language model or pretend lexical scores are business inference.

Structural nodes and relations include normalized `support.status` and `support.provenance`. Business assertions use `certainty`, `validity`, and evidence instead. Unknown boundaries keep their structural owner, unresolved operation, support, reason, source location, and finite candidates.
