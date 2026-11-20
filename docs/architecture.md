# Semantic Atlas Architecture

This page defines the stable responsibilities, data lifecycle, dependency
direction, and failure semantics for the initial product. It applies to the
public CLI, renderer, and business-understanding Agent Skill.

**Status: query, validation, visual projection, Agent Skills, managed Skill
lifecycle, accuracy observations, read-only reconciliation, and public release
verification are implemented. Persistent project registration and on-demand
Web loading are implemented in the current source candidate.**

## System Model

```text
tracked map documents
        |
        v
MapDocumentLoader -> MapValidator -> BusinessFlowValidator -> BusinessGraph
                                                              |
                                  +---------------------------+-------------------+
                                  |                                               |
                                  v                                               v
                    ConceptSearchService + ContextQueryService       MapProjector + FlowProjector
                                  |                                               |
                                  v                                               v
                 business context JSON                            shared process Viewer

Calling Agent
  -> activates from business task meaning
  -> probes the graph, including the map-not-found outcome
  -> treats available map results as investigation hypotheses
  -> confirms decisive behavior in current repository evidence
  -> updates affected code and business flows in the same branch

published package Skills bundle
        |
        v
ManagedSkillsInstaller -> one ManagedSkillInstaller per Skill
                                  |
                                  v
                       atomic directory replacement

verified installed CLI <- exact npm version <- PackageUpgrader
        |
        +------------ invokes setup ------------+

Task Agent evidence -> ObservationApplication -> ObservationStore
                              |                      |
Independent review -----------+                      v
                                               user-local files
                                                      |
                                                      v
                                               InsightService
                                                      |
                                                      v
                                             ReconciliationService
                                              /                \
                                             v                  v
                                  required boolean   deterministic candidate report
                                         |                    |
                                         v                    v
                                  task orchestrator   explicit historical reconciliation
                                                      |
                                                      v
                                       current evidence + reviewed YAML

verified source candidate -> annotated release tag -> published GitHub Release
                                                      |
                                                      v
                                             protected npm environment
                                                      |
                                                      v
                                             provenance publication
                                                      |
                                                      v
                                      independent read-only public verification

project add [path] -> complete map validation -> user-local ProjectStore
                                                    |
parameterless web ----------------------------------+
explicit web --repo -> temporary session paths -----+-> LocalWebApplication
                                                         |
Viewer catalog <- GET / -----------------------------+
Viewer selection -> GET /api/projects/<opaque-id> -> one validated projection
```

The tracked documents and their Git history are the shared product state. Each
map load creates an in-memory graph for its own invocation. Rendering and future
local acceleration remain derived behavior around that same graph. The
user-local project list supplies checkout selection and never becomes a
second graph or map-authoring source.

## Stable Responsibilities

### MapDocumentLoader

Discovers map documents through one repository-owned configuration convention,
parses them with a mature data-format library, and returns document-shaped
values with their source locations. It owns filesystem discovery and parsing,
not graph semantics.

### MapValidator

Validates document shape and complete-graph integrity. It reports every
actionable issue that can be collected safely in one run, including duplicate
IDs, missing relation endpoints, containment cycles, invalid kinds, and
malformed anchors. It owns deterministic validity, not current-source truth.

### BusinessFlowValidator

Validates scenario ownership, flow and step identity, concept and transition
references, action/decision/outcome branch shape, and reachability from the
declared entry set. A single entry ID and a nonempty entry list normalize to
one immutable list. Actions can have multiple unconditional successors;
decisions retain distinct labeled alternatives. Cycles are valid. It owns structural flow coherence while current source and durable
product evidence decide whether the described business path is current.

### BusinessGraph

Holds normalized immutable nodes, relations, flows, aliases, containment
indexes, and incoming/outgoing relation indexes for one command. It exposes
domain operations in terms of business concepts and scenario paths rather than
file layout or parser objects. Related flows are derived from scenario
containment and step concept references.

### ContextQueryService

Resolves a concept by stable ID, name, or alias and returns the smallest useful
business neighborhood: ancestors, direct children, incoming and outgoing
relations, referenced concepts, summaries, navigation anchors, and complete
related flows. It reports ambiguity explicitly rather than selecting a hidden
match. It preserves bound symbol anchors as structured file paths and
declaration names; source location and behavior confirmation belong to the
calling Agent's repository tools.

