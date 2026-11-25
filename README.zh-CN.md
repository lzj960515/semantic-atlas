# Semantic Atlas

[![CI](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/semantic-atlas.svg)](https://www.npmjs.com/package/semantic-atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | 简体中文

**让业务流程图成为人和 AI 协作开发的一等公民。**

Semantic Atlas 让业务人员、工程师和 AI 围绕同一份业务流程理解需求、讨论规则、
推进开发。人通过可交互的流程图阅读业务，AI 编辑流程源文件、找到对应代码，
并在业务变化时同步维护两者。

它与 Codex、Claude Code 等编码 Agent 配合使用，提供只读流程阅读器、本地 CLI，
以及一个统一指导 AI 理解业务、画图和维护资料的 Skill。

## 先把业务讲清楚

AI 编写代码的速度越来越快，人需要先明确软件应该怎样工作。业务流程图把谁来做、
做什么、什么条件会改变路径、最后得到什么结果展示出来，让业务人员与工程师能够
讨论同一件事。

**经确认的业务流程图定义业务规范，代码负责实现，测试与运行证据检查是否兑现。**

当图与代码不一致时，先核对背后的业务决定，再判断是实现缺陷、图画错了，还是
需求已经改变。不能仅因为代码已经这样运行，就改图迁就它。尚不能判断的差异明确保留。

项目还没有流程图时，AI 从现有实现开始调查，边看边画，区分已确认要求、当前行为
与待定问题；后续发现改变了理解，就及时修正之前画好的内容。

## 人阅读，AI 维护

| 人负责什么 | AI 负责什么 |
| --- | --- |
| 阅读、讲解业务 | 调查业务及其实现 |
| 沿分支查看过程，按需进入细节 | 编写、修改和重组流程源文件 |
| 讨论规则，决定期望行为 | 找到对应代码和关联业务 |
| 对照已确认流程验收改动 | 在同一分支同步流程与代码 |

网页是只读画布。起点、判断、结果和带子流程的节点使用不同样式。点击节点角标
直接进入下一层，通过“上一层”回到来路；带说明的节点有小信息标识，点击节点正文
即可查看。每个入口节点都有“开始”标记和蓝色轮廓，多入口流程也能快速找到各自起点。
“查看其他流程”提供按层级展开的菜单，可以直接跳到要看的流程。

业务人员看到业务过程和补充说明；代码文件、类和方法保留在流程源文件与 CLI 中，
供 AI 定位实现。

## 安装

需要 Node.js 24 或更高版本。

```bash
npm install --global semantic-atlas --allow-scripts=semantic-atlas
semantic-atlas --version
```

全局安装会同时安装统一的 `semantic-atlas` Skill。Codex 和 Claude 共用
`~/.agents/skills/semantic-atlas` 中的内容，安装时会清理已识别的旧维护 Skill。
npm 12 的 `--allow-scripts` 参数允许执行本包的安装步骤，无需修改全局 npm 配置。

## 建立并阅读第一批流程

直接向编码 Agent 提出任务：

> 用 Semantic Atlas 梳理这个项目的业务，画成能给新同事讲清楚的业务流程图。

AI 根据包内 Skill 调查业务，将流程源文件写入 `docs/business-map/*.yaml`，
随项目代码一起纳入 Git 管理。[统一 Skill](.agents/skills/semantic-atlas/SKILL.md)
说明如何画图与维护，[文件格式](docs/map-format.md)说明各字段的含义。

文件建立后，登记项目并打开阅读器：

```bash
semantic-atlas project add /path/to/my-app
semantic-atlas project list
semantic-atlas web
```

登记后可以从任意工作目录按项目名或 ID 查询。项目名来自仓库目录名，以上例子对应
`my-app`。重名时使用 `project list` 返回的 ID；名称拼错时会返回相近项目建议，
由 AI 判断后使用确切名称重试。

也可以临时打开几个仓库：

```bash
semantic-atlas web --repo /path/to/api /path/to/frontend --port 4310 --no-open
```

临时路径不会与已登记路径合并，也不会保存。每个项目分别读取自己的文件；重新选择
或刷新项目会读取最新流程，按 `Ctrl+C` 停止服务。已有流程的项目直接登记阅读即可，
只有缺少相关流程时才需要让 AI 新建。

在产品源码中体验虚构的订单流程，可查看[订单业务示例](examples/订单管理/README.md)。

### 直接打开指定流程

```bash
semantic-atlas web --project my-app --flow "<flow-id>" --no-open
```

命令先校验目标，并在 `data.url` 返回包含
`#project=<project-id>&flow=<flow-id>` 的完整本地地址。AI 把这个链接给你，打开就是
对应的业务图。未登记项目时改用单个 `--repo /path/to/my-app`；有多个登记项目时，
需要明确选择一个项目。

切换项目或流程会同步地址。复制当前 URL 即可再次直达，刷新及浏览器前进后退按
链接定位。目标不存在时明确提示。导出的 HTML 也支持此格式，使用文件内嵌的项目 ID。

## 根据业务决定怎么画

每张图都要讲清一个有意义的业务过程：谁要完成什么，哪些动作和条件影响结果，
结果交给谁使用。一个项目可以有多张平级流程图。同一业务能在一张图中讲清，就保持
完整；某个局部展开后会干扰主线理解，再放进下一层。

业务边界和展开深度由 AI 根据实际业务判断。一段流程可能横跨前端、后端、后台任务
与其他仓库，缺少的业务环节决定接下来要去调查哪里。真实业务有多个入口、并行路径，
图就可以据实表达。

节点用简短的话写清具体动作或条件；较长的解释、清单和规则背景放在节点说明中。
交付前，AI 直接复查流程源文件，检查路径是否完整、是否有放错位置的业务片段、
语言是否清楚，以及图中的规则是否符合业务决定。

软件负责管理、搜索、校验和渲染文件，Skill 提供使用方法与画图指南。具体画什么、
如何组织，由 AI 按业务作判断，详见[流程设计指导](.agents/skills/semantic-atlas/references/diagram-design.md)。

## 业务变化时，同步维护流程与实现

1. 找到相关业务流程及其代码。
2. 规则变化时，先在流程中表达新要求，再实现；修复违背既有规则的代码时，保留正确的流程。
3. 实现并验证行为，核对条件、结果或协作关系受到影响的其他流程。
4. 在同一分支审阅并提交流程与代码改动。

内部重构或修改注释没有改变业务含义时，流程可以保持原样。合并分支时，先确定两边
规则共同生效后的业务流程，再检查合并后的代码是否实现它。

## 让 AI 按业务直接查询

<a id="查询与渲染"></a>

AI 可以使用已知流程或概念 ID 直达目标，也可以按业务意图搜索，直接进入相关业务。
网页的层级服务于人的阅读，AI 按任务选择调查入口。

```bash
semantic-atlas search "发货前取消订单" --flows --project my-app
semantic-atlas flows "<flow-id>" --project my-app
semantic-atlas context "<concept-id>" --project my-app
```

使用查询返回的 ID 继续读取。结果采用紧凑 JSON，提供业务规则、已记录的关联关系、
相关流程、流程源文件中的维护位置，以及对应代码文件或符号，帮助 AI 找到实现和
需要同步维护的图。关联表示已知关系，任务需要的其他调用方与使用方仍要继续核实。

搜索按业务名称、别名、步骤与说明中的词语匹配，最多返回五个候选；随附上下文属于
第一候选，AI 判断后可以改用其他候选的 ID 查询。代码符号是定位提示，流程文件行号
指向当前需要维护的声明。详细字段见[查询契约](docs/map-format.md#context-projection)。

未登记的仓库可以用 `--repo /path/to/my-app` 替代 `--project my-app`。
校验文件或导出可独立打开的交互 HTML：

```bash
semantic-atlas validate --project my-app
semantic-atlas render --project my-app --output ./business-flows.html
```

## 升级

```bash
semantic-atlas upgrade
```

升级会安装当前稳定版本、核对 CLI 身份，并同步更新 Skill。旧版 CLI 如果无法完成
版本检查，重新执行上面的全局安装命令即可。

<details>
<summary>Skill 安装与目录冲突</summary>

<a id="skill-conflicts"></a>

### Skill 目录冲突

主动禁用安装脚本时，运行 `semantic-atlas setup` 完成 Skill 安装。
作为普通项目依赖安装时，用户级 Skill 保持原样。

`MANAGED_SKILL_CONFLICT` 表示目标目录无法识别为 Semantic Atlas Skill。将提示中的
目录完整移到 Agent 的 Skill 发现路径之外，再运行 `semantic-atlas setup`。
如果 `upgrade` 在 `step: "setup"` 失败，CLI 已完成安装，处理目录冲突后重跑 setup 即可。

</details>

## 本地数据与隐私

流程源文件保存在所属项目仓库中。项目登记把本地路径写入
`~/.semantic-atlas/projects.json`；网页服务监听 `127.0.0.1`，仓库路径留在服务端。
导出只向指定位置写入本地 HTML 文件。Semantic Atlas 在本地工作，无需账号，
也不上传遥测数据。

CLI 跟随终端语言环境，网页与导出的 HTML 跟随浏览器语言，支持英语和简体中文。
具体规则见[语言选择](docs/architecture.md#internationalization)。

<details>
<summary>可选的历史观察与候选校准</summary>

这些工具用于按明确请求读取或记录工程观察。处理已有证据时可以使用；日常维护在
开发分支同步流程与代码。

```bash
semantic-atlas observe task --stdin --repo /path/to/my-app
semantic-atlas reconcile status --repo /path/to/my-app
semantic-atlas reconcile candidates --repo /path/to/my-app
```

记录格式和历史工具的语义见[观察契约](docs/observations.md)。

</details>

## 开发

参与产品开发前，请阅读[贡献指南](https://github.com/lzj960515/semantic-atlas/blob/main/CONTRIBUTING.md)，
确认上游仓库和 PR 流程。

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

候选检查覆盖静态检查、格式、测试、类型、构建、渲染及打包安装。公开发布使用不可变
GitHub Release 和受保护的 npm 工作流，包含 npm provenance 与独立的公共包核验，
详见[发布流程](https://github.com/lzj960515/semantic-atlas/blob/main/.claude/commands/release.md)。

## 进一步阅读

- [统一 Skill](.agents/skills/semantic-atlas/SKILL.md)
- [流程设计指导](.agents/skills/semantic-atlas/references/diagram-design.md)
- [流程源文件格式与查询契约](docs/map-format.md)
- [产品契约](docs/product-contract.md)
- [架构](docs/architecture.md)
- [评估方法与证据边界](docs/evaluation.md)

## 许可证

[MIT](LICENSE)
