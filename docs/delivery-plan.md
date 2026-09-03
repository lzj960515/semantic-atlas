# Semantic Atlas Delivery Plan

This page defines the integrated initial vertical slices and the ordered public
rollout gates. Tasks preserve one coherent user workflow and become eligible
only when their stated predecessor is integrated or directly verified.

**Status: the baseline and Slices 1-5 are integrated, the public package is
released, and the first target-domain pilot is in local use.**

## Baseline: Establish The Product Contract

The clean repository begins with product, architecture, map-format, evaluation,
Agent, and example documents. This baseline is created and reviewed before
Codrive implementation so later agents execute an established product rather
than inventing one from task-local code.

Acceptance:

- the map is explicitly advisory while current evidence controls engineering
  conclusions;
- tracked files and an in-memory graph define the complete initial lifecycle;
- evaluation prioritizes engineering accuracy and human intervention;
- documentation contains no inherited persistence, structural-index, graph
  transaction, or mandatory stewardship responsibility;
- the example parses and its nodes and relation endpoints are internally
  coherent;
- the repository has a clean committed Git baseline.

## Slice 1: Deliver A Queryable Business Map

**Status: integrated.**

Build the complete minimum path from tracked YAML documents to a structured
local business context result.

Acceptance:

- a TypeScript ESM, Node.js 24, and pnpm project uses maintained libraries for
  YAML parsing, runtime schema validation, and CLI argument parsing;
- `docs/business-map/*.yaml` discovery resolves the selected repository and
  records each supplying document;
- validation enforces the v1 document, identity, relation, containment, anchor,
  and deterministic-normalization rules in `map-format.md`;
- one immutable in-memory graph supplies ID, name, alias, ancestor, direct
  child, incoming relation, outgoing relation, endpoint, and anchor indexes;
- `semantic-atlas validate` reports all safely collectable map issues through a
  stable machine envelope and meaningful exit status;
- `semantic-atlas context <selector>` returns the defined local projection and
  distinguishes not-found from ambiguity;
- public-flow tests cover multiple domain files, cross-file relations, invalid
  graphs, missing maps, ambiguity, partial matching, and deterministic output;
- typecheck, tests, build, packaged CLI smoke, and Git diff checks pass;
- independent review confirms that parser, graph, query, and CLI
  responsibilities remain separate and that no durable runtime state was
  introduced.

## Slice 2: Render The Same Graph For Human Inspection

**Status: integrated.**

Start after Slice 1 is integrated. Add deterministic visual projection without
creating another authoring model.

Acceptance:

- `semantic-atlas render` uses the normalized in-memory graph produced by the
  same loader and validator as `context`;
- a maintained graph-layout library owns node placement and edge routing;
- semantic containment and directed horizontal relations have visibly distinct
  channels, labels, and accessible non-color cues;
- stable node and relation identities produce repeatable output for unchanged
  map content;
- SVG or static HTML supports readable labels, business summaries, relation
  direction, and navigation anchors without an editing or mutation path;
- the Commerce example renders without clipped labels, overlapping nodes, or
  avoidable unreadable edge crossings at desktop and narrow viewport sizes;
- unit, projection, packaged CLI, visual inspection, typecheck, test, build, and
  Git diff checks pass;
- independent review confirms that rendering remains an adapter over the
  canonical graph.

## Slice 3: Guide Agents From Map Context To Current Evidence

**Status: integrated.**

Start after Slices 1 and 2 are integrated. Package the business-understanding
Agent Skill and prove its behavior on controlled engineering fixtures.

Acceptance:

- a package-managed Skill activates from business-changing task meaning, probes
  the smallest useful map neighborhood even when map files are absent, and
  builds a bounded current-evidence business model;
- map results are described as investigation leads and every
  change-controlling claim is confirmed in current source, tests, or tracked
  product documents;
- missing concepts, ambiguous terms, missing anchors, stale anchors, and
  contradicted relations route to bounded ordinary source discovery;
- every business-changing result records a task observation and a maintenance
  disposition, while canonical map mutation remains a separate reviewed change;
- already represented, implementation-local, and unresolved results are valid
  no-candidate outcomes;
- controlled fixtures cover an upstream root cause, a downstream consumer,
  missing map knowledge, a stale anchor, and a contradicted relation;
- fresh-context runs cover mapped, mapless, stale, implementation-local, and
  mechanical behavior; independent review finds no unsupported final business
  claim and no regression in required behavior;
- packaged Skill identity, CLI contract, typecheck, tests, build, and Git diff
  checks pass.

## Slice 4: Verify Accuracy On Real Pietra Engineering Tasks

**Status: privately verified and integrated.**