### ConceptSearchService

Ranks every normalized business node against one natural-language query and
returns at most five deterministic candidates. It compares names, aliases,
stable IDs, and summaries through local lexical similarity, keeps scores within
`0–1`, and uses stable IDs to break ties. The score expresses relevance within
that query rather than truth or selection confidence. Candidate retrieval owns
no graph expansion or source-evidence judgment; callers pass the selected stable
ID to `ContextQueryService`.

### MapProjector 与流程导航

将已校验的 `flows` 投影为阅读器数据。默认入口来自显式流程：没有被其他流程步骤
引用其场景的流程先显示，再按节点引用排列子流程。`part_of` 继续表示业务归属，
不会生成分类画面或执行箭头。没有流程时提供空状态。

AI 决定每条流程的业务范围与粒度；产品不补统一起止、不生成跨流程连线，也不把
所有根流程自动铺在一张画布中。独立业务通过按需导航分别浏览。

节点进入目标只取引用场景自己拥有的其他流程，排除当前流程。普通相关关系与后代
归属不产生深入链接。CLI 的概念、关系、源码锚点和完整地图统计保持其已有含义。

### FlowProjector 与布局

每个流程投影出 HTML 节点、SVG 连线和布局资料。起点、动作、判断、结果采用紧凑
卡片、小图标与细色条，子流程节点以叠层样式提示。判断使用淡金卡片，不因正文
增加而膨胀成大菱形。

显式声明的所有入口都采用起点样式；同图的不相连路径和并行连线沿原布局完整投影，
不生成共同起点、虚拟判断或汇合节点。它们来自 AI 编写的这一张图，项目内其他流程
仍按需读取，不被自动合并到当前画布。

Dagre 确定层级和位置，正交走线保持水平或垂直并使用圆角转折。小箭头与线条同色，
分支标签放在对应连接的空白区。服务端预估与浏览器实测共用布局，文字变化后重新
测量卡片，完整展示标题、摘要与条件。

### ViewerPage 与浏览状态

正式阅读器按流程阅读需求重新实现。项目内所有页面使用一套流程画布，顶部提供
标题旁的“查看其他流程”级联菜单与多项目选择；产品品牌栏删除，单项目名隐藏。画布保留标题、“上一层”、平移和缩放。默认适应最多使用原始
比例，避免少量节点被过度放大。没有常驻目录、关系模式、图例或导出按钮。

详情默认关闭，点击正文只显示业务备注；节点角标直接进入子流程，多目标先选择。
详情不放进入按钮。正文无备注时保持原样。源码锚点保留在业务文件和 CLI，Web 数据只包含业务阅读所需内容。
浏览历史保存图编号、视野与选中节点；切项目时清空。浏览器不提供内容编辑或写入。

静态 HTML 内嵌完整流程资料与运行包，可离线导航。Web 首页只包含项目名称和不透明
标识，选择项目后按需载入。请求编号与取消信号防止较早请求覆盖新的项目。

### ProjectStore And ProjectRegistrationService

`ProjectStore` owns the versioned `~/.semantic-atlas/projects.json` document. A
missing file means an empty project list. It strictly reads normalized absolute
checkout paths, appends a new path idempotently, and publishes the complete list
through a unique temporary file and atomic replacement. This disposable local
configuration is separate from observations and tracked business-map YAML.

`ProjectRegistrationService` validates the complete map through
`MapApplication` before storing its resolved root. A missing, invalid, or
unresolvable map therefore leaves the project file unchanged.

### ProjectDirectory

从既有登记路径派生目录名、展示名和路径哈希 ID，不增加持久字段。CLI 的 `project list`
返回 `{id, name, displayName, repositoryPath}`；Web 复用同一目录生成名称与 ID，但只
向浏览器发送名称和不透明 ID。目录名经 Unicode NFKC、首尾空白和大小写归一后精确
匹配，重名返回候选并要求使用 ID。未知名称返回最多五个相近候选，供 AI 判断后明确
重试，不自动选中相近项目。路径存在与地图有效性仍由 `MapApplication` 在读取时核实。

### LocalWebApplication And LocalWebServer

