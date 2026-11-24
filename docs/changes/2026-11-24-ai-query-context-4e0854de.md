# [2026-11-24] revise | AI 查询上下文与按需读取

- 变更与原因：保留 YAML 和现有持久业务模型，在查询投影与统一 Skill 中明确首次定位
  所需的信息：当前维护位置、唯一概念详情、代码入口、带业务原因的关系和相关图的步骤
  引用。搜索最多保留五个候选，只附第一候选的局部摘要，并用 `contextFor` 明示所属，
  避免不同候选的邻域混在一起。完整流程在指定 ID 后展开，概念与父／子流程以 ID
  引用；删除 `context` 返回完整相关流程、步骤内重复概念对象的旧说明。
- 边界：关联摘要覆盖显式直接关系及共享数据、接口、规则的其他已记录使用方，
  `scope: "recorded"` 不等于当前变更的完整影响。位置从本次 YAML AST 派生，符号
  继续保留文件与声明提示，路径缺失可识别，代码行号由 AI 使用仓库工具核实。跨项目
  线索保持调查入口，跨仓关系模型属于独立范围。
- 证据：2026-11-24 的 5.0.0 源码中的
  [查询契约](../../src/contracts/query-context.ts)、
  [局部关系投影](../../src/query/context-query-service.ts)、
  [YAML 与锚点定位](../../src/query/query-source-locator.ts)、
  [应用编排](../../src/application/map-application.ts)和
  [CLI 序列化](../../src/cli/run-cli.ts)。
- 影响页面：[统一 Skill](../../.agents/skills/semantic-atlas/SKILL.md)、
  [编写参考](../../.agents/skills/semantic-atlas/references/map-authoring.md)、
  [产品契约](../product-contract.md#ai-查询与按需读取)、
  [架构](../architecture.md#querysourcelocator)、
  [格式与查询字段](../map-format.md#context-projection)、
  [查询验收](../evaluation.md#ai-查询验收)、
  [README](../../README.md#query-and-render)和
  [中文 README](../../README.zh-CN.md#查询与渲染)。
- 验证：逐项核对上述源码与完整文档差异；Skill `quick_validate.py` 通过，含本记录的
  九份文档共 65 个本地链接及其标题锚点检查通过，`git diff --check` 通过。完整候选的
  `release:verify` 已通过，包含 173 项测试及构建、渲染、打包和安装后产品验证。
  一次新上下文真实业务调查中，AI 自行查询并核实源码，在较宽的第一候选与更贴合
  问题的后续细图间选对入口，识别既有复用与有条件的关联图维护范围；未记录的关系
  仍从源码补齐。脱敏结果与限制见[查询验收](../evaluation.md#ai-查询验收)。这次是
  调查任务，没有实施业务修改，不证明实际图更新效果或长期收益。本变更纳入 5.0.0，
  以主版本标明查询 JSON 字段变化；YAML 文件无需迁移。安装、提交与公开发布状态
  分别由 Git、GitHub Release、npm 和本机升级结果核验。
  独立只读代码审查已批准，并复现了业务文件位置、关联原因和相关图引用；未发现阻塞问题。
