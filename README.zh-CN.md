<div align="center">
  <h1>Semantic Atlas</h1>
  <p><strong>为 AI 编程 Agent 准备的本地、证据约束项目世界图。</strong></p>
  <p>把代码结构连接到经过验证的业务含义，并让两者始终感知版本变化。</p>

  <p>
    <a href="https://www.npmjs.com/package/semantic-atlas"><img alt="npm 版本" src="https://img.shields.io/npm/v/semantic-atlas?style=flat-square&color=cb3837"></a>
    <a href="https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml"><img alt="持续集成" src="https://img.shields.io/github/actions/workflow/status/lzj960515/semantic-atlas/ci.yml?branch=main&style=flat-square&label=ci"></a>
    <a href="https://www.npmjs.com/package/semantic-atlas"><img alt="支持的 Node.js 版本" src="https://img.shields.io/node/v/semantic-atlas?style=flat-square&color=43853d"></a>
    <a href="./LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/github/license/lzj960515/semantic-atlas?style=flat-square&color=2d5b46"></a>
  </p>

  <p><a href="./README.md">English</a> · <strong>简体中文</strong></p>
</div>

## Semantic Atlas 是什么？

Semantic Atlas 为编程 Agent 提供一张本地世界图，把两类项目知识连接在一起：

- **TypeScript 与 JavaScript 结构证据**：文件、符号、关系、框架入口和未解析边界。
- **由 Agent 验证的业务知识**：能力、场景、操作、接口、数据、规则、测试，以及支撑它们的证据。

`semantic-atlas` CLI 提供确定性、带版本的 JSON 操作；随包发布的 Codex Skill 则告诉 Agent 何时查询、何时回到源码，以及何时值得保留已经验证的知识。

> **先查询，再确认源码；只学习证据真正证明的内容。**

源码始终是权威事实。Atlas 是一份感知代码版本的投影：它让有用上下文可以复用，同时不会假装静态分析已经知道所有运行时行为。

## 为什么使用它？

- **从业务含义开始。** 先找到能力、操作、数据和依赖路径，再打开范围广泛的仓库源码。
- **减少源码上下文。** 用图证据选择有边界的源码起点，只阅读当前判断真正需要的代码。
- **让知识保持诚实。** 证据绑定到快照；证据变化或消失后，断言会明确变为过期，而不会悄悄继续充当当前事实。
- **保留不确定性。** 动态分派、反射、不支持的结构和未解析目标会保持显式，并把 Agent 引导回源码。
- **不侵入目标项目。** 持久知识保存在 `~/.semantic-atlas`；工作树内只有被忽略、可丢弃的 CodeGraph 投影，不会改写跟踪中的源码和配置。

## 一张项目世界图

![Semantic Atlas 能力图，展示结构证据、业务知识、Agent 循环、统一世界图、显式不确定性与本地存储](docs/mindmaps/semantic-atlas-overview.zh-CN.png)

Atlas 保存一张权威业务图，而不是分别保存总览图和多张细节图。`map view`
展示它在当前缩放层级的可见边界：先看没有父节点的世界区域，再进入某个业务
key，沿 breadcrumb、子区域和关联上下文区域继续放大，直到看见任务相关的
操作、数据或规则。跨区域连接汇总支撑当前视图的深层已验证关系，但不会把
投影出来的高层关系持久化成新事实。

## 快速开始

Semantic Atlas 支持 Node.js 22.12 至 24，以及包含 TypeScript 或 JavaScript 的 Git 工作树。

### 安装 CLI

```sh
npm install --global semantic-atlas
semantic-atlas setup
semantic-atlas --version
semantic-atlas status --repo /path/to/project
```

`setup` 会把当前 npm 包内的同版本 Skill 安装到
`~/.agents/skills/semantic-atlas`。升级 npm 包后再次执行即可同步 Skill；它还会
删除能够确认为 Semantic Atlas 的旧 `~/.codex/skills/semantic-atlas` 副本，避免
旧版本优先被发现。之后，Codex 和其他兼容 Agent 可以根据任务描述自动选择
`$semantic-atlas`，你也可以显式调用它。

安装完成后，索引和查询均在本机执行，不会调用模型或网络。只有安装或更新软件包时需要正常访问 npm registry。

### 发起第一次查询

从准确的目标工作树串行执行命令：

```sh
semantic-atlas status
semantic-atlas index
semantic-atlas map view
semantic-atlas map search "checkout" --limit 10
semantic-atlas code search "CheckoutService" --limit 10
```

每条项目命令都会向标准输出写入一个带版本的 JSON 信封；`setup`、
`-h`/`--help` 与 `--version` 是不依赖仓库的文本命令。诊断信息留在标准错误
中，因此 Agent 可以读取稳定的项目字段与告警代码，而不是抓取自然语言文本。

新项目完成索引后，世界 `map view` 可能返回 `regions: []` 和
`BUSINESS_KNOWLEDGE_EMPTY`。这是诚实的起点：map 命令只包含已经验证的业务
知识，显式 `code search` 则为当前任务提供有边界的 CodeGraph 证据。

## Agent 如何循环工作？

