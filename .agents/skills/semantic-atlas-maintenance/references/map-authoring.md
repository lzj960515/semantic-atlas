# Initial Map Authoring

Use this reference when creating the first map documents. The Skill owns scope
selection and business partitioning; this page supplies the version 1 authoring
shape. The installed package's `docs/map-format.md` defines the complete format,
and `semantic-atlas validate` checks all documents together.

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
    anchors: []
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

Anchors contain `kind`, `value`, and `description`. Kinds are `file`, `directory`,
`document`, `symbol`, and `search`; file-like values are normalized
repository-relative paths. Keep source evidence discoverable through anchors.

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
