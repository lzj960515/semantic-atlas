# [2026-11-20] revise | 安装升级自动接入统一 Skill

- 变更：全局安装自动调用已安装包的 `setup`，升级继续由新版 CLI 同步唯一 Skill。识别本产品的旧标记与准确 Skill 名称，更新主 Skill，移除 Agents、Codex、Claude 发现目录中的旧维护入口和过期副本；Codex、Claude 共享 Agents 中的唯一源。其他 Skill 保留。
- 原因：同事安装或升级产品后应直接获得当前用法，无需手动清理旧阅读、维护 Skill，也无需分别维护多个副本。项目依赖安装不修改用户级发现目录。
- 依据：[安装实现](../../src/setup/managed-skill-installer.ts)、[全局安装入口](../../scripts/postinstall.mjs)、[升级实现](../../src/setup/package-upgrader.ts)。真实 npm 12 安装默认拦截安装脚本，因此公开命令仅允许本包脚本；本地 tarball 验证按文件来源许可，不修改用户全局 npm 配置。
- 受影响页面：[README](../../README.md)、[中文 README](../../README.zh-CN.md)、[产品契约](../product-contract.md)、[架构](../architecture.md)。PR 模板同步已生效的同分支流程维护约定，移除独立候选维护要求。
- 验证：完整 `pnpm release:verify` 通过，含162项检查、类型检查、构建、渲染、Skill、打包内容与隐私检查；隔离 HOME 与全局 prefix 的真实打包安装验证自动安装、旧维护入口清理、共享链接及其他 Skill 保留；Claude 整个发现目录已链接到 Agents 的场景回归通过。独立代码审查通过。公开发布和 registry 安装结果在交付时分别核实。
