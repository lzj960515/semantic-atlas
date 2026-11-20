# [2026-11-20] revise | 修复 npm 12 版本查询导致升级提前退出

- 问题：4.1.0 发布后的本机真实升级在检查阶段失败。npm 12.2.1 的 `npm view semantic-atlas dist-tags.latest --json` 返回单项数组，原升级器仅接受字符串，尚未进入安装就退出。
- 修改：[升级器](../../src/setup/package-upgrader.ts)接受字符串或单项数组中的稳定版本，多个结果仍拒绝；继续安装该确切版本、验证身份并委派新版 `setup`。不修改 npm 全局配置，也不猜测多个结果中的目标。
- 来源：真实命令输出与[回归用例](../../tests/setup/package-upgrader.test.ts)。单项数组用例先复现检查阶段失败，再完成修复。
- 受影响页面：[README](../../README.md)、[中文 README](../../README.zh-CN.md)、[产品契约](../product-contract.md)。旧版本已在检查阶段退出时，可重新运行正常的全局安装命令更新。
- 验证：版本输出回归通过，完整 `pnpm release:verify` 通过（164项检查、构建、渲染、打包和隔离安装）；独立局部复审通过。正式发布、真实升级与用户级 Skill 同步分别核实。
