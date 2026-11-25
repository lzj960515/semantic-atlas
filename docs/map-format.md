# Semantic Atlas Map Format

This page defines the tracked document model, relationship and flow meaning,
validation rules, and context projection.

**Status: implemented by the `schemaVersion: 1` validation and context-query
path.**

## Repository Layout

Repositories store maps by stable business domain:

```text
docs/business-map/
├── commerce.yaml
├── fulfillment.yaml
└── support.yaml
```

The first implementation uses this conventional directory. Every `*.yaml` file
in the directory participates in one repository-wide graph. File names organize
ownership but do not become graph nodes.

各仓库保留各自的流程文件。登记后，通过 `project list` 查看项目名称、ID 与路径，查询、
校验和渲染使用 `--project <名称或ID>` 选择目标，与当前工作目录无关；也可通过 `--repo`
直接指定仓库。两种选择方式互斥，均不提供时只加载当前目录，不递归合并子项目。
概念与流程 ID 在选定仓库的图内解析，源码锚点也相对它解析。跨项目协作分别读取双方
资料并核实真实契约，不能把一个项目的同名业务当成另一个项目。

## Business Ownership And File Boundaries

Every map-writing task chooses ownership from stable business responsibilities,
owned data/rules, and collaborators. This applies to initial creation, later
capability additions, drift correction and candidate maintenance. Source
folders, existing filenames and recorded candidate owners supply evidence;
current business meaning decides the boundary. Before encoding, use the Skills'
[boundary-design method](../.agents/skills/semantic-atlas/references/boundary-design.md)
to establish cohesive responsibilities, supported lifecycle coverage and
collaborator limits. That reference owns the judgment method; this page owns
its representation in the tracked model.

Reuse a domain and owning YAML when their business scope remains correct. Give
a newly identified independent business area its own meaningful `domain` root
and owning document. Narrower responsibilities use `capability` and `part_of`
within an area. A small project or local task with one responsibility can use
one file. Correct affected containment when an existing umbrella domain is too
broad, preserving stable concept IDs where identity has not changed. Viewer
selection follows domain nodes and containment, not filenames.

Define shared concepts once in their owning file. Declare each relation in the
source concept's file and each flow in its scenario's file. References resolve
by stable ID across all documents, including flow-step concepts. Validate the
complete repository graph and inspect each affected domain with its external
collaborators and relevant flows.

The requested or evidenced change bounds the work. Ordinary candidate
reconciliation handles one confirmed business domain and its owning YAML.
Necessary repartitioning across existing files is a complete normal reviewed
authoring/reorganization change, with accurate separate candidate accounting;
the observation format does not decide the business model.

## Document Shape

```yaml
schemaVersion: 1
map:
  id: commerce
  title: Commerce
  summary: Capabilities that let a shopper discover and purchase products.

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

relations:
  - from: commerce.orders
    type: part_of
    to: commerce
    summary: Orders is a durable Commerce capability.

flows: []
```

Top-level `map` metadata identifies the owning document for diagnostics and
review. It does not create a repository hub or implicit graph node.

## Node Contract

Each node contains:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable repository-wide business identity |
| `kind` | yes | One supported business concept kind |
| `name` | yes | Concise human-facing business name |
| `summary` | yes | Durable meaning and outcome, not implementation detail |
| `aliases` | yes | Alternative business vocabulary used for deterministic lookup |
| `anchors` | yes | Zero or more current investigation hints |
| `notes` | no | Durable qualification or known uncertainty useful to future tasks |

IDs use lowercase dot-separated business vocabulary, for example
`commerce.orders.place-order`. They remain stable when implementation paths or
semantic parents change. Containment lives in explicit `part_of` relations.

Human-facing names, summaries, and branch labels accept Chinese or English.
Use the author's working language for the single retained description. A Chinese
node name can keep an English stable ID and English search terms in `aliases`;
both Chinese names and English aliases participate in the lookup rules below.
Browser translation changes presentation only and does not write another map.

Supported node kinds are:

```text
domain
capability
scenario
operation
data
invariant
interface
```

已确认的节点与流程承载业务规范；未决解释在现有备注中说明。格式不增加数值真值
分数或逐节点审批字段，也不把源码已运行视为业务规则自动成立的证明。

## Relation Contract

Each relation contains:

