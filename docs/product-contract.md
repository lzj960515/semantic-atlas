# Semantic Atlas Product Contract

This page defines the accepted initial product. It answers what Semantic Atlas
must improve, how agents and people use it, and which results establish
that the product works.

**Status: the public product is released and installed; the first target-domain
pilot is in local use and longitudinal acceptance is in progress.**

## Purpose

Semantic Atlas helps coding agents make more accurate engineering changes.
Its Agent Skill builds a task-specific understanding of stable business
boundaries, meaningful concepts, relationships, data, rules, interfaces, and
likely source entry points before an agent changes code. An existing shared map
accelerates that work; a missing map starts a bounded current-evidence path.

The map is a durable navigation prior rather than a synchronized copy of the
codebase. Product structure normally changes more slowly than implementation,
so a partially stale map can still lead an agent toward the right owners,
collaborators, invariants, and upstream causes. The agent corrects that prior
with current source, tests, tracked product documentation, Git, and runtime
evidence before changing behavior.

## Product Outcome

The product succeeds when agents using the business-understanding workflow more
reliably:

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
compact business neighborhood even when no map documents exist. It follows map
leads when available, otherwise establishes the smallest source-supported
business boundary, then opens decisive current evidence before editing.

### Root-cause and impact discovery

An agent uses typed business relations to ask what invokes an action, what data
it reads or writes, which invariant constrains it, and which interfaces cross
its boundary. These relations guide source investigation when user wording and
implementation vocabulary differ.

### Human inspection

A person views deterministic projections of the same tracked map to discuss
business boundaries and relationships. A self-contained export and a local
read-only Web command share the same interactive Viewer, including project and
business-domain selection, pan, zoom, and fit-to-view. Graph cards prioritize
business meaning by showing type, title, and description; selecting a card
reveals its navigation anchors in a side panel or narrow-screen bottom panel.
The visual surface does not become a second authoring format.

### Post-task maintenance decision and reconciliation

Every business-changing task records its map outcome and decides whether stable
shared knowledge needs maintenance. The decision may be a durable candidate,
already represented knowledge, an implementation-local result, or unresolved
meaning. A separate post-integration maintenance task reviews candidates against
current code and stable product meaning by business domain, then updates tracked
map files through ordinary Git changes. When no map exists, it can establish one
evidence-supported initial business domain. Periodic reconciliation recovers
missed work and accumulated drift.

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

Every business-changing engineering task follows this evidence order:

1. The Skill probes existing map knowledge from a distinctive business term.
2. A map proposes likely business scope and relations; `MAP_NOT_FOUND` routes to
   the smallest source-supported business model needed for the task.
3. Current source and tests confirm implementation behavior.
4. Tracked product documents confirm durable intent when they own that intent.
5. Runtime, database, queue, or environment evidence confirms state-dependent
   behavior when the task requires it.
6. The agent reports uncertainty when available evidence cannot support a
   decisive conclusion.
7. The result records one maintenance disposition and creates a candidate only
   for stable business meaning supported by decisive evidence.

An outdated path or symbol anchor weakens that navigation hint without
invalidating unrelated business meaning. A contradiction changes the current
task conclusion immediately and becomes a candidate for later map
reconciliation.

## Collaboration And Concurrency

Business-map files live in the repository and travel with its branches. Files
are divided by stable business domain so agents can read concurrently and most
durable updates touch only one owning map.

Business-changing development tasks record independent observations whether or
not a map exists. A task records a candidate only when stable business meaning
requires later maintenance; successful engineering delivery does not depend on
synchronizing the shared map. Reconciliation uses normal Git diff, review, and
merge semantics instead of a second transaction or locking protocol.

## Initial Product Scope

The initial product delivers one coherent path:

1. Load tracked map documents from a repository.
2. Validate document shape and graph integrity.
3. Normalize the complete map in memory.
4. Find a business concept by stable ID, name, or alias.
5. Return its containment, direct business relations, related concepts, and
   navigation anchors as structured JSON.
6. Render deterministic interactive human-readable projections from the same
   graph as a portable HTML artifact or loopback Web session.
