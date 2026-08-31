---
name: semantic-atlas-maintenance
description: Reconcile current Semantic Atlas candidates for one business domain into a source-supported reviewed map update or evidence conclusion, then record the result after integration. Use for post-integration maintenance, initial-domain bootstrap, drift cleanup, candidate triage, and domain-scoped reconciliation with or without an existing business map.
compatibility: Requires Node.js 24+, Git, the current semantic-atlas CLI, retained local observations, and repository source access.
---

# Semantic Atlas Maintenance

Turn current candidate leads for one business domain into one independently
reviewable map update or evidence conclusion. Current source, tests, tracked product documents,
and required runtime evidence decide the result. Candidate
provenance explains where to investigate; it does not authorize a map edit.

Read [references/reconciliation.md](references/reconciliation.md) before
classifying candidates. It defines evidence meaning, durable-content tests,
duplicate handling, maintenance-observation fields, and stopping conditions.

## Work Phase

### Load Current Actionable Candidates

1. Resolve the repository root and work only in the assigned worktree.
2. Run:

   ```bash
   semantic-atlas reconcile candidates --repo <absolute-repository-root>
   ```

3. Confirm the v1 `reconcile candidates` envelope. Select one business domain
   from `data.domains`. Read each origin's exact `taskObservationId` and
   `candidateIndex`, task evidence, linked independent reviews, duplicate
   provenance, and any earlier unresolved maintenance history.
   Treat task-time `confirmed`, `contradicted`, and `unresolved` dispositions as
   investigation inputs rather than maintenance conclusions.
4. When `data.domains` is empty, finish with a no-change result. A positive
   `waitingForEvidenceOccurrences` means prior investigation remains retained
   but does not justify immediately repeating the same work.

### Confirm Current Business Meaning

Open every decisive current source, test, or tracked product document named by
the selected origins. Follow current callers and collaborators when a proposed
relation changes both endpoints. Use runtime evidence when deployed state owns
the conclusion.

Classify every selected origin:

- `accepted`: current evidence supports the proposed durable correction;
- `refined`: current evidence supports a narrower or differently worded durable
  correction;
- `discarded`: current evidence shows implementation-local, obsolete, or
  unsupported meaning that does not belong in the shared map;
- `unresolved`: available evidence cannot yet establish stable business meaning.

Keep discarded and unresolved results outside the canonical map. A correct
discard or unresolved conclusion is a complete work result and may have no Git
change.

### Resolve And Edit One Owning YAML

- Edit the selected domain's existing owning `docs/business-map/*.yaml` file.
- When the graph exists without an owning file for this domain, create one
  domain-owned YAML that participates in complete-graph validation.
- When no map documents exist, create one initial business-domain YAML under
  `docs/business-map/`. Establish its stable domain ID, title, summary, root
  node, and only the bounded accepted or refined meaning supported by current
  evidence. Preserve `MAP_NOT_FOUND` as the explicit bootstrap condition.

Limit the initial map to stable meaning supported by the selected candidates and current evidence.

Limit the run to one owning YAML. Preserve stable node IDs when business
identity is unchanged, declare directed relations from the source concept's
owning file, and keep anchors as navigation hints. One duplicate candidate
group produces one map edit while its maintenance draft retains every exact
origin.

### Validate And Prepare The Review Candidate

When the map changes, run:

```bash
semantic-atlas validate --repo <absolute-repository-root>
semantic-atlas render --repo <absolute-repository-root> \
  --output <repository-root>/tmp/semantic-atlas-<business-domain>.html
git diff --check
git diff -- docs/business-map/<owning-file>.yaml
```

Inspect the changed neighborhood in the Viewer. Confirm the Git diff changes at
most one owning YAML and leaves retained observations unchanged. Commit the map
candidate through the host workflow.

Prepare, but do not record, one maintenance-observation JSON document. It
contains the maintenance task/run identity, selected `businessDomainId`, every
exact candidate source, classification, reason, and current evidence. Accepted
or refined results reserve `mapChange.owningMapPath`; the Integration Phase adds
the real `mergedCommit`.

Do not record a terminal maintenance observation during the Work Phase. At this
point the classification and YAML are proposals that have not completed
independent review and integration.

Report the selected domain, origins, classifications, evidence, owning YAML,
validation and render results, Git candidate, and the prepared observation to
the host workflow.

## Review Phase

Use the host workflow's ordinary independent review. Review durable business
meaning, relation direction, evidence support, complete-graph validity, exact
candidate coverage, one-domain ownership, and whether discarded or unresolved
conclusions correctly avoid a map edit.

Changes requested return to the normal Work Phase. Approval authorizes the host
workflow to enter Integration Phase; it does not itself consume candidates.

## Integration Phase

1. Re-read the approved work and review evidence.
2. When a map candidate exists, merge it through the repository's normal Git
   flow and capture the actual `mergedCommit`. Put that commit and the one
   `owningMapPath` into `mapChange`.
3. When every result is discarded or unresolved, keep `mapChange` absent and
   continue only after the no-change conclusion has passed independent review.
4. Send the complete JSON document through standard input:

   ```bash
   semantic-atlas observe maintenance --stdin --repo <absolute-repository-root>
   ```

5. Require a `recorded` or `idempotent` success response before reporting the
   maintenance task complete. Reuse the exact observation ID and document on an
   uncertain retry. The same ID with changed content is a conflict.
6. Rerun `semantic-atlas reconcile candidates --repo` when confirming the
   result. Accepted, refined, and discarded origins disappear from actionable
   candidates. Unresolved origins remain retained as waiting for new evidence
   and do not immediately schedule the same work again.

If the map merged but observation recording failed, preserve the merged Git
result and keep the task incomplete. Resume or retry the Integration Phase with
the exact same observation document until the idempotent record succeeds.
