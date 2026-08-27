# Semantic Atlas Next Product Contract

This page defines the accepted initial product. It answers what Semantic Atlas
Next must improve, how agents and people use it, and which results establish
that the product works.

**Status: the initial local product is accepted and integrated; the v1
real-repository rollout is approved.**

## Purpose

Semantic Atlas Next helps coding agents make more accurate engineering changes.
It supplies a shared map of stable business boundaries, meaningful concepts,
relationships, data, rules, interfaces, and likely source entry points before
an agent confirms current behavior in authoritative evidence.

The map is a durable navigation prior rather than a synchronized copy of the
codebase. Product structure normally changes more slowly than implementation,
so a partially stale map can still lead an agent toward the right owners,
collaborators, invariants, and upstream causes. The agent corrects that prior
with current source, tests, tracked product documentation, Git, and runtime
evidence before changing behavior.

## Product Outcome

The product succeeds when map-assisted agents more reliably:

- enter a task through the correct business boundary;
- distinguish a downstream symptom from its upstream cause;
- inspect the business collaborators, data, rules, and interfaces needed for a
  complete change;
- choose an implementation scope that fixes the cause without unrelated work;
- preserve readable responsibilities and maintainable code;
- identify when the map is incomplete or contradicted by current evidence;
- correct their investigation without requiring a person to supervise routine
  discovery and implementation.

The map itself may be incomplete or stale. The final engineering conclusion
uses current evidence and is held to a higher accuracy standard than the map.

## Users And Core Scenarios

### Coding agent orientation

An agent receives a feature, bug, refactor, or impact question. It queries a
compact business neighborhood, follows likely owners and collaborators, opens
the decisive current source, and builds the task-specific system model before
editing.

### Root-cause and impact discovery

An agent uses typed business relations to ask what invokes an action, what data
it reads or writes, which invariant constrains it, and which interfaces cross
its boundary. These relations guide source investigation when user wording and
implementation vocabulary differ.

### Human inspection

A person views deterministic projections of the same tracked map to discuss
business boundaries and relationships. The visual surface does not become a
second authoring format.

### Periodic reconciliation

Agents accumulate candidate observations from real work. A later maintenance
task reviews current code and stable product meaning by business domain, then
updates tracked map files through ordinary Git changes. The map evolves at the
pace of durable business understanding rather than every source edit.

## Shared Business Model

The map uses these concept kinds:

- `domain`: a stable top-level business area;
- `capability`: a durable ability owned by a domain or broader capability;
- `scenario`: a bounded business collaboration that users or operators can
  name;
- `operation`: an independently meaningful action with one business outcome or
  state effect;
- `data`: a durable business record or concept;
- `invariant`: a rule that constrains business behavior;
- `interface`: an API, event, queue, webhook, or external integration boundary.

`part_of` supplies primary semantic containment. Directed horizontal relations
describe collaboration:

- `invokes`
- `reads`
- `writes`
- `publishes`
- `consumes`
- `constrained_by`

A concept is worth retaining when future tasks can independently name,
navigate to, depend on, constrain, read, write, publish, consume, or change it.
Methods, helpers, SQL statements, folders, and framework components remain
source details until they express durable business meaning.

## Authority And Accuracy

Tracked map documents are authoritative for the shared map. They are not
authoritative for current application behavior.

Every map-assisted engineering task follows this evidence order:

1. The map proposes likely business scope and relations.
2. Current source and tests confirm implementation behavior.
3. Tracked product documents confirm durable intent when they own that intent.
4. Runtime, database, queue, or environment evidence confirms state-dependent
   behavior when the task requires it.
5. The agent reports uncertainty when available evidence cannot support a
   decisive conclusion.

An outdated path or symbol anchor weakens that navigation hint without
invalidating unrelated business meaning. A contradiction changes the current
task conclusion immediately and becomes a candidate for later map
reconciliation.

## Collaboration And Concurrency

Business-map files live in the repository and travel with its branches. Files
are divided by stable business domain so agents can read concurrently and most
durable updates touch only one owning map.

Ordinary development tasks read the map and proceed independently. A task may
record a candidate map observation, but successful engineering delivery does
not depend on synchronizing the shared map. Reconciliation uses normal Git
diff, review, and merge semantics instead of a second transaction or locking
protocol.

## Initial Product Scope

The initial product delivers one coherent path:

1. Load tracked map documents from a repository.
2. Validate document shape and graph integrity.
3. Normalize the complete map in memory.
4. Find a business concept by stable ID, name, or alias.
5. Return its containment, direct business relations, related concepts, and
   navigation anchors as structured JSON.
6. Render deterministic human-readable projections from the same graph.
7. Package an Agent Skill that routes map context into current-source
   confirmation.
8. Exercise the workflow against real engineering tasks, including stale and
   incomplete map cases.

The runtime is stateless between commands. Derived render artifacts and future
performance caches are reproducible from tracked files.

## Current Non-Goals

The initial product does not provide:

- a synchronized structural copy of the codebase;
- a persistent business-knowledge database;
- content hashes, source snapshots, knowledge revisions, or transactional graph
  patches;
- automatic inference of business meaning from folders or call graphs;
- mandatory map updates after every engineering task;
- source editing, test execution, Git mutation, code review, or release
  orchestration;
- branch conditions, retries, loops, timing, or executable workflow state;
- real-time multi-user map editing;
- a second visual authoring representation.