7. Package an Agent Skill that activates from business task meaning, routes map
   context or `MAP_NOT_FOUND` into current-source confirmation, and makes an
   explicit post-task maintenance decision.
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
- a package-managed Agent Skill activates for business-changing work with or
  without a map, probes bounded context before broad discovery, and confirms
  every change-controlling claim in current evidence;
- real task cases cover upstream root cause, cross-capability impact, missing
  map knowledge, stale anchors, and a contradicted relationship;
- mapped and mapless Skill runs reach correct source-supported conclusions
  without introducing unsupported business claims;
- independent review finds the implementation responsibilities readable and
  the public workflow consistent with this contract;
- delivery remains local: publication, external installation, and migration are
  separately authorized stages.

Token usage, opened files, wall time, compute cost, and map-maintenance effort
are recorded to explain product behavior. They do not replace accuracy and
human-intervention evidence as acceptance conditions.

## Current Delivery State

The initial product, managed setup, versioned observations, read-only
reconciliation, public repository, and npm publication are complete. The first
real target-domain map and reviewed observation pair are in local use. The
current `semantic-atlas@2.1.1` release removes one-time predecessor migration
paths and accepts only current managed Skill, observation, and claim contracts.
Target-repository sharing and longitudinal acceptance remain separate verified
stages.

## Current Public Release

- `lzj960515/semantic-atlas` is the active public source repository and
  `semantic-atlas` is the npm package identity.
- Releases are normal fast-forward continuations of public `main`.
- `setup` recognizes package-owned current markers and refuses obsolete or
  unrelated same-named Skill directories.
- Observation reads and writes use the current task and review schemas; old
  local formats are disposable rather than migration inputs.
- Existing Git tags, GitHub Releases, and npm versions remain immutable release
  records, not runtime compatibility requirements.

### Installed CLI and managed Skills

The published CLI owns installation of its bundled user Skills:

```text
npm install --global semantic-atlas
semantic-atlas setup
```

`setup` installs the exact bundled Semantic Atlas engineering and maintenance
Skills under `~/.agents/skills/semantic-atlas` and
`~/.agents/skills/semantic-atlas-maintenance`. Each uses the same package
version, content fingerprint, ownership marker, and atomic replacement
protocol. Setup is idempotent, repairs a modified managed copy, preserves the
previous copy on failure, and refuses to replace an unrelated same-named
directory.

Business repositories share only `docs/business-map/*.yaml` through Git. They do
not duplicate the managed user Skills. The package, installed CLI, and installed
Skills must have one verifiable version identity.

### Accuracy observations

Real-use evidence is separate from the Git business map and from business-map
authority. The product records two immutable, versioned local artifacts:

- `TaskObservation`: map query outcomes including `map_not_found`, selected
  concepts, current-evidence classification, explicitly domain-owned map-update
  candidates when maintenance is warranted, and any explicit human correction
  known to the task Agent. Reads and writes use task artifact v2;
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

### Post-integration maintenance and reconciliation

Normal engineering work records one task observation and creates durable
map-update candidates only when the maintenance disposition is `candidate`.
`reconcile candidates` is read-only and preserves every candidate origin,
evidence disposition, duplicate provenance, and linked independent review. A
post-integration maintenance task selects one business domain, checks current
source and durable product meaning, updates one owning YAML map through normal
Git review, and leaves unresolved or implementation-local meaning outside the
canonical map. A mapless repository can create one initial domain-owned YAML
when current evidence establishes stable identity and bounded meaning. Periodic
runs provide a fallback for missed observations, accumulated drift, and changes
outside the normal workflow.

### Real-use acceptance

The first pilot starts with one stable business domain in a private target
repository rather than mapping the whole repository. Its initial map is
independently reviewed before merge. Task orchestrators keep their own develop,
independent review, rework, and integration lifecycle. Semantic Atlas activates
from the Agent's business task, supplies advisory understanding and observation
evidence, and remains independent of orchestration.

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

## Delivery Boundary

The [delivery plan](delivery-plan.md) owns the ordered release and real-use
gates. An earlier gate never implies that a later publication,
target-repository, or longitudinal-use gate has completed.
