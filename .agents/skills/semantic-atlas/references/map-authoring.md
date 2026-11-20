# 业务流程文件编写

编写或修改业务资料时读取。本页说明当前 v1 文件格式；业务归属判断见[业务边界](boundary-design.md)，流程层次和表达见[流程设计](diagram-design.md)。完整字段与校验以安装包的 `docs/map-format.md` 为准。

首次建图沿[持续建图方法](diagram-design.md#2-分块调查并持续修正已画流程)分块读取、及时写入并反向修正。每次保存能独立解释的已核实路径和可解析引用；尚未确认的协作者内部、顺序和条件记入调查状态，不写成确定事实或伪造占位流程。后续发现错误时直接修改既有文件，并同步引用，不只追加新内容。

## 文件与概念

资料放在 `docs/business-map/<business-area>.yaml`。`map.id` 标识文档，业务概念由 `nodes` 定义，执行路径由 `flows` 定义。每个节点包含 `id`、`kind`、`name`、`summary`、`aliases` 和 `anchors`，可另有 `notes`。ID 使用小写业务词汇，以点或短横线分隔，并在仓库内唯一。

节点类型保留 `domain`、`capability`、`scenario`、`operation`、`data`、`invariant`、`interface`，供 AI 查询业务责任和源码。Web 中所有图都由显式 `flows` 呈现，这些概念类型不构成另一种可视图。

以下是格式示意，实际名称、规则和锚点应来自目标项目证据：

```yaml
schemaVersion: 1
map:
  id: support
  title: 客户服务
  summary: 将客户请求处理到明确结果。
nodes:
  - id: support
    kind: domain
    name: 客户服务
    summary: 负责客户请求的接收与处理。
    aliases: []
    anchors: []
  - id: support.resolve-request
    kind: scenario
    name: 处理客户请求
    summary: 记录请求，核对是否支持，给出处理结果。
    aliases: []
    anchors:
      - kind: symbol
        file: src/support/resolve-request.ts
        value: SupportService.resolveRequest
        description: 核对请求是否支持并处理。
relations:
  - from: support.resolve-request
    type: part_of
    to: support
    summary: 客户请求由客户服务负责。
flows:
  - id: support.resolve-request.flow
    name: 处理客户请求
    summary: 从接收请求到给出结果。
    scenario: support.resolve-request
    startsAt: receive
    steps:
      - id: receive
        kind: action
        name: 接收请求
        summary: 记录客户要解决的问题。
      - id: supported
        kind: decision
        name: 属于支持范围吗？
        summary: 根据当前服务范围核对请求。
        notes: 超出服务范围时说明原因，避免让客户继续等待无法提供的结果。
      - id: resolved
        kind: outcome
        name: 完成处理
        summary: 客户得到处理结果。
      - id: refused
        kind: outcome
        name: 说明无法处理的原因
        summary: 告知客户当前服务边界。
    transitions:
      - from: receive
        to: supported
      - from: supported
        when: 属于
        to: resolved
      - from: supported
        when: 不属于
        to: refused
```

文件中的 `relations`、节点的 `aliases` 和 `anchors` 可以为空；业务图需要明确编写 `flows`，没有流程时 Web 显示空状态，不从领域或分类自动补画。

## 总览与子流程

总览也编写为一个 `flow`，归属一个负责这条完整旅程的 `scenario`。步骤使用动作和判断说明主要环节及交接；例如“顾客下单 → 仓库发货 → 顾客申请退款了吗？”，退款只有符合触发条件才进入。

继续深入某个环节时，让上层步骤的 `concept` 指向下层流程所属的场景：

上层与下层使用同一个已定义概念。例如，上层步骤引用 `orders.payment`：

```yaml
- id: collect-payment
  kind: action
  name: 支付订单
  summary: 顾客完成订单付款。
  concept: orders.payment
```

下层完整流程归属这个已定义的 `scenario`：

```yaml
- id: orders.payment.flow
  name: 支付订单
  summary: 从提交支付请求到收到最终结果。
  scenario: orders.payment
  startsAt: request
  steps:
    - id: request
      kind: action
      name: 提交付款
      summary: 顾客确认本次支付。
    - id: paid
      kind: decision
      name: 付款成功了吗？
      summary: 以支付渠道的确认结果为准。
    - id: success
      kind: outcome
      name: 订单已付款
      summary: 订单可以进入待发货。
    - id: failed
      kind: outcome
      name: 保留待付款订单
      summary: 顾客可以稍后重新付款。
  transitions:
    - from: request
      to: paid
    - from: paid
      when: 成功
      to: success
    - from: paid
      when: 失败或取消
      to: failed
```

同一场景可拥有多条有明确名字的流程，界面按当前子流程入口呈现。不要把进入操作放进备注详情。

Web 默认入口从根流程取得：其 `scenario` 没有被其他流程步骤的 `concept` 引用。根流程排在前面；明确编写一个总览，使读者进入后先看到完整旅程。多个真实独立入口不应为了凑成总览而伪造先后关系。流程内部循环用 `transitions` 表达，图间引用用于展开环节。

`part_of` 只表达业务归属，不能推断执行顺序；被同一流程引用也不改变概念的业务所有者。相关流程不自动变成下一层，只有步骤所引用概念自己的流程才作为进入目标，当前流程排除自身入口。

## 步骤、连接与备注

- 流程归属已存在的 `scenario`；步骤包含 `id`、`kind`、`name`、`summary`，可以有 `concept` 和 `notes`。
- `action` 至多有一条无标签后续连接；`decision` 至少有两条标签不同且非空的后续连接；`outcome` 结束当前路径。
- `startsAt` 指向起点，所有步骤都应从它可达。`transitions` 的 `from`、`to` 引用本流程内的步骤 ID；判断的 `when` 说明具体条件。
- 节点 `notes` 和步骤 `notes` 记录业务背景、规则的目的与接受的代价；步骤备注优先于引用概念的备注。不能把推测的原因写成已确认决定。
- 子流程通过节点角标直接进入；点击节点正文仅在有业务备注时打开默认关闭的详情，详情只显示备注，不提供进入按钮。无备注的普通节点点击保持原样。

概念关系继续用于 AI 调查：`invokes` 从场景／操作指向场景／操作，`reads`／`writes` 指向数据，`publishes`／`consumes` 指向接口，`constrained_by` 指向约束。每条关系包含 `from`、`type`、`to` 和业务 `summary`。关系由来源概念所属文件声明，共享概念只定义一次。

## 源码锚点

锚点包含 `kind`、`value`、`description`。类型为 `file`、`directory`、`document`、`symbol`、`search`。`symbol` 可另有仓库相对路径 `file`，`value` 标识类和方法，例如 `OrderService.placeOrder`；普通函数使用函数名。

当前源码确认了业务动作的决定性方法时，优先绑定到文件与声明，描述后续需要核实的动作、规则或状态。领域可以定位目录，数据概念定位声明文件，业务规则定位产品决定。文件路径保持规范的仓库相对路径；有效概念没有已证实入口时可以保留空锚点。

AI 可以用 `flows <flow-id>` 或 `context <concept-id>` 直达已知业务；只有业务意图时，用 `search --flows` 词面定位相关流程。目标流程提供本层步骤、子流程和引用概念的源码锚点，需要整体结构时才读取无 ID 的 `flows` 目录。文件和 CLI 保留这些结构，Web 面向业务人员隐藏源码路径、类和方法。AI 使用普通仓库工具打开当前声明和实现；行号与行为以当前源码为准。旧文件或声明失效时，依据当前证据修正锚点，不丢弃仍准确的业务含义。

## 完成检查

业务行为变化时，在修改代码的同一分支同步相关流程、备注与锚点，作为一个完整业务变更审阅、提交和合入。内部组织或纯机械变化没有业务含义变化时，不重画流程。

完整校验全部文件，打开受影响流程，按需检查上下层进入与返回，核对关键分支和业务备注。合并或重放后按最终代码复核条件、顺序、结果和子流程引用，不只拼接 YAML。文件有效只能证明结构；源码证据证明规则，实际阅读证明表达是否清楚。

新版格式与已有资料可以按已确认的当前契约重写，无需保留旧业务文件或旧格式的兼容路径。具体格式变化仍按所属项目规则与授权执行。
