# Semantic Atlas Next Product Contract

This page defines the accepted initial product. It answers what Semantic Atlas
Next must improve, how agents and people use it, and which results establish
that the product works.

**Status: accepted product contract; the queryable-map slice is implemented.**

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
