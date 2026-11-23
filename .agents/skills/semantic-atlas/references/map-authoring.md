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
  id: appointments
  title: 预约管理
  summary: 管理客户预约及其取消规则。
nodes:
  - id: appointments
    kind: domain
    name: 预约管理
    summary: 负责预约状态和取消规则。
    aliases: []
    anchors: []
  - id: appointments.cancel
    kind: scenario
    name: 取消预约
    summary: 允许客户在约定期限内取消已确认的预约。
    aliases: []
    anchors:
      - kind: symbol
        file: src/rules/cancel.ts
        value: cancelAppointment
        description: 判断预约状态与取消期限，修改预约状态。
relations:
  - from: appointments.cancel
    type: part_of
    to: appointments
    summary: 预约管理决定取消规则和预约状态。
flows:
  - id: appointments.cancel.flow
    name: 取消预约
    summary: 在取消期限内取消已确认的预约，否则保留原状态。
    scenario: appointments.cancel
    startsAt: within-deadline
    steps:
      - id: within-deadline
        kind: decision
        name: 预约已确认且距离开始至少 24 小时吗？
        summary: 同时满足状态和提前时间要求才允许取消。
      - id: cancel
        kind: action
        name: 取消预约
        summary: 将预约状态改为已取消。
      - id: cancelled
        kind: outcome
        name: 预约已取消
        summary: 本次预约不再有效。
      - id: retained
        kind: outcome
        name: 保留预约当前状态
        summary: 不符合状态或提前时间要求，本次取消不生效。
    transitions:
      - from: within-deadline
        when: 两项均满足
        to: cancel
      - from: within-deadline
        when: 任意一项不满足
        to: retained
      - from: cancel
        to: cancelled
