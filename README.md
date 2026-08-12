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

## License

MIT
