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

## Install And Upgrade

After the separately verified v1 publication, one global package owns the
Semantic Atlas CLI and its user Skill:

```bash
npm install --global semantic-atlas
semantic-atlas setup
```

`setup` copies the exact bundled Skill to
`~/.agents/skills/semantic-atlas`. Its management marker records the package
name, package version, Skill name, and deterministic content fingerprint.
Repeated setup verifies those files, repairs a changed managed copy, recovers
an interrupted directory swap, and upgrades the supported v0.4 managed copy.
A same-named directory without recognized ownership remains untouched and is
reported as a conflict.

Use the package-owned upgrade path to keep the executable and managed Skill on
one identity:

```bash
semantic-atlas upgrade
```

`upgrade` resolves npm's current stable version before mutation, installs the
exact `semantic-atlas@<version>` when needed, starts that installed package by
its npm global path, verifies `--version`, and delegates Skill synchronization
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
- [Evaluation](docs/evaluation.md)
- [Documentation index](docs/index.md)

## Current Status

The documentation baseline and all five initial delivery slices are integrated
at `decac0c`. That revision passes source, built-product, packed-tarball, Skill,
renderer, privacy, and private real-task accuracy acceptance.

The approved next stage is a breaking `semantic-atlas@1.0.0` rollout. Its
contract covers managed user Skills, independently owned task and review
observations, read-only reconciliation candidates, and preservation of the
previous repository and npm versions. Setup implementation, public repository
cutover, publication, target-repository rollout, and longitudinal acceptance
remain separate delivery gates; none is implied by local-product integration.
See the [product contract](docs/product-contract.md#v1-real-repository-rollout)
and [delivery plan](docs/delivery-plan.md#v1-real-repository-rollout) for the
authoritative scope and sequence.