`LocalWebApplication` turns one saved or explicit path set into a session-local
catalog with opaque project IDs. It renders the initial list without loading a
map and resolves a selected ID back to its server-only path for one
`MapApplication.viewerProject` call. Duplicate basenames receive deterministic
numeric labels without revealing parent or absolute paths. A project load
failure becomes a safe unavailable result and does not affect another project.

`LocalWebServer` binds to `127.0.0.1`, serves GET and HEAD, rejects mutation
methods, and accepts no repository path from HTTP. Its root serves the Viewer
shell and catalog; its opaque-ID project endpoint serves one current model and
SVG set with caching disabled. The server owns transport lifetime only; map
loading, validation, layout, and HTML remain in their existing owners.

### CLI

Owns argument parsing, exit status, machine-readable envelopes, and concise
human presentation. It composes application services and performs no graph
interpretation of its own.

### Internationalization

`src/i18n/` owns locale normalization and i18next integration. The CLI normally
uses the first nonempty system variable in `LC_ALL`, `LC_MESSAGES`, and `LANG`.
`SEMANTIC_ATLAS_LANG` is an optional debugging and testing override of that
selection, rather than a normal setup requirement. Locale matching ignores case,
accepts underscores and POSIX encoding or modifier suffixes, and maps `zh`,
`zh-CN`, `zh-SG`, and `zh-Hans` (including script-region variants) to Simplified
Chinese. Missing or unsupported system settings select English.

The Viewer uses `i18next-browser-languagedetector` with only its `navigator`
detector enabled. Browser language preferences select the first supported
language; the fallback is English. Traditional Chinese locales are unsupported.
Detection does not persist a language preference, so opening the same export
in another browser follows that browser's preferences. Server environment
variables determine CLI diagnostics only.

Independent catalogs under `src/i18n/locales/en/` and
`src/i18n/locales/zh-CN/` group CLI, diagnostics, and Viewer messages. i18next
owns resource lookup, interpolation, and English fallback. Node instances are
isolated by locale; Zod uses its official locale error maps per parse. External
parser, operating-system, and npm diagnostics retain their original details.
HTML adapters escape translated output at the rendering boundary.

The Viewer embeds its resources, i18next runtime, and browser language detector
in the self-contained page. Server-rendered markup uses deterministic English
fallback text with translation bindings. The browser translates product-owned
text and attributes on startup and after each lazy project load, before measuring
the diagram. User-authored content remains outside those bindings. Safe project
error responses include a translation key for the browser to render in its own
language. The JSON model escapes script delimiters before embedding resources.

