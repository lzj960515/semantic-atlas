# Semantic Atlas

[![CI](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/semantic-atlas.svg)](https://www.npmjs.com/package/semantic-atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | 简体中文

Semantic Atlas 在编码 Agent 修改代码之前，为它提供一份紧凑的业务地图。
仓库使用纳入 Git 管理的 YAML 描述稳定的业务域、能力、操作、数据、规则、
接口及其关系；场景流程继续描述业务上重要的动作、判断、分支和结果。CLI 负责
验证地图、返回适合当前调查的小范围业务邻域及相关流程，并把两种视图渲染给人
查看。

地图只提供调查线索，不直接代表当前实现。它帮助 Agent 从正确的业务边界
进入问题；当前源码、测试、纳入版本管理的产品文档，以及必要的运行时证据，
仍然决定系统现在实际怎样工作。
受管 Skill 根据业务任务本身决定是否进入理解流程。因此，即使仓库还没有地图，
Agent 也会建立有边界的当前业务模型，并在业务变化时同步更新相关流程。

## 安装

Semantic Atlas 需要 Node.js 24 或更高版本。CI 验证 Node.js 24 和 26。

```bash
npm install --global semantic-atlas
semantic-atlas setup
semantic-atlas --version
```

`setup` 把一个统一的 `semantic-atlas` Skill 安装到
`~/.agents/skills/semantic-atlas`，负责业务理解与流程维护。重复执行时，它会验证已安装内容、修复被修改的受管副本，
并升级由其他当前版本安装的 Skill。对于无关或格式已经废弃的同名目录，它会
拒绝覆盖。

## 界面语言

终端自动读取系统语言环境，依次使用 `LC_ALL`、`LC_MESSAGES`、`LANG`。
Web 查看器和导出的 HTML 自动使用浏览器语言。支持英语和简体中文，
未匹配到支持的语言时回退英语，正常使用无需额外配置。

调试覆盖变量和新增翻译的方法见[国际化说明](docs/architecture.md#internationalization)。

## 升级

```bash
semantic-atlas upgrade
```

`upgrade` 先解析 npm 当前稳定版本，再安装这个精确版本，验证已安装 CLI 的
身份，然后让新 CLI 同步一个统一 Skill。因此，可执行程序和 Skill 始终作为
同一个有版本的产品一起升级。

<a id="skill-conflicts"></a>

### Skill 目录冲突

`MANAGED_SKILL_CONFLICT` 表示现有目录的管理身份无法确认，因此受到保护。
仅有相同目录名或 `SKILL.md` 不足以证明身份。`setup` 要求可读取的
`.semantic-atlas-managed.json` 是有效 JSON，并包含 `schemaVersion: 1`、
`managedBy: "semantic-atlas"`、与目标一致的 `skillName`、非空的
`packageName` 和 `packageVersion`，以及 64 位小写十六进制 `fingerprint`。
包名和版本可以属于先前安装；识别管理身份后，setup 才会修复或升级其中的内容。
标识缺失、不可读、损坏、格式过时或字段不匹配时，目录都会受到保护。

如果 `upgrade` 返回 `UPGRADE_FAILED` 且 `step` 为 `setup`，说明目标 CLI 已通过
版本验证，但 Skill 同步尚未完成。内层错误的 `directory` 指明冲突位置。
处理报错目录后，使用原来同一套 Node/npm 安装执行 `semantic-atlas setup` 即可
重试这个阶段，无需为了恢复而再次升级包。

先检查错误中列出的确切目录；如果指向 `.backup`，使用错误中的对应路径：

```bash
skill_dir="$HOME/.agents/skills/semantic-atlas"
ls -ld "$skill_dir"
ls -l "$skill_dir/.semantic-atlas-managed.json"
cat "$skill_dir/.semantic-atlas-managed.json"
```

对于来源明确的受管安装，可以从该安装的可信备份恢复管理标识，或恢复读取权限，
再运行 setup。自定义或其他来源的 Skill 继续由其原来的管理者维护。
如果决定在此位置改用包内 Skill，先把完整冲突目录移到所有 Skill 发现目录之外，
保留原内容，再安装新的受管副本：

```bash
backup_root="$(mktemp -d "$HOME/semantic-atlas-skill-backup.XXXXXX")" &&
  mv -- "$skill_dir" "$backup_root/" &&
  semantic-atlas setup
```

独立生成的备份目录可以避免覆盖已有备份。在新 Skill 验证完成、自定义内容
确认处理完毕之前保留备份。仅在 `~/.agents/skills/` 内重命名旧目录，仍可能被
Agent 当作 Skill 发现，因此示例把备份放在该目录之外。新的管理标识由 setup
根据包内内容生成。

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

`context` 保留文件和符号两个字段；面向业务人员的 Viewer 隐藏源码锚点。Agent 使用平常的仓库
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
semantic-atlas web
```

从多项目工作空间调用时，将 `--repo` 指向实际要修改的子仓库。流程文件保存在该仓库的
`docs/business-map/`，源码锚点也相对该仓库解析；不同项目分别查询。省略 `--repo` 只读取
当前目录，不递归扫描子项目，因此工作空间根目录没有图不表示子项目没有图。

`validate` 把所有地图文档作为一张完整图进行检查。`search` 根据自然语言查询，
从所有类型的业务节点中返回最多五个排序结果；每个结果包含查询内的相对相关度、
稳定 ID、节点类型和命中字段。选定候选后，把稳定 ID 交给 `context`，即可通过
带版本的 JSON 结果取得该概念的所属层级、直接输入和输出关系、相关概念、源码
导航锚点及完整相关流程。原有的 `context` 精确和部分选择器继续兼容。`render`
从同一个标准化地图生成确定性的单文件交互 Viewer。
AI 按业务问题直接定位流程：已知编号时直接 `flows <flow-id>`，未知时用
`search "<业务描述>" --flows` 返回相关流程，再读取该图的步骤、子流程与具体代码锚点。
`context <concept-id>` 可以补看业务规则、数据和协作。没有必须先读总览的顺序。
搜索使用业务名称、别名、步骤和说明做词面匹配，AI 仍需判断业务含义，不能把分数当成证据。

人通过画布阅读。所有页面统一为流程图；节点角标直接进子流程，多目标先选择。
正文有备注才打开默认关闭的说明，说明中没有进入按钮。“上一层”沿实际来路返回。
“查看其他流程”按父子流程逐列展开，单项目名不重复显示。源码与 AI 编排理由在界面隐藏。

没有 `flows` 时显示空状态。可运行[订单管理阅读样例](examples/订单管理/README.md)。

`project add [path]` 会先校验完整业务地图，再把规范化的 checkout 路径保存到
带版本的用户本地文件 `~/.semantic-atlas/projects.json`。省略 `path` 时使用当前
目录；重复登记有效路径是幂等操作，地图缺失或无效时不会修改文件。

`web` 会在只读的 `127.0.0.1` 服务上启动同一个 Viewer，并打开默认浏览器。
不带 `--repo` 时，它可以从任意当前目录读取已登记项目；清单为空时仍会打开
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
2. 有地图时把返回的业务知识当作调查线索；遇到 `MAP_NOT_FOUND` 时，建立能够
   支持当前任务的最小源码证据模型。
3. 沿相关业务流程找出本次任务可能影响的判断、分支和结果。
4. 在当前源码和测试中确认每一条会决定改动范围的结论。
5. 使用纳入版本管理的产品文档确认稳定意图，使用运行时证据确认依赖环境状态的行为。
6. 当地图缺失、过期或与当前证据冲突时，以当前证据为准。
7. 按目标仓库原有的工程流程实现、验证并重新核对受影响的业务路径。
8. 业务变化在同分支同步代码与相关图，一起验证合入；纯实现调整无需重画。

最终工程结论应当比帮助定位问题的地图更准确。

## Agent Skills

`semantic-atlas setup` 只安装一个 `semantic-atlas` Skill。它把理解业务、核实证据、
编写流程和维护资料放在同一条工作路径中，按任务读取所需方法，不再转交另一个
维护 Skill。所有可视图都使用 `flows` 显式编写，总览有真实顺序与分支，子流程
通过步骤的场景引用进入；`part_of` 只表示业务归属。

旧安装中的 maintenance 用户目录不会由本次源码改动自动删除，新安装只提供统一
入口。业务资料仍随所属仓库通过 Git 维护。

每次写入或维护图谱，都先根据业务职责、数据、规则与协作关系确认归属，再选择文件。
既有业务域仍然准确时复用；新增独立业务有自己的 YAML 和清楚的业务域根节点；阅读器通过对应的流程访问细节。共享概念只定义一次，其他文件用稳定 ID 引用。局部请求或只有一种业务职责
的小项目可以只用一个文件；这些规则同样适用于初始化和后续维护。

业务代码和相关流程在同分支一起修改、检查、评审和合入。合并冲突按最终代码的
业务行为重新梳理，不机械拼接图文件。纯实现调整无需重画。旧业务文件不要求兼容，
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
