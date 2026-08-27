# Semantic Atlas Delivery Plan

This page defines the integrated initial vertical slices and the ordered v1
rollout gates. Tasks preserve one coherent user workflow and become eligible
only when their stated predecessor is integrated or directly verified.

**Status: the baseline and Slices 1-5 are accepted and integrated at `decac0c`;
the v1 real-repository rollout contract is approved.**

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

Start after Slices 1 and 2 are integrated. Package the repository Agent Skill
and prove its behavior on controlled engineering fixtures.

Acceptance:

- a repository-discovered Skill queries the smallest useful map neighborhood
  before broad source discovery for supported business-changing tasks;
- map results are described as investigation leads and every
  change-controlling claim is confirmed in current source, tests, or tracked
  product documents;
- missing concepts, ambiguous terms, missing anchors, stale anchors, and
  contradicted relations route to bounded ordinary source discovery;
- ordinary task completion has no mandatory canonical-map mutation; durable
  observations are reported separately for later reconciliation;
- controlled fixtures cover an upstream root cause, a downstream consumer,
  missing map knowledge, a stale anchor, and a contradicted relation;
- fresh-context runs and independent review find no unsupported final business
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
  and the still-unperformed public release.

## V1 Real-Repository Rollout

The approved next stage turns the accepted local product into the installed
`semantic-atlas@1.0.0` product. The [product contract](product-contract.md) owns
the v1 identity, managed-Skill behavior, observation model, reconciliation
rules, and real-use acceptance thresholds.

Delivery keeps these gates separate:

1. close the initial-product documentation against the integrated baseline;
2. implement managed `setup` and old-CLI upgrade compatibility;
3. implement immutable task and review observations plus read-only candidate
   reconciliation;
4. verify the public repository, CI, privacy, and release candidate;
5. replace the existing `lzj960515/semantic-atlas` repository's `main` with the
   clean v1 history through one lease-checked direct cutover;
6. create the Git tag and GitHub Release, publish with npm provenance, and test
   an anonymous install;
7. integrate one target-repository map and verify installed-Skill discovery;
8. evaluate natural longitudinal use and concurrent development.

Gate 4 now prepares the clean `semantic-atlas@1.0.0` source candidate. Package
metadata, public documentation, repository guidance, CI, a
GitHub-Release-driven provenance workflow, tarball privacy checks, anonymous
installed-product coverage, and a public v0.4 transition rehearsal form one
local verification gate. Independent review remains required before the direct
`main` replacement, tag, GitHub Release, npm publication, or target-repository
change.

Each gate starts from directly verified evidence from its predecessor. Local
integration does not authorize or prove setup, remote changes, publication,
target-repository changes, or real-use acceptance.
