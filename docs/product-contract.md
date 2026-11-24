# Semantic Atlas Product Contract

This page defines the accepted initial product. It answers what Semantic Atlas
must improve, how agents and people use it, and which results establish
that the product works.

**状态：当前 5.0.0 源码已实现紧凑查询、业务关系与维护位置输出。YAML 持久格式保持
不变；查询 JSON 的字段变化见下文。发布身份以对应 GitHub Release 为准，长期验收仍在进行。**

## Purpose

Semantic Atlas helps coding agents make more accurate engineering changes.
Its Agent Skill builds a task-specific understanding of stable business
boundaries, meaningful concepts, relationships, data, rules, interfaces, and
likely source entry points before an agent changes code. Scenario flows add the
business-relevant decisions, branches, and outcomes that relationships alone
cannot express. An existing shared map accelerates that work; a missing map
starts a bounded current-evidence path.

The map is a durable navigation prior rather than a synchronized copy of the
codebase. Product structure normally changes more slowly than implementation,
so a partially stale map can still lead an agent toward the right owners,
collaborators, invariants, and upstream causes. The agent corrects that prior
with current source, tests, tracked product documentation, Git, and runtime
evidence before changing behavior.

## Product Outcome

The product succeeds when agents using the business-understanding workflow more
reliably:

- enter a task through the correct business boundary;
- distinguish a downstream symptom from its upstream cause;
- inspect the business collaborators, data, rules, and interfaces needed for a
  complete change;
- preserve business-relevant branches and outcomes during refactors;
- choose an implementation scope that fixes the cause without unrelated work;
- preserve readable responsibilities and maintainable code;
- identify when the map is incomplete or contradicted by current evidence;
- correct their investigation without requiring a person to supervise routine
  discovery and implementation.

The map itself may be incomplete or stale. The final engineering conclusion
uses current evidence and is held to a higher accuracy standard than the map.

## Users And Core Scenarios

### Coding agent orientation

Agent 接到功能、缺陷、重构或影响分析任务后，按已知流程或概念 ID 直接读取；只有
业务意图时才搜索相关流程。已登记项目可通过 `project list` 与 `--project <名称或ID>`
从任意工作目录定位。未登记项目可显式使用 `--repo <路径>`。业务图缺失时，先建立
当前任务所需且有源码依据的业务理解；修改前核实会决定结果的当前证据。

