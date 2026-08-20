<div align="center">
  <h1>Semantic Atlas</h1>
  <p><strong>A local, evidence-bound world map for AI coding agents.</strong></p>
  <p>Connect code structure to verified business meaning, then keep both revision-aware.</p>

  <p>
    <a href="https://www.npmjs.com/package/semantic-atlas"><img alt="npm version" src="https://img.shields.io/npm/v/semantic-atlas?style=flat-square&color=cb3837"></a>
    <a href="https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml"><img alt="continuous integration" src="https://img.shields.io/github/actions/workflow/status/lzj960515/semantic-atlas/ci.yml?branch=main&style=flat-square&label=ci"></a>
    <a href="https://www.npmjs.com/package/semantic-atlas"><img alt="supported Node.js version" src="https://img.shields.io/node/v/semantic-atlas?style=flat-square&color=43853d"></a>
    <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/lzj960515/semantic-atlas?style=flat-square&color=2d5b46"></a>
  </p>

  <p><strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a></p>
</div>

## What is Semantic Atlas?

Semantic Atlas gives coding agents one local map that joins two kinds of project knowledge:

- **Structural evidence** from TypeScript and JavaScript: files, symbols, relations, framework entry points, and unresolved boundaries.
- **Agent-verified business knowledge**: capabilities, scenarios, operations, interfaces, data, rules, tests, and the evidence that supports them.

The `semantic-atlas` CLI provides deterministic, versioned JSON operations. The packaged Codex Skill teaches an agent when to query, when to return to source, and when verified knowledge should be retained.

> **Query first. Confirm in source. Learn only what the evidence proves.**

Source code remains authoritative. Atlas is a revision-aware projection that makes useful context reusable without pretending static analysis knows every runtime behavior.

## Why use it?

- **Start from business meaning.** Find the capability, operation, data, and dependency path before opening a broad slice of the repository.
- **Spend less source context.** Use graph evidence to choose a bounded source seed set, then read only the code needed to decide the task.
- **Keep knowledge honest.** Evidence is tied to a snapshot; changed or missing evidence becomes visibly stale instead of silently remaining current.
- **Preserve uncertainty.** Dynamic dispatch, reflection, unsupported structure, and unresolved targets stay explicit and route the agent back to source.
- **Leave the project untouched.** Durable knowledge stays under `~/.semantic-atlas`; only a disposable CodeGraph projection enters the worktree's ignored `.atlas/` directory. Tracked source and configuration are not rewritten.

## One project world map

![Semantic Atlas capability map showing structural evidence, business knowledge, the Agent loop, one unified world map, explicit uncertainty, and local storage](docs/mindmaps/semantic-atlas-overview.png)

Atlas stores one canonical business graph rather than separate overview and
detail maps. `map view` shows its current visible frontier: start at parentless
world regions, zoom into a business key, follow breadcrumbs and related context
regions, and keep zooming until the relevant operation, data, or rule is visible.
Cross-region connections summarize the verified deeper relations that contribute
to the current view without persisting invented high-level facts.

## Quick start

Semantic Atlas supports Node.js 22.12 through 24 and Git worktrees containing TypeScript or JavaScript.

### Install the CLI

```sh
npm install --global semantic-atlas
semantic-atlas setup
semantic-atlas --version
semantic-atlas status --repo /path/to/project
```

`setup` installs the exact Skill bundled with the current package into
`~/.agents/skills/semantic-atlas`. Run it again after upgrading the npm package
to update the managed Skill. It also removes a recognized legacy copy from
`~/.codex/skills/semantic-atlas`, preventing an older duplicate from taking
precedence. Codex and other compatible agents can then select `$semantic-atlas`
from the task description, or you can invoke it explicitly.

After installation, indexing and queries run locally without model or network calls. npm registry access is needed only to install or update the package.

### Run the first query

Run commands serially from the exact target worktree:

```sh
semantic-atlas status
semantic-atlas index
semantic-atlas map view
semantic-atlas map search "checkout" --limit 10
semantic-atlas code search "CheckoutService" --limit 10
```

Every project command writes one versioned JSON envelope to standard output.
`setup`, `-h`/`--help`, and `--version` are repository-independent text
commands. Diagnostics stay on standard error, so agents consume stable project
fields and warning codes instead of scraping prose.

On a newly indexed project, the world `map view` may return `regions: []` with
`BUSINESS_KNOWLEDGE_EMPTY`. That is the honest starting state: map commands
contain business knowledge only, while explicit `code search` provides bounded
CodeGraph evidence for the active task.

## The Agent loop

1. **Status.** Confirm the exact repository root, snapshot freshness, and structural-backend completeness before broad source discovery.
2. **Index.** Publish or refresh the worktree-local snapshot when state is missing, stale, failed, or incomplete.
3. **Query.** Start from the business world, search business vocabulary, zoom through relevant regions, and show direct evidence. Use `code search` only when the business map is absent or insufficient.
4. **Confirm source.** Open the cited ranges and resolve the decisive behavior in authoritative code. Keep partial, stale, unsupported, and unknown results bounded.
5. **Do the engineering work.** The calling agent edits code, runs tests, reviews diffs, and owns Git; Atlas performs none of those actions.
6. **Reconcile and learn.** Reindex after relevant source changes, inspect semantic `changes`, and submit only durable, verified business knowledge through `learn --stdin`. Verify learned nodes with `map show`.

