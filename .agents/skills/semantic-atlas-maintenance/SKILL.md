---
name: semantic-atlas-maintenance
description: Create, extend, correct, and reconcile source-supported business maps according to real business ownership. Use for project or local map requests, ongoing business-map maintenance, post-integration candidate reconciliation, and drift cleanup with or without an existing business map.
compatibility: Requires Node.js 24+, Git, the current semantic-atlas CLI, and repository source access. Candidate reconciliation also requires retained local observations.
---

# Semantic Atlas Maintenance

Create or maintain a source-supported business map through ordinary Git review.
Current source, tests, tracked product documents, and required runtime evidence
decide business meaning; retained candidates supply investigation leads.

## Choose The Requested Scope

Resolve the repository root and assigned worktree. A request to create, extend,
correct or reorganize a map is **direct authoring**: use current evidence for
its requested business scope, including when the candidate report is empty.
Project-wide requests cover the evidenced project areas; local requests cover
the named neighborhood. Creating the first map is one instance of this work.

**Candidate reconciliation** selects one business domain from retained origins.
Load that report first, then apply the same business-ownership rules used for
every map change. The candidate's recorded owner is an investigation hypothesis
that current evidence must confirm.

Both paths continue through the common Work, Review and Integration phases.
Read [references/map-authoring.md](references/map-authoring.md) when a document
shape or relationship/flow rule needs confirmation. For candidate reconciliation,
also read [references/reconciliation.md](references/reconciliation.md) for
provenance, classification and the unchanged observation contract.

## Work Phase

### Load Current Actionable Candidates

For candidate reconciliation:

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
   investigation inputs rather than maintenance conclusions. A candidate with
   `kind: "flow"` proposes a correction to one stable business scenario path.
4. When `data.domains` is empty, finish with a no-change result. A positive
   `waitingForEvidenceOccurrences` means prior investigation remains retained
   but does not justify immediately repeating the same work.

### Establish Business Ownership Before Every Map Edit

For direct authoring, start from the requested change and current product/source
evidence. For candidate reconciliation, start from the selected origins and
confirm their current evidence. Apply this sequence when creating the first map,
adding later business capabilities, correcting meaning, or reconciling drift:

1. Inspect the affected map, tracked product documents, current source and tests.
   Follow callers and collaborators needed to confirm both endpoints of a
   relationship. Use runtime evidence when deployed state owns the conclusion.
   Preserve `MAP_NOT_FOUND` as the result when no map exists.
2. Identify the affected business responsibilities, owned data and rules,
   collaborators, and decisive evidence before selecting a YAML file. Independent
   responsibilities with their own business outcomes and rules get distinct
   business areas. Source directories and existing filenames are evidence, not
   the decision about ownership.
3. Reuse an existing domain and owning file when their business meaning matches
   the change. Give newly identified independent business areas their own
   meaningful `domain` roots and owning YAML files, including during incremental
   maintenance. Use `capability` and `part_of` for narrower responsibilities within
   an area. A single-business project or local task can still use one file.
   File count follows business boundaries; domain roots drive Viewer selection.
4. Correct affected containment when current evidence exposes an oversized or
   misplaced owner. Preserve stable concept IDs when business identity is
   unchanged, while updating their owner, `part_of` and related references as
   needed. Keep the correction within the requested/evidenced scope.
5. Define each shared concept once in its owning business file. Other files use
   its stable ID. Declare each directed relation in its source concept's file,
   including cross-file relations. Keep each flow in the same domain-owned YAML
   as its scenario; steps may reference concepts owned by other files. Anchors
   remain repository-relative navigation hints.

For each relevant flow, confirm the business-relevant actions, decisions,
branches, and outcomes that can change user results, durable data, cost or
provider usage, authorization or isolation, or interfaces. Keep flow steps at
business granularity. Treat a source diff as evidence to investigate; durable
product meaning decides whether a flow changes. Helpers, DTO conversion,
framework wiring, and Service or Queue names remain source details.

### Apply The Evidence Within Its Delivery Boundary

For direct authoring, edit the files owned by the evidenced responsibilities.
Complete the requested business neighborhood and report unresolved meaning
separately. Recheck the shared ownership rules above as later evidence reveals
an additional owner; an existing file is reusable only while its scope remains
correct.

For candidate reconciliation, classify every exact origin as `accepted`,
`refined`, `discarded`, or `unresolved` using the reconciliation reference.
Keep discarded and unresolved meaning outside the canonical map. Apply accepted
or refined changes to the confirmed domain's existing file, or create its
owning YAML when that business area has no file. A mapless candidate run can
create one initial business-domain YAML for its supported scope. One duplicate
candidate group produces one edit while retaining all exact origins.

Ordinary candidate reconciliation remains one business domain and one owning
YAML. When a real ownership correction requires changes across existing files,
organize the complete necessary change as a normal reviewed authoring or
reorganization Git candidate. Report the affected owners and retained origins
explicitly. The one-file observation contract describes a candidate result;
it never determines business containment. Keep exact-origin reconciliation
separate until its result truthfully fits that contract; a multi-file correction
is not represented as an accepted single-path `mapChange`.

### Validate And Prepare The Review Candidate

When the map changes, run:

```bash
semantic-atlas validate --repo <absolute-repository-root>
semantic-atlas render --repo <absolute-repository-root> \
  --output <repository-root>/tmp/semantic-atlas-map.html
git diff --check
git diff -- docs/business-map/
```

Inspect every changed business area in the Viewer. Confirm that domain
selection matches the evidenced boundaries, cross-file relationships retain
external neighboring concepts, and scenario flows preserve their branches,
outcomes and relationship-to-flow links. Moving YAML alone does not establish
correct business containment. Check the complete graph together, including
unchanged documents, and keep retained observations immutable.

For direct authoring, review the complete requested business scope and all
owning files as one Git candidate, including newly created files that an
unstaged `git diff` does not yet show. A one-domain result is appropriate when the
requested or evidenced scope has only that business responsibility. For
candidate reconciliation, confirm the diff changes at most one owning YAML.
Commit the map candidate through the host workflow.

For candidate reconciliation, prepare one maintenance-observation JSON document:
maintenance task/run identity, selected `businessDomainId`, every exact origin,
classification, reason, and current evidence. Accepted or refined results
reserve `mapChange.owningMapPath`; Integration adds the real `mergedCommit`.
Keep this draft unrecorded until independent review and integration finish.
Direct authoring without retained origins uses Git review evidence rather than
a candidate-origin observation. A reorganization records its complete Git diff
and integration state; retained origins stay available for accurate separate
reconciliation instead of being consumed by a fabricated single-file result.

Report the requested scope, boundaries, evidence, owning files, validation and
render results, Git candidate, and actual review/integration state. Include
origins, classifications and the observation draft for candidate reconciliation.

## Review Phase

Use the host workflow's ordinary independent review. Review durable business
meaning, relation direction, flow branch meaning, evidence support,
complete-graph validity, and whether the domain/file partition matches the
requested business scope. For candidate reconciliation, also check exact origin
coverage, one-domain ownership, and whether discarded or unresolved conclusions
correctly avoid a map edit.

Changes requested return to the normal Work Phase. Approval authorizes the host
workflow to enter Integration Phase; it does not itself consume candidates.

## Integration Phase

For direct authoring, integrate the approved Git candidate through the
repository workflow and report the actual commit and map validation. This path
uses Git review evidence and leaves candidate maintenance observations to the
candidate workflow. A local candidate remains pending integration when the host
workflow has not merged it.

For candidate reconciliation:

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
