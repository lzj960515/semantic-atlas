# Semantic Atlas Agent Guide

Semantic Atlas is a Git-native, advisory business map for coding agents.
It improves the accuracy of engineering work by giving an agent durable
business context before the agent confirms decisive behavior in current source,
tests, tracked product documentation, and runtime evidence.

Before contributing or changing the product, read [CONTRIBUTING.md](CONTRIBUTING.md)
to confirm the canonical upstream repository and the target for fork pull requests.

## Product Authority

Read these pages before product or implementation work:

1. `docs/product-contract.md` defines the product outcome, users, scope, and
   completion standard.
2. `docs/architecture.md` defines ownership, lifecycle, dependency direction,
   and failure semantics.
3. `docs/map-format.md` defines the tracked map model and query meaning.
4. `docs/evaluation.md` defines accuracy and human-intervention evidence.

Keep one conclusion in its owning page and link to it elsewhere. When stable
knowledge, ownership boundaries, or navigation changes, update the owning page
and affected links, then add an independent record in `docs/changes/` following
the [maintenance record rules](docs/changes/README.md). Apply the same record and
navigation conventions to Wiki maintenance workflows.

## Stable Product Model

- Tracked declarative files are the shared business-map source.
- Every CLI invocation loads those files into an in-memory graph.
- The map supplies business boundaries, relationships, navigation anchors, and
  scenario flows as investigation hypotheses.
- Relationships describe durable collaboration. Flows separately describe
  business-relevant actions, decisions, labeled branches, and outcomes.
- 统一的 `semantic-atlas` Skill 从任务的业务含义介入；仓库尚无图时，先建立当前任务
  所需且有证据的业务模型，行为变化时补写相关流程。
- AI 依据已知流程或概念 ID 直达 `flows <id>`／`context <id>`；只有业务意图时，
  用 `search --flows` 词面定位相关流程。按需补看上下层和协作，不强制从总览起步。
  无 ID 的 `flows` 提供可选目录；人的级联浏览不约束 AI 的调查顺序。
- 当前源码、测试、已跟踪的产品决定和必要运行证据确认会影响改动的结论。
- 业务行为变化时，代码与相关流程在同一分支同步修改、审阅、提交和合入；不默认
  留作候选等待主分支后的独立维护。纯机械或内部组织变化不要求重画流程。
- 合并或重放后按最终代码重审受影响的流程条件、顺序、结果与子流程引用；没有文本
  冲突也需核对两边行为叠加。禁止只拼接两边 YAML 文本。
- `observe` 与 `reconcile` 保留为明确请求时使用的历史记录工具，不作为正常工程
  或流程维护的前置条件，不自动修改或清理已有观察数据。
- 新版文件格式和业务资料可以按已确认契约重写，不因旧格式或旧业务文件引入
  兼容要求；发布、真实业务资料更新和用户安装仍按本次授权分别执行。
- 所有可视页面统一为业务流程图，由 AI 根据真实业务在 flows 中决定范围、粒度和
  连接。独立业务可以有多张平级顶层图，无需共同父图或项目全貌图。默认第一张只是
  阅读选择。每张图讲清自己的业务，相关主线不拆散，独立业务不强行合并；详图提供
  有用的局部解释。不按固定骨架、节点数或层数画图。仓库不限定业务图边界，沿缺失
  环节查前端、后端与其他项目证据；归属与资料依赖不自动产生执行顺序。
- Static export and the loopback Web command use one shared interactive Viewer;
  the service adds project selection without becoming a second graph model.
- Source discovery uses the calling agent's normal repository tools. The map
  remains focused on business meaning rather than structural code indexing.

## Current Delivery Boundary

Build the first product as one small vertical path:

```text
tracked map files
  -> schema validation and normalization
  -> in-memory relationships and business flows
  -> local context query
  -> deterministic JSON and visual projections
```

产品只提供一个包内 semantic-atlas Skill，统一理解业务、核实证据、编写和维护流程图。
业务资料由 AI 编辑，人通过只读画布阅读、导航与讨论。后续能力依据实际业务需要引入。

## Engineering Quality

- Organize high-level methods in user-flow order and keep one abstraction level
  per method.
- Give every module one stable responsibility such as loading map documents,
  validating graph integrity, querying a business neighborhood, or rendering a
  projection.
- Keep domain contracts separate from CLI and rendering adapters.
- Use mature libraries for parsing, schema validation, command-line behavior,
  and graph layout when they express the required contract.
- Introduce local names for multi-step transformations and business decisions so
  inputs, outputs, and failure boundaries remain visible.
- Let errors propagate to a boundary that can return a stable, actionable CLI
  result. Add recovery behavior only when the boundary can perform a defined
  recovery.
- Express product behavior through public-flow tests. Exercise packaged CLI and
  rendered output when those surfaces change.
- Review architecture conformance before treating green tests as delivery
  evidence. A candidate belongs in the product when its responsibilities and
  lifecycle remain readable from the entry point.

## Business Change Workflow

1. 阅读任务与仓库规则，按已知 ID 或业务意图直接定位受影响流程、步骤概念和源码，
   只有决定所需时补看上下层；无相关图时，建立足以完成本次任务的业务模型。
2. 核实当前行为、已确认要求与必要协作，沿相关路径检查动作、判断、分支和结果。
3. 在同一工作分支实施代码与相关流程变更；只更新实际影响范围。纯机械或内部
   组织变化没有业务含义变化时，保留既有流程并说明核对结果。
4. 对完整候选进行业务验证、图校验、实际阅读和独立审查，检查代码与图一致。
5. 按授权一起提交和合入。遇到合并或重放，以最终代码重审受影响路径和两边规则
   的叠加，再完成必要验证；文本合并成功不代表业务一致。
6. 交付说明业务边界、代码与流程修改、验证及真实 Git 状态。准确性观察或历史候选
   校准仅在明确请求时执行，不延后本次流程同步，也不构成交付门槛。

业务资料是理解入口，最终工程结论仍由当前实现与业务证据支持。

## Public Release Contract

- Treat `pnpm release:verify` as the complete source candidate gate. It covers
  contracts, tests, typecheck, build, render, installed package behavior,
  tarball privacy, pack output, and Git diff checks.
- Keep the package version and annotated `v<version>` tag on one exact commit.
  Enable immutable releases before publishing that tag as a non-prerelease
  GitHub Release. A read-only gate job verifies the specific Release before any
  tag checkout or access to the protected `npm` environment; the publish job
  starts only after that gate succeeds.
- Let the protected `npm` GitHub environment own credentials. The release
  workflow repeats source verification and uses npm provenance; local release
  instructions never publish directly.
- Verify the exact workflow run, GitHub Release, remote tag, and anonymous
  `npm view` result before reporting a public release complete.
- Release only a normal fast-forward continuation of public `main`. Preserve
  existing tags, Releases, and npm versions.
- Preserve release stages: a repository candidate does not authorize a direct
  `main` replacement, tag, GitHub Release, npm publication, target-repository
  change, or runtime rollout.

## Git And Task State

- Use TypeScript ESM with Node.js 24 and pnpm when product implementation begins.
- Use English single-line Conventional Commits.
- Keep worktrees under `.worktrees/` and add that directory to this repository's
  `.git/info/exclude` before creating the first worktree.
- Keep long-task state under ignored `tmp/` and update it after meaningful
  milestones.
- Preserve unrelated local work and keep each candidate limited to its task.
- Treat release, publication, installation, external repository changes, and
  runtime rollout as separate explicitly verified stages.
