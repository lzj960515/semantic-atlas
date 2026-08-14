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
4. The knowledge is reusable business meaning rather than a task note,
   implementation instruction, test result, Git fact, or generic code summary.

Use the repository's `schemas/graph-patch-v1.schema.json` and
`docs/contracts/graph-patch-v1.md` as the normative contract when they are
available. The outline here is an authoring checklist.

## Patch shape

A patch is one strict JSON object:

```json
{
  "schemaVersion": 1,
  "baseSnapshotId": "<current 64-character snapshot ID>",
  "nodeOperations": [],
  "relationOperations": []
}
```

Node operations upsert or remove business keys. Relation operations upsert or
remove a `(from, type, to)` relationship. A single patch can create related
nodes and connect them atomically.

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
  target.

Every learned relation originates at a business node.

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
- `hypothesis` marks exploratory knowledge that remains visibly unverified.

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
