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

Every node is advisory. The format does not assign a numeric truth score or
pretend that one confidence value can replace task-time evidence.

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

Flows remain advisory knowledge. A source discrepancy starts an investigation
into whether source regressed, product intent changed, the flow was already
stale, or available evidence is unresolved. It never synchronizes either side
automatically.

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

每个项目的资料应通过一张或几张总览讲清整体业务，再逐步进入细节。只有分散的接口
流程并不满足项目建图的阅读目标。源码证据可以分布在多个仓库，图按完整业务组织；
本地路径锚点继续相对资料所属仓库，跨项目线索可由 `search` 锚点注明项目和入口。

一条流程可以有多个真实入口，`startsAt` 列出它们；没有执行关系的入口无需补出共同
触发或连线。动作有多个无条件后继时，各条路径分别继续，适合表达同一事件的独立
消费者。判断的带条件后继仍表示业务选择。多个入口与分支均由 AI 在资料中显式写出，
软件不自动补全业务联系。多条线汇入一个步骤不自行声明等待语义；需要等待哪些工作
完成，应使用具体动作与说明表达。阅读器负责展示，不执行或模拟流程。
`part_of` 只表达业务归属，不推断执行先后；没有 `flows` 的资料仍可被 CLI 查询，
阅读器显示空状态。

默认入口是没有被其他流程的步骤引用其场景的根流程，按稳定编号排序；随后沿步骤
引用安排子流程。步骤对自身场景的引用不算新的父层。所有流程都能从按需选择器访问。

步骤备注优先使用自己的 `notes`，未写时沿用所引用概念的备注。只有业务备注才打开节点详情；子流程角标直接进入，多目标先选择。新增或修改概念、关系和流程仍沿用 v1 字段；源码锚点只供
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
relation. Incompleteness is valid advisory knowledge and remains visible to the
caller.

## Ranked Search And Lookup Semantics

`search <query>` compares one natural-language business query with every node,
including domains, capabilities, scenarios, operations, data, invariants, and
interfaces. It returns at most five candidates ordered by descending score and
stable ID for ties. Each candidate contains:

- `rank` within the returned list;
- a `0–1` score that compares relevance only within the current query;
- stable ID, name, kind, and supplying document ID;
- `matchedFields` drawn from `name`, `alias`, `id`, and `summary`.

The deterministic local matcher applies Unicode NFKC and lowercase
normalization, then combines character-bigram similarity with query-token
coverage. Names have full weight, followed by aliases, IDs, and summaries.
Exact ID, name, or alias matches score `1`. Candidates below the retrieval
threshold are omitted, so no sufficiently related vocabulary produces a
successful empty result rather than a concept error. Scores are ranking signals,
not correctness probabilities or map truth scores.

After choosing a candidate, callers use its stable ID with `context` to obtain
the local business neighborhood. The earlier compatibility selector remains
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

For one selected node, `context` returns:

- the selected node;
- its ordered ancestor chain;
- direct semantic children;
- direct incoming and outgoing horizontal relations;
- complete summaries for referenced endpoint nodes;
- navigation anchors for all directly returned nodes;
- the document IDs that supplied each item;
- advisory anchor diagnostics when requested and available;
- complete related flows, including steps and labeled transitions.

A flow is related when it belongs to the selected scenario, belongs to a
scenario under the selected domain or capability, or directly references the
selected operation, data, invariant, or interface from one of its steps.

The result is intentionally local. The caller can query another returned stable
ID when it needs to expand the investigation.

## 同分支编辑与业务定位

改变业务行为时，在同一开发分支更新代码和相关流程，校验完整地图，实际查看受影响
图，并一起评审和合入。纯实现调整不改变流程含义时保持原图。合并冲突按合并后代码
重新核实分支、结果与引用，再修订资料，不等待合入后创建候选任务。

AI 不必先从总览进入。已知编号直接 `flows <flow-id>`；未知时
`search "<business-query>" --flows` 搜索流程业务词，再读取命中的图、步骤和概念锚点。
`context <concept-id>` 补充协作者、规则与数据；`flows` 无编号仅提供可选目录。
词面匹配不能识别任意同义表达，AI 仍需按业务含义选择结果并核实当前源码。

旧文件兼容不是新格式设计约束。现有字段足以表达本轮导航与锚点，因此没有为本轮
新增持久结构；将来需要新结构时明确契约，再按新版重写资料，无需保留旧解析分支。

## 流程搜索与直接读取

`search <query> --flows` 直接返回最多五个业务流程候选，包含 `id`、`name`、`summary`、
`scenarioId`、相对分数和命中字段。匹配流程名称、所属场景业务别名、步骤及其引用业务的名称和说明，使用
本地词面检索。没有 `--flows` 时仍搜索业务概念。

`flows <flow-id>` 直接读取该图，`data.selected` 包含入口、步骤、带标签转换、父流程和
业务概念。步骤的 `concept` 为包含源码锚点的业务对象，`childFlows` 指向子图。
指定编号时只返回该流程，不附带全量目录。省略编号时返回 `data.navigation`，
它与人的级联菜单共用同一目录，AI不必先读它。
没有匹配的编号返回 `FLOW_NOT_FOUND`，不会自动换成名字相近的业务。