These boundaries keep the first product centered on better engineering
judgment. Later capabilities require observed evidence that they improve that
outcome.

## Completion Standard

The first product is complete when one candidate revision demonstrates all of
the following:

- tracked example and real-project map files load and validate through the
  public CLI;
- context queries return the expected business owner, containment, incoming and
  outgoing relationships, and navigation anchors;
- the renderer produces readable projections from the same normalized graph;
- a repository-discovered Agent Skill uses map context before broad source
  discovery and confirms every change-controlling claim in current evidence;
- real task cases cover upstream root cause, cross-capability impact, missing
  map knowledge, stale anchors, and a contradicted relationship;
- map-assisted agents reach correct source-supported conclusions without
  introducing unsupported business claims;
- independent review finds the implementation responsibilities readable and
  the public workflow consistent with this contract;
- delivery remains local: publication, external installation, and migration are
  separately authorized stages.

Token usage, opened files, wall time, compute cost, and map-maintenance effort
are recorded to explain product behavior. They do not replace accuracy and
human-intervention evidence as acceptance conditions.

## Current Delivery State

The documentation baseline and Slices 1-5 are integrated at commit `decac0c`.
The complete candidate passes local source, built-product, packed-tarball,
Skill, renderer, privacy, and private real-task accuracy acceptance. The
previous Semantic Atlas repository and project remain separate and paused.

## V1 Real-Repository Rollout

The next product stage turns the accepted local candidate into the one installed
Semantic Atlas product used by real engineering repositories.

### Product identity and legacy preservation

- The new implementation takes over the npm package name `semantic-atlas` as a
  breaking `v1.0.0` release.
- The new implementation keeps its clean Git history and becomes the active
  `semantic-atlas` source repository.
- The previous public GitHub repository is preserved, renamed, and archived
  only through a separately verified cutover. It is never deleted or
  force-overwritten.
- The previous local repository contains unpublished commits and remains intact.
  Its exact HEAD and remote identity are preserved before any remote rename.
- Existing npm versions remain available. The old CLI's supported upgrade path
  must install v1 and invoke the v1 `setup` successfully.

### Installed CLI and managed Skills

The published CLI owns installation of its bundled user Skills:

```text
npm install --global semantic-atlas
semantic-atlas setup
```

`setup` installs the exact bundled Semantic Atlas Skill under
`~/.agents/skills/semantic-atlas` using a package version, content fingerprint,
and atomic replacement. It is idempotent, repairs a modified managed copy,
preserves the previous copy on failure, and refuses to replace an unrelated
same-named directory. A maintenance Skill may be installed beside it when the
observation workflow is delivered.

Business repositories share only `docs/business-map/*.yaml` through Git. They do
not duplicate the managed user Skill. The package, installed CLI, and installed
Skills must have one verifiable version identity.

### Accuracy observations

Real-use evidence is separate from the Git business map and from business-map
authority. The product records two immutable, versioned local artifacts:

- `TaskObservation`: map query and selected concepts, current-evidence
  classification, map-update candidates, and any explicit human correction
  known to the task Agent;
- `ReviewObservation`: the independent review verdict, correctness of the
  business boundary and upstream cause, impact completeness, required rework,
  and whether the map caused a wrong conclusion.

The task Agent never grades its own engineering accuracy. Review or explicit
human correction owns correctness. Each observation uses an independent ID and
atomic file write under a user-local repository partition. The implementation
does not use SQLite, a remote API, or a shared append-only JSONL file. Summaries
are reproducible from immutable observations.

The deterministic CLI exposes the observation boundary:

```text
semantic-atlas observe task --stdin
semantic-atlas observe review --stdin
semantic-atlas insights summary [--repo <path>] [--period <duration>]
semantic-atlas reconcile candidates --repo <path>
```

Observation failures are reported and never turn a successful engineering task
into a successful accuracy claim. The main accuracy measures are correct
business boundary, correct upstream cause, complete required impact, map-caused
regression, independent-review rework, human correction, and safe recovery from
missing, stale, or contradicted map knowledge. Tokens, files, time, compute, and
map-maintenance effort remain explanatory measures.

### Reconciliation

Normal engineering work records durable map-update candidates without editing
the shared map. `reconcile candidates` is read-only. A periodic maintenance task
groups candidates by business domain, checks current source and durable product
meaning, updates one owning YAML map through normal Git review, and leaves
unresolved observations out of the canonical map.

### Real-use acceptance

The first pilot starts with one stable `pietra-ex-api` business domain rather
than the whole repository. Its initial map is independently reviewed before
merge. Normal Codrive development keeps its existing develop, independent
review, rework, and fast-forward integration lifecycle; Semantic Atlas supplies
advisory context and observation evidence only.

Longitudinal acceptance requires at least 20 natural business-changing tasks
with independent review, at least one period of real code drift, and two
domain-scoped reconciliations. Every fifth suitable task adds an ordinary
analysis-only shadow for bounded comparison without duplicating production
writes. Natural use is not replaced with manufactured jobs or provider activity.

Any map-caused wrong conclusion, Store/authorization/data-boundary regression,
or installed CLI/Skill version mismatch blocks acceptance. The final stage also
tests multiple Agents in independent worktrees reading one map revision and
writing independent observations, with canonical map changes deferred to a
separate reconciliation task.

## V1 Delivery Boundary

The [delivery plan](delivery-plan.md) owns the ordered v1 gates. An earlier gate
never implies that a later remote, publication, target-repository, or real-use
gate has completed.