| Field | Required | Meaning |
| --- | --- | --- |
| `from` | yes | Source business node ID |
| `type` | yes | Supported directed relation kind |
| `to` | yes | Target business node ID |
| `summary` | yes | Business reason for this relation |
| `notes` | no | Durable qualification or known uncertainty |

The tuple `(from, type, to)` is unique across the complete repository map.

### Containment

`part_of` expresses one primary semantic parent. It supports business zoom and
ownership without claiming execution order. A non-domain node has at most one
direct `part_of` parent. Domain nodes are top-level business areas.

### Horizontal Relations

- `invokes`: one scenario or operation collaborates with another business
  action;
- `reads`: an action uses a data concept;
- `writes`: an action creates or changes a data concept;
- `publishes`: an action or capability emits an interface;
- `consumes`: an action or capability receives an interface;
- `constrained_by`: a business concept is governed by an invariant.

Relations describe durable business collaboration. They do not encode branch
conditions, total order, retry behavior, loops, timing, or runtime execution
state.

## Business Flow Contract

A business flow describes one scenario's business-relevant actions,
decisions, labeled branches, and outcomes. It complements the relationship
graph: relations explain which concepts collaborate, while a flow explains how
one stable business path can reach different results.

```yaml
flows:
  - id: commerce.orders.place-order-flow
    name: Place order
    summary: Available stock becomes a reserved customer order.
    scenario: commerce.orders.place-order
    startsAt: check-inventory
    steps:
      - id: check-inventory
        kind: decision
        name: Is inventory available?
        summary: Only available stock may proceed to order creation.
        concept: commerce.orders.place-order.check-inventory
      - id: create-order
        kind: action
        name: Create order
        summary: The purchase becomes a durable customer order.
        concept: commerce.orders.place-order.create-order
      - id: order-placed
        kind: outcome
        name: Order placed
        summary: The shopper receives a durable order.
        concept: commerce.orders.order
      - id: order-not-created
        kind: outcome
        name: Order not created
        summary: Unavailable stock ends the attempt without an order.
    transitions:
      - from: check-inventory
        when: available
        to: create-order
      - from: check-inventory
        when: unavailable
        to: order-not-created
      - from: create-order
        to: order-placed
```

Each flow contains:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable repository-wide flow identity |
| `name` | yes | Human-facing scenario path name |
| `summary` | yes | Durable business result represented by the flow |
| `scenario` | yes | Existing `scenario` node that owns the flow |
| `startsAt` | yes | 一个步骤 ID 或非空步骤 ID 列表，表示真实业务入口；解析与 CLI 输出统一为列表 |
| `steps` | yes | One or more business-granularity steps |
| `transitions` | yes | Directed step connections and decision labels |
| `notes` | no | Durable qualification or known uncertainty |

Step kinds are:

- `action`：具体业务动作，可有多条无条件后继；多条路径都成立，不表示择一执行；
- `decision`: a business choice with at least two uniquely labeled branches;
- `outcome`: a business result that ends its path.

Each step has an ID unique within its flow, a name, a summary, and an optional
`concept` reference to an existing graph node. Referencing the same concept is
what lets the Viewer open a scenario-owned child process;
there is no separately maintained link list.

Record a step when changing it can alter a user-visible result, durable data,
cost or provider usage, authorization or tenant isolation, an interface, or a
business outcome. Keep parameter validation, DTO conversion, helpers,
framework wiring, Service or Queue names, retries, and timing in current-source
evidence. Cycles are valid when the repeated business path itself is durable.

已确认流程定义应有行为。源码差异需要核实是实现偏离规范、图误写、业务决定变化，
还是意图尚未确认；不自动以源码覆盖流程。首次建图可以记录当前实现与已知差异，
但不能把代码缺陷确立为正确规则。阅读器不执行流程，也不会自动同步任何一侧。

## Navigation Anchors

Anchors help an agent enter the current repository. They are hints rather than
evidence bindings.

```yaml
anchors:
  - kind: file
    value: src/orders/order.ts
    description: Order data declarations and stored states.
  - kind: directory
    value: src/inventory
    description: Inventory capability source area.
  - kind: symbol
    file: src/orders/place-order.service.ts
    value: PlaceOrderService.execute
    description: Confirm inventory and create a durable customer order.
  - kind: symbol
    value: OrderPlaced
    description: Order-created event vocabulary when its source file is unknown.
  - kind: search
    value: PLACE_ORDER
    description: Stable operation or event vocabulary.
  - kind: document
    value: docs/orders/place-order.md
    description: Tracked product intent for the scenario.
```

