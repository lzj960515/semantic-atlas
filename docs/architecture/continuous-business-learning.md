# 持续业务学习与演进式业务地图

本页回答 Semantic Atlas 何时学习业务知识、业务根节点如何随认知演进、
以及层级调整如何保持身份与证据稳定。适用于业务图查询、GraphPatch、
Agent Skill 和后续影响分析设计。状态：已接受，按垂直切片逐步实施。

## 产品判断

Semantic Atlas 在真实工程任务中持续学习业务，不在首次索引时生成一套
推测性的完整业务模型。真实任务同时提供产品意图、相关源码、测试、修改
结果和复用价值，是形成可靠业务知识的最佳证据边界。

`index` 只发布当前工作树的结构投影、仓库快照和已有证据有效性。调用
Agent 负责理解自然语言和业务意义；CodeGraph 负责提供符号、引用、调用、
模块和源码位置等结构事实。两者通过证据关系协作，但结构目录不替代业务
地图。

业务地图是一个持续成长并允许重组的心智模型：

```text
真实工程任务
  -> 查询已有业务知识
  -> 从 CodeGraph 与源码补足未知部分
  -> 完成修改与验证
  -> 提炼可复用业务知识
  -> 新增、扩展、修正或重挂载业务子树
```

## 根节点语义

根节点表示当前有效业务图中没有已知主要父节点的业务节点。它是查询时的
结构状态，不是永久地位，也不是 `Capability` 等节点类型。

第一次任务可能只验证“退款”，它暂时作为根节点；后续任务发现“退款”
属于“订单”，再发现“订单”属于“Commerce”，地图可以持续演进：

```text
Refunds

Orders
└── Refunds

Commerce
└── Orders
    └── Refunds
```

世界层 `map view` 只把当前父节点为空的业务知识作为 root regions：

- 空业务图返回空数组和稳定的 `BUSINESS_KNOWLEDGE_EMPTY` 告警；
- 结构 `Module` 根节点通过 `code search` 参与源码回退，不进入业务 regions；
- 任意业务节点类型都可以在尚未发现父节点时暂时成为根；
- 新的上层知识可以在一个原子事务中把既有根节点变成子节点；
- 根节点变化不改变节点身份、证据或其他业务关系。

## 稳定身份与可变位置

业务身份的生命周期长于当前分类位置。v1 继续使用 `key` 作为仓库内稳定
身份；key 中的斜杠只表达可读命名空间，不构成父子关系，也不随重挂载
改写。权威层级只来自 `part_of` 关系。

例如 `refunds` 或既有的 `commerce/refunds` 在挂到 `orders` 下时保持原 key。
调用方通过稳定 key 继续引用该节点，展示路径则根据当前 `part_of` 链计算。
后续版本只有在真实碰撞或跨仓库身份需求出现时，才引入独立 opaque ID；
本阶段不为假设性需求迁移现有知识。

## 业务层级不变量

`part_of` 是导航层级关系，并满足以下不变量：

1. 一个业务节点最多拥有一个 outgoing `part_of` 主要父节点。
2. 父节点和子节点都属于业务域并已存在或在同一 GraphPatch 中创建。
3. `part_of` 图保持无环；节点不能成为自身或自身后代的父节点。
4. 横向关系不受主要父节点限制，继续使用 `invokes`、`reads`、`writes`、
   `publishes`、`consumes`、`constrained_by`、`realized_by` 和 `verified_by`。
5. 层级变化保留节点 key、业务断言、证据和非层级关系。

树形主要归属提供稳定的逐层导航；横向关系表达真实业务协作。需要从多个
角度发现同一节点时，使用 aliases、搜索和横向关系，而不是创建多个主要
父节点。

## 原子重挂载

GraphPatch v1 已支持在一个事务中删除旧关系并新增关系。重挂载使用同一
patch 完成以下动作：

1. 必要时 upsert 新的上层业务节点；
2. remove 既有 outgoing `part_of`；
3. upsert 指向新父节点的 `part_of`；
4. 保持被移动节点及其子树 key 不变。

