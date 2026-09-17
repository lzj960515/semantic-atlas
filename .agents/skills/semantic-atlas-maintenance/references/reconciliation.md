# Reconciliation Evidence Guide

Use this guide for candidate reconciliation after loading the versioned report
and selecting one business domain. Apply the Skill's common business-ownership
rules to this domain before selecting files or accepting its recorded ownership.

## Read Candidate Provenance

Each candidate group represents one exact domain, kind, and proposed summary.
Every origin retains:

- its task-observation ID, task/run identity, and candidate position;
- the candidate-specific evidence and `confirmed`, `contradicted`, or
  `unresolved` disposition;
- the task's map queries and current-evidence dispositions;
- any task or review human correction;
- every linked independent review and its accuracy assessment.
- earlier unresolved maintenance classifications and current evidence, when
  the candidate group has become actionable again through a new origin.

`confirmed` says task-time evidence supported the proposed correction.
`contradicted` says current evidence contradicted the mapped statement that the
candidate proposes to replace. `unresolved` identifies a useful lead whose
stable meaning was not established. These task dispositions organize the
maintenance investigation; independent review remains the correctness
authority for the engineering run that produced them.

## Decide Whether Meaning Is Durable

A correction belongs in the shared map when future tasks can independently
name, navigate to, depend on, constrain, read, write, publish, consume, or
change it. Keep methods, helpers, SQL details, folders, framework components,
temporary migrations, and one-off execution state as implementation-local
evidence.

Use current tracked product documents for durable intent and current source and
tests for implemented collaboration. Use runtime evidence when the conclusion
depends on deployed state. When these sources disagree, state the disagreement
and leave the candidate unresolved until the owning authority can decide it.

## Classify Current Evidence

Classify every selected origin against current durable meaning:

- `accepted`: current evidence supports the proposed durable correction;
- `refined`: current evidence supports a narrower or differently worded durable
  correction;
- `discarded`: current evidence shows implementation-local, obsolete, or
  unsupported meaning that does not belong in the shared map;
- `unresolved`: available evidence cannot yet establish stable business meaning.

A correct discarded or unresolved conclusion is complete and may have no map
change. Keep that meaning outside the canonical map.

## Handle Drift And Duplicates

- A stale anchor can be accepted when the business concept remains durable and
  current source provides the replacement navigation hint.
- A contradicted relation can be replaced after both current endpoints and the
  relation direction are confirmed.
- A missing concept can be added when current evidence establishes stable
  business identity, ownership, and meaning rather than only a source symbol.
- A flow can be added or corrected when durable evidence establishes the
  scenario's business-relevant actions, decisions, labeled branches, and
  outcomes. Keep the flow at business granularity and classify a source
  discrepancy before changing the canonical path.
- A repository with `MAP_NOT_FOUND` can begin with one domain-owned map when
  current evidence establishes that domain and the selected bounded concepts.
  Cross-domain relations wait until both stable endpoints can join one valid
  graph.
- A duplicate candidate keeps all provenance but produces one YAML edit.
- A transient or implementation-local observation is discarded with a concise
  evidence-backed reason and produces no map change.

## Keep One Candidate Domain Review Surface

Edit or create one owning `docs/business-map/*.yaml` file for the selected
domain when current evidence confirms that ownership. Reuse a file because its
business meaning matches, and create the owning file for a new independent
business domain. The Skill's common rules apply equally to an existing or
initial map. When the evidence requires repartitioning existing files, prepare
the complete normal authoring/reorganization Git candidate and report retained
origins separately; one `owningMapPath` must not stand for a multi-file result.
The original observation stays immutable, and accurate origin reconciliation
remains separate from that authoring delivery. Validate the complete graph because
relation endpoints and containment remain repository-wide even when the Git
diff is local. Render the changed graph and inspect the selected neighborhood.
The final Git diff is the independent review surface; retained observation
artifacts stay unchanged.

## Record The Reviewed Outcome

A maintenance observation settles retained candidates, not a general map-authoring
run. Direct authoring without retained origins uses Git review and integration
evidence. Ownership reorganization likewise keeps its complete Git diff distinct
from the single-domain result contract. Retain exact candidate identities and
report pending reconciliation when the change cannot truthfully be represented
by the current result shape.

One maintenance result identifies an exact source with both
`taskObservationId` and zero-based `candidateIndex`. Repeated summaries do not
replace this identity. The command rejects a missing source or a source owned by
another `businessDomainId`.

Use this shape after independent review and integration:

```json
{
  "schemaVersion": 1,
  "id": "maintenance-observation-id",
  "recordedAt": "2026-08-31T08:00:00.000Z",
  "maintenance": {
    "taskId": "maintenance-task-id",
    "runId": "integration-run-id"
  },
  "businessDomainId": "commerce",
  "results": [
    {
      "candidate": {
        "taskObservationId": "task-observation-id",
        "candidateIndex": 0
      },
      "status": "accepted",
      "reason": "Current source confirms the durable business meaning.",
      "evidence": [
        { "kind": "source", "reference": "src/orders/place-order.ts" }
      ]
    }
  ],
  "mapChange": {
    "owningMapPath": "docs/business-map/commerce.yaml",
    "mergedCommit": "MERGED_COMMIT_HEX"
  }
}
```

Replace `MERGED_COMMIT_HEX` with the full hexadecimal commit that actually
merged the reviewed map change before submitting the observation.

`accepted` and `refined` require `mapChange`; a document containing only
`discarded` and `unresolved` results omits it. Every result needs a concise
reason and at least one current evidence reference. One document lists each
exact candidate source once.

The reconciliation report exposes only actionable groups in `domains`.
`waitingForEvidenceOccurrences` counts unresolved sources for which no new
origin has appeared. A new origin with the same domain, kind, and summary makes
the group actionable again and returns the earlier unresolved history beside
the new evidence.