Supported anchor kinds are `file`, `directory`, `symbol`, `search`, and
`document`. Every anchor contains `kind`, `value`, and `description`. Only
`symbol` supports an optional `file`, a normalized repository-relative source
path. For a bound symbol, `value` names the declaration within that file, for
example `PlaceOrderService.execute` or the module function `placeOrder`. Include
the owning class or type when it distinguishes same-named methods. Symbol names
use the source language's vocabulary and remain language-independent hints.
An unbound symbol retains its existing literal lookup meaning. `value` remains
repository-relative for file-like anchors and literal vocabulary for `search`.

Prefer a file-bound symbol for a mapped business action when current source
establishes a decisive method or function. Its `description` explains the
specific action, rule, or state change to inspect. Domain directories, data
declaration files, product documents, and useful search terms retain their
appropriate anchor kinds. Existing anchors remain valid and can be refined
during maintenance using current evidence.

CLI 在上下文查询中保留 `file` 和 `value` 两个字段；面向业务人员的 Viewer 隐藏
源码锚点。AI 用平常的仓库工具定位当前声明并读取代码，确认它实际承担的业务职责。
文件中的锚点保留路径与符号名称，当前源码提供行号和行为。文件或声明缺失时，
按既有的过期锚点流程调查。

## 流程图阅读与层次

所有可视页面使用 `flows`。AI 依据实际业务与阅读需要决定范围、层次与表达；总览
概括真实业务动作、条件和交接，不为独立业务补出共同触发或执行关系。子流程
通过步骤的 `concept` 引用其所属场景进入。文件字段约定结构，不规定业务的画法。

项目可以有多张独立、平级的顶层业务图，无需共同父图或专门的项目全貌图。每张图
按自身业务组织主要过程与必要详图，不把相关主线拆成接口碎片，也不为项目归属合并
无关业务。源码证据可以跨仓库；本地锚点仍相对资料仓库，跨项目线索由 `search` 记录。

一条流程可以有多个真实入口，`startsAt` 列出它们；没有执行关系的入口无需补出共同
触发或连线。动作有多个无条件后继时，各条路径分别继续，适合表达同一事件的独立
消费者。判断的带条件后继仍表示业务选择。多个入口与分支均由 AI 在资料中显式写出，
软件不自动补全业务联系。多条线汇入一个步骤不自行声明等待语义；需要等待哪些工作
完成，应使用具体动作与说明表达。阅读器负责展示，不执行或模拟流程。
`part_of` 只表达业务归属，不推断执行先后；没有 `flows` 的资料仍可被 CLI 查询，
阅读器显示空状态。

默认入口是没有被其他流程的步骤引用其场景的根流程，按稳定编号排序；随后沿步骤
引用安排子流程。步骤对自身场景的引用不算新的父层。所有流程都能从按需选择器访问。

浏览链接通过 `#project=<project-id>&flow=<flow-id>` 引用已有流程，切换时同步更新。
没有指定流程时按默认根图进入；指定流程不存在时明确提示。项目 ID 来自当前阅读器
目录或导出文件，流程 ID 来自既有声明；定位信息只在 URL 中表达，不增加 YAML 字段。
Web 和自包含 HTML 共用此规则。

`startsAt` 同时决定起点样式；声明多个入口就逐个显示蓝色轮廓，不增加“开始”文字或专用留白，节点类型保持原样。
连线接点及回线路径由阅读器按既有 `transitions` 布局，不写入 YAML；渲染不改变边的
起点、终点或条件。自适应横竖选择和画布缩放仍由同一阅读器处理。

步骤备注优先使用自己的 `notes`，未写时沿用所引用概念的备注。实际采用的非空备注让节点显示信息标识并支持点击正文打开详情；子流程叠层角标直接进入，多目标先选择。标识由既有备注派生，不增加文件字段。新增或修改概念、关系和流程仍沿用 v1 字段；源码锚点只供
AI 与 CLI 使用，业务界面不展示。

## Validation Rules

The complete repository map must satisfy:

