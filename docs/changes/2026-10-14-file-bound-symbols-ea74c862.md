# [2026-10-14] revise | 文件与具体方法的代码引用

- 变更：为 `symbol` 锚点增加可选的仓库相对路径 `file`，查询保留文件与符号，Viewer 显示 `file#value`。工作 Skill 在指定文件内定位声明并核实当前实现，维护 Skill 为已有源码证据的业务动作优先记录具体方法或函数。既有锚点与地图版本继续兼容，候选包版本为 2.8.0。
- 原因：文件引用只能指出阅读范围；把业务动作绑定到具体声明，让 Agent 更直接找到需要核实的代码，同时由当前源码确定行号和真实行为。
- 依据：[锚点契约](../../src/contracts/map.ts)、[路径验证](../../src/map/map-validator.ts)、[Viewer 展示](../../src/rendering/viewer-browser.ts)、[公开查询回归](../../tests/cli/navigation-anchors.test.ts) 和 [安装后验证](../../tests/smoke/packaged-product.mjs)。实现沿用 Agent 的仓库工具完成源码定位。
- 受影响页面：[地图格式](../map-format.md#navigation-anchors)、[产品契约](../product-contract.md)、[架构](../architecture.md)、[中文入口](../../README.zh-CN.md)、[英文入口](../../README.md)、[工作 Skill](../../.agents/skills/semantic-atlas/SKILL.md)、[维护 Skill](../../.agents/skills/semantic-atlas-maintenance/SKILL.md) 与 [编写示例](../../.agents/skills/semantic-atlas-maintenance/references/map-authoring.md#navigation-anchors)。
- 验证：`pnpm release:verify` 通过，28 个测试文件、199 项测试通过，包含类型检查、构建、渲染、打包后匿名安装、公开 CLI/Web、Skill 生命周期、包内容检查和差异检查。真实浏览器点击业务节点后显示 `src/checkout/place-order.ts#placeOrder`。独立新上下文按候选 Skill 分析订单金额，先读取地图指出的金额计算文件，再在绑定文件内定位并阅读 `placeOrder`，发现当前计算实现与产品规则的矛盾。该次行为检查证明绑定可用于定向定位，尚不构成真实任务效果提升的比较证据。