```

文件中的 `relations`、节点的 `aliases` 和 `anchors` 可以为空；业务图需要明确编写 `flows`，没有流程时 Web 显示空状态，不从领域或分类自动补画。

## 流程与深入阅读

每段要讲解的业务编写为 `flow`，归属相应的 `scenario`。独立业务可以有多个平级顶层图，无需共同父图或专门的项目全貌图；范围与层次按[流程设计](diagram-design.md#4-根据理解成本安排层次)决定。步骤使用具体动作、判断与结果说明环节和交接；例如“顾客下单 → 仓库发货 → 顾客申请退款了吗？”，退款只有符合触发条件才进入。导航目录只帮助选图，不编成执行流程。

先按流程设计判断当前图是否已讲清主要过程，以及局部规则是否确实需要详图。业务
概念可以供查询和源码定位，不要求每个概念都有自己的图；详图链接也不代替在主图
展开必要过程。已经决定需要进一步解释某个环节时，让上层步骤的 `concept` 指向
下层流程所属的场景：

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
  summary: 顾客付款后，订单进入已付款或继续待付款。
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

根流程是其 `scenario` 没有被其他流程步骤的 `concept` 引用的流程。目录支持多个根流程，它们可承载独立的平级业务；不要求增加一个引用所有根流程的汇总场景。默认第一张是阅读器的初始选择，没有“代表全项目”的业务含义。按各图能否讲清其业务及指定范围的覆盖验收，不用可打开的图数代替判断。独立业务保留真实起点和结果，不添加共同路由或虚构关系；流程内循环用 `transitions`，图间引用用于展开确有阅读价值的环节。

`part_of` 只表达业务归属，不能推断执行顺序；被同一流程引用也不改变概念的业务所有者。相关流程不自动变成下一层，只有步骤所引用概念自己的流程才作为进入目标，当前流程排除自身入口。

## 步骤、连接与备注

- 流程归属已存在的 `scenario`；步骤包含 `id`、`kind`、`name`、`summary`，可以有 `concept` 和 `notes`。
- `action` 可有多条无标签后续连接，表示各条路径都成立；`decision` 至少有两条标签不同且非空的后续连接，表示按条件选择；`outcome` 结束当前路径。
- `startsAt` 可以是一个 ID 或非空 ID 列表，显式记录真实入口；解析和 CLI 返回统一为列表。入口不能重复，每个步骤应从至少一个入口可达。`transitions` 的 `from`、`to` 引用本流程内的步骤 ID；判断的 `when` 说明具体条件。
- 节点 `notes` 和步骤 `notes` 记录业务背景、规则的目的与接受的代价；步骤备注优先于引用概念的备注。不能把推测的原因写成已确认决定。
- 子流程通过节点角标直接进入；点击节点正文仅在有业务备注时打开默认关闭的详情，详情只显示备注，不提供进入按钮。无备注的普通节点点击保持原样。

例如 `startsAt: [customer-order, customer-refund]` 可以保留购买与退款各自的入口；一个
“付款确认”动作分别连向“仓库发货”和“发送购买确认”，表示两条后续各自进行。具体
是否并行、是否需要等待仍按业务证据判断；需要等全部工作完成时，明确写出等待对象。
不把同时发生或独立发生的路径改成判断菜单，不为不相连的入口补共同触发。

概念关系继续用于 AI 调查：`invokes` 从场景／操作指向场景／操作，`reads`／`writes` 指向数据，`publishes`／`consumes` 指向接口，`constrained_by` 指向约束。每条关系包含 `from`、`type`、`to` 和业务 `summary`。关系由来源概念所属文件声明，共享概念只定义一次。

## 源码锚点

锚点包含 `kind`、`value`、`description`。类型为 `file`、`directory`、`document`、`symbol`、`search`。`symbol` 可另有仓库相对路径 `file`，`value` 标识类和方法，例如 `OrderService.placeOrder`；普通函数使用函数名。

当前源码确认了业务动作的决定性方法时，优先绑定到文件与声明，描述后续需要核实的动作、规则或状态。领域可以定位目录，数据概念定位声明文件，业务规则定位产品决定。文件路径保持规范的仓库相对路径；有效概念没有已证实入口时可以保留空锚点。

图的业务范围可以跨项目。先根据缺失的业务环节找到证据所属项目，再记录项目与具体
入口；跨项目线索可使用现有 `search` 锚点，在 `value` 与 `description` 中写清项目、
文件和符号，供 AI 转到该项目核实。本地路径锚点仍相对资料所属仓库，不能用 `../`
冒充本地文件。资料保存位置不限定图能描述的业务范围；确有格式或跨图导航能力缺口
时明确报告，不通过省掉业务环节解决，也不擅自新增字段。

AI 可以用 `flows <flow-id>` 或 `context <concept-id>` 直达已知业务；只有业务意图时，用 `search --flows` 词面定位相关流程。已登记项目用 `--project "<name-or-id>"`，需要核对名称、ID 与仓库路径时用 `project list`；相近名称建议和重名候选经判断后，再以确切名称或 ID 重试。未登记或按已知路径操作时用 `--repo "<absolute-repository-root>"`，两种选择方式互斥。锚点和业务文件都相对选中的仓库解析，父工作空间不是自动递归查询入口。

目标流程提供本层步骤、子流程和引用概念的源码锚点，需要整体结构时才读取无 ID 的 `flows` 目录。文件和 CLI 保留这些结构，Web 面向业务人员隐藏源码路径、类和方法。AI 使用普通仓库工具打开当前声明和实现；行号与行为以当前源码为准。旧文件或声明失效时，依据当前证据修正锚点，不丢弃仍准确的业务含义。

## 完成检查

业务行为变化时，在修改代码的同一分支同步相关流程、备注与锚点，作为一个完整业务变更审阅、提交和合入。内部组织或纯机械变化没有业务含义变化时，不重画流程。

完整校验全部文件，打开受影响流程，按需检查上下层进入与返回，核对关键分支和业务备注。合并或重放后按最终代码复核条件、顺序、结果和子流程引用，不只拼接 YAML。文件有效只能证明结构；源码证据证明规则，实际阅读证明表达是否清楚。

新版格式与已有资料可以按已确认的当前契约重写，无需保留旧业务文件或旧格式的兼容路径。具体格式变化仍按所属项目规则与授权执行。
