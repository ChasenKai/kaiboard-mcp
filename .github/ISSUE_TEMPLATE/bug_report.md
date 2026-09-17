---
name: Bug report
about: 报告一个可复现的问题 / Report a reproducible issue
title: "[Bug] "
labels: bug
assignees: ''
---

**描述 / Description**
简明描述你遇到的问题。
Briefly describe the problem you encountered.

**复现步骤 / Steps to reproduce**
1.
2.
3.

**期望行为 / Expected behavior**
应该发生什么。
What should happen.

**实际行为 / Actual behavior**
实际发生了什么（如有报错文本 / 截图请一并贴上）。
What actually happened (attach error text / screenshots if available).

**环境 / Environment**
- MCP 客户端 / MCP client（WorkBuddy / Claude Desktop / Cursor / 其他）:
- Node.js 版本 / Node.js version（`node -v`）:
- 本包版本 / This package's version（`npm ls -g @kaibuddy/kaiboard-mcp` 或 `npx -y @kaibuddy/kaiboard-mcp` 的输出）:
- 运行模式 / Mode: `--relay` / `--dir` / 两者叠加
- 操作系统 / OS:
- 如用 `--relay`：KaiBoard 页面是否打开且已启用「Agent 共绘」？
  If `--relay`: is the KaiBoard page open with "Agent co-draw" enabled?

**诊断输出 / Diagnostics**
请贴上 `kbfs_list_capabilities` 的返回结果（含 `storageModes` / `activeStorageMode` / `pageConnected` / `dirWarnings`），这可快速定位问题。
Please paste the result of `kbfs_list_capabilities` — it lets us pinpoint most issues quickly.