Start after Slice 3 is integrated. Use a private, isolated evaluation workspace
to test the complete product against real Pietra behavior without publishing
private maps or modifying the target repositories.

Acceptance:

- the case set covers every required type in `evaluation.md` with frozen task
  wording and a source-supported oracle;
- ordinary and map-assisted runs use matching model, repository revision, tool
  availability, and fresh contexts;
- every map-assisted run reaches the correct source-supported business and
  engineering conclusion;
- missing, stale, and contradicted knowledge is detected and corrected through
  current evidence;
- paired evidence demonstrates at least one material accuracy improvement and
  no map-caused correctness regression;
- independent code-quality review approves implementation cases;
- human decisions and corrections are recorded separately from routine status;
- only de-identified aggregate conclusions enter this repository;
- any product defect becomes a bounded regression and repair before acceptance.

## Slice 5: Accept The Initial Local Product

**Status: accepted and integrated at `decac0c`.**

Start after the real-task evidence is integrated. Verify the complete candidate
as one local product without publishing it.

Acceptance:

- product docs, public types, CLI help, machine envelopes, examples, Skill, and
  rendered behavior describe one consistent advisory-map workflow;
- one clean candidate passes the full suite, typecheck, build, package dry-run,
  external packed-CLI smoke, example rendering, Skill checks, and retained
  accuracy regressions;
- an empty repository, a valid map, an invalid map, an ambiguous query, and a
  stale-anchor workflow all produce the documented outcomes;
- Git inspection contains only intended public files and no private Pietra
  paths, facts, prompts, answers, credentials, or local artifacts;
- the report separates local implementation, integration, private evaluation,
  and later public release evidence.

## Current Public Rollout

The initial product is public and installed. The current
`semantic-atlas@2.3.0` release adds manual project registration, parameterless
Web startup, on-demand single-project loading, and project-level unavailable
states while preserving the tracked business-map model, current observations,
managed Skills, reconciliation, and real-use acceptance thresholds defined by
the [product contract](product-contract.md).

Delivery keeps these gates separate:

1. keep managed `setup`, immutable task and review observations, and read-only
   reconciliation on one current contract;
2. verify source, packed product, privacy, and anonymous installation;
3. publish through an immutable GitHub Release and npm provenance;
4. install the public package and synchronize both managed Skills;
5. share the first target-repository map through its normal Git lifecycle;
6. evaluate natural longitudinal use and concurrent development.

Package metadata, public documentation, repository guidance, CI, a
GitHub-Release-driven provenance workflow, tarball privacy checks, and anonymous
installed-product coverage form one local verification gate. Tag creation,
GitHub Release publication, npm publication, and target-repository changes
remain separately verified actions.

Each gate starts from directly verified evidence from its predecessor. Local
integration does not authorize or prove setup, remote changes, publication,
target-repository changes, or real-use acceptance.

## Interactive Viewer Extension

**Status: the base Viewer was released in `semantic-atlas@2.1.0`; persistent
registration and on-demand project loading were released in
`semantic-atlas@2.3.0`.**

Human inspection feedback established that a fixed-width static page without
zoom is insufficient once a real domain map contains many relations. The
extension keeps the original deterministic rendering boundary while making it
usable in daily inspection:

- `render` exports a self-contained interactive Viewer with a compact one-row
  desktop toolbar, top-level-domain selection, pan, zoom, and fit-to-view;
- `web` serves the same Viewer on `127.0.0.1` for one or more repositories
  selected from a user-local registered list or explicitly supplied at startup;
- `project add [path]` is the only persistent registration entry point, while
  explicit `web --repo` paths remain temporary and never merge into that list;
- the initial Web page contains only the project catalog, and map validation,
  layout, and rendering occur only for the currently selected opaque project ID;
- project and domain selection remain read-only projections over the current
  tracked YAML and create no persistent graph or browser-side authoring state;
- an empty catalog shows registration guidance, while an unavailable checkout
  remains selectable and does not prevent another project from loading;
- graph cards show business type, title, and description while pointer or
  keyboard selection reveals navigation anchors in an overlaid details panel;
- map drag suppresses text selection, and pointer zoom plus pan use the SVG's
  aspect-ratio-preserving viewport coordinates;
- duplicate repository basenames receive stable numbered labels without
  disclosing their parent paths;
- domain views preserve directly connected external concepts so filtering does
  not hide cross-domain collaboration;
- packaged-product tests start the real installed server, read the Viewer, and
  confirm mutation methods are rejected;
- browser inspection verifies desktop side-panel and narrow bottom-panel
  details plus project/domain, pointer and keyboard selection, drag without text
  selection, zoom, fit, and refresh behavior before integration.
