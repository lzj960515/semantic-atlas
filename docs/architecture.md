# Semantic Atlas Next Architecture

This page defines the stable responsibilities, data lifecycle, dependency
direction, and failure semantics for the initial product. It applies to the
public CLI, renderer, and repository Agent Skill.

**Status: query, validation, visual projection, repository Agent, managed
Skill lifecycle, and accuracy-observation paths are implemented locally.**

## System Model

```text
tracked map documents
        |
        v
MapDocumentLoader -> MapValidator -> BusinessGraph
                                        |
                         +--------------+--------------+
                         |                             |
                         v                             v
                  ContextQueryService            MapProjector
                         |                             |
                         v                             v
                  stable JSON result             SVG / static HTML

Calling Agent
  -> queries the graph
  -> treats the result as an investigation hypothesis
  -> confirms decisive behavior in current repository evidence

published package Skill bundle
        |
        v
ManagedSkillInstaller -> staged copy -> atomic directory replacement
        ^                                      |
        |                                      v
verified installed CLI <- exact npm version <- PackageUpgrader

Task Agent evidence -> ObservationApplication -> ObservationStore
                              |                      |
Independent review -----------+                      v
                                               user-local files
                                                      |
                                                      v
                                               InsightService
```

The tracked documents and their Git history are the shared product state. Each
command creates an in-memory graph for its own invocation. Rendering and future
local acceleration remain derived behavior around that same graph.

## Stable Responsibilities

### MapDocumentLoader

Discovers map documents through one repository-owned configuration convention,
parses them with a mature data-format library, and returns document-shaped
values with their source locations. It owns filesystem discovery and parsing,
not graph semantics.

### MapValidator

Validates document shape and complete-graph integrity. It reports every
actionable issue that can be collected safely in one run, including duplicate
IDs, missing relation endpoints, containment cycles, invalid kinds, and
malformed anchors. It owns deterministic validity, not current-source truth.

### BusinessGraph

Holds normalized immutable nodes, relations, aliases, containment indexes, and
incoming/outgoing relation indexes for one command. It exposes domain
operations in terms of business concepts rather than file layout or parser
objects.

### ContextQueryService

Resolves a concept by stable ID, name, or alias and returns the smallest useful
business neighborhood: ancestors, direct children, incoming and outgoing
relations, referenced concepts, summaries, and navigation anchors. It reports
ambiguity explicitly rather than selecting a hidden match.

### MapProjector

Builds deterministic graph projections for people and agents. The first visual
projection distinguishes semantic containment from directed horizontal
relations and preserves stable element identities for repeatable layout and
inspection.

### CLI

Owns argument parsing, exit status, machine-readable envelopes, and concise
human presentation. It composes application services and performs no graph
interpretation of its own.

### Repository Agent Skill

Owns the map-assisted engineering workflow. It converts a natural-language
task into bounded map queries, interprets advisory results, opens current
evidence, and continues through the repository's normal implementation and
verification process. It does not move source editing or engineering judgment
into the CLI.

The Skill invokes `context` through a small contract-checking adapter. The
adapter prefers the CLI distributed with the Skill and accepts a PATH command
only when it returns the current versioned envelope. This preserves one query
contract when another installed product uses the same executable name.

### ManagedSkillInstaller

Owns the user-local lifecycle of the bundled `semantic-atlas` Skill. It derives
a deterministic payload fingerprint, records package and Skill identity in a
management marker, recognizes the v0.4 marker as a supported predecessor, and
classifies repeated setup as current, repair, upgrade, or interrupted-swap
recovery. It requires recognized ownership before replacing an existing
same-named directory.

Replacement uses one complete staged directory. The current managed directory
moves to a deterministic backup before the staged directory becomes active. A
failed swap restores the backup, while a later setup recovers a backup left by
process interruption and removes owned staging artifacts only after it has
confirmed the managed target.

### PackageUpgrader

Owns the boundary between npm package state and managed Skill state. It reads
npm's stable version first, installs an exact `semantic-atlas@<version>` when
the current package differs, locates that package through npm's global root,
verifies its CLI version through the current Node executable, and invokes that
CLI's `setup`. The old process never copies its own Skill after a package
replacement.