1. Every document uses `schemaVersion: 1` and the strict field contract.
2. Document IDs and node IDs are repository-wide unique.
3. Node and relation kinds use supported values.
4. Every relation endpoint resolves after all documents load.
5. Relation tuples are unique.
6. Every node has at most one direct `part_of` parent.
7. `part_of` contains no cycles.
8. Domain nodes have no `part_of` parent.
9. Names, summaries, IDs, aliases, anchor values, and relation summaries are
   non-empty after trimming.
10. Aliases are unique for one node after case-insensitive normalization.
11. Repository-relative anchor values and symbol `file` paths remain relative
    and normalized; `file` is supported only by `symbol` anchors.
12. Normalized graph order is deterministic across file discovery order.
13. Flow IDs are repository-wide unique and each flow belongs to an existing
    `scenario`.
14. Step IDs are unique within a flow; every `startsAt` ID, transition endpoint,
    and optional concept reference resolves. Entry IDs are nonempty and unique.
15. Actions have unlabeled outgoing transitions, decisions have at
    least two uniquely labeled outgoing transitions, and outcomes have none.
16. Every flow step is reachable from at least one declared entry; cycles remain valid.

Horizontal relation endpoints follow their business meaning:

- `invokes` connects a scenario or operation to a scenario or operation;
- `reads` and `writes` connect a scenario or operation to data;
- `publishes` and `consumes` connect a capability, scenario, or operation to an
  interface;
- `constrained_by` targets an invariant.

The first version does not require every node to have a parent or horizontal
relation. Incomplete coverage remains visible to the caller and does not make
unrecorded implementation behavior an approved business rule.

## Ranked Search And Lookup Semantics

`search <query>` compares one natural-language business query with every node,
including domains, capabilities, scenarios, operations, data, invariants, and
interfaces. It returns at most five candidates ordered by descending score and
stable ID for ties. Each candidate contains:

- `rank` within the returned list;
- a `0–1` score that compares relevance only within the current query;
- stable ID, name, kind, and supplying document ID;
- `map`，定位候选在当前 YAML 中的声明；
- `matchedFields` drawn from `name`, `alias`, `id`, and `summary`.

The deterministic local matcher applies Unicode NFKC and lowercase
normalization, then combines character-bigram similarity with query-token
coverage. Names have full weight, followed by aliases, IDs, and summaries.
Exact ID, name, or alias matches score `1`. Candidates below the retrieval
threshold are omitted, so no sufficiently related vocabulary produces a
successful empty result rather than a concept error. Scores are ranking signals,
not correctness probabilities or map truth scores.

