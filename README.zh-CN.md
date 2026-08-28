# Semantic Atlas

[![CI](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/semantic-atlas.svg)](https://www.npmjs.com/package/semantic-atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | 简体中文

Semantic Atlas 在编码 Agent 修改代码之前，为它提供一份紧凑的业务地图。
仓库使用纳入 Git 管理的 YAML 描述稳定的业务域、能力、操作、数据、规则、
接口及其关系。CLI 负责验证地图、返回适合当前调查的小范围业务邻域，并把
同一张图渲染给人查看。

地图只提供调查线索，不直接代表当前实现。它帮助 Agent 从正确的业务边界
进入问题；当前源码、测试、纳入版本管理的产品文档，以及必要的运行时证据，
仍然决定系统现在实际怎样工作。

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

## 升级

```bash
semantic-atlas upgrade
```

`upgrade` 先解析 npm 当前稳定版本，再安装这个精确版本，验证已安装 CLI 的
身份，然后让新 CLI 同步两个受管 Skill。因此，可执行程序和 Skill 始终作为
同一个有版本的产品一起升级。

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
```

[地图格式](docs/map-format.md)定义了支持的业务概念、关系、导航锚点、验证规则
和查找行为。

## 查询与渲染

```bash
semantic-atlas validate --repo /path/to/repository
semantic-atlas context "Checkout" --repo /path/to/repository
semantic-atlas render --repo /path/to/repository --output ./business-map.html
semantic-atlas web --repo /path/to/repository
```

`validate` 把所有地图文档作为一张完整图进行检查。`context` 使用带版本的 JSON
结果返回选中的概念、所属层级、直接输入和输出关系、相关概念及源码导航锚点。
`render` 从同一个标准化图生成确定性的单文件交互 Viewer。顶部工具栏可以在
完整项目图和顶层业务域之间切换；拖动可以平移，鼠标滚轮和按钮可以缩放，
`Fit` 会恢复当前完整视图。卡片默认只显示业务类型、标题和描述，不会让代码
路径挤占地图空间。点击卡片，或聚焦后按 `Enter`，会在桌面右侧面板或窄屏底部
面板中显示导航锚点。

`web` 会在只读的 `127.0.0.1` 服务上启动同一个 Viewer，并打开默认浏览器。
一个 `--repo` 参数可以接收多个启动时明确允许的仓库，从而启用项目切换：

```bash
semantic-atlas web --repo /path/to/api /path/to/frontend --port 4310 --no-open
```

浏览器不能提交任意仓库路径。刷新页面会重新读取命令启动时指定仓库中的 YAML。
目录名相同的仓库会获得稳定的编号标签，同时不会暴露父目录。按 `Ctrl+C` 停止
服务。

## 证据顺序

对于可能改变业务行为的工程任务：

1. 查询能够支持当前任务的最小业务邻域。
2. 把返回的概念、关系、摘要和锚点当作调查线索。
3. 在当前源码和测试中确认每一条会决定改动范围的结论。
4. 使用纳入版本管理的产品文档确认稳定意图，使用运行时证据确认依赖环境状态的行为。
5. 当地图缺失、过期或与当前证据冲突时，以当前证据为准。
6. 按目标仓库原有的工程流程实现和验证改动。

最终工程结论应当比帮助定位问题的地图更准确。

## Agent Skills

`semantic-atlas setup` 会安装两个由 npm 包管理的 Skill：

- `semantic-atlas` 引导业务改动任务从小范围地图查询进入当前源码确认。
- `semantic-atlas-maintenance` 按一个业务域审查保留的候选，并准备普通的、需要
  审查的 YAML 改动。

目标仓库不会复制这些 Skill；通过 Git 共享的只有仓库自己的业务地图。

## 准确性观测

普通工程任务可以保存任务调查证据和独立审查证据，而不修改业务地图：

```bash
semantic-atlas observe task --stdin --repo /path/to/repository
semantic-atlas observe review --stdin --repo /path/to/repository
semantic-atlas insights summary --repo /path/to/repository --period 4w
```

任务观测记录地图查询、当前证据分类、地图修正候选和明确的人类纠正，但不会
给自己的准确性打分。独立审查观测负责记录正确性、影响完整性、是否需要返工，
以及地图是否导致了错误结论。观测 ID 不可变：完全相同的重放是幂等的，内容
发生变化则会报告冲突。

具体 schema 和证据语义见[准确性观测](docs/observations.md)。

## 地图校准

```bash
semantic-atlas reconcile candidates --repo /path/to/repository
```

该命令按明确的业务域归属对保留候选进行分组，同时保留每个来源、证据判断和
关联的独立审查。命令本身只读。随后，维护 Skill 会选择一个业务域，使用当前
证据重新确认候选，并把被接受的地图修正作为普通 Git 差异提交独立审查。

## 本地数据与隐私

业务地图保存在目标仓库中。准确性观测以不可变 JSON 文件保存在经过哈希处理的
本地仓库分区：

```text
~/.semantic-atlas/observations/v1/repositories/<repository-id>/
```

观测文件既不包含仓库路径，也不包含远端 URL。Semantic Atlas 没有远程观测
服务、账号系统、遥测上传、持久化图数据库或自动修改源码和地图的行为。`setup`
和观测命令不会向目标仓库添加文件；`render` 只写入调用者明确指定的本地输出；
`web` 只绑定 loopback，只接受 GET 和 HEAD，并且只读取启动时明确指定的仓库。

## 开发

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

候选版本验收会运行契约和源码测试、类型检查、构建、渲染检查、打包隐私检查、
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