### RepositoryIdentityResolver

Owns the private repository partition used by observations. Git worktrees
resolve through their common Git directory so concurrent task branches share
one logical repository identity. The resolver hashes the local identity source
and exposes neither repository paths nor remote URLs in retained artifacts.

### ObservationApplication

Owns complete task and review input validation and the accuracy-authority
boundary. It creates a repository-bound artifact only after strict schema
validation. Review recording additionally resolves the referenced task
observation from the same repository partition before persistence.

### ObservationClaimManager

Owns the observation-ID claim lifecycle. It publishes complete synced owner
metadata without overwrite, distinguishes process instances, recovers the
earlier directory claim format, and verifies ownership again before final
observation publication.

### ObservationStore

Owns immutable, versioned user-local observation files and composes the claim
manager around each write. The store writes and syncs a complete observation
staging file, atomically renames it into place, returns idempotency for an exact
replay, and reports a conflict for changed content under an existing ID.

### InsightService

Owns read-only derivation over retained observations. It filters by optional
duration, aggregates independent review dimensions, and joins approved reviews
to task evidence when counting safe recovery from missing, stale, or
contradicted map knowledge.

## Data Lifecycles

| Data | Owner | Lifetime | Mutation path |
| --- | --- | --- | --- |
| Business-map documents | Target repository | Git history | Normal reviewed file edit |
| Parsed documents | One CLI invocation | Parse phase | Recreated from tracked files |
| Normalized graph | One CLI invocation | Query/render phase | Recreated after validation |
| Rendered output | Calling workflow | Reproducible artifact | Regenerated from the graph |
| Bundled Skill payload | Installed npm package | Package version | Replaced only by exact package installation |
| Managed user Skill | User home | Across repositories and CLI invocations | `semantic-atlas setup` atomic replacement |
| Managed Skill marker | Managed Skill directory | Same as installed payload | Written into the staged copy before activation |
| Repository identity | One local repository across worktrees | Observation lookup | Re-derived from the Git common directory or selected directory |
| Task observation | User-local repository partition | Immutable retained evidence | Strict validation and one atomic file publication |
| Review observation | User-local repository partition | Immutable retained evidence | Existing task reference plus strict validation and atomic publication |
| Accuracy summary | One CLI invocation | Read phase | Re-derived from retained task and review files |
| Task-specific source understanding | Calling agent | Engineering task | Current evidence investigation |
| Candidate map observation | Task or maintenance record | Until reconciled | Reviewed by periodic maintenance |

Map commands remain stateless and branches naturally see the map revision
tracked with their own source. Observation writers coordinate only one
repository-partitioned observation ID while publishing its immutable file.

## Dependency Direction

```text
domain contracts
    ^
    |
application services
    ^
    |
filesystem, parser, CLI, and rendering adapters
```

Domain contracts contain concept kinds, relation types, normalized graph
objects, selectors, and query results. They do not import CLI, YAML, rendering,
filesystem, Git, or framework types.

Application services coordinate loading, validation, querying, and projection
through narrow ports. Adapters translate external representations at the
boundary.

## Command Model

The public flow contains repository commands and repository-independent package
lifecycle commands:

```text
semantic-atlas validate [--repo <path>]
semantic-atlas context <id-or-term> [--repo <path>]
semantic-atlas render [--repo <path>] [--output <path>]
semantic-atlas setup
semantic-atlas upgrade
semantic-atlas observe task --stdin [--repo <path>]
semantic-atlas observe review --stdin [--repo <path>]
semantic-atlas insights summary [--repo <path>] [--period <duration>]
semantic-atlas --version
```

Map commands resolve and report the repository root and map-document set they
used. Observation commands report the derived repository identity, while
package lifecycle commands remain repository-independent. Machine output uses
a versioned envelope with a stable success or error discriminant.

`context` returns ambiguity when multiple concepts match the term. Callers can
then use a stable ID. A missing concept is a bounded map result and routes the
agent to ordinary source discovery; it is not a repository failure.

`setup`, `upgrade`, and `--version` do not discover a repository or load a
business map. Their results expose the package version and managed Skill path
needed to verify one installed identity. Business repositories retain only
their Git-tracked map documents.