Atlas 在写入前根据删除和新增操作计算最终层级，并整体校验单父节点和无环
不变量。任何一步失败都会拒绝完整 patch，旧地图保持不变。

未来若多个 Agent 同时修改共享业务地图，需要在 GraphPatch 中加入独立于
源码 snapshot 的 knowledge revision。当前 v1 继续依赖串行 Skill 工作流、
SQLite 写事务和完整 patch 校验；知识 revision 属于后续并发切片。

## 任务驱动的知识协调

每个受支持任务先查询已有业务图。地图不足时，Agent 显式使用结构搜索和
有界源码阅读完成工程工作。在最终源码和测试得到验证后，Agent 对新理解
执行一次知识协调：

| 决策 | 含义 |
| --- | --- |
| `reuse` | 已有节点和关系完整表达本次验证的业务意义 |
| `extend` | 给已有知识增加节点、断言或横向关系 |
| `introduce` | 当前没有可信上层概念，新增暂时的根节点 |
| `reparent` | 发现更高层归属，原子移动已有节点或子树 |
| `refine` | 修正 kind、label、summary、aliases 或 certainty |
| `transient` | 本次信息是实现细节、症状或未验证假设，不持久化 |

创建节点前必须搜索近似业务词并查看世界 regions，减少重复根节点。发现更上层业务
时优先重挂载现有知识，而不是复制一棵新子树。所有持久事实仍需要当前源码
证据；结构不确定性保留为显式边界。

## CodeGraph 的位置

CodeGraph 保持为 Semantic Atlas 内部结构证据层：

- 索引文件、符号和可静态证明的关系；
- 为业务断言提供 source range、content hash 和可重绑定身份；
- 在业务知识不足时提供有界源码种子；
- 从已选业务节点向调用方、消费者、数据和测试扩展未来 impact 查询。

CodeGraph 不命名业务、不决定业务父子关系，也不把目录层级呈现为业务地图。
结构 exact 不自动成为业务 exact；无法证明的运行时行为继续保持
`UnknownBoundary`。

## 一张地图与语义缩放

Semantic Atlas 保存一张权威业务图，不分别保存总览图和模块子图。`part_of`
形成可逐层进入的区域层级，其他业务关系形成跨区域连接。查询根据当前焦点
选择一个可见业务边界，同一底图因此可以像游戏地图一样连续缩放。

世界视图显示当前 roots。聚焦某个节点后，视图显示它的直接子区域，并把与
当前区域发生业务关系的外部节点折叠到最接近当前视野的业务分支。例如源码
确认的关系是 `place-order reads user-profile`，在 Commerce 视图中可以投影为
`orders reads users`，在 Orders 视图中投影为
`place-order reads users`。

投影关系满足以下规则：

1. GraphPatch 只保存 Agent 明确验证的原始业务关系。
2. 缩放视图把下层关系端点提升到当前可见区域，形成只读聚合连接。
3. 同一对可见区域按 relation type 合并贡献关系，分别报告 direct 与
   aggregated 数量、certainty 分布和 validity 分布。
4. 投影后落在同一可见区域内的关系属于该区域内部细节，本层隐藏，放大后
   再显示。
5. 聚合连接不是新的业务事实，不写回 GraphPatch，也不获得虚构的 certainty。
6. breadcrumb 始终从当前 root 指向焦点；每个区域返回 direct child count 和
   expandable 状态，让 Agent 明确下一次缩放入口。

节点 kind 表达业务角色，不表达固定缩放级别。`Capability` 可以包含更细的
`Capability`，尚未发现父节点的 `Operation` 也可以暂时成为世界区域；视图
完全根据当前 `part_of` 层级计算。

## AI-first 查询契约

公共 API 以调用 Agent 完成真实工程任务的最短可靠路径设计：

```text
status -> index when needed
map view [business-key]
map search <business vocabulary>
map show <business-key>
code search <symbol or structural vocabulary> when business knowledge is insufficient
source confirmation -> engineering work -> index -> changes -> learn
```