1. **检查状态。** 在广泛发现源码前，确认准确的仓库根目录、快照新鲜度和结构后端完整性。
2. **建立索引。** 当状态缺失、过期、失败或不完整时，发布或刷新当前工作树的本地快照。
3. **查询世界图。** 从业务世界开始，搜索业务词、逐层缩放相关区域并查看直接证据；只有业务地图为空或不足时才使用 `code search`。
4. **确认源码。** 打开图中引用的范围，在权威代码中确认决定性行为；让部分、过期、不支持和未知结果保持有边界。
5. **完成工程工作。** 调用 Agent 负责改代码、跑测试、审查差异和操作 Git；Atlas 不接管这些动作。
6. **对齐并学习。** 相关源码变化后重新索引，检查语义 `changes`，只通过 `learn --stdin` 写入持久且已验证的业务知识，再用 `map show` 验证学习结果。

这个循环在真实任务中逐块增长并重组经过验证的业务地图。一个暂时没有已知父节点的操作可以先成为根；后续任务发现更大的业务概念后，可以保持原有 key 和证据，把它挂到新的父节点下。Atlas 不要求预先执行一次全仓库业务学习。

当新建 Git worktree 第一次运行 `index` 时，Atlas 会自动复制兼容 sibling worktree 的 CodeGraph 投影，再执行增量同步。Agent 不需要额外初始化命令；只有不存在兼容投影时才执行全量索引。

## 实测结果

### 冻结对照评测

仓库保留的 [`fresh-agent-v1` 报告](evaluation/results/fresh-agent-v1/report.json)覆盖 `framework-evaluation@fixture-v1`：针对 NestJS、GraphQL、TypeORM 与 BullMQ 的定位和依赖影响任务，共有 12 组配对案例、24 次全新 Agent 运行。

| 指标 | 不使用 Atlas | 使用 Atlas | 固定 fixture 结果 |
| --- | ---: | ---: | --- |
| 最终答案正确率 | 100% | 100% | 无回退 |
| 必要文件召回率 | 100% | 100% | 无回退 |
| 必要符号召回率 | 100% | 100% | 无回退 |
| 打开的唯一源码文件中位数 | 6.5 | 4 | 减少 38.46% |
| 观测到的源码输入 token 中位数 | 1,351 | 688 | 减少 49.07% |

评测门槛在收集结果前就已固定；61 个被路由的不确定性事件均得到处理，没有形成失败分类。解读数字前，请阅读[评测方法](docs/evaluation.md)和保留的运行记录。

这些只是在固定 fixture 上得到的对照结果，**不能**证明所有仓库都具有相同业务准确率，也不能代表模型总 token 节省。这里的 token 指标只统计使用 `tiktoken-o200k_base-v1` 观测到的源码输入。

### 公开工作流验证

我们在一个隔离的 TypeScript 项目中，使用从 npm registry 安装的 CLI 和本仓库公开的 Skill 验证了公开安装路径：

- 第一个全新 Agent 完成 `missing → index → query → 源码确认 → learn`。
- 第二个全新 Agent 没有看到前一个答案，也没有重复 `learn`，只通过正常的状态、业务导航、搜索和详情查询就发现并复用了已持久化的知识。
- 验证前后，目标 revision 与普通 Git 状态保持不变；持久知识位于用户级 Atlas 目录，工作树内只有被忽略的 CodeGraph 状态。

这次验证说明安装路径、Agent 工作流、知识复用和零侵入行为可以协同工作；它不构成通用准确率基准或生产稳定性结论。

## 证据、不确定性与存储边界

| 边界 | 契约 |
| --- | --- |
| 源码权威 | 所有影响答案的结论都要回到源码确认；Atlas 上下文不会覆盖当前检出的代码。 |
| 证据有效性 | 业务断言携带源码定位、哈希、确定性和由快照推导的有效性。证据无法重绑定时会得到 `stale`，而不是被静默删除或升级。 |
| 显式不确定性 | `UnknownBoundary`、`partial`、`unsupported`、`hypothesis` 和信息不足的结果用于缩小源码回退范围，绝不会冒充精确事实。 |
| 一个产品 | CLI 与 Skill 组成一个 Semantic Atlas 工作流。CodeGraph 位于适配器之后，它的 CLI、MCP、表结构和后端类型不是 Atlas 公共接口。 |
| 仓库级持久知识 | `~/.semantic-atlas/repositories/<repository-id>/atlas.db` 保存仓库共享的业务知识、快照、按快照绑定、有效性和 worktree publication 状态。测试与 CI 只能用绝对路径 `SEMANTIC_ATLAS_HOME` 隔离。 |
| 工作树级结构投影 | 每个 worktree 拥有只含 CodeGraph 结构的 `.atlas/codegraph.db`。缺失投影会从兼容 sibling 自动引导并增量同步。 |
| 零侵入 | Atlas 准备 `.atlas/.gitignore`，不写入跟踪中的源码或项目配置，也不负责编辑、测试、审查、提交、合入或发布代码。删除 worktree 只会删除其可丢弃结构投影。 |

## CLI 与开发

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

字段级行为由带版本的 [CLI v1](docs/contracts/cli-v1.md)与 [GraphPatch v1](docs/contracts/graph-patch-v1.md)契约定义。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm package:verify
```

`package:verify` 会把打包产物安装到仓库外的临时使用者中，并运行真实 CLI。`validation:backend` 则增加固定 CodeGraph 版本的结构投影、恢复、证据重绑定、sibling 引导与工作树隔离门槛。

## 参考资料

- [产品契约](docs/product-contract.md)
- [图模型](docs/contracts/graph-model.md)
- [CodeGraph 后端架构](docs/architecture/codegraph-backend.md)
- [Fresh Agent 评测协议](docs/evaluation.md)
- [已发布评测产物](evaluation/results/fresh-agent-v1/README.md)

## 许可证

Semantic Atlas 使用 [MIT 许可证](LICENSE)发布。
