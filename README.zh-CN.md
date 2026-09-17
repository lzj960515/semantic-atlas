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
Agent 也会建立有边界的当前业务模型，并在证据足够时保留后续维护候选。

## 安装

Semantic Atlas 需要 Node.js 24。

```bash
npm install --global semantic-atlas
semantic-atlas setup
semantic-atlas --version
```

`setup` 会把与当前包完全匹配的工程 Skill 和维护 Skill 安装到
`~/.agents/skills/`。重复执行时，它会验证已安装内容、修复被修改的受管副本，
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
身份，然后让新 CLI 同步两个受管 Skill。因此，可执行程序和 Skill 始终作为
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
两个 Skill 按顺序同步，第二个发生冲突时，第一个可能已经完成同步。
处理报错目录后，使用原来同一套 Node/npm 安装执行 `semantic-atlas setup` 即可
重试这个阶段，无需为了恢复而再次升级包。

先检查错误中列出的确切目录。下面的 Linux/macOS 示例以工程 Skill 为例；
如果错误指向维护 Skill 或 `.backup` 目录，请把变量改为错误中的对应路径：

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

## 查询与渲染

```bash
semantic-atlas validate --repo /path/to/repository
semantic-atlas context "Checkout" --repo /path/to/repository
semantic-atlas render --repo /path/to/repository --output ./business-map.html
semantic-atlas project add /path/to/repository
semantic-atlas web
```

`validate` 把所有地图文档作为一张完整图进行检查。`context` 使用带版本的 JSON
结果返回选中的概念、所属层级、直接输入和输出关系、相关概念、源码导航锚点及
完整相关流程。`render` 从同一个标准化地图生成确定性的单文件交互 Viewer。
顶部工具栏先在“关系”和“流程”之间切换，再选择业务域或场景流程；拖动可以
平移，鼠标滚轮和按钮可以缩放，`Fit` 会恢复当前完整视图。卡片默认只显示业务
类型、标题和描述，不会让代码路径挤占地图空间。点击卡片，或聚焦后按 `Enter`，
会在桌面右侧面板或窄屏底部面板中显示导航锚点和相关流程；点击相关流程会直接
进入实际流程图。

点击 `Export PNG` 可以把当前选中的整张图导出为高清图片，不受屏幕大小和当前
缩放影响，也会保留页面上已经翻译的文字。导出的单文件 HTML 离线打开后也能使用
这个功能。超过浏览器图片容量的超大图会提示先选择一个业务域或流程再导出。

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
8. 记录任务结果，并判断共享业务知识是否需要单独维护；确认无需修改也是完整结果。

最终工程结论应当比帮助定位问题的地图更准确。

## Agent Skills

`semantic-atlas setup` 会安装两个由 npm 包管理的 Skill：

- `semantic-atlas` 让每个业务改动任务进入有边界的当前证据理解流程，不要求仓库
  事先存在业务地图，并在存在相关流程时核对关键分支。
- `semantic-atlas-maintenance` 按明确请求初始化项目或局部业务地图，也按一个业务域
  审查保留的候选及流程修正，地图变更通过普通 Git 审查交付。

初始化整个项目时，Skill 先识别真实业务范围，通常为独立业务域分别建立 YAML 和
可供 Viewer 选择的业务域根节点。共享概念只定义一次，其他文件用稳定 ID 引用。
局部请求或只有一种业务职责的小项目可以只用一个文件。直接初始化不需要先有候选，
交付时报告来源证据、图谱验证、审查和实际合入状态；日常候选维护仍限于一个业务域
及其所属文件。

目标仓库不会复制这些 Skill；通过 Git 共享的只有仓库自己的业务地图。

## 准确性观测

每个业务改动任务都会保存自己的调查证据，而不直接修改业务地图。独立审查会另外
保存审查证据；完成审查和合入的维护任务还会记录每个精确候选来源的处理结果：

```bash
semantic-atlas observe task --stdin --repo /path/to/repository
semantic-atlas observe review --stdin --repo /path/to/repository
semantic-atlas observe maintenance --stdin --repo /path/to/repository
semantic-atlas insights summary --repo /path/to/repository --period 4w
```

任务观测记录包括 `map_not_found` 在内的查询结果、当前证据分类、地图修正候选
和明确的人类纠正；候选可以针对节点、关系、导航锚点或流程。业务知识已经覆盖、
改动只涉及实现细节或稳定含义尚不明确时，
候选列表可以为空。任务不会给自己的准确性打分；独立审查观测负责记录正确性、
影响完整性、是否需要返工，以及地图是否导致了错误结论。维护观测只在审查和
合入完成后记录 `accepted`、`refined`、`discarded` 或 `unresolved`。观测 ID
不可变：完全相同的重放是幂等的，内容发生变化则会报告冲突。

具体 schema 和证据语义见[准确性观测](docs/observations.md)。

## 地图校准

```bash
semantic-atlas reconcile status --repo /path/to/repository
semantic-atlas reconcile candidates --repo /path/to/repository
```

`reconcile status` 只回答当前仓库是否至少存在一个可行动候选。它只读取任务观测和
维护观测，把候选详情、Review 证据和业务域选择留在维护流程内部；这是提供给任务
编排器的最小契约。

`reconcile candidates` 按明确的业务域归属返回当前可行动候选，同时保留每个来源、
证据判断、关联的独立审查和之前未解决的调查。已接受、已细化和已丢弃的来源会进入终态；
未解决的来源会等待新证据，而不会立刻重复生成相同任务。两个命令都只读。随后，
维护 Skill 会选择一个业务域，使用当前证据重新确认候选，把被接受的地图修正
作为普通 Git 差异提交独立审查，并在合入后记录处理结果。如果仓库还没有地图，
有充分证据的候选可以建立第一份有边界的业务域 YAML，而不是一次推断整个仓库。
代码合入后的维护是正常的保鲜路径；定期校准负责补回遗漏观测、累计漂移和常规
流程以外的变更。
候选针对流程时，维护 Skill 会核对稳定业务路径，而不是照抄当前实现控制流。

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
并通过 npm provenance 发布。

## 文档

- [产品契约](docs/product-contract.md)
- [架构](docs/architecture.md)
- [地图格式](docs/map-format.md)
- [准确性观测](docs/observations.md)
- [评估方法](docs/evaluation.md)

## 许可证

[MIT](LICENSE)
