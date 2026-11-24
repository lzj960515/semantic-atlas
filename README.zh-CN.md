# Semantic Atlas

[![CI](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/semantic-atlas.svg)](https://www.npmjs.com/package/semantic-atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | 简体中文

Semantic Atlas 将业务流程图作为人和 AI 协作的一等公民。
仓库使用纳入 Git 管理的 YAML 描述稳定的业务域、能力、操作、数据、规则、
接口及其关系；场景流程继续描述业务上重要的动作、判断、分支和结果。CLI 负责
验证地图、返回适合当前调查的小范围业务邻域及相关流程，并把业务流程渲染给人查看。

经确认的流程定义业务应当怎样运转，代码负责实现，测试与运行证据核对是否兑现。
图与代码不一致时，先核对业务决定，区分实现缺陷、图误写与意图变化，不直接改图
迁就代码。首次建图仍调查当前实现，分清确认规则、实现现状和待定差异。
受管 Skill 根据业务任务本身决定是否进入理解流程。因此，即使仓库还没有地图，
Agent 也会建立有边界的当前业务模型，并在业务变化时同步更新相关流程。

## 安装

Semantic Atlas 需要 Node.js 24 或更高版本。CI 验证 Node.js 24 和 26。

```bash
npm install --global semantic-atlas --allow-scripts=semantic-atlas
semantic-atlas --version
```

全局安装自动接入统一的 `semantic-atlas` Skill，并清理已识别的旧维护 Skill。Codex 与
Claude 使用指向 `~/.agents/skills/semantic-atlas` 的共享入口，同事无需分别维护副本。
`--allow-scripts=semantic-atlas` 允许 npm 12 执行本包的安装步骤，不改变全局 npm 配置。
普通项目依赖安装不会改动用户级 Skill；主动禁用安装脚本时，可运行 `semantic-atlas setup`。

## 界面语言

终端自动读取系统语言环境，依次使用 `LC_ALL`、`LC_MESSAGES`、`LANG`。
Web 查看器和导出的 HTML 自动使用浏览器语言。支持英语和简体中文，
未匹配到支持的语言时回退英语，正常使用无需额外配置。

调试覆盖变量和新增翻译的方法见[国际化说明](docs/architecture.md#internationalization)。

## 升级

```bash
semantic-atlas upgrade
```

旧版在 `check` 阶段提示无法取得单一稳定版本时，重新运行上面的全局安装命令即可更新。
4.1.1 已支持 npm 12 返回的单项版本数组；更新后继续使用 `upgrade`。

`upgrade` 先解析 npm 当前稳定版本，再安装这个精确版本，验证已安装 CLI 的
身份，然后让新 CLI 同步一个统一 Skill。因此，可执行程序和 Skill 始终作为
同一个有版本的产品一起升级。

<a id="skill-conflicts"></a>

### Skill 目录冲突

`setup` 和 `upgrade` 使用同一安装流程。`semantic-atlas` 与
`semantic-atlas-maintenance` 是本产品管理的 Skill 名称；当前管理标记或匹配的
`SKILL.md` 身份可识别旧安装。旧格式会被接管并更新，旧维护入口在新 Skill 生效后移除。

`MANAGED_SKILL_CONFLICT` 表示目标目录实为其他 Skill，或没有可识别的本产品身份。
该目录会保留。需要让出这个位置时，将错误中的确切目录移到所有 Skill 发现目录之外，
再运行 `semantic-atlas setup`。`upgrade` 若在 `step: "setup"` 失败，已安装的 CLI 保持，
处理这个目录后重跑 setup 即可，无需重新安装软件。不要手工伪造管理标记。

## 添加业务地图

目标仓库只需要维护自己纳入 Git 管理的地图文档：

```text
docs/business-map/*.yaml
```

先为每个稳定业务域建立一个文件：

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

[地图格式](docs/map-format.md)定义了支持的业务概念、关系、业务流程、导航锚点、
验证规则和查找行为。

业务操作已有明确实现方法时，可以把符号绑定到源文件，让 Agent 从这个方法开始阅读：

```yaml
anchors:
  - kind: symbol
    file: src/orders/place-order.service.ts
    value: PlaceOrderService.execute
    description: 确认库存并创建持久化的客户订单。
```

查询保留文件和符号两个字段并标为 `resolution: "hint"`，不猜声明的代码行号；
缺失的本地路径标为 `missing`。面向业务人员的 Viewer 隐藏源码锚点。Agent 使用平常的仓库
工具定位当前方法，并确认实际业务行为。既有文件引用和未绑定文件的符号继续兼容；
维护时根据当前源码证据完善更精确的业务入口。

## 查询与渲染

```bash
semantic-atlas validate --repo /path/to/repository
semantic-atlas search "订单确认通知" --flows --repo /path/to/repository
semantic-atlas flows "engagement.notifications.confirm-order-flow" --repo /path/to/repository
semantic-atlas context "engagement.notifications.send-order-confirmation" --repo /path/to/repository
semantic-atlas render --repo /path/to/repository --output ./business-map.html
semantic-atlas project add /path/to/repository
semantic-atlas project list
semantic-atlas search "订单确认通知" --flows --project repository
semantic-atlas web
```

登记项目后，可从任意目录使用 `--project <项目名称或ID>` 查询。`project list` 返回名称、
展示名、ID 与实际路径；名称从仓库目录名派生。重名时用 ID，误拼时返回“你是不是在找”
的候选，由 AI 判断后明确重试。`validate/search/flows/context/render/web` 支持该参数，
与显式 `--repo` 互斥。也可直接用 `--repo <路径>`，两项均省略时地图命令只读取当前目录。
流程与源码保留在同一仓库，锚点相对它解析；不同项目分别查询，不递归混合子项目。

`validate` 把所有地图文档作为一张完整图进行检查。`search` 返回最多五个概念候选，
包含稳定 ID、查询内的相对相关度、命中字段和当前 YAML 的维护位置。`contextFor`
标明随附业务摘要所属的第一候选 ID。它仍是需要 AI 判断的词面候选；另一个候选更
合适时，按其 ID 读取 `context`。

共用摘要提供唯一概念详情与源码入口、带业务原因的类型关系，以及相关图的步骤引用
位置。它覆盖直接关系和共享数据、接口、规则的其他已记录使用方。`scope: "recorded"`
明示这些是需要查源码核实的调查线索，不保证全部影响已经找齐。

`context` 保留精确与部分选择器，另给所选概念、祖先与直接子概念 ID。相关流程保持
摘要；`flows <id>` 才展开
该图完整的本层步骤与转换。场景、父流程、步骤概念与子流程用 ID 引用，概念详情和
锚点在同一响应中只保留一份。查询输出紧凑的带版本 JSON，`repository` 只包含 `root`，
不附全库地图目录。各条目的 `map` 定位当前 YAML 声明；字段与边界见
[查询契约](docs/map-format.md#context-projection)。`render` 从同一标准化地图生成
确定性的单文件交互 Viewer。

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

`project add [path]` 会先校验完整业务地图，再把规范化的 checkout 路径保存到
带版本的用户本地文件 `~/.semantic-atlas/projects.json`。省略 `path` 时使用当前
目录；重复登记有效路径是幂等操作，地图缺失或无效时不会修改文件。

`web` 会在只读的 `127.0.0.1` 服务上启动同一个 Viewer，并打开默认浏览器。
`--repo` 和 `--project` 均未提供时，它从任意当前目录读取完整登记清单；清单为空时仍会打开
Viewer，并显示登记指引。首页只包含项目名称和不透明标识，浏览器初次选择或
切换项目时才加载、校验并渲染该项目。路径不可用的项目仍保留在列表中，而且
不会阻止其他项目正常加载。

一个 `--repo` 参数也可以接收多个仓库，组成仅用于本次启动的临时项目集合：

```bash
semantic-atlas web --repo /path/to/api /path/to/frontend --port 4310 --no-open
```

显式路径不会写入项目文件，也不会与已登记路径合并。浏览器不能提交任意仓库
路径，也不会收到保存的路径。重新选择或刷新项目会重新读取其当前 YAML。目录
名相同的仓库会获得稳定的编号标签，同时不会暴露父目录。按 `Ctrl+C` 停止服务。

## 证据顺序

对于可能改变业务行为的工程任务：

1. 无论仓库是否已有地图，都先探测能够支持当前任务的最小业务邻域。
2. 以已确认流程为业务规范；遇到 `MAP_NOT_FOUND` 时，调查当前实现，建立支持
   当前任务的最小候选流程并说明未决差异。
3. 沿相关业务流程找出本次任务可能影响的判断、分支和结果。
4. 在源码和测试中核对实现是否兑现已确认业务规则。
5. 以已有业务决定明确期望行为，以运行证据核对实际发生的行为。
6. 差异先区分实现缺陷、图误写与意图变化；代码与图不同，不足以自动覆盖图。
7. 按目标仓库原有的工程流程实现、验证并重新核对受影响的业务路径。
8. 业务变化在同分支同步代码与相关图，一起验证合入；纯实现调整无需重画。

业务规则变化先在图中表达，再实现；工程结论分别说明业务规范、实现现状和未决差异。

## Agent Skills

`semantic-atlas setup` 只安装一个 `semantic-atlas` Skill。它把理解业务、核实证据、
编写流程和维护资料放在同一条工作路径中，按任务读取所需方法，不再转交另一个
维护 Skill。所有可视图都使用 `flows` 显式编写，总览有真实顺序与分支，子流程
通过步骤的场景引用进入；`part_of` 只表示业务归属。

安装和升级会清理已识别的旧维护 Skill，持续提供同一入口。业务资料仍随所属仓库通过 Git 维护。

每次写入或维护图谱，都先根据业务职责、数据、规则与协作关系确认归属，再选择文件。
既有业务域仍然准确时复用；新增独立业务有自己的 YAML 和清楚的业务域根节点；阅读器通过对应的流程访问细节。共享概念只定义一次，其他文件用稳定 ID 引用。局部请求或只有一种业务职责
的小项目可以只用一个文件；这些规则同样适用于初始化和后续维护。

业务代码和相关流程在同分支一起修改、检查、评审和合入。合并先确定共同生效的业务规则，再核对最终实现，不机械拼接图文件。纯实现调整无需重画。旧业务文件不要求兼容，
新版发布后再按新契约重写，本轮不迁移其他项目。

## 准确性观测

以下工具只在明确请求处理观察或历史资料时使用，不属于普通开发的默认步骤：

```bash
semantic-atlas observe task --stdin --repo /path/to/repository
semantic-atlas observe review --stdin --repo /path/to/repository
semantic-atlas observe maintenance --stdin --repo /path/to/repository
semantic-atlas insights summary --repo /path/to/repository --period 4w
```

记录不可变，精确重放幂等；完整语义见[观察契约](docs/observations.md)。

## 地图校准

```bash
semantic-atlas reconcile status --repo /path/to/repository
semantic-atlas reconcile candidates --repo /path/to/repository
```

这些命令只读查询已有历史候选。正常流程维护随业务代码变化，不先生成候选，
不等待代码合入；需要处理已有历史记录时才使用这些工具。

## 本地数据与隐私

业务地图保存在目标仓库中。准确性观测以不可变 JSON 文件保存在经过哈希处理的
本地仓库分区：

```text
~/.semantic-atlas/observations/v1/repositories/<repository-id>/
```

观测文件既不包含仓库路径，也不包含远端 URL。独立的 Viewer 配置文件
`~/.semantic-atlas/projects.json` 只保存用户明确登记的 checkout 路径；这些路径
始终留在服务端，不会发送给浏览器。Semantic Atlas 没有远程观测服务、账号系统、
遥测上传、持久化图数据库或自动修改源码和地图的行为。`setup` 和观测命令不会
向目标仓库添加文件；`render` 只写入调用者明确指定的本地输出；`web` 只绑定
loopback，只接受 GET 和 HEAD，并且只读取登记清单或显式的临时 `--repo` 集合。

## 开发

参与项目贡献时，请先阅读[贡献指南](https://github.com/lzj960515/semantic-atlas/blob/main/CONTRIBUTING.md)，
确认上游仓库、分支和 PR 提交位置。

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm release:verify
```

`pnpm lint` 运行 Oxlint 正确性规则，遇到错误或警告会失败；`pnpm lint:fix`
应用安全的自动修复。`pnpm format` 使用 Oxfmt 整理代码，`pnpm format:check`
只检查格式。检查覆盖 TypeScript 源码、测试、发布与冒烟脚本、随包提供的 Skill
脚本和 Vitest 配置，地图 YAML 与 Markdown 保持人工维护。格式统一为两个空格缩进、
双引号、分号、尾随逗号和 100 列换行宽度，并保留 import 顺序与内嵌语言内容。

候选版本验收会运行静态检查、格式检查、契约和源码测试、类型检查、构建、渲染检查、打包隐私检查、
匿名安装后的完整产品流程、package dry-run 和 Git 差异检查。

发布是独立操作。仓库启用不可变 Release 后，带 annotated version tag 的正式
GitHub Release 会触发受保护的 npm 工作流。工作流先在只读任务中确认这个精确
Release 不可变，然后才允许检出 tag、进入 npm 凭证边界、重新运行候选验收，
并通过 npm provenance 发布。发布成功后，独立的只读任务会在五分钟内核验 npm
公共可见性；核验失败时可以单独重跑，无需重复发布。

## 文档

- [产品契约](docs/product-contract.md)
- [架构](docs/architecture.md)
- [地图格式](docs/map-format.md)
- [准确性观测](docs/observations.md)
- [评估方法](docs/evaluation.md)

## 许可证

[MIT](LICENSE)
