# GraphPatch v1

GraphPatch is the only public write contract for agent-learned knowledge. It cannot create, change, or delete CodeGraph-backed structural nodes or relations. The normative input schema is `schemas/graph-patch-v1.schema.json`.

## Shape

```json
{
  "schemaVersion": 1,
  "baseSnapshotId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "nodeOperations": [
    {
      "op": "upsert",
      "node": {
        "key": "commerce/orders/place-order",
        "kind": "Operation",
        "label": "Place order",
        "summary": "Validates and creates a customer order.",
        "aliases": ["checkout"],
        "certainty": "exact",
        "evidence": [
          {
            "symbolId": "symbol:src/orders/order.service.ts#OrderService.placeOrder",
            "file": "src/orders/order.service.ts",
            "range": {
              "start": { "line": 18, "column": 3 },
              "end": { "line": 24, "column": 4 }
            },
            "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
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
          "id": "symbol:src/orders/order.service.ts#OrderService.placeOrder"
        },
        "certainty": "exact",
        "evidence": [
          {
            "symbolId": "symbol:src/orders/order.service.ts#OrderService.placeOrder",
            "file": "src/orders/order.service.ts",
            "range": {
              "start": { "line": 18, "column": 3 },
              "end": { "line": 24, "column": 4 }
            },
            "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          }
        ]
      }
    }
  ]
}
```

## Operations

Business node upserts contain a stable hierarchical `key`, one of `Capability`, `Scenario`, `Operation`, `Invariant`, `Interface`, or `Data`, plus a label, summary, aliases, certainty, and at least one evidence record. The key, kind, label, and aliases form vocabulary identity; the summary is an assertion governed by certainty and evidence. A node-only patch without assertion evidence is invalid. Removing a node uses `{ "op": "remove", "key": "..." }`.

Business relation upserts contain a source reference, relation type, target reference, certainty, and at least one evidence record. Removing a relation supplies its source, type, and target selector. The stable relation identity is that `(from, type, to)` tuple; repeated upserts replace the assertion and its evidence idempotently.

Reference domains make ownership explicit:

- `{ "domain": "business", "key": "..." }` addresses an existing or same-patch business node.
- `{ "domain": "structural", "id": "symbol:..." }` addresses an Atlas-normalized CodeGraph node in the base snapshot.

All learned relations originate at a business node. `realized_by` and `verified_by` target structural nodes; `part_of`, `reads`, `writes`, `publishes`, `consumes`, and `constrained_by` target business nodes.

## Evidence and certainty

Each node or relation evidence item binds an Atlas structural reference, normalized repository-relative file, one-based source range, and lowercase SHA-256 content hash. Atlas also records the backend locator and version needed for later rebinding. Evidence must resolve inside the same worktree and match the current completed snapshot exactly.

`exact` means the node summary or relation is uniquely established by evidence. `inferred` means the agent made a supported inference. `hypothesis` records exploration and remains visibly non-factual even while its evidence is current. Certainty never upgrades automatically.

## Atomic validation

`learn --stdin` performs these checks before writing:

1. The schema version and complete JSON value are valid.
2. `baseSnapshotId` equals the current working-tree snapshot.
3. Every referenced node exists either in the current snapshot or in the patch.
4. Relation endpoints and kinds satisfy the graph contract.
5. Every node and relation evidence symbol, path, range, and hash belongs to the current repository snapshot.
6. Removes do not leave dangling business relations.

The patch is one transaction. Any failure rejects every operation with exit code 5 and a machine-readable error; retries start from a freshly read snapshot. No partial success is exposed.

Validity is derived rather than accepted from GraphPatch. After later indexing, only node summaries and relations with changed evidence become `stale`. Stable node identity and unaffected assertions remain available, and hypotheses remain hypotheses.
