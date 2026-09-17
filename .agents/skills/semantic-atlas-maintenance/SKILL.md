---
name: semantic-atlas-maintenance
description: Initialize source-supported project or local business maps, or reconcile retained candidates for one business domain into a reviewed update. Use for requests to create a project business/module map, bounded initial-domain bootstrap, post-integration maintenance, drift cleanup, and candidate triage with or without an existing business map.
compatibility: Requires Node.js 24+, Git, the current semantic-atlas CLI, and repository source access. Candidate reconciliation also requires retained local observations.
---

# Semantic Atlas Maintenance

Create or maintain a source-supported business map through ordinary Git review.
Current source, tests, tracked product documents, and required runtime evidence
decide business meaning; retained candidates supply investigation leads.

## Choose The Requested Scope

Resolve the repository root and assigned worktree, then choose the work from
the user's requested outcome:

- **Project initialization:** a request to create the project's business or
  module map covers the project's evidenced business areas. Identify those
  areas before choosing files; multiple independent business scopes normally
  produce multiple domain-owned YAML files.
- **Bounded initialization:** a request limited to one business area or scenario
  creates only that supported neighborhood. A small project with one business
  responsibility can also use one file. File count follows business boundaries,
  not a quota or the number of source directories.
- **Candidate reconciliation:** a post-integration or periodic maintenance run
  selects one business domain from retained candidates and edits one owning YAML.
  Its bounded scope preserves routine reviewability.

Explicit initialization starts from current repository evidence even when the
candidate report is empty. Read [references/map-authoring.md](references/map-authoring.md)
when creating a map without an existing document to use as a format reference.
For candidate reconciliation, read
[references/reconciliation.md](references/reconciliation.md) before classifying
origins and follow the candidate path below.

## Work Phase

### Initialize The Requested Business Scope

1. Inspect existing `docs/business-map/*.yaml`, product documentation, current
   entry points, durable data and business rules. Preserve `MAP_NOT_FOUND` when
   the repository has no map. Preserve supported existing concepts and stable IDs
   when filling an incomplete initial map.
2. Establish a short boundary inventory before writing YAML: each business
   area's purpose, owned data/rules, collaborators and decisive evidence.
   Split areas when their business responsibilities and rules can be understood
   and maintained independently. Source directories provide evidence; technical
   layers and helpers remain source details.
3. Assign each independent business area a meaningful `domain` root and owning
   file. Use `capability` and `part_of` for narrower responsibilities inside an
   area. Domain roots drive Viewer selection; a repository name is metadata,
   not a substitute for its distinct business areas. Existing domain IDs remain
   stable when they already express the right scope.
4. Create the supported nodes, relationships and scenario flows in their owners
   using the shared ownership rules below. For a project request, finish the
   evidenced areas in the inventory, with unresolved meaning stated separately.
   For a local request, stop at its supported neighborhood.
5. Continue to validation and normal independent review. Direct initialization
   is map authoring, not candidate consumption: record its evidence, changed
   files and review/integration status in the Git delivery. Retained candidates
   remain available for their separate domain-scoped reconciliation.

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
   investigation inputs rather than maintenance conclusions. A candidate with
   `kind: "flow"` proposes a correction to one stable business scenario path.
4. When `data.domains` is empty, finish with a no-change result. A positive
   `waitingForEvidenceOccurrences` means prior investigation remains retained
   but does not justify immediately repeating the same work.

### Confirm Current Business Meaning

Open every decisive current source, test, or tracked product document named by
the selected origins. Follow current callers and collaborators when a proposed
relation changes both endpoints. Use runtime evidence when deployed state owns
the conclusion.

For a flow candidate, reconstruct the durable scenario in business terms: the
business-relevant actions, decisions, branches, and outcomes that can change
user results, durable data, cost or provider usage, authorization or isolation,
or interfaces. Keep flow steps at business granularity; leave parameter
validation, DTO conversion, helpers, framework wiring, and Service or Queue
names in source. Treat a source diff as evidence to investigate and retain the
existing flow until tracked product intent or durable current evidence supports
a change.

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

### Resolve The Candidate Domain's Owning YAML

Edit the selected domain's existing `docs/business-map/*.yaml`, or create its
owning file when that domain has no map. When no map documents exist, create
one initial business-domain YAML for the selected candidate scope. Limit the
initial map to stable meaning supported by the selected candidates and current
evidence. Keep this candidate run to one owning YAML; other business domains
remain separate maintenance work. One duplicate candidate group produces one
map edit while the maintenance draft retains every exact origin.

### Keep Business Ownership Consistent

Apply these rules to every initialized or maintained map:

- Define each shared concept once in its owning business file. Other files
  reference its stable ID. All files together form one repository-wide graph.
- Declare each directed relation in its source concept's file, including
  cross-file relations. Confirm both endpoints and the existing relation meaning.
- Keep each flow in the same domain-owned YAML as its scenario; flow steps may
  reference concepts in other files. Preserve business-relevant actions,
  decisions, labeled branches and outcomes.
- Preserve stable node and scenario IDs when business identity is unchanged.
  Anchors remain repository-relative navigation hints.

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

For initialization, review the complete requested boundary inventory and all
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
Direct initialization has no candidate-origin observation to prepare; Git review
records its authoring evidence without fabricated task IDs or candidate indexes.

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

For direct initialization, integrate the approved Git candidate through the
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
