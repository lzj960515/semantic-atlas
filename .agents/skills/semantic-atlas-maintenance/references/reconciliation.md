# Reconciliation Evidence Guide

Use this guide after loading the versioned candidate report and selecting one
business domain.

## Read Candidate Provenance

Each candidate group represents one exact domain, kind, and proposed summary.
Every origin retains:

- its task-observation ID, task/run identity, and candidate position;
- the candidate-specific evidence and `confirmed`, `contradicted`, or
  `unresolved` disposition;
- the task's map queries and current-evidence dispositions;
- any task or review human correction;
- every linked independent review and its accuracy assessment.

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

## Handle Drift And Duplicates

- A stale anchor can be accepted when the business concept remains durable and
  current source provides the replacement navigation hint.
- A contradicted relation can be replaced after both current endpoints and the
  relation direction are confirmed.
- A missing concept can be added when current evidence establishes stable
  business identity, ownership, and meaning rather than only a source symbol.
- A duplicate candidate keeps all provenance but produces one YAML edit.
- A transient or implementation-local observation is discarded with a concise
  evidence-backed reason and produces no map change.

## Keep One Review Surface

Edit one owning `docs/business-map/*.yaml` file for the selected domain. Validate
the complete graph because relation endpoints and containment remain
repository-wide even when the Git diff is local. Render the changed graph and
inspect the selected neighborhood. The final Git diff is the independent
review surface; retained observation artifacts stay unchanged.