This loop grows and reorganizes the business map one verified business area at a time. A parentless operation can be a provisional root; later work can place it beneath a broader concept without changing its stable key or evidence. Atlas does not require an upfront repository-wide business-learning pass.

When `index` runs for a newly created Git worktree, Atlas automatically copies a compatible sibling CodeGraph projection and performs an incremental sync. Agents do not run a separate initialization command; a full index is used only when no compatible sibling projection is available.

## Measured results

### Frozen comparative evaluation

The retained [`fresh-agent-v1` report](evaluation/results/fresh-agent-v1/report.json) covers `framework-evaluation@fixture-v1`: 12 paired cases and 24 fresh-agent runs across NestJS, GraphQL, TypeORM, and BullMQ location and dependency-impact tasks.

| Metric | Without Atlas | With Atlas | Fixture result |
| --- | ---: | ---: | --- |
| Final-answer correctness | 100% | 100% | No regression |
| Required-file recall | 100% | 100% | No regression |
| Required-symbol recall | 100% | 100% | No regression |
| Median unique source files opened | 6.5 | 4 | 38.46% fewer |
| Median observed source-input tokens | 1,351 | 688 | 49.07% fewer |

The gate was declared before collection and all 61 routed uncertainty events were handled without a failure classification. Read the [evaluation methodology](docs/evaluation.md) and retained runs before interpreting the numbers.

These are fixture-scoped comparative results. They do **not** establish universal business accuracy, performance on every repository, or total model-token savings; the token metric counts observed source input under `tiktoken-o200k_base-v1`.

### Public workflow validation

An isolated TypeScript project was used to validate the public installation path with the registry-installed CLI and the Skill from this repository:

- A first fresh agent completed `missing → index → query → source confirmation → learn`.
- A second fresh agent discovered and reused the persisted knowledge through normal status, business navigation, search, and show commands without receiving the previous answer or repeating `learn`.
- The target revision and ordinary Git status stayed unchanged; durable knowledge lived in the user Atlas home and the worktree contained only ignored CodeGraph state.

This validates installation, the Agent workflow, knowledge reuse, and zero-intrusion behavior in that project. It is not a universal accuracy benchmark or a production-stability claim.

## Evidence, uncertainty, and storage

| Boundary | Contract |
| --- | --- |
| Source authority | Every answer-controlling claim is confirmed in source; Atlas context never overrides the checked-out code. |
| Evidence validity | Business assertions carry source locators, hashes, certainty, and snapshot-derived validity. Failed rebinding produces `stale`, not silent deletion or promotion. |
| Explicit uncertainty | `UnknownBoundary`, `partial`, `unsupported`, `hypothesis`, and insufficient results narrow source fallback; they are never presented as exact facts. |
| One product | The CLI and Skill expose one Semantic Atlas workflow. CodeGraph stays behind the adapter and its CLI, MCP, schema, and backend types are not public Atlas interfaces. |
| Durable repository knowledge | `~/.semantic-atlas/repositories/<repository-id>/atlas.db` stores repository-wide business knowledge, snapshots, snapshot bindings, validity, and worktree publication state. Set absolute `SEMANTIC_ATLAS_HOME` only when tests or CI need isolation. |
| Disposable worktree projection | Each worktree owns `.atlas/codegraph.db`, containing CodeGraph structure only. A missing projection is bootstrapped from a compatible sibling and incrementally synchronized. |
| Zero intrusion | Atlas prepares `.atlas/.gitignore`, writes no tracked source or project configuration, and does not edit, test, review, commit, merge, or release code. Removing a worktree removes only its disposable projection. |

## CLI and development

```text
semantic-atlas status [--repo <path>] [--pretty]
semantic-atlas index [--repo <path>] [--pretty]
semantic-atlas map view [business-key] [--repo <path>] [--pretty]
semantic-atlas map search <business-term> [--limit <n>] [--repo <path>] [--pretty]
semantic-atlas map show <business-key> [--repo <path>] [--pretty]
semantic-atlas code search <structural-term> [--limit <n>] [--repo <path>] [--pretty]
semantic-atlas learn --stdin [--repo <path>] [--pretty]
semantic-atlas changes [--from <snapshot-id>] [--to <snapshot-id>] [--repo <path>] [--pretty]
```

Field-level behavior lives in the versioned [CLI v1](docs/contracts/cli-v1.md) and [GraphPatch v1](docs/contracts/graph-patch-v1.md) contracts.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm package:verify
```

`package:verify` installs the packed artifact into an external temporary consumer and runs the real CLI. `validation:backend` adds the pinned CodeGraph projection, recovery, rebinding, sibling-bootstrap, and worktree-isolation gate.

## Reference

- [Product contract](docs/product-contract.md)
- [Graph model](docs/contracts/graph-model.md)
- [CodeGraph backend architecture](docs/architecture/codegraph-backend.md)
- [Fresh Agent evaluation protocol](docs/evaluation.md)
- [Published evaluation artifacts](evaluation/results/fresh-agent-v1/README.md)

## License

Semantic Atlas is released under the [MIT License](LICENSE).