`observe task` and `observe review` read one complete JSON object from standard
input. They derive a private repository identity, validate before publication,
and return recorded, idempotent, or explicit conflict results. `insights
summary` reads those retained files without changing them or the business map.

## Validation Boundary

Validation establishes that the tracked documents form a coherent graph. It
checks:

- supported schema version and strict document shape;
- repository-wide unique node IDs;
- valid concept and relation kinds;
- resolvable relation endpoints;
- at most one direct `part_of` parent per node;
- acyclic `part_of` containment;
- well-formed aliases and navigation anchors;
- deterministic normalization independent of input file order.

Validation does not claim that a path exists, a symbol still has the same name,
or a business relation still matches current code. Those are task-time
investigation questions. A separate advisory diagnostic may report obviously
missing paths without changing graph validity.

## Error Semantics

Errors fall into stable categories:

- `MAP_DOCUMENT_INVALID`: one or more tracked documents cannot form a valid
  graph; the result includes document-local issues.
- `MAP_NOT_FOUND`: the selected repository has no configured map documents;
  agents continue with ordinary source discovery.
- `CONCEPT_NOT_FOUND`: no concept matches the requested selector; agents use
  bounded source discovery.
- `CONCEPT_AMBIGUOUS`: multiple concepts match; the result returns stable IDs
  for explicit selection.
- `OUTPUT_FAILED`: a requested render artifact cannot be written; the graph
  query result remains unaffected.
- `MANAGED_SKILL_CONFLICT`: an existing same-named user directory has no
  recognized Semantic Atlas management identity and remains unchanged.
- `SETUP_FAILED`: staging, fingerprinting, replacement, or recovery failed;
  the previous managed directory is restored or retained as the backup.
- `UPGRADE_FAILED`: the result identifies whether registry lookup, exact
  installation, package location, version verification, or delegated setup
  failed.
- `OBSERVATION_INPUT_INVALID`: the complete stdin document violates the
  versioned task or review contract and no observation is written.
- `TASK_OBSERVATION_NOT_FOUND`: a review references no task observation in the
  selected repository partition.
- `OBSERVATION_CONFLICT`: an immutable ID already belongs to different content.
- `OBSERVATION_STORAGE_FAILED`: atomic publication could not complete and no
  new final artifact is reported.
- `INSIGHTS_PERIOD_INVALID`: a requested duration does not use the supported
  positive `h`, `d`, or `w` form.
- `INSIGHTS_READ_FAILED`: retained observations cannot produce a trustworthy
  summary.

Unexpected infrastructure errors propagate to the CLI boundary with a safe
message and a nonzero exit status. The implementation adds contextual details
where they help a caller act, without converting failures into successful empty
results.

## Collaboration Model

Map files are divided by stable business domain. Cross-domain relations may be
declared by the file that owns the source concept and resolved only after all
documents load.

Ordinary feature branches read their branch's map revision. Durable changes use
normal Git merge behavior. Review focuses on business meaning, stable IDs,
relationship direction, and whether the update belongs in the shared map.

Periodic reconciliation works from current source and accumulated task
observations. It updates one bounded business neighborhood rather than rewriting
the complete map. A stale observation can be discarded without affecting an
engineering task that already completed against current evidence.

## Current Technology Boundary

The implementation uses TypeScript ESM, Node.js 24, and pnpm. Mature libraries
provide YAML parsing, runtime schema validation, CLI parsing, and graph layout.
The exact packages are selected in the first implementation task from their
maintained APIs, footprint, and supported output needs.

Tracked files and the in-memory model satisfy map-query state. Immutable local
JSON files satisfy the separately approved observation lifecycle. The calling
agent's repository tools satisfy current source discovery. Structural indexes,
remote observation services, and alternate persistence engines require
real-task evidence and a separate product decision.

## Extension Seams

Future evidence may justify additional adapters without changing the current
domain model:

- alternate tracked serialization formats behind `MapDocumentLoader`;
- disposable performance caches behind a graph-loading boundary;
- additional deterministic projections behind `MapProjector`;
- editor integrations that write the same tracked document contract;
- advisory anchor diagnostics using language-aware tooling.

Each extension remains subordinate to the tracked map and current-source
confirmation workflow.
