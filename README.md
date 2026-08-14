# Semantic Atlas

Semantic Atlas is a local project world model for AI coding agents. It connects CodeGraph-backed code structure with agent-verified business capabilities, flows, data, rules, and interfaces in one revision-aware map.

The project is under active development toward v0.1. The first release focuses on TypeScript and JavaScript repositories, ships as the `semantic-atlas` npm CLI, and integrates with coding agents through a Skill rather than MCP.

## Contracts

- [Product contract](docs/product-contract.md)
- [Graph model](docs/contracts/graph-model.md)
- [CLI v1](docs/contracts/cli-v1.md)
- [GraphPatch v1](docs/contracts/graph-patch-v1.md)
- [Fresh Agent evaluation](docs/evaluation.md)

## Product boundaries

- Source code remains the source of truth.
- `@colbymchenry/codegraph` is an internal structural-index dependency; agents use only Semantic Atlas.
- One ignored `.atlas/codegraph.db` stores the structural index and Atlas business knowledge for each worktree.
- Business knowledge is stored with revision and content-hash evidence.
- Stale or unresolved knowledge is explicit.
- Code editing, testing, Git operations, and natural-language reasoning remain the agent's responsibility.

The runtime foundation now embeds CodeGraph behind an Atlas adapter and stores snapshots and business knowledge in namespaced `atlas_*` objects in the same worktree-local database. Structural and business results are composed through APIs rather than copied into a second structural schema.

## CLI

The package installs the `semantic-atlas` executable. Commands discover the target Git worktree from the current directory or `--repo <path>` and write one versioned JSON envelope to standard output.

```sh
semantic-atlas status
semantic-atlas index --repo /workspace/project
semantic-atlas map roots --pretty
semantic-atlas map search checkout --limit 10
semantic-atlas map show commerce/orders --depth 2
semantic-atlas learn --stdin < graph-patch.json
semantic-atlas changes
```

The CLI performs deterministic lexical and graph operations. The calling agent interprets natural language, inspects source when evidence is insufficient, and submits verified knowledge through GraphPatch v1.

## Business Flow Derivation

`BusinessFlowDerivationService` turns a current, normalized structural graph into
a deterministic GraphPatch draft for a caller-supplied capability with explicit
structural ownership roots. Its built-in strategies recognize representative
NestJS HTTP endpoints, GraphQL operations, TypeORM entities and provable
repository reads/writes, BullMQ producer/consumer flows, agent-verified
invariants, and agent-verified test declarations. Framework convention is
reported as `inferred`; dynamic channels, reflection, indirect dispatch, and
unclassifiable data access return source-fallback boundaries instead of exact
business claims. The calling agent reviews the draft and submits it through the
normal `BusinessKnowledgeService.learn()` transaction.

## License

MIT