For a mapped business action, a source-file-bound symbol can point to the
specific method or function that carries it. The Agent locates that declaration
inside the named file using its normal repository tools and confirms the
described business responsibility in current code. Existing file, directory,
document, search, and unbound symbol hints remain valid. The
[navigation-anchor contract](map-format.md#navigation-anchors) defines the shape
and when each granularity is useful.

### Root-cause and impact discovery

An agent uses typed business relations to ask what invokes an action, what data
it reads or writes, which invariant constrains it, and which interfaces cross
its boundary. These relations guide source investigation when user wording and
implementation vocabulary differ.

### AI 查询与按需读取

首次定位应足以判断业务入口：搜索候选带当前 YAML 的维护位置，第一候选随附唯一
概念详情、源码入口、显式业务关系及相关图的引用位置；`contextFor` 明确摘要所属的
候选 ID。最多五个候选仍由 Agent 按业务含义选择，第一候选及其词面分数不代表
已经确定目标。选中其他候选后，按稳定 ID 读取相应概念或流程。

已知概念用 `context` 直达所选业务与其关联；已知流程用 `flows <id>` 直接读本层完整
步骤和转换。普通查询中的相关流程保留所属／引用摘要，完整细节按需读取。响应通过
ID 连接概念、关系和流程，避免在步骤和关系中重复概念与锚点；查询不列全库文件，
使用紧凑 JSON，`repository` 只报告选中的 `root`。

关联解释来自 `relations` 的类型、业务 `summary` 与端点，流程的 `references` 说明
哪些步骤引用了相关概念。查询覆盖直接关系及共享数据、接口、规则的其他已记录使用方，
帮助 Agent 判断哪些业务与图需要核实；不无限扩展动作邻域。`scope: "recorded"` 明示
范围：记录了关联不等于当前变更一定有影响，未返回也不证明没有使用方。跨项目线索
仍由 Agent 转到对应仓库核实，本轮不引入跨仓关系模型。

维护位置从当前 YAML 派生，不改变持久模型。代码符号保留文件和声明提示，CLI 不猜
代码行号；导航状态只说明路径可进入或缺失，不代替当前行为核实。字段与定位语义
由[查询投影](map-format.md#context-projection)定义。

### Human inspection

A person views deterministic projections of the same tracked map to discuss
business boundaries and relationships. A self-contained export and a local
read-only Web command share the same interactive Viewer. The user manually
registers checkouts with `semantic-atlas project add [path]`; an omitted path
means the current directory. A parameterless `semantic-atlas web` can then
start from any directory, list the registered projects, and load only the
initially selected or newly selected map. An unavailable checkout remains in
the list and affects only its own view.

The explicit `web --repo <paths...>` form remains a temporary project set for
one session. It neither writes the user-local project file nor implicitly
merges registered paths. The browser receives service-assigned project IDs and
display names, never repository paths, and cannot submit a filesystem path.
所有可视页面统一为业务流程图。AI 根据真实业务决定怎样概括、拆分和连接，不套用
固定的开始、判断和结束结构。项目可直接提供多张平级业务图，不要求共同父图或
专门的“业务全貌”图。默认第一张只是初始阅读选择，不要求覆盖项目全部业务。
每张图的范围来自读者需要理解的业务目标；相关主线不拆散，独立业务不强行合并。
操作有独立接口、角色或返回值，不足以证明它应当成为顶层业务。应说明它为谁发生、
作用于什么对象，以及结果怎样进入后续使用，再决定主图、详图或仅保留概念与锚点。

记录这些内容的 YAML 称为业务流程源文件，简称流程源文件；应用的运行实现称业务
代码，渲染后的页面称业务流程图。AI 直接审查流程源文件中的业务范围、节点、连接和
措辞，并按业务代码核实。孤立节点或多块不相连的内容需要逐项说明并修正组织，不能
只靠同图摆放表示关系，也不能编造执行顺序。网页用于核对呈现，不代替业务语义审查。

在选定业务内，图应讲清主要过程、重要条件、状态与交接，复杂局部可进入有额外
解释的详图。例如订单图保留下单、付款、发货及按条件发生的退款，不因此把另一项
无关业务并入订单图。图数、节点数与层数由实际内容决定，反复“入口到结果”的封面
不能替代业务过程。业务跨前端、后端或其他服务时，AI 按缺口找证据；软件提供表达、
渲染、搜索和导航能力，不替 AI 决定画法或推断执行关系。

流程节点可以引用场景，进入该场景自己的子流程。没有被其他流程引用的根流程排在
前面，默认打开第一条根流程；其余流程通过“查看其他流程”的级联菜单或节点角标进入。没有流程资料
时显示空状态，AI 根据当前证据编写流程后再阅读，不生成分类图或猜测连线。

单项目界面只显示当前流程标题，不重复展示目录名或产品品牌栏。“查看其他流程”
放在标题旁，菜单左对齐并向右增加层级。鼠标悬停整行展开下一层，点击名称直达；
触屏仍可点展开箭头，键盘可用方向键浏览。“上一层”沿实际访问历史返回。
子流程叠层角标直接进入下一张图；多个目标时先选择。有业务备注的节点显示独立的
小信息标识，点击正文打开默认关闭的详情；没有备注就不显示该标识。详情不包含
进入按钮，无备注节点正文保持原样。
起点、判断、结果与子流程继续使用当前卡片样式，不改成大菱形。

节点用一句话概括具体业务意图，补充说明只保留读懂路径所需的信息；清单、解释和
例外放详情。写作预算由 Skill 指导，不变成文件格式的硬限制，也不在界面截断文字。
读者仅看节点与分支就应理解主要过程，影响路径的关键条件保持可见。

业务文件只由 AI 编辑。源码路径、类和方法锚点保留在文件与 CLI 中，Web 面向业务
人员，隐藏源码与 AI 怎样编排图的理由。业务规则自身的目的和取舍仍可写成节点备注。
浏览器只负责阅读、导航、平移和缩放，不修改业务资料。

画布采用紧凑 HTML 卡片与 SVG 正交连线。文字可选择、可复制，长文本与整页翻译后
按实际内容重新测量；小图不自动放大超过原始字号，避免节点和线条变成大色块。
Web 与导出的单文件 HTML 共用同一个阅读器。

### Runtime language

Product-owned text supports English and Simplified Chinese, with English as
the fallback. CLI help and diagnostics follow the system's language environment.
The shared Viewer follows the browser's language preferences when the page opens,
for both exported HTML and local Web sessions. Its controls, diagram type labels,
project states and accessibility text share that browser language.
The same exported file can therefore serve browsers with different preferences.
User-authored map names, summaries, aliases, and branch labels retain their
original content; machine-readable keys, IDs, error codes, and enum values remain
stable.

Language configuration and translation maintenance are defined in
[Internationalization](architecture.md#internationalization).

### Business-map authoring and maintenance

Agents organize maps by real business responsibility whenever they create,
extend, correct or reconcile shared knowledge. Independent business areas have
meaningful domain roots and owning YAML files. Existing owners are reused while
their scope remains correct; newly discovered independent responsibilities get
their own owners rather than accumulating under an unrelated existing domain.
A local task or single-business project can use one file. Shared concepts remain
unique and relationships and flows retain their business owners. The
[map format](map-format.md#business-ownership-and-file-boundaries) owns these
rules for the complete authoring lifecycle.

产品自带的维护 Skill 同时承担业务图的阅读编排方法：AI 根据业务资料选择每图的
边界、层次、表达与修改范围，并核对完整业务分支、目的、代价和依据。软件提供结构
表达、校验、渲染和浏览能力；这些方法沿当前版本实际支持的格式使用，具体指南见
[业务图设计](../.agents/skills/semantic-atlas/references/diagram-design.md)。

业务行为变化时，在当前开发分支同时修改代码与受影响流程图，一起检查、提交和合入。
内部重命名、接线或组织变化没有改变业务含义时，不强制重画。新的局部业务没有流程
资料时，建立足以表达当前改动的流程，不补画整个系统。

合并出现冲突时，依据合并后代码的业务行为重新梳理受影响路径，检查上下层和协作
交接，再解决图文件冲突。不能只做文本拼接或保留与代码不一致的分支。
候选、观察和合入后的校准不再作为正常开发门槛；既有历史工具只在明确请求时使用。

旧业务文件不构成格式兼容约束。格式以当前产品需求与具体契约决定，新版发布后再
重写已有业务资料；本轮不批量迁移其他项目，也不额外加入旧格式兼容路径。

## Shared Business Model

The map uses these concept kinds:

- `domain`: a stable top-level business area;
- `capability`: a durable ability owned by a domain or broader capability;
- `scenario`: a bounded business collaboration that users or operators can
  name;
- `operation`: an independently meaningful action with one business outcome or
  state effect;
- `data`: a durable business record or concept;
- `invariant`: a rule that constrains business behavior;
- `interface`: an API, event, queue, webhook, or external integration boundary.

`part_of` supplies primary semantic containment. Directed horizontal relations
describe collaboration:

- `invokes`
- `reads`
- `writes`
- `publishes`
- `consumes`
- `constrained_by`

A concept is worth retaining when future tasks can independently name,
navigate to, depend on, constrain, read, write, publish, consume, or change it.
Methods, helpers, SQL statements, folders, and framework components remain
source details until they express durable business meaning.

### Business flows

A flow belongs to one existing scenario and orders business-granularity
`action`, `decision`, and `outcome` steps through transitions. Decision
transitions carry distinct business labels. A step can reference an existing
场景概念 ID，从该步骤进入场景自有的子流程，无需第二套链接字段。

同一张图支持多个真实业务入口与独立并行后续。`startsAt` 可写一个 ID 或非空列表，
解析与 CLI 返回统一为列表；动作的多条无条件后续均成立，判断的条件分支继续按条件
选择。软件按显式节点和连线展示，不要求编造共同入口，也不自动推断等待或执行状态。

Flows retain only steps that can change a user-visible result, durable data,
cost or provider usage, authorization or tenant isolation, an interface, or a
business outcome. They can express stable loops, but they remain advisory
knowledge rather than an executable workflow or synchronized copy of source.

## Authority And Accuracy

Tracked map documents are authoritative for the shared map. They are not
authoritative for current application behavior.

Every business-changing engineering task follows this evidence order:

1. 已知流程或业务 ID 时直接读取；未知时按本次业务意图搜索相关流程，不要求从总览开始。
2. A map proposes likely business scope and relations; `MAP_NOT_FOUND` routes to
   the smallest source-supported business model needed for the task.
3. Current source and tests confirm implementation behavior.
4. Tracked product documents confirm durable intent when they own that intent.
5. Runtime, database, queue, or environment evidence confirms state-dependent
   behavior when the task requires it.
6. The agent reports uncertainty when available evidence cannot support a
   decisive conclusion.
7. 业务行为变化时，代码与相关流程在同分支同步验证；观察记录仅按明确请求执行。

An outdated path or symbol anchor weakens that navigation hint without
invalidating unrelated business meaning. A contradiction changes the current
task conclusion immediately; an affected business flow is corrected alongside the code.

## Collaboration And Concurrency

Business-map files live in the repository and travel with its branches. Files
are divided by stable business domain so agents can read concurrently and most
durable updates touch only one owning map.

业务代码和流程图随同一分支、同一次评审与合并维护。多个 Agent 修改同一业务时，
以最终合并行为核对流程，使用正常 Git 评审处理冲突，不引入第二套候选提交门槛。

## Initial Product Scope

The initial product delivers one coherent path:

1. Load tracked map documents from a repository.
2. Validate document shape and graph integrity.
3. Normalize the complete map in memory.
4. Rank up to five concepts of any node kind for a natural-language business
   query, with a deterministic query-relative score and stable IDs.
5. Select a concept by stable ID, while retaining the existing exact and partial
   selector behavior for compatibility.
6. 返回有维护位置的局部业务摘要、概念与锚点、直接关系及共享数据／接口／规则的其他
   已记录使用方；相关图提供引用位置，指定流程时才展开完整本层步骤。
7. Render deterministic interactive human-readable projections from the same
   graph as a portable HTML artifact or loopback Web session, with linked
   business process diagrams.
8. 提供统一 Skill：按已知业务编号直接读取，或按意图搜索相关流程；核实当前源码，
   业务行为变化时在同一分支同步代码与图，不要求固定先从目录或总览开始。
9. Exercise the workflow against real engineering tasks, including stale and
   incomplete map cases.

Map loading, validation, querying, and rendering remain stateless between
commands. Derived render artifacts and future performance caches are
reproducible from tracked files. The user-local, versioned project-path list is
disposable Viewer configuration rather than business knowledge.

## Current Non-Goals

The initial product does not provide:

- a synchronized structural copy of the codebase;
- a persistent business-knowledge database;
- content hashes, source snapshots, knowledge revisions, or transactional graph
  patches;
- automatic inference of business meaning from folders or call graphs;
- mandatory map updates after every engineering task;
- source editing, test execution, Git mutation, code review, or release
  orchestration;
- retry policy, timing, executable workflow state, or automatic source-to-flow
  synchronization;
- a general workflow engine or full visual-diagram authoring system;
- real-time multi-user map editing;
- a second visual authoring representation;
- browser-side project registration or automatic repository discovery;
- branch and worktree management for registered checkout paths.

These boundaries keep the first product centered on better engineering
judgment. Later capabilities require observed evidence that they improve that
outcome.

## Completion Standard

The first product is complete when one candidate revision demonstrates all of
the following:

- tracked example and real-project map files load and validate through the
  public CLI;
- 搜索候选与指定概念／流程查询返回预期业务身份、维护位置、代码入口、带原因的
  已记录关联及相关图引用；候选摘要所属明确，概念不重复，完整流程按需读取；
- the renderer produces readable business process diagrams from the
  same normalized map and links shared business concepts between them;
- a package-managed Agent Skill activates for business-changing work with or
  without a map, probes bounded context before broad discovery, and confirms
  every change-controlling claim in current evidence;
- real task cases cover upstream root cause, cross-capability impact, missing
  map knowledge, stale anchors, and a contradicted relationship;
- mapped and mapless Skill runs reach correct source-supported conclusions
  without introducing unsupported business claims;
- independent review finds the implementation responsibilities readable and
  the public workflow consistent with this contract;
- delivery remains local: publication, external installation, and migration are
  separately authorized stages.

Token usage, opened files, wall time, compute cost, and map-maintenance effort
are recorded to explain product behavior. They do not replace accuracy and
human-intervention evidence as acceptance conditions.

## Current Delivery State

当前源码版本为 `semantic-atlas@5.0.0`。项目登记、只读阅读器、观察与历史校准能力继续
保留；本次将 AI 查询改为唯一概念详情、带原因的关联、相关图引用及当前 YAML 位置，
完整步骤按需读取。查询 JSON 的重复嵌套对象与全量文件目录已移除，因此使用主版本
标明输出契约变化；业务文件仍使用原有 YAML，无需迁移。公开发行和本机安装分别核验，
长期真实任务验收仍按下文证据标准进行。

## Current Public Release

- `lzj960515/semantic-atlas` is the active public source repository and
  `semantic-atlas` is the npm package identity.
- Releases are normal fast-forward continuations of public `main`.
- 全局安装、`setup` 与 `upgrade` 同步唯一新版 Skill，接管已识别的旧格式并清理旧维护入口；
  身份属于其他 Skill 的目录继续保留。
- Observation reads and writes use the current task and review schemas; old
  local formats are disposable rather than migration inputs.
- Existing Git tags, GitHub Releases, and npm versions remain immutable release
  records, not runtime compatibility requirements.

### Installed CLI and managed Skills

The published CLI owns installation of its bundled user Skills:

```text
npm install --global semantic-atlas --allow-scripts=semantic-atlas
```

使用 `npm install --global semantic-atlas --allow-scripts=semantic-atlas` 一次完成 CLI 与
统一 Skill 的接入。安装入口只在全局模式执行；普通项目安装保持用户目录不变。
`setup` 仍可显式修复，`upgrade` 委派新版 CLI 同步 Skill。启用 npm 12 的安装脚本只需
允许本包，无需修改全局配置；主动禁用脚本的安装需显式执行 setup。

唯一源保存在 `~/.agents/skills/semantic-atlas`，Codex／Claude 的入口指向这份资料。
当前管理标记或准确的 Skill 名称识别本产品旧目录，安装使用原子替换，随后移除各发现
目录中的旧维护 Skill 与过期副本。父发现目录已共享时不删除唯一源；其他 Skill 保留。
业务仓库只共享业务 YAML，安装与公开发布各自验证。

### Accuracy observations

Real-use evidence is separate from the Git business map and from business-map
authority. The product records three immutable, versioned local artifacts:

- `TaskObservation`: map query outcomes including `map_not_found`, selected
  concepts, current-evidence classification, explicitly domain-owned node,
  relation, anchor, or flow candidates when maintenance is warranted, and any
  explicit human correction known to the task Agent. Reads and writes use task
  artifact v2;
- `ReviewObservation`: the independent review verdict, correctness of the
  business boundary and upstream cause, impact completeness, required rework,
  and whether the map caused a wrong conclusion;
- `MaintenanceObservation`: a reviewed post-integration result for exact
  `taskObservationId + candidateIndex` sources, their `accepted`, `refined`,
  `discarded`, or `unresolved` classification, current evidence, and the owning
  YAML plus real merged commit when the map changed.

The task Agent never grades its own engineering accuracy. Review or explicit
human correction owns correctness. Each observation uses an independent ID and
atomic file write under a user-local repository partition. The implementation
does not use SQLite, a remote API, or a shared append-only JSONL file. Summaries
are reproducible from immutable observations.

The deterministic CLI exposes the observation boundary:

```text
semantic-atlas observe task --stdin
semantic-atlas observe review --stdin
semantic-atlas observe maintenance --stdin
semantic-atlas insights summary [--repo <path>] [--period <duration>]
semantic-atlas reconcile status --repo <path>
semantic-atlas reconcile candidates --repo <path>
```

Observation failures are reported and never turn a successful engineering task
into a successful accuracy claim. The main accuracy measures are correct
business boundary, correct upstream cause, complete required impact, map-caused
regression, independent-review rework, human correction, and safe recovery from
missing, stale, or contradicted map knowledge. Tokens, files, time, compute, and
map-maintenance effort remain explanatory measures.

### 可选历史观察与候选处理

`observe` 和 `reconcile` 保留已有不可变记录的查询与处理契约，仅在用户明确要求时使用。
旧维护观察仍按精确来源记账，不重解释历史字段；这些工具不形成普通开发的候选门槛。
日常业务变化在当前分支同步代码和流程，冲突按合并后代码重审，再一起验证合入。

### Real-use acceptance

The first pilot starts with one stable business domain in a private target
repository rather than mapping the whole repository. Its initial map is
independently reviewed before merge. Task orchestrators keep their own develop,
independent review, rework, and integration lifecycle. Semantic Atlas activates
from the Agent's business task, supplies source-supported business understanding,
and remains independent of orchestration.

Longitudinal acceptance requires at least 20 natural business-changing tasks
with independent review, at least one period of real code drift, and two
domain-scoped reconciliations. Every fifth suitable task adds an ordinary
analysis-only shadow for bounded comparison without duplicating production
writes. Natural use is not replaced with manufactured jobs or provider activity.

Any map-caused wrong conclusion, Store/authorization/data-boundary regression,
or installed CLI/Skill version mismatch blocks acceptance. The final stage also
tests multiple Agents in independent worktrees reading one map revision and
在各自分支同步修改代码与流程，并在合并后重新核对冲突业务；观察记录仅作为可选证据。

## Delivery Boundary

The [delivery plan](delivery-plan.md) owns the ordered release and real-use
gates. An earlier gate never implies that a later publication,
target-repository, or longitudinal-use gate has completed.