- `map view` 是主要导航入口。省略 key 时返回世界视图；提供 key 时向该业务
  区域放大一层，同时返回 breadcrumb、child/context regions 和聚合连接。
- `map search` 只搜索业务词汇并返回业务节点，避免代码符号淹没业务意图。
- `map show` 只接受业务 key，返回该业务断言、直接业务关系和直接结构证据，
  不递归展开 CodeGraph。
- `code search` 是业务知识为空或不足时的显式结构回退，返回有界源码种子。
- 源码读取、编辑和测试继续属于 Agent 的正常工程工具，不包装进 Atlas CLI。

`map roots`、`map children`、混合业务/结构的 `map search`、接受结构 ID 与任意
depth 的 `map show` 不再属于公共契约。当前没有外部使用者，本阶段直接替换
旧 API，不增加 alias、兼容 schema 或双轨行为。

API 的首要 dogfood 场景是让一个没有预置 key 的 Agent 使用 Semantic Atlas
理解并修改 Semantic Atlas 自身：先从世界视图寻找业务区域；知识不足时通过
`code search` 定位 `WorldGraphQuery` 等结构入口；完成修改后学习查询能力、
层级和关系，使下一个 Agent 能从 `map view` 逐层到达实现证据。

## 分阶段实现

### Slice 1：业务 roots 与安全层级

- 世界视图只选择所有类型的 parentless business nodes；
- 空业务图返回 `BUSINESS_KNOWLEDGE_EMPTY`；
- GraphPatch 最终状态强制单父节点和无环；
- Skill 在真实任务后执行 `reuse/extend/introduce/reparent/refine/transient`；
- 文档明确 key 与位置分离。

### Slice 2：语义缩放与 AI-first 查询视角

- 以 `map view` 替换 roots/children，生成 breadcrumb、可展开区域和聚合连接；
- 业务搜索不与结构结果混排，增加 `code search` 作为显式回退；
- `map show` 限制在业务关系和直接结构证据，避免结构图淹没业务语境；
- 使用 Semantic Atlas 对自身完成一次世界视图到源码修改再到知识写回的验证。

### Slice 3：业务影响分析

- 从业务节点遍历 scenario、operation、data、interface 和 invariant；
- 通过 `realized_by`、`verified_by` 和 CodeGraph 扩展实现、调用者、消费者与
  测试；
- 分别报告 exact、inferred 和 unknown 影响，支持 Agent 制定修改范围。

### Slice 4：并发知识 revision 与长期治理

- 为共享业务知识增加 optimistic knowledge revision；
- 显式记录 reparent、merge 和分类修正；
- 在真实重复知识或并发冲突出现后设计 merge 操作，不提前引入复杂治理。

## 验收场景

1. 新仓库完成 `index` 后，世界 `map view` 返回空业务图而不是 `src` 或 `libs`。
2. 第一次任务学到一个 Operation 时，它可以作为暂时根节点被后续任务复用。
3. 后续任务创建更高层 Capability，并在一个 GraphPatch 中把该 Operation
   重挂载到 Capability 下；Operation key 与证据保持不变。
4. 同一 patch 尝试给节点添加两个主要父节点时整体失败。
5. 同一 patch 尝试形成 `A -> B -> A` 层级环时整体失败。
6. 世界视图只显示根区域；聚焦父节点时显示直接子区域、breadcrumb 和可展开
   状态。
7. 两个深层节点的横向关系在上层视图聚合到各自可见祖先，放大后恢复更具体
   的端点；聚合连接保留贡献关系的 certainty 与 validity 分布。
8. 一个 Fresh Agent 通过 `map view/search/show` 发现当前业务路径，并在业务
   知识不足时通过 `code search` 明确转入结构与源码回退。

## 相关页面

- [产品契约](../product-contract.md)
- [图模型](../contracts/graph-model.md)
- [GraphPatch v1](../contracts/graph-patch-v1.md)
- [CLI v1](../contracts/cli-v1.md)
- [CodeGraph 后端边界](codegraph-backend.md)
