# GraphPatch authoring

Read this reference only when durable, verified business knowledge should be
written to Semantic Atlas.

## Preconditions

1. `status` identifies the intended worktree and a current, complete world
   snapshot.
2. The Agent has inspected the relevant source and can state the assertion,
   certainty, and evidence separately.
3. Current map output supplies every structural symbol ID, exact source range,
   and file `contentHash` used as evidence.
4. The knowledge is durable, verified, reusable business meaning rather than a
   task note, implementation instruction, test result, Git fact, debugging
   symptom, or generic code summary.

Use the repository's `schemas/graph-patch-v1.schema.json` and
`docs/contracts/graph-patch-v1.md` as the normative contract when they are
available. The outline here is an authoring checklist.

## Patch shape

A patch is one strict JSON object. Every operation uses the discriminator `op`.
Relation endpoints are domain-tagged objects rather than key or ID strings:

```json
{
  "schemaVersion": 1,
  "baseSnapshotId": "<current 64-character snapshot ID>",
  "nodeOperations": [
    {
      "op": "upsert",
      "node": {
        "key": "commerce/orders/place-order",
        "kind": "Operation",
        "label": "Place order",
        "summary": "Creates and persists a customer order.",
        "aliases": ["checkout"],
        "certainty": "exact",
        "evidence": [
          {
            "symbolId": "symbol:<current structural identity>",
            "file": "src/orders/order.service.ts",
            "range": {
              "start": { "line": 18, "column": 3 },
              "end": { "line": 24, "column": 4 }
            },
            "contentHash": "<current 64-character file hash>"
          }
        ]
      }
    }
  ],
  "relationOperations": [
    {
      "op": "upsert",
      "relation": {
        "from": {
          "domain": "business",
          "key": "commerce/orders/place-order"
        },
        "type": "realized_by",
        "to": {
          "domain": "structural",
          "id": "symbol:<current structural identity>"
        },
        "certainty": "exact",
        "evidence": [
          {
            "symbolId": "symbol:<current structural identity>",
            "file": "src/orders/order.service.ts",
            "range": {
              "start": { "line": 18, "column": 3 },
              "end": { "line": 24, "column": 4 }
            },
            "contentHash": "<current 64-character file hash>"
          }
        ]
      }
    }
  ]
}
```

Node removal uses `{ "op": "remove", "key": "..." }`. Relation removal uses
`op: "remove"` with the same domain-tagged `from`, `type`, and `to` selector but
without certainty or evidence. A single patch can create related nodes and
connect them atomically.

## Business vocabulary

Node kinds:

- `Capability`: a durable business ability;
- `Scenario`: a user or system scenario within a capability;
- `Operation`: a business action or use-case step;
- `Invariant`: a rule constraining behavior or data;
- `Interface`: an API, event, queue, or integration contract;
- `Data`: a business data concept or persisted record.

Use stable lowercase hierarchical keys such as
`<domain>/<capability>/<concept>`. Labels and aliases provide vocabulary;
summaries state evidence-bound assertions.

Business relation types:

- `part_of`, `reads`, `writes`, `publishes`, `consumes`, and `constrained_by`
  connect a business source to a business target;
- `realized_by` and `verified_by` connect a business source to a structural
  `Symbol` or `Test` declaration returned by the current map. A `File` or
  `Module` is navigation context, not a learned implementation or verification
  target. When the backend exposes only a test file, cite that source in the
  task result and omit `verified_by` until a declaration target is available.

Every learned relation originates at a business node.

- Every `from` is `{ "domain": "business", "key": "..." }`.
- A business target is `{ "domain": "business", "key": "..." }`.
- A structural target is `{ "domain": "structural", "id": "symbol:..." }` or
  a current `test:...` declaration ID.

## Evidence

Every upserted node summary and relation includes at least one evidence item:

```json
{
  "symbolId": "symbol:<Atlas structural identity>",
  "file": "<repository-relative source path>",
  "range": {
    "start": { "line": 1, "column": 1 },
    "end": { "line": 1, "column": 1 }
  },
  "contentHash": "<current Atlas file content hash>"
}
```

Copy structural identity, path, range, and hash from a current Atlas map result.
Atlas validates that the symbol resolves, path and range match, and file hash is
current. Evidence outside the worktree or fabricated from source text is not a
valid binding.

Certainty is independent from evidence freshness:

- `exact` means the evidence uniquely proves the assertion;
- `inferred` means the evidence supports an explicit Agent synthesis;
- `hypothesis` is available in the GraphPatch contract for explicitly requested
  exploratory records. The required task-completion capture keeps unverified
  hypotheses in task context and persists only verified `exact` or `inferred`
  knowledge.

Use one assertion per clear business meaning. Multiple source locations can
support one assertion; one nearby symbol should not stand in for an unproven
workflow.

## Submission and conflicts

Send exactly one complete JSON value through standard input:

```sh
semantic-atlas learn --stdin < /path/to/graph-patch.json
```

Keep transient patch drafts outside tracked repository content. On an invalid
input error, correct the schema or reference. On snapshot, evidence, or
repository-boundary rejection, run `status`, re-query the current map, and
rebuild the patch from current evidence. Preserve atomic intent rather than
partially replaying operations.

After success, inspect the returned operation counts and run `map show` for the
learned key. Confirm its certainty, `valid` status, evidence, and intended
relationships before relying on it in later tasks.
