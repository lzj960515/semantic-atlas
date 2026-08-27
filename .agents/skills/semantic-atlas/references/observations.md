# Accuracy Observation Contract

Create one immutable task observation after business-changing engineering work
has reached its current result. Generate `id` once, keep `recordedAt` stable,
and replay the same document when a submission result is uncertain.

## Task Observation

The task Agent records investigation evidence. It does not add review verdicts,
correctness fields, rework judgments, or map-regression judgments. Current task
observations use schema version 2.

```json
{
  "schemaVersion": 2,
  "id": "task-observation-unique-id",
  "recordedAt": "2026-08-27T03:00:00.000Z",
  "task": {
    "taskId": "engineering-task-id",
    "runId": "engineering-run-id"
  },
  "map": {
    "queries": [
      {
        "selector": "Place order",
        "outcome": "context",
        "selectedConceptIds": ["commerce.orders.place-order"]
      }
    ],
    "dispositions": [
      {
        "status": "stale",
        "summary": "Current source moved while the mapped business meaning stayed stable.",
        "evidence": [
          {
            "kind": "source",
            "reference": "src/orders/place-order.ts"
          }
        ]
      }
    ]
  },
  "mapUpdateCandidates": [
    {
      "businessDomainId": "commerce",
      "kind": "anchor",
      "disposition": "confirmed",
      "summary": "Replace the stale source anchor during reconciliation.",
      "evidence": [
        {
          "kind": "source",
          "reference": "src/orders/place-order.ts"
        }
      ]
    }
  ]
}
```

Query outcomes are `context`, `concept_not_found`, `concept_ambiguous`,
`map_not_found`, or `unavailable`. Only `context` includes one or more
`selectedConceptIds`. Current-evidence dispositions are `confirmed`, `missing`,
`stale`, `contradicted`, or `unresolved`. Evidence kinds are `source`, `test`,
`document`, or `runtime`.

Every map-update candidate names its stable `businessDomainId`. Its disposition
is `confirmed` when current evidence supports the proposed correction,
`contradicted` when it replaces a mapped statement contradicted by current
evidence, or `unresolved` when it remains a maintenance lead. Periodic
maintenance preserves these task-time judgments and linked independent reviews,
then confirms durable business meaning again before editing canonical YAML.
Immutable task v1 observations remain readable after package upgrades, but
their candidates predate these ownership fields and therefore stay outside
domain reconciliation.

When a person explicitly corrects the task, add:

```json
{
  "humanCorrection": {
    "summary": "The user corrected the business boundary.",
    "dimensions": ["business_boundary"]
  }
}
```

Correction dimensions are `business_boundary`, `upstream_cause`, `impact`, and
`map_use`.

Submit the document on standard input from the repository or provide `--repo`:

```text
semantic-atlas observe task --stdin --repo <repository-root>
```

The first submission returns `recorded`. An exact replay returns `idempotent`.
The same ID with changed content returns `OBSERVATION_CONFLICT`.

## Independent Review Observation

An independent reviewer references the retained task observation and owns the
accuracy assessment:

```json
{
  "schemaVersion": 1,
  "id": "review-observation-unique-id",
  "recordedAt": "2026-08-27T03:30:00.000Z",
  "taskObservationId": "task-observation-unique-id",
  "review": {
    "taskId": "review-task-id",
    "runId": "review-run-id",
    "verdict": "approved",
    "businessBoundary": "correct",
    "upstreamCause": "correct",
    "impactCompleteness": "complete",
    "requiredRework": false,
    "mapCausedRegression": false
  }
}
```

Submit it with:

```text
semantic-atlas observe review --stdin --repo <repository-root>
```

An approved review cannot contain an incorrect assessed dimension, required
rework, or a map-caused regression. A `changes_requested` review sets
`requiredRework` to `true` and can record the failed accuracy dimensions.