搜索同时返回第一候选的局部业务摘要，以字符串 `contextFor` 标明其概念 ID。
`results` 仍包含其他候选的排序和维护位置；摘要不混入它们各自的邻域。第一候选只是
词面排序结果，调用者依据业务含义决定目标；其他候选更合适时按其 ID 读取 `context`。
无命中时省略 `contextFor`，摘要列表为空。摘要结构见[查询投影](#context-projection)。

The earlier compatibility selector remains
available and resolves in this order:

1. exact stable ID;
2. case-insensitive exact node name;
3. case-insensitive exact alias;
4. normalized partial name or alias match.

One compatibility match returns a context projection. Multiple matches return
ambiguity with stable IDs and names. Zero matches returns `CONCEPT_NOT_FOUND`
and leaves bounded current-evidence business discovery available.

Both paths are deterministic and vocabulary-based. The calling agent owns the
business choice among ranked candidates and continues with current evidence
when no candidate is sufficient.

## Context Projection

`search`、`search --flows`、`context` 与指定 ID 的 `flows` 共用局部业务摘要。
查询结果使用紧凑 JSON，`repository` 只保留 `root`；不附地图文件目录。
完整 YAML 仍是持久业务来源，以下位置与关联摘要在每次查询中派生。

| 字段 | 含义与读取方式 |
| --- | --- |
| `scope: "recorded"` | 仅反映当前地图显式记录的关系，不代表已确认影响或完整依赖 |
| `concepts` | 按 ID 唯一的概念详情：`id`、`kind`、`name`、`summary`、可选 `notes`、源码 `anchors` 和维护位置 `map`；规则沿 `invariant` 概念及 `constrained_by` 表达 |
| `relations` | `from`、`type`、`to`、`summary`、可选 `notes` 和 `map`；端点用 ID 引用概念，保留关联原因 |
| `flows` | 流程的 `id`、`name`、所属 `scenario` ID、`map` 与 `references`；仅为所属／引用摘要，不展开步骤与转换 |
| `flows[].references` | 相关概念的 `concept` ID、引用它的 `step` ID 和步骤 `map`，供调查及同步图时定位 |

摘要先取查询种子的所有直接关系，再沿直接关系涉及的共享 `data`、`interface` 和
`invariant`，补充它们的其他非 `part_of` 关系。它会暴露共享订单的读写者、同一事件的
生产者与消费者、同一规则约束的其他动作；不会沿普通动作继续无限递归，也不把归属
解释成执行先后。流程摘要覆盖这些业务概念所属的场景或直接引用它们的步骤。
哪些关系与当前修改相关，仍由调用者核实源码与业务证据。

`context <id-or-term>` 在摘要外返回 `selector`、`matchedBy`、所选概念详情 `selected`、
按顺序排列的祖先 ID `ancestors` 和直接子概念 ID `children`。祖先与子概念详情纳入
`concepts`，所选概念不再在其中重复。归属链只补充身份与导航，不自动展开所有后代
的业务或流程；需要时按返回 ID 继续查询。

各 `map` 为 `{file, line?, column?}`：`file` 相对 `repository.root`，一基行列从本次
读取的 YAML AST 派生，指向概念／流程／步骤的 `id` 或关系的 `from`。无法取得位置
时仅保留文件，不编造行列。该位置是维护声明的入口，不是代码位置，也不持久化。

源码锚点保持[原有字段](#navigation-anchors)，额外的 `resolution` 只表达导航状态。
存在的 `file`／`document` 标为 `located`，`location` 指向文件第一行；目录、符号和
`search` 保留 `hint`。绑定符号的 `file` 与 `value` 继续交给调用者查当前声明，不猜
代码行号；预期本地路径缺失或类型不符时标为 `missing`。这些状态不确认业务行为，
也不从跨项目线索推导新的关系模型。

## 同分支编辑与业务定位

业务规则变化先在流程中表达，再同分支实现和验证，并一起评审合入。纯实现调整不
改变业务含义时保持原图。合并冲突先确定共同生效的最终业务流程，再核对代码中的
分支、结果与引用；不等待合入后创建候选任务，也不让代码先合入决定业务规则。

AI 不必先从总览进入。已知编号直接 `flows <flow-id>`；未知时
`search "<business-query>" --flows` 搜索流程业务词，再读取命中的图、步骤和概念锚点。
`context <concept-id>` 补充协作者、规则与数据；`flows` 无编号仅提供可选目录。
词面匹配不能识别任意同义表达，AI 仍需按业务含义选择结果并核实当前源码。

旧文件兼容不是新格式设计约束。现有字段足以表达本轮导航与锚点，因此没有为本轮
新增持久结构；将来需要新结构时明确契约，再按新版重写资料，无需保留旧解析分支。

## 流程搜索与直接读取

`search <query> --flows` 直接返回最多五个业务流程候选，包含 `id`、`name`、`summary`、
`scenarioId`、相对分数和命中字段。每个候选有流程 `map` 与 `matchedSteps`，命中步骤
带 ID、名称、可选概念 ID 和维护位置。匹配流程名称、所属场景业务别名、步骤及其引用
业务的名称和说明，使用本地词面检索。没有 `--flows` 时仍搜索业务概念。

`contextFor` 为第一流程候选的 ID，摘要基于其所属场景及命中步骤引用的概念；它不表示
已选定业务。其他候选更合适时，可按 `scenarioId` 读取概念上下文，或按流程 ID 读取
完整流程。搜索不附每个候选的完整邻域，也不重复输出各图的全部步骤。

`flows <flow-id>` 读取该图的完整本层细节。`data.selected` 包含 `id`、`name`、`summary`、
所属 `scenario` ID、`map`、入口 `startsAt`、可选 `notes`、父流程 ID `parents`、步骤
`steps` 和带标签转换 `transitions`。步骤保留 `kind`、`name`、`summary`、可选 `notes`
及 `map`；`concept` 为可选概念 ID，`childFlows` 为子流程 ID 列表。概念详情从同一
响应 `concepts` 查，父图和子图按 ID 需要时再读。指定编号时不附全量目录或其他流程
完整内容。省略编号时只返回
`data.navigation`，它与人的级联菜单共用同一目录，AI 不必先读它。
没有匹配的编号返回 `FLOW_NOT_FOUND`，不会自动换成名字相近的业务。
