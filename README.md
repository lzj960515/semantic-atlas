# Semantic Atlas Next

Semantic Atlas Next is a Git-native business map for coding agents. It gives an
agent a durable but advisory view of business boundaries, relationships, data,
rules, interfaces, and likely source entry points before the agent confirms
current behavior in source code and tests.

The first three product slices load tracked YAML files, validate the complete
repository graph, return a local business neighborhood, render the same
normalized graph as a deterministic static HTML artifact, and guide coding
agents from that context into decisive current repository evidence. Private
real-task accuracy evaluation remains a later delivery slice.

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

## Agent Skill

Mapped repositories discover `.agents/skills/semantic-atlas/SKILL.md`. For a
business-changing task, the Skill queries one small context neighborhood before
broad source discovery, treats the result as investigation leads, and confirms
every claim that controls the change in current evidence. Missing concepts,
ambiguous terms, absent or stale anchors, and contradicted relations all route
to bounded ordinary discovery. Durable map discrepancies become separate
reconciliation candidates rather than mandatory map edits.

The Skill's query adapter prefers the CLI from the same package and verifies
the versioned `context` envelope before exposing it to the Agent.

## Authority

- [Product contract](docs/product-contract.md)
- [Architecture](docs/architecture.md)
- [Map format](docs/map-format.md)
- [Evaluation](docs/evaluation.md)
- [Documentation index](docs/index.md)

## Current Status

The previous Semantic Atlas implementation remains a separate, frozen
experiment. This repository starts from the new product model and imports no
runtime code or persistence lifecycle from that implementation.
