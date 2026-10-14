# Business Map Authoring

Use this reference when encoding a confirmed business partition. The Skill owns
the workflow; [boundary-design.md](boundary-design.md) supplies boundary judgment.
This page supplies the version 1 authoring shape. The installed package's
`docs/map-format.md` defines the complete format, and `semantic-atlas validate`
checks all documents together.

## Document And Concept Shape

Store each owning document at `docs/business-map/<business-area>.yaml`.
`map.id` identifies that document; only nodes create business graph elements.
For each evidenced business area, adapt this minimal shape:

```yaml
schemaVersion: 1
map:
  id: support
  title: Customer support
  summary: Resolve customer support requests.
nodes:
  - id: support
    kind: domain
    name: Customer support
    summary: Help customers resolve service problems.
    aliases: []
    anchors:
      - kind: document
        value: README.md
        description: Current product purpose and rules.
  - id: support.resolve-request
    kind: scenario
    name: Resolve request
    summary: A customer request reaches a supported resolution.
    aliases: []
    anchors:
      - kind: symbol
        file: src/support/resolve-request.ts
        value: resolveRequest
        description: Apply the supported resolution to a customer request.
relations:
  - from: support.resolve-request
    type: part_of
    to: support
    summary: Request resolution belongs to customer support.
flows:
  - id: support.resolve-request.flow
    name: Resolve request
    summary: Complete a supported customer request.
    scenario: support.resolve-request
    startsAt: resolve
    steps:
      - id: resolve
        kind: action
        name: Resolve request
        summary: Apply the supported resolution.
        concept: support.resolve-request
      - id: resolved
        kind: outcome
        name: Request resolved
        summary: The customer request is resolved.
    transitions:
      - from: resolve
        to: resolved
```

Use evidence-backed names, summaries and flows rather than retaining illustrative
Support meaning. Document `relations` and `flows`, and node `aliases` and `anchors`, may be
empty when the evidence supplies no entries.
Every node needs `id`, `kind`, `name`, `summary`, `aliases`, and `anchors`.
IDs use lowercase business vocabulary separated by dots or hyphens and remain
unique across the repository. Node kinds are `domain`, `capability`, `scenario`,
`operation`, `data`, `invariant`, and `interface`.

## Navigation Anchors

Anchors contain `kind`, `value`, and `description`. Kinds are `file`, `directory`,
`document`, `symbol`, and `search`. A `symbol` may also include `file`, a
normalized repository-relative source path; other kinds use only the three
common fields. Its `value` names the declaration, such as
`SupportService.resolveRequest` or the module function `resolveRequest`.
Use the owning class or type when needed to distinguish same-named methods.
The name follows the source language's vocabulary rather than a parser syntax.

Prefer a file-bound symbol when current source establishes the method or
function that carries a mapped business action. Open that declaration and
confirm its responsibility before writing the anchor; `description` states
the action, rule or state change a future task should inspect there. The
Viewer shows this pair as `file#value`; the Agent locates the current declaration
and body through normal repository tools. Retain the file and symbol name as
navigation hints while current source supplies line locations and behavior.

Choose the anchor granularity that serves the business concept: a domain can
point to its directory, a data concept to its declaration file, and a durable
rule to its product document. File-like `value` fields remain normalized
repository-relative paths. Existing unbound symbols and file references stay
valid; improve them during maintenance when evidence identifies a more precise
business entry. A valid node can retain an empty anchor list when no supported
location is available.

## Relations And Flows

`part_of` points from child to parent, gives a concept at most one parent, and
keeps domain roots top-level. It describes business containment, not execution.
Use existing node IDs for every relation endpoint:

- `invokes`: scenario/operation to scenario/operation;
- `reads` / `writes`: scenario/operation to data;
- `publishes` / `consumes`: capability/scenario/operation to interface;
- `constrained_by`: business concept to invariant.

Each relation includes `from`, `type`, `to`, and a business `summary`. Even a
consumer's `consumes` relation points **to the interface**, not from it.
The source concept owns the relation, including when its target is in another
YAML. Shared concepts stay defined once in their own document.

A flow belongs to an existing `scenario` and lives beside it. Steps have `id`,
`kind`, `name`, `summary`, and optional `concept` referencing a repository-wide
node. Actions have at most one unlabeled next transition; decisions have at
least two transitions with distinct nonempty `when` labels; outcomes end paths.
All steps must be reachable from `startsAt`. Preserve source-supported business
branches, including refusals; use flows for durable outcomes rather than
helpers or framework control flow.

Run complete-graph validation and inspect each rendered domain and related flow.
Separate YAML filenames organize review; distinct domain nodes and correct
`part_of` relations make the business areas selectable in the Viewer.
