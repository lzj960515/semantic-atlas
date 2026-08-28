# Semantic Atlas Map Format

This page defines the initial tracked document model, graph meaning, validation
rules, and context projection. The implementation will publish a machine schema
that follows this contract.

**Status: implemented by the `schemaVersion: 1` validation and context-query
path.**

## Repository Layout

Repositories store maps by stable business domain:

```text
docs/business-map/
├── commerce.yaml
├── fulfillment.yaml
└── support.yaml
```

The first implementation uses this conventional directory. Every `*.yaml` file
in the directory participates in one repository-wide graph. File names organize
ownership but do not become graph nodes.

## Document Shape

```yaml
schemaVersion: 1
map:
  id: commerce
  title: Commerce
  summary: Capabilities that let a shopper discover and purchase products.

nodes:
  - id: commerce
    kind: domain
    name: Commerce
    summary: Customer-facing product discovery and purchase.
    aliases: []
    anchors:
      - kind: directory
        value: src/commerce
        description: Likely source entry point for Commerce behavior.

relations:
  - from: commerce.orders
    type: part_of
    to: commerce
    summary: Orders is a durable Commerce capability.
```

Top-level `map` metadata identifies the owning document for diagnostics and
review. It does not create a repository hub or implicit graph node.

## Node Contract

Each node contains:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable repository-wide business identity |
| `kind` | yes | One supported business concept kind |
| `name` | yes | Concise human-facing business name |
| `summary` | yes | Durable meaning and outcome, not implementation detail |
| `aliases` | yes | Alternative business vocabulary used for deterministic lookup |
| `anchors` | yes | Zero or more current investigation hints |
| `notes` | no | Durable qualification or known uncertainty useful to future tasks |

IDs use lowercase dot-separated business vocabulary, for example
`commerce.orders.place-order`. They remain stable when implementation paths or
semantic parents change. Containment lives in explicit `part_of` relations.

Supported node kinds are:

```text
domain
capability
scenario
operation
data
invariant
interface
```

Every node is advisory. The format does not assign a numeric truth score or
pretend that one confidence value can replace task-time evidence.

## Relation Contract

Each relation contains:

| Field | Required | Meaning |
| --- | --- | --- |
| `from` | yes | Source business node ID |
| `type` | yes | Supported directed relation kind |
| `to` | yes | Target business node ID |
| `summary` | yes | Business reason for this relation |
| `notes` | no | Durable qualification or known uncertainty |

The tuple `(from, type, to)` is unique across the complete repository map.

### Containment

`part_of` expresses one primary semantic parent. It supports business zoom and
ownership without claiming execution order. A non-domain node has at most one
direct `part_of` parent. Domain nodes are top-level business areas.

### Horizontal Relations

- `invokes`: one scenario or operation collaborates with another business
  action;
- `reads`: an action uses a data concept;
- `writes`: an action creates or changes a data concept;
- `publishes`: an action or capability emits an interface;
- `consumes`: an action or capability receives an interface;
- `constrained_by`: a business concept is governed by an invariant.

Relations describe durable business collaboration. They do not encode branch
conditions, total order, retry behavior, loops, timing, or runtime execution
state.

## Navigation Anchors

Anchors help an agent enter the current repository. They are hints rather than
evidence bindings.

```yaml
anchors:
  - kind: file
    value: src/orders/place-order.service.ts
    description: Historical implementation entry for placing an order.
  - kind: directory
    value: src/inventory
    description: Inventory capability source area.
  - kind: symbol
    value: PlaceOrderService.execute
    description: Likely orchestration symbol.
  - kind: search
    value: PLACE_ORDER
    description: Stable operation or event vocabulary.
  - kind: document
    value: docs/orders/place-order.md
    description: Tracked product intent for the scenario.
```

Supported anchor kinds are `file`, `directory`, `symbol`, `search`, and
`document`. `value` is repository-relative for file-like anchors and literal
search vocabulary for symbol or search anchors.

The CLI preserves anchors exactly in context results. It may report an advisory
diagnostic for a missing file or directory. The calling agent decides how to
continue through current source discovery.

## Validation Rules

The complete repository map must satisfy:

1. Every document uses `schemaVersion: 1` and the strict field contract.
2. Document IDs and node IDs are repository-wide unique.
3. Node and relation kinds use supported values.
4. Every relation endpoint resolves after all documents load.
5. Relation tuples are unique.
6. Every node has at most one direct `part_of` parent.
7. `part_of` contains no cycles.
8. Domain nodes have no `part_of` parent.
9. Names, summaries, IDs, aliases, anchor values, and relation summaries are
   non-empty after trimming.
10. Aliases are unique for one node after case-insensitive normalization.
11. Repository-relative anchors remain relative and normalized.
12. Normalized graph order is deterministic across file discovery order.

Horizontal relation endpoints follow their business meaning:

- `invokes` connects a scenario or operation to a scenario or operation;
- `reads` and `writes` connect a scenario or operation to data;
- `publishes` and `consumes` connect a capability, scenario, or operation to an
  interface;
- `constrained_by` targets an invariant.

The first version does not require every node to have a parent or horizontal
relation. Incompleteness is valid advisory knowledge and remains visible to the
caller.

## Lookup Semantics

A selector resolves in this order:

1. exact stable ID;
2. case-insensitive exact node name;
3. case-insensitive exact alias;
4. normalized partial name or alias match.

One match returns a context projection. Multiple matches return ambiguity with
stable IDs and names. Zero matches returns `CONCEPT_NOT_FOUND` and leaves
bounded current-evidence business discovery available.

The initial lookup is deterministic and vocabulary-based. Natural-language
inference belongs to the calling agent, which can issue another bounded term or
continue with current source.

## Context Projection

For one selected node, `context` returns:

- the selected node;
- its ordered ancestor chain;
- direct semantic children;
- direct incoming and outgoing horizontal relations;
- complete summaries for referenced endpoint nodes;
- navigation anchors for all directly returned nodes;
- the document IDs that supplied each item;
- advisory anchor diagnostics when requested and available.

The result is intentionally local. The caller can query another returned stable
ID when it needs to expand the investigation.

## Editing And Reconciliation

Agents edit the owning YAML file directly and use `semantic-atlas validate`
before submitting a map change. Git diff is the review surface.

Business-changing engineering tasks record observations outside the canonical
map and create candidates only for stable meaning that needs maintenance.
Post-integration or periodic reconciliation confirms candidates in current
evidence, updates one bounded neighborhood, validates the complete graph, and
submits the normal repository change for review. A mapless repository can use
the same reviewed path to establish one evidence-supported initial domain.
