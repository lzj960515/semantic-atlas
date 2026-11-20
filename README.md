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
npm install --global semantic-atlas
semantic-atlas setup
semantic-atlas --version
```

`setup` 安装一个统一的 `semantic-atlas` Skill 到 `~/.agents/skills/semantic-atlas`，
负责理解业务、核实证据、编写和维护流程图。重复运行会校验、修复或升级受管副本，
无关同名目录受到保护。

## Upgrade

```bash
semantic-atlas upgrade
```

`upgrade` resolves npm's current stable version, installs that exact package,
verifies the installed CLI identity, and synchronizes the single managed Skill.

### Skill conflicts

`MANAGED_SKILL_CONFLICT` protects an existing directory whose ownership cannot
be established. A matching directory name or `SKILL.md` alone is insufficient.
`setup` requires a readable `.semantic-atlas-managed.json` containing valid JSON
with `schemaVersion: 1`, `managedBy: "semantic-atlas"`, the matching `skillName`,
nonempty `packageName` and `packageVersion`, and a 64-character lowercase
hexadecimal `fingerprint`. The package identity may describe an earlier
installation; an accepted marker allows setup to repair or upgrade its payload.
Missing, unreadable, malformed, obsolete, or mismatched markers remain protected.

When `upgrade` reports `UPGRADE_FAILED` with `step: "setup"`, the target CLI has
already passed version verification, but Skill synchronization is incomplete.
The nested setup error identifies the conflicting `directory`. Resolve the named directory, then retry `semantic-atlas setup` using
the same Node/npm installation; another package upgrade is not needed for this
recovery.

Inspect the exact directory named in the error. This Linux/macOS example uses
the managed Skill; substitute the `.backup` path when that is
the reported conflict:

```bash
skill_dir="$HOME/.agents/skills/semantic-atlas"
ls -ld "$skill_dir"
ls -l "$skill_dir/.semantic-atlas-managed.json"
cat "$skill_dir/.semantic-atlas-managed.json"
```

For a known managed installation, restore the marker only from a trusted backup
of that installation, or restore its read access, then retry setup. Keep custom
or unrelated Skills under their owner's control. To switch this location to the
bundled Skill, preserve the complete conflicting directory outside all Skill
discovery roots before installing a fresh managed copy:

```bash
backup_root="$(mktemp -d "$HOME/semantic-atlas-skill-backup.XXXXXX")" &&
  mv -- "$skill_dir" "$backup_root/" &&
  semantic-atlas setup
```

The unique backup directory prevents an existing backup from being overwritten.
Keep it until the new Skills have been verified and any custom work has been
reviewed. A renamed copy inside `~/.agents/skills/` may still be discovered by
agents, so this example places the backup outside that directory. Let `setup`
create the new ownership marker from its bundled payload.

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

`context` retains both fields. The business-facing Viewer hides source anchors. The Agent locates
the current method using normal repository tools and confirms its behavior.
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
semantic-atlas web
```

从多项目工作空间调用时，将 `--repo` 指向实际要修改的子仓库。流程与源码保留在同一
仓库，锚点相对该仓库解析；跨项目任务分别查询。省略参数只读取当前目录，不递归扫描
子项目，不能根据工作空间根目录的空结果判断子项目没有图。

`validate` checks every map document as one graph. `search` ranks up to five
concepts of any business-node kind for a natural-language query. Each result
includes a query-relative score, stable ID, node kind, and the fields that
matched. Use the selected stable ID with `context` to return that concept's
containment, direct incoming and outgoing relationships, related concepts,
source-navigation anchors, and complete related flows in a versioned JSON
envelope. Existing exact and partial `context` selectors remain supported.
`render` produces a deterministic, self-contained interactive HTML Viewer from
that same normalized map.

AI 按业务问题直接定位流程：已知编号时直接 `flows <flow-id>`，未知时用
`search "<业务描述>" --flows` 返回相关流程，再读取该图的步骤、子流程与具体代码锚点。
`context <concept-id>` 可以补看业务规则、数据和协作。没有必须先读总览的顺序。
搜索使用业务名称、别名、步骤和说明做词面匹配，AI 仍需判断业务含义，不能把分数当成证据。

人通过画布阅读。所有页面统一为流程图；节点角标直接进子流程，多目标先选择。
正文有备注才打开默认关闭的说明，说明中没有进入按钮。“上一层”沿实际来路返回。
“查看其他流程”按父子流程逐列展开，单项目名不重复显示。源码与 AI 编排理由在界面隐藏。

没有 `flows` 时显示空状态。可运行[订单管理阅读样例](examples/订单管理/README.md)。

`project add [path]` validates the complete business map and saves its
normalized checkout path in the versioned user-local
`~/.semantic-atlas/projects.json` file. Omitting `path` uses the current
directory. Repeating a valid path is idempotent; a missing or invalid map leaves
the file unchanged.

`web` starts the same Viewer on a read-only `127.0.0.1` server and opens the
default browser. With no `--repo`, it reads the registered list from any current
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
`part_of` 继续表达所有权，不作为执行顺序。旧用户目录中的 maintenance Skill
不由本次源码改动自动清理；本产品的新安装只提供统一入口。

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
