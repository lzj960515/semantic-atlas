# [2026-11-19] revise | Node.js 运行版本兼容性

- 变更：将 npm 包的 Node.js 要求由 `>=24 <25` 改为 `>=24`，发布补丁版本 `2.8.1`；CI 在 Node.js 24 和 26 下执行完整发布候选检查。
- 原因：`2.8.0` 的版本上限使 Node.js 26.13.1 用户在全局安装时收到 `EBADENGINE` 告警；保留最低版本要求，移除缺少当前兼容性依据的上限。
- 证据：[包声明](../../package.json)、[CI](../../.github/workflows/ci.yml) 与 [Node.js 官方版本记录](https://nodejs.org/dist/index.json)；2026-11-19 核实 Node.js 26.13.1 已标记为 LTS。
- 涉及页面：[架构](../architecture.md#current-technology-boundary)、[英文安装说明](../../README.md#install)、[中文安装说明](../../README.zh-CN.md#安装)。
- 验证：Node.js 24.18.0 与 26.13.1 下的 `pnpm release:verify` 均完整通过，各通过 28 个测试文件、199 项测试，覆盖 lint、格式、契约、类型、构建、渲染、打包后匿名安装、CLI/Web、Skill 生命周期、包内容隐私与差异检查。在 Node.js 26.13.1/npm 11.20.0 下，以 `--engine-strict` 复现旧版 `2.8.0` 的 `EBADENGINE`，确认 `2.8.1` 包可以全局安装并运行，安装日志没有该告警。独立审查未发现方向、范围或实现阻塞。
