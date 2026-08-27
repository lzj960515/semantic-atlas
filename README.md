# Semantic Atlas Next

Semantic Atlas Next is a Git-native business map for coding agents. It gives an
agent a durable but advisory view of business boundaries, relationships, data,
rules, interfaces, and likely source entry points before the agent confirms
current behavior in source code and tests.

The initial local product loads tracked YAML files, validates the complete
repository graph, returns a local business neighborhood, renders the same
normalized graph as a deterministic static HTML artifact, guides coding agents
from that context into decisive current repository evidence, and verifies the
workflow through controlled fixtures and a private paired real-task evaluation.
The complete local product is accepted and integrated at `decac0c` without
publishing it.

## CLI

Repositories place map documents in `docs/business-map/*.yaml` and can query
them without creating durable runtime state:

```bash
semantic-atlas validate --repo /path/to/repository
semantic-atlas context "Checkout" --repo /path/to/repository
semantic-atlas render --repo /path/to/repository --output ./business-map.html
```

All commands return versioned JSON envelopes and meaningful exit codes.
`render` writes static HTML after the same complete-graph validation used by
`context`; when `--output` is omitted, it writes `semantic-atlas.html` in the
selected repository. The artifact keeps labels readable on narrow screens with
horizontal scrolling and contains no editing or mutation path.

A missing or stale map remains an advisory discovery result; current source,
tests, and tracked product documents control engineering conclusions.

## Accuracy Observations

Business-changing runs can retain task investigation evidence and independent
review evidence without changing the Git business map:

```bash
semantic-atlas observe task --stdin --repo /path/to/repository
semantic-atlas observe review --stdin --repo /path/to/repository
semantic-atlas insights summary --repo /path/to/repository --period 4w
semantic-atlas reconcile candidates --repo /path/to/repository
```

The strict task schema records map outcomes, current-evidence dispositions,
reconciliation candidates, and explicit human corrections. Accuracy judgments
belong to the referenced independent review observation. Each ID publishes one
immutable JSON file under a private user-local repository partition; exact
replays are idempotent and changed-content replays are conflicts. Summaries are
derived read-only from retained task and review evidence. See the
[observation contract](docs/observations.md) for schemas, privacy, persistence,
and failure semantics.

`reconcile candidates` groups durable leads by explicit business-domain
ownership while retaining candidate dispositions, duplicate task provenance,
and linked independent reviews. The report is deterministic and read-only. It
does not edit observations, source, maps, rendered artifacts, or Git state.

## Install And Upgrade

After the separately verified v1 publication, one global package owns the
Semantic Atlas CLI and its user Skills:

```bash
npm install --global semantic-atlas
semantic-atlas setup
```

`setup` copies the exact bundled engineering and maintenance Skills to
`~/.agents/skills/semantic-atlas` and
`~/.agents/skills/semantic-atlas-maintenance`. Each management marker records
the package name, package version, Skill name, and deterministic content
fingerprint. Repeated setup verifies both payloads, repairs a changed managed
copy, recovers an interrupted directory swap, and upgrades the supported v0.4
primary Skill. A same-named directory without recognized ownership remains
untouched and is reported as a conflict.

Use the package-owned upgrade path to keep the executable and managed Skills on
one identity:

```bash
semantic-atlas upgrade
```

`upgrade` resolves npm's current stable version before mutation, installs the
exact `semantic-atlas@<version>` when needed, starts that installed package by
its npm global path, verifies `--version`, and delegates Skills synchronization
to that exact CLI. Target repositories continue to share only
`docs/business-map/*.yaml`; setup and upgrade do not add Skill files to them.

## Agent Skill

Mapped repositories discover `.agents/skills/semantic-atlas/SKILL.md`. For a
business-changing task, the Skill queries one small context neighborhood before
broad source discovery, treats the result as investigation leads, and confirms
every claim that controls the change in current evidence. Missing concepts,
ambiguous terms, absent or stale anchors, and contradicted relations all route
to bounded ordinary discovery. Durable map discrepancies become separate
reconciliation candidates rather than mandatory map edits.

The Skill's query adapter invokes its package sibling when present. From the
managed user directory, it first checks that the PATH CLI version matches the
setup marker, then verifies the versioned `context` envelope before exposing it
to the Agent.

## Maintenance Skill

The bundled `semantic-atlas-maintenance` Skill starts from the read-only
candidate report, selects one business domain, confirms every proposed
correction in current source and tracked product documents, and classifies
unsupported or implementation-local leads without promoting them. Accepted
work edits one owning `docs/business-map` YAML file, validates the complete
graph, renders the result, and uses the ordinary Git diff and independent
review path.

## Local Acceptance

Run the complete local-product acceptance path from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm test:acceptance
```

The acceptance command runs the full regression suite, typecheck, build,
package dry-run, built example rendering, built Skill checks, and a temporary
external consumer that installs the packed archive and exercises its CLI,
Commerce example, renderer, and bundled Skill adapter.

## Authority

- [Product contract](docs/product-contract.md)
- [Architecture](docs/architecture.md)
- [Map format](docs/map-format.md)
- [Accuracy observations](docs/observations.md)
- [Evaluation](docs/evaluation.md)
- [Documentation index](docs/index.md)

## Current Status

The documentation baseline and all five initial delivery slices are integrated
at `decac0c`. That revision passes source, built-product, packed-tarball, Skill,
renderer, privacy, and private real-task accuracy acceptance.

The approved next stage is a breaking `semantic-atlas@1.0.0` rollout. Its
contract covers managed user Skills, independently owned task and review
observations, read-only reconciliation candidates, and preservation of the
previous repository and npm versions. The managed-Skills setup path is
implemented locally, and the accuracy-observation plus read-only reconciliation
path is the current local candidate. Review and integration of that candidate,
public repository cutover, publication, target-repository rollout, and
longitudinal acceptance remain separate delivery gates.
See the [product contract](docs/product-contract.md#v1-real-repository-rollout)
and [delivery plan](docs/delivery-plan.md#v1-real-repository-rollout) for the
authoritative scope and sequence.