To add a language, create its catalogs using the same keys and interpolation
names, register its resources in `src/i18n/index.ts` and aliases in
`src/i18n/locale.ts`, extend the Viewer's supported languages, and add the
corresponding Zod locale. The internationalization tests check catalog parity
and public language behavior. Runtime language scope is owned by the
[product contract](product-contract.md#runtime-language).

### 统一业务 Skill

已知流程或概念编号时直接调用 `flows <id>` 或 `context <id>`；未知时按业务意图
调用 `search --flows` 定位相关图。搜索使用本地业务名称、别名、步骤和说明的词面匹配，
AI 根据业务含义选择结果；没有语义向量索引，不将分数解释为业务正确性。
缺少上下文时才补看上层、子流程与协作，不强制总览或固定搜索顺序。

根据源码、产品决定和运行证据确定业务行为，沿流程步骤上的概念锚点定位文件、类
和方法。业务变化在当前分支同步代码和图，检查正常路径、条件和结果。纯实现改动
不强制重画。合并冲突按最终代码的业务含义重新梳理受影响图，不做机械文本拼接。

流程设计、业务边界和文件编写资料在同一 Skill 中按需读取。旧候选与观察仅在明确
处理历史资料时使用，不作为普通工程的默认动作或合入后的前置工作。

### FlowNavigationService 与流程搜索

共享服务从显式步骤的场景引用派生根入口、子流程和父流程，不推断执行顺序。
浏览器的级联菜单与 AI 的 `flows` 命令使用同一目录，AI 可以直接读取任意编号。
菜单从标题旁左对齐向右展开，鼠标悬停整行时只更新右侧列，保留当前行 DOM 和焦点，
避免名称点击被展开打断。键盘和触屏保留明确的展开操作，窄屏在菜单内横向滚动。
流程详情包含本层步骤、转换、子流程、概念与源码锚点；没有锚点时如实为空。
`search --flows` 复用现有词面检索，直接返回流程候选；普通 `search` 保留概念检索。
目录支持共享子流程；循环引用保留一个可达入口，菜单沿当前路径停止重复展开。

### ManagedSkillsInstaller

只安装一个包内 `semantic-atlas` Skill，统一理解业务与流程维护。沿用安装指纹、
归属标记、暂存目录和原子替换，验证已有同名目录归属后才修复或升级。
旧 `semantic-atlas-maintenance` 用户目录不自动清退，无关目录保持原样。

### PackageUpgrader

Owns the boundary between npm package state and managed Skills state. It reads
npm's stable version first, installs an exact `semantic-atlas@<version>` when
the current package differs, locates that package through npm's global root,
verifies its CLI version through the current Node executable, and invokes that
CLI's `setup`. The invoking process never copies its own Skills after a package
replacement.

### RepositoryIdentityResolver

Owns the private repository partition used by observations. Git worktrees
resolve through their common Git directory so concurrent task branches share
one logical repository identity. The resolver hashes the local identity source
and exposes neither repository paths nor remote URLs in retained artifacts.

### ObservationApplication

Owns complete task, review, and maintenance input validation and the
accuracy-authority boundary. It creates a repository-bound artifact only after
strict schema validation. Review recording additionally resolves the referenced
task observation from the same repository partition before persistence.
Maintenance recording resolves every exact candidate position and verifies its
business domain before persistence.

### ObservationClaimManager

Owns the observation-ID claim lifecycle. It publishes complete synced owner
metadata without overwrite, distinguishes process instances, recovers the
current atomic-file claim format, and verifies ownership again before final
observation publication. Unknown claim shapes remain in place and fail closed.

### ObservationStore

Owns immutable, versioned user-local observation files and composes the claim
manager around each write. The store writes and syncs a complete observation
staging file, atomically renames it into place, returns idempotency for an exact
replay, and reports a conflict for changed content under an existing ID. Its
write boundary accepts current task v2, review v1, and maintenance v1 artifacts.
Its read boundary accepts those same contracts; unsupported stored
artifacts fail the read instead of being reinterpreted.

### InsightService

Owns read-only derivation over retained observations. It filters by optional
duration, aggregates independent review dimensions, and joins approved reviews
to task evidence when counting safe recovery from missing, stale, or
contradicted map knowledge.

### ReconciliationService

Owns deterministic read-only grouping of retained map-update candidates. It
uses explicit business-domain ownership plus exact candidate kind and summary,
preserves each actionable candidate occurrence, evidence disposition, task
query record, human correction, linked independent review, and unresolved
maintenance history, and marks groups with multiple origins as duplicates.
Terminal maintenance results remove their exact origins. A group containing
only previously unresolved origins waits for a new origin before becoming
actionable again. The service reads repository identity and observations
without loading or editing the business map.

The service also owns the narrow maintenance-status projection used by task
orchestrators. That path reads task and maintenance observations only and
returns whether any exact origin remains actionable; Review joins and complete
candidate reports are deferred until a maintenance Agent requests them.

### Release Candidate Verification

The repository-owned release gate composes Oxlint correctness checks, Oxfmt
format checks for code and scripts, contract and source tests,
typecheck, build, deterministic render checks, packed-tarball privacy, an
anonymous installed-product flow, package dry-run, and Git diff validation. CI
invokes the same gate used by a
release tag so the public package is not validated through a weaker path.
CI runs the complete gate on Node.js 24 and 26 to verify the minimum supported
major version and the newer LTS runtime.

### Release Automation

The release workflow starts only from a published, non-prerelease GitHub
Release after immutable releases have been enabled for the repository. A
read-only gate job uses workflow-owned code to read the specific Release through
GitHub's API before any tag checkout, protected environment, or OIDC permission
is available. The gate fails unless the Release tag matches and immutable
protection is active. A dependent publish job then enters the protected `npm`
environment, checks out the annotated tag, proves that the tag, commit, and
stable package version agree, repeats the Release check as defense in depth,
runs release-candidate verification, and publishes with provenance. A separate
`verify_publication` job depends on successful publication and checks out the
same exact tag with Node 24 and read-only repository permission. It needs no npm
credentials, protected environment, or dependency installation. The verifier
reads the exact version, latest tag, shasum, and integrity from the public
registry within a five-minute deadline, logging each attempt and bounding npm
requests by the remaining time. A failed verification can be rerun independently
without repeating a successful publication; recovery commands live in the
[release command](../.claude/commands/release.md#failure-semantics).
The fast-forward `main` push, repository setting changes, tag creation,
GitHub Release publication, and npm publication remain explicit operations
rather than local build effects.

## Data Lifecycles

| Data | Owner | Lifetime | Mutation path |
| --- | --- | --- | --- |
| Business-map documents | Target repository | Git history | Normal reviewed file edit |
| Parsed documents | One CLI invocation | Parse phase | Recreated from tracked files |
| Normalized map with relationships and flows | One CLI invocation | Query/render phase | Recreated after validation |
| Rendered output | Calling workflow | Reproducible artifact | Regenerated from the graph |
| Registered project paths | User home | Across Web sessions | Validated `project add` and atomic project-file replacement |
| Web project catalog | One local Web session | Server lifetime | Recreated from either registered or explicit paths |
| Current Web project model and SVG | Browser selection | Until the next selection | Loaded through one opaque server-assigned project ID |
| Bundled Skill payloads | Installed npm package | Package version | Replaced only by exact package installation |
| Managed user Skills | User home | Across repositories and CLI invocations | Per-Skill `semantic-atlas setup` atomic replacement |
| Managed Skill markers | Managed Skill directories | Same as each installed payload | Written into each staged copy before activation |
| Repository identity | One local repository across worktrees | Observation lookup | Re-derived from the Git common directory or selected directory |
| Task observation | User-local repository partition | Immutable retained evidence | Strict validation and one atomic file publication |
| Review observation | User-local repository partition | Immutable retained evidence | Existing task reference plus strict validation and atomic publication |
| Maintenance observation | User-local repository partition | Immutable retained evidence | Exact candidate validation after review and integration plus atomic publication |
| Accuracy summary | One CLI invocation | Read phase | Re-derived from retained task and review files |
| Reconciliation status | One CLI invocation | Read phase | Re-derived from retained task and maintenance files |
| Reconciliation candidate report | One CLI invocation | Read phase | Re-derived from retained candidate and review provenance |
| Packed npm candidate | One verified source revision | Release review | Rebuilt from the package allowlist |
| Public release identity | Annotated tag and immutable GitHub Release | Permanent remote history | Explicit release command after repository cutover and immutable-release enablement |
| Published npm package | Protected npm environment | Immutable registry version | GitHub Release workflow with provenance |
| Task-specific source understanding | Calling agent | Engineering task | Current evidence investigation |
| Candidate map observation | Business-changing task record | Until reconciled | Reviewed by post-integration or periodic maintenance |

Map commands remain stateless and branches naturally see the map revision
tracked with their own source. Observation writers coordinate only one
repository-partitioned observation ID while publishing its immutable file.

## Dependency Direction

```text
domain contracts
    ^
    |
application services
    ^
    |
filesystem, parser, CLI, and rendering adapters
```

Domain contracts contain concept kinds, relation and flow types, normalized map
objects, selectors, and query results. They do not import CLI, YAML, rendering,
filesystem, Git, or framework types.

Application services coordinate loading, validation, querying, and projection
through narrow ports. Adapters translate external representations at the
boundary.

## Command Model

The public flow contains repository commands and repository-independent package
lifecycle commands:

```text
semantic-atlas validate [--repo <path>]
semantic-atlas search <query> [--flows] [--repo <path>]
semantic-atlas flows [flow-id] [--repo <path>]
semantic-atlas context <id-or-term> [--repo <path>]
semantic-atlas render [--repo <path>] [--output <path>]
semantic-atlas project add [path]
semantic-atlas project list
semantic-atlas web [--repo <path...>] [--port <port>] [--no-open]
semantic-atlas setup
semantic-atlas upgrade
semantic-atlas observe task --stdin [--repo <path>]
semantic-atlas observe review --stdin [--repo <path>]
semantic-atlas observe maintenance --stdin [--repo <path>]
semantic-atlas insights summary [--repo <path>] [--period <duration>]
semantic-atlas reconcile status [--repo <path>]
semantic-atlas reconcile candidates [--repo <path>]
semantic-atlas --version
```

Map commands resolve and report the repository root and map-document set they
used. `project add` defaults to the current directory, validates the complete
map, and reports `added` or `already_exists`. Parameterless `web` reads the
registered list; `web --repo` uses only its explicit temporary paths. `web`
reports its loopback URL and repository count without exposing roots to the
browser. Observation commands report the derived repository identity, while
package lifecycle commands remain repository-independent. Machine output uses
a versioned envelope with a stable success or error discriminant.

`search --flows` 直接检索流程及其业务步骤，按流程去重返回命中步骤。`flows <id>`
只读取指定图及源码锚点，省略编号时才提供目录。

`validate`、`search`、`flows`、`context`、`render` 与 `web` 均支持
`--project <name-or-id>`，从登记目录解析目标，与当前工作目录无关；它与显式 `--repo`
互斥。两项均未提供时，地图命令仍使用当前目录，`web` 仍使用完整登记清单。

`search` returns at most five ranked nodes from every business-node kind. A
successful empty result means the map has no sufficiently related vocabulary;
it is not a repository failure. Each candidate includes `rank`, a `0–1`
query-relative `score`, stable identity, node kind, supplying document, and
`matchedFields`. Exact ID, name, or alias matches score `1`; ties use stable ID.

`context` returns ambiguity when multiple concepts match a compatibility
selector. Callers can then use a stable ID. A missing concept is a bounded map
result and routes the Agent to a bounded current-evidence business model; it is
not a repository failure. A successful result includes every flow related
through scenario containment or direct step concept references.

`setup`, `upgrade`, and `--version` do not discover a repository or load a
business map. Their results expose the package version and managed Skill paths
needed to verify one installed identity. Business repositories retain only
their Git-tracked map documents.

The three `observe` commands read one complete JSON object from standard input.
They derive a private repository identity, validate before publication, and
return recorded, idempotent, or explicit conflict results. Maintenance input
also verifies every candidate source and its business-domain ownership.
`insights summary` reads retained task and review files without changing them or
the business map. `reconcile status` reads only retained task and maintenance
files and returns whether any origin is actionable. `reconcile candidates`
derives actionable candidates and
unresolved waiting counts without changing observations, source, maps, rendered
artifacts, or Git state.

## Validation Boundary

Validation establishes that the tracked documents form a coherent graph. It
checks:

- supported schema version and strict document shape;
- repository-wide unique node IDs;
- valid concept and relation kinds;
- resolvable relation endpoints;
- at most one direct `part_of` parent per node;
- acyclic `part_of` containment;
- well-formed aliases and navigation anchors;
- unique scenario-owned flow identities and resolvable step references;
- valid action, decision, and outcome branch shape;
- reachability of every step from its flow entry while allowing cycles;
- deterministic normalization independent of input file order.

Validation does not claim that a path exists, a symbol still has the same name,
or a business relation or flow still matches current behavior. Those are
task-time investigation questions. A separate advisory diagnostic may report
obviously missing paths without changing graph validity.

## Error Semantics

Errors fall into stable categories:

- `MAP_DOCUMENT_INVALID`: one or more tracked documents cannot form a valid
  graph; the result includes document-local issues.
- `MAP_NOT_FOUND`: the selected repository has no configured map documents;
  the understanding Skill builds the smallest source-supported business model
  needed for the task and records the bounded outcome.
- `CONCEPT_NOT_FOUND`: no concept matches the requested selector; agents use
  bounded source discovery.
- `CONCEPT_AMBIGUOUS`: multiple concepts match; the result returns stable IDs
  for explicit selection.
- `OUTPUT_FAILED`: a requested render artifact cannot be written; the graph
  query result remains unaffected.
- `MANAGED_SKILL_CONFLICT`: an existing same-named user directory has no
  recognized Semantic Atlas management identity and remains unchanged.
- `SETUP_FAILED`: staging, fingerprinting, replacement, or recovery failed;
  the previous managed directory is restored or retained as the backup.
- `UPGRADE_FAILED`: the result identifies whether registry lookup, exact
  installation, package location, version verification, or delegated setup
  failed.
- `OBSERVATION_INPUT_INVALID`: the complete stdin document violates the
  versioned task or review contract and no observation is written.
- `TASK_OBSERVATION_NOT_FOUND`: a review references no task observation in the
  selected repository partition.
- `MAINTENANCE_CANDIDATE_INVALID`: a maintenance result references no exact
  candidate position in the selected repository or uses another business
  domain.
- `OBSERVATION_CONFLICT`: an immutable ID already belongs to different content.
- `OBSERVATION_STORAGE_FAILED`: atomic publication could not complete and no
  new final artifact is reported.
- `INSIGHTS_PERIOD_INVALID`: a requested duration does not use the supported
  positive `h`, `d`, or `w` form.
- `INSIGHTS_READ_FAILED`: retained observations cannot produce a trustworthy
  summary.
- `RECONCILIATION_READ_FAILED`: retained candidate and review evidence cannot
  produce a trustworthy reconciliation report.
- `PROJECT_CONFIG_INVALID`: the user-local project file violates its versioned
  shape, normalized absolute-path rule, or uniqueness rule and remains unchanged.
- `PROJECT_CONFIG_STORAGE_FAILED`: the project file cannot be read or atomically
  replaced; the previous complete file remains authoritative.
- `PROJECT_NOT_FOUND`：没有精确匹配的项目；`selector` 保留原输入，`candidates` 返回
  相近项目，找不到相近项时为空。
- `PROJECT_AMBIGUOUS`：多个登记路径具有相同名称；`candidates` 返回候选，使用 ID 重试。
- `WEB_START_FAILED`: the registered list cannot be read, the loopback port
  cannot bind, or the local Viewer cannot start.

A selected checkout that is missing or has an invalid map is a project-level
unavailable result, not `WEB_START_FAILED`. The HTTP response uses a safe
summary and never forwards a repository path or lower-level error message.

Unexpected infrastructure errors propagate to the CLI boundary with a safe
message and a nonzero exit status. The implementation adds contextual details
where they help a caller act, without converting failures into successful empty
results.

## Collaboration Model

Map files are divided by stable business domain. Cross-domain relations may be
declared by the file that owns the source concept and resolved only after all
documents load.

Ordinary feature branches read their branch's map revision. Durable changes use
normal Git merge behavior. Review focuses on business meaning, stable IDs,
relationship direction, labeled branch outcomes, and whether the update belongs
in the shared map.

业务行为变化时，同分支更新代码与受影响流程，使用正常 Git 差异、验证与审阅一起合入。
纯实现改动不强制改图。多个 Agent 的合并冲突依据最终代码重审业务含义，不机械拼接。
旧观察与候选工具仅用于明确请求的历史资料处理，不决定普通开发何时维护图。

统一的 semantic-atlas Skill 独立于任务编排器，根据业务任务选择直接定位、调查、实现
和同步流程的必要动作。编排器可以安排任务，但不添加固定从根图开始或等主干后维护的门槛。

## Current Technology Boundary

The implementation uses TypeScript ESM, Node.js 24 or later, and pnpm. The npm
engine declaration has no upper version bound. Mature libraries
provide YAML parsing, runtime schema validation, CLI parsing, and graph layout.
The exact packages are selected in the first implementation task from their
maintained APIs, footprint, and supported output needs.

Tracked files and the in-memory model satisfy map-query state. Immutable local
JSON files satisfy the separately approved observation lifecycle. The calling
agent's repository tools satisfy current source discovery. Structural indexes,
remote observation services, and alternate persistence engines require
real-task evidence and a separate product decision.

## Extension Seams

Future evidence may justify additional adapters without changing the current
domain model:

- alternate tracked serialization formats behind `MapDocumentLoader`;
- disposable performance caches behind a graph-loading boundary;
- additional deterministic projections behind `MapProjector`;
- editor integrations that write the same tracked document contract;
- advisory anchor diagnostics using language-aware tooling.

Each extension remains subordinate to the tracked map and current-source
confirmation workflow.
