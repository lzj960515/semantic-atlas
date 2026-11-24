# Semantic Atlas

[![CI](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/semantic-atlas.svg)](https://www.npmjs.com/package/semantic-atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English | [简体中文](README.zh-CN.md)

Semantic Atlas 用流程图帮助人和 AI 共同理解业务。AI 根据源码、文档与运行证据维护
Git 中的业务资料，人通过只读画布检查流程、分支与结果，并逐层进入细节。
总览和子图统一为业务流程图；业务归属、源码锚点与查询为 AI 提供调查入口。

The map is deliberately advisory. It helps an agent enter through the right
business boundary; current source, tests, tracked product documents, and
required runtime evidence still decide what the system does now.
The installed Skill activates from business-changing task meaning, so a
repository without a map still receives the same bounded business-understanding
workflow and updates affected business flows in the same branch.

## Install

Semantic Atlas requires Node.js 24 or later. CI verifies Node.js 24 and 26.

```bash
npm install --global semantic-atlas --allow-scripts=semantic-atlas
semantic-atlas --version
```

全局安装自动接入统一的 `semantic-atlas` Skill，并清理已识别的旧维护 Skill。Codex 与
Claude 使用指向 `~/.agents/skills/semantic-atlas` 的共享入口，同事无需分别维护副本。
`--allow-scripts=semantic-atlas` 允许 npm 12 执行本包的安装步骤，不改变全局 npm 配置。
普通项目依赖安装不会改动用户级 Skill；主动禁用安装脚本时，可运行 `semantic-atlas setup`。

## Upgrade

```bash
semantic-atlas upgrade
```

旧版在 `check` 阶段提示无法取得单一稳定版本时，重新运行上面的全局安装命令即可更新。
4.1.1 已支持 npm 12 返回的单项版本数组；更新后继续使用 `upgrade`。

`upgrade` resolves npm's current stable version, installs that exact package,
verifies the installed CLI identity, and synchronizes the single managed Skill.

### Skill conflicts

`setup` 和 `upgrade` 使用同一安装流程。`semantic-atlas` 与
`semantic-atlas-maintenance` 是本产品管理的 Skill 名称；当前管理标记或匹配的
`SKILL.md` 身份可识别旧安装。旧格式会被接管并更新，旧维护入口在新 Skill 生效后移除。

`MANAGED_SKILL_CONFLICT` 表示目标目录实为其他 Skill，或没有可识别的本产品身份。
该目录会保留。需要让出这个位置时，将错误中的确切目录移到所有 Skill 发现目录之外，
再运行 `semantic-atlas setup`。`upgrade` 若在 `step: "setup"` 失败，已安装的 CLI 保持，
处理这个目录后重跑 setup 即可，无需重新安装软件。不要手工伪造管理标记。

## Add A Business Map

A target repository owns only its Git-tracked map documents:

```text
docs/business-map/*.yaml
```

Start with one file per stable business domain:

```yaml
schemaVersion: 1
map:
  id: commerce
  title: Commerce
  summary: Customer-facing product discovery and purchase.

nodes:
  - id: commerce
    kind: domain
    name: Commerce
    summary: Customer-facing product discovery and purchase.
    aliases: []
    anchors:
      - kind: directory
        value: src/commerce
        description: Likely source entry point for Commerce behavior.

relations: []
flows: []
```

The [map format](docs/map-format.md) defines supported concepts, relations,
business flows, anchors, validation rules, and lookup behavior.

For an operation implemented by a known method, bind its symbol to the source
file so the Agent can begin with that declaration:

```yaml
anchors:
  - kind: symbol
    file: src/orders/place-order.service.ts
    value: PlaceOrderService.execute
    description: Confirm inventory and create a durable customer order.
```

Queries retain both fields with `resolution: "hint"`; they do not guess a declaration's code line.
A missing local path is marked `missing`. The business-facing Viewer hides source anchors.
The Agent locates the current method using normal repository tools and confirms its behavior.
Existing file references and unbound symbols remain compatible; maintenance
can refine them when current evidence establishes a more precise business entry.

## Query And Render

```bash
semantic-atlas validate --repo /path/to/repository
semantic-atlas search "order confirmation notification" --flows --repo /path/to/repository
semantic-atlas flows "engagement.notifications.confirm-order-flow" --repo /path/to/repository
semantic-atlas context "engagement.notifications.send-order-confirmation" --repo /path/to/repository
semantic-atlas render --repo /path/to/repository --output ./business-map.html
semantic-atlas project add /path/to/repository
semantic-atlas project list
semantic-atlas search "order confirmation notification" --flows --project repository
semantic-atlas web
```

登记项目后，可从任意目录使用 `--project <项目名称或ID>` 查询。`project list` 返回名称、
展示名、ID 与实际路径；名称从仓库目录名派生。重名时用 ID，误拼时返回“你是不是在找”
的候选，由 AI 判断后明确重试。`validate/search/flows/context/render/web` 支持该参数，
与显式 `--repo` 互斥。也可直接用 `--repo <路径>`，两项均省略时地图命令只读取当前目录。
流程与源码保留在同一仓库，锚点相对它解析；不同项目分别查询，不递归混合子项目。

`validate` checks every map document as one graph. `search` ranks up to five
concepts with stable IDs, query-relative scores, matched fields, and current YAML
maintenance locations. The first candidate's ID appears in `contextFor`: only
that candidate has an attached business summary. It remains a lexical candidate
for the Agent to assess; use another candidate's ID with `context` when needed.

The shared summary returns unique concept details and source anchors, typed
relations with business reasons, and related flow references with step locations.
It covers direct relations and other recorded users of shared data, interfaces,
and invariants. `scope: "recorded"` marks this as investigation evidence to
confirm in source. It does not establish complete change impact.

`context` retains exact and partial selectors and adds the selected concept,
ancestor IDs and direct child IDs. Related flows remain summaries;
`flows <id>` expands that flow's full local steps and
transitions. Scenario, parent, step concept and child-flow references use IDs;
concept details and anchors appear once in the same response. Query commands
emit compact versioned JSON with only `repository.root`, without a map-file
inventory. Each item's `map` locates its current YAML declaration. See the
[query contract](docs/map-format.md#context-projection) for fields and limits.
`render` produces a deterministic, self-contained interactive HTML Viewer from
that same normalized map.

AI 按业务问题直接定位流程：已知编号时直接 `flows <flow-id>`，未知时用
`search "<业务描述>" --flows` 返回相关流程及命中步骤的维护位置。`contextFor` 标明
第一流程候选的关联摘要；另一个候选更合适时按其流程 ID 读取，或用 `scenarioId`
查询概念上下文。完整步骤与子流程按需读取，没有必须先读总览的顺序。
搜索使用业务名称、别名、步骤和说明做词面匹配，AI 仍需判断业务含义，不能把分数当成证据。

人通过画布阅读。所有页面统一为流程图；节点角标直接进子流程，多目标先选择。
正文有备注才打开默认关闭的说明，说明中没有进入按钮。“上一层”沿实际来路返回。
“查看其他流程”按父子流程逐列展开，单项目名不重复显示。源码与 AI 编排理由在界面隐藏。

AI 根据真实业务决定每张图的范围、平级关系与必要详图。项目可以直接提供多张平级
业务图，无需共同父图或专门的“业务全貌”图。每张图讲清自己的业务，相关主线不拆散，
独立业务不强行合并；跨项目环节沿实际业务找源码，软件不自动拼图或推断执行关系。

同一流程的 `startsAt` 可写多个真实入口；普通动作可以连接多个无条件后续，表示各条
路径都成立。带条件的选择继续使用判断节点。CLI 的 `startsAt` 统一返回 ID 列表，
这是 4.0 的公开结果类型变化；原有单 ID 输入仍可读取。详见[格式](docs/map-format.md)。

没有 `flows` 时显示空状态。可运行[订单管理阅读样例](examples/订单管理/README.md)。

`project add [path]` validates the complete business map and saves its
normalized checkout path in the versioned user-local
`~/.semantic-atlas/projects.json` file. Omitting `path` uses the current
directory. Repeating a valid path is idempotent; a missing or invalid map leaves
the file unchanged.

`web` starts the same Viewer on a read-only `127.0.0.1` server and opens the
default browser. With neither `--repo` nor `--project`, it reads the registered list from any current
directory. An empty list opens an instructional empty state. The initial page
contains only project names and opaque IDs; it loads and validates a map only
when that project is initially selected or selected later. An unavailable path
stays in the list and does not prevent another project from loading.

Pass several repositories after one `--repo` option for a temporary session:

```bash
semantic-atlas web --repo /path/to/api /path/to/frontend --port 4310 --no-open
```

Explicit paths are not saved and are not merged with registered projects. The
browser cannot provide arbitrary repository paths and never receives the saved
paths. Reselecting or refreshing a project reloads its tracked YAML.
Repositories with the same directory name receive deterministic numbered
labels without exposing their parent paths. `Ctrl+C` stops the server.

## Language

The CLI follows your system language (`LC_ALL`, `LC_MESSAGES`, then `LANG`).
Both the Web Viewer and exported HTML follow your browser's language preferences.
English and Simplified Chinese are supported, with English as the fallback.
No language configuration is required for normal use.

See [language selection and adding translations](docs/architecture.md#internationalization)
for implementation details and the optional debugging override.

## Evidence Order

For a business-changing engineering task:

1. Probe the smallest useful map neighborhood whether or not map files exist.
2. Use returned map knowledge as investigation leads, or build the smallest
   source-supported business model after `MAP_NOT_FOUND`.
3. Trace any related business flow and identify the decisions, branches, and
   outcomes that the task can affect.
4. Confirm every change-controlling claim in current source and tests.
5. Use tracked product documents for durable intent and runtime evidence for
   state-dependent behavior.
6. Let current evidence override missing, stale, or contradicted map knowledge.
7. Implement, verify, and recheck the affected business paths through the
   repository's normal engineering workflow.
8. 业务行为变化时，在同一分支同步代码与流程，一起验证和合入；纯实现调整不强制改图。

The final engineering conclusion is expected to be more accurate than the map
that helped locate it.

## Agent Skills

`semantic-atlas setup` 只安装一个 `semantic-atlas` Skill。它根据当前任务先理解业务、
核实源码与运行证据，再决定实现、编写流程或维护共享资料；相关方法按需读取。
理解、画图与维护使用同一份业务知识，不再交接给另一个 Skill。

所有图都用 `flows` 显式编写。总览交代主要路径与条件，子流程解释具体环节，
`part_of` 继续表达所有权，不作为执行顺序。安装和升级会清理已识别的旧维护 Skill，
持续提供同一入口。业务资料仍随所属仓库通过 Git 维护。

业务代码和相关流程在同分支一起修改、检查、评审与合入。合并冲突按最终代码的业务
行为重新梳理，不机械拼接图文件。只有实现组织变化时无需重画。旧业务文件不要求兼容，
新版发布后再按新契约重写，当前不迁移其他项目。

## Accuracy Observations

观察与候选工具保留为明确请求下的历史资料操作，不属于普通开发的默认步骤：

```bash
semantic-atlas observe task --stdin --repo /path/to/repository
semantic-atlas observe review --stdin --repo /path/to/repository
semantic-atlas observe maintenance --stdin --repo /path/to/repository
semantic-atlas insights summary --repo /path/to/repository --period 4w
```

具体不可变记录与重放语义见[观察契约](docs/observations.md)。

## Reconciliation

```bash
semantic-atlas reconcile status --repo /path/to/repository
semantic-atlas reconcile candidates --repo /path/to/repository
```

这些只读命令查询已有的历史候选，只有明确要求时使用。正常流程维护随代码变化，
不先生成候选，不等待代码合入。业务仓库只共享版本控制中的资料。

## Local Data And Privacy

Business maps stay in the target repository. Accuracy observations stay in
immutable JSON files under a hashed user-local repository partition:

```text
~/.semantic-atlas/observations/v1/repositories/<repository-id>/
```

Observation files contain neither repository paths nor remote URLs. The
separate `~/.semantic-atlas/projects.json` Viewer configuration stores only the
checkout paths the user explicitly registers. Those paths remain server-side
and are never sent to the browser. Semantic Atlas has no remote observation
service, account, telemetry upload, persistent graph database, or automatic
source/map mutation. `setup` and observation commands do not add files to a
target repository; `render` writes only the explicitly requested local output.
`web` binds only to loopback, exposes GET and HEAD, and reads either the
registered list or the explicit temporary `--repo` set.

## Development

For upstream contributions, forks, and pull requests, start with the
[contribution guide](https://github.com/lzj960515/semantic-atlas/blob/main/CONTRIBUTING.md).

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm release:verify
```

`pnpm lint` runs Oxlint correctness rules and fails on errors or warnings.
`pnpm lint:fix` applies safe lint fixes; `pnpm format` writes Oxfmt formatting,
and `pnpm format:check` checks formatting without changing files. These commands
cover TypeScript source, tests, release and smoke scripts, the bundled Skill
script, and Vitest configuration. Map YAML and Markdown stay outside automatic
formatting. The shared formatter uses two-space indentation, double quotes,
semicolons, trailing commas, and a 100-column print width, while preserving
import order and embedded language content.

The release-candidate gate runs lint and formatting checks, contract and source
tests, typecheck, build,
rendering checks, packed-tarball privacy checks, an anonymous installed-product
flow, package dry-run, and Git diff validation.

Publication is a separate operation. After the repository's immutable-release
setting is enabled, a non-prerelease GitHub Release for an annotated version tag
triggers the protected npm workflow. The workflow verifies the specific Release
is immutable in a read-only job before any tag checkout or npm credential
boundary. Only then does the protected publish job repeat the candidate gate
and publish with npm provenance. A separate read-only job verifies public npm
visibility within five minutes and can be rerun without publishing again.

## Documentation

- [Product contract](docs/product-contract.md)
- [Architecture](docs/architecture.md)
- [Map format](docs/map-format.md)
- [Accuracy observations](docs/observations.md)
- [Evaluation](docs/evaluation.md)

## License

[MIT](LICENSE)
