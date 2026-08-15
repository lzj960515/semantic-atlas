# Semantic Atlas

Semantic Atlas is a local, revision-aware project world model for AI coding agents. It combines CodeGraph-backed TypeScript and JavaScript structure with agent-verified business capabilities, flows, data, rules, and interfaces in one evidence-bound map.

Semantic Atlas is an AI-agent tool, not a natural-language engine. The deterministic CLI accepts commands, lexical search terms, graph identifiers, and structured GraphPatch input. The calling agent interprets a task, judges evidence, reads source when the map is insufficient, and performs all code and Git work.

## Requirements

- Node.js 22.12 through 24
- A Git worktree containing TypeScript or JavaScript
- Codex or another agent that can follow the packaged Skill workflow

## Install the CLI

Install the public executable globally:

```sh
npm install --global semantic-atlas
semantic-atlas status --repo /path/to/project
```

The installed runtime works offline. Indexing, graph queries, evidence validation, and change inspection do not call a model or a network service. Package installation itself still requires normal npm registry access.

## Install the Codex Skill

The Skill makes Atlas the required first business-understanding surface for supported TypeScript and JavaScript implementation, debugging, refactoring, behavior review, flow tracing, invariant discovery, and impact work. It teaches Codex when to trust the map, reindex, preserve unknown boundaries, inspect authoritative source, and capture newly verified business knowledge. In Codex, invoke the built-in installer with the repository-owned Skill URL:

```text
$skill-installer Install semantic-atlas from https://github.com/lzj960515/semantic-atlas/tree/v0.1.0/.agents/skills/semantic-atlas
```

For repository development, Codex discovers the checked-in Skill automatically from `.agents/skills/semantic-atlas`. Codex detects newly installed skills automatically; restart Codex if it does not appear in the skill list.

Invoke it explicitly with `$semantic-atlas`, or let Codex select it from the task through the Skill description. Git-only release work, mechanical formatting, unrelated documentation, and unsupported repositories remain normal workflows.

## Required agent loop

Run Atlas commands serially from the exact target worktree. `--repo <path>` can be supplied before the command when the current directory is elsewhere.

```sh
semantic-atlas status
semantic-atlas index
semantic-atlas map roots
semantic-atlas map search checkout --limit 10
semantic-atlas map show module:src --depth 1
```

For every supported business-behavior task, the agent loop is:

1. Check `status` before broad source discovery or trusting stored knowledge.
2. Load the bootstrap procedure only when the snapshot needs publication, the current map lacks relevant business knowledge, or the user requests project initialization.
3. Query `map roots`, `map search`, `map children`, and `map show` to bound source exploration.
4. Confirm decisive behavior in authoritative source and preserve stale, unsupported, unresolved, ambiguous, or insufficient boundaries.
5. After relevant source changes, reindex and inspect `changes` before trusting the refreshed map.
6. Before completion, decide what source inspection taught: write every new durable verified business concept and relationship with `learn --stdin`, verify it through `map show`, and retain transient or unverified observations only in task context.

A normal task incrementally bootstraps only its relevant capability. An explicit project-initialization task starts at structural roots, inspects a stated bounded set of representative paths, and creates a reusable initial business map rather than attempting an exhaustive code inventory.

Every command writes one versioned JSON envelope to standard output. Diagnostics remain on standard error, so callers can parse output without scraping prose.

## Zero-intrusion storage

Each worktree owns one generated store:

```text
<worktree>/.atlas/codegraph.db
```

Semantic Atlas creates an Atlas-owned `.atlas/.gitignore`, keeps transient locks and SQLite sidecars under `.atlas/`, and leaves tracked source and project configuration unchanged. CodeGraph owns structural tables while Atlas owns namespaced `atlas_*` business, evidence, snapshot, and validity tables in the same database. Public queries compose one world graph without copying the structural graph.

## Scope and uncertainty

v0.1 supports TypeScript and JavaScript, with initial business-flow coverage for NestJS, GraphQL, TypeORM, and BullMQ projects. The embedded `@colbymchenry/codegraph` SDK supplies static structure; Atlas adds revision-aware business interpretation and evidence.

Runtime-only dispatch, reflection, generated behavior, unsupported syntax, and unresolved targets remain explicit boundaries. An `UnknownBoundary`, stale assertion, hypothesis, or unsupported result is a prompt for bounded source inspection, never an exact business claim. Source code remains authoritative.

Semantic Atlas does not edit source, run project tests, mutate Git history, review code, or publish releases on behalf of the calling agent.

## CLI reference

```sh
semantic-atlas status [--repo <path>] [--pretty]
semantic-atlas index [--repo <path>] [--pretty]
semantic-atlas map roots [--repo <path>] [--pretty]
semantic-atlas map search <query> [--limit <n>] [--repo <path>] [--pretty]
semantic-atlas map children <node-id> [--repo <path>] [--pretty]
semantic-atlas map show <node-id> [--depth <n>] [--repo <path>] [--pretty]
semantic-atlas learn --stdin [--repo <path>] [--pretty]
semantic-atlas changes [--from <snapshot-id>] [--to <snapshot-id>] [--repo <path>] [--pretty]
```

See the versioned [CLI contract](docs/contracts/cli-v1.md) and [GraphPatch contract](docs/contracts/graph-patch-v1.md) for field-level behavior.

## Development

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm package:verify
```

`pnpm package:verify` packs the project, installs the tarball into a temporary consumer outside the checkout, and runs a real `status` -> `index` -> `map roots` CLI flow while checking that the fixture Git status stays clean. `pnpm validation:backend` provides the deeper pinned-backend and upgrade contract.

CI runs typecheck, build, contract checks, and installed-package tests on Node.js 22.12 and 24. The complete source test suite runs on the Node.js 24 development runtime, while Linux, macOS, and Windows jobs execute the installed CLI smoke flow.

## Contracts

- [Product contract](docs/product-contract.md)
- [CodeGraph backend architecture](docs/architecture/codegraph-backend.md)
- [Graph model](docs/contracts/graph-model.md)
- [CLI v1](docs/contracts/cli-v1.md)
- [GraphPatch v1](docs/contracts/graph-patch-v1.md)
- [Fresh Agent evaluation](docs/evaluation.md)

## License

Semantic Atlas is released under the [MIT License](LICENSE).
