## 变更说明 / What changed
简要描述本 PR 做了什么、为什么。
Briefly describe what this PR does and why.

## 关联 / Related
- 关闭 #（issue 编号） / Closes # (issue number)

## 检查清单 / Checklist
- [ ] 构建通过 / Build passes：`npm run build`
- [ ] 类型检查通过 / Typecheck passes：`npm run typecheck`
- [ ] 端到端通过 / E2E passes：`npm run e2e`（核心 + 文件后端 / 真实 stdio server）
- [ ] 真实 MCP 客户端冒烟通过 / Smoke passes：`npm run smoke`
- [ ] 如改了工具集 / 命令集，`docs/PROTOCOL.md` 的工具表与命令数已同步
  If the tool/command set changed, the tool table and command counts in `docs/PROTOCOL.md` are updated.
- [ ] 如引入新依赖，`package.json` 与 `package-lock.json` 已同步更新
  If new dependencies are introduced, `package.json` and `package-lock.json` are updated.
- [ ] 如改了包的 `name` / `version`，所有引用处已同步（含本仓 README、`docs/PROTOCOL.md`、KaiBoard 侧的安装指令）
  If the package `name` / `version` changed, all references are updated (this repo's README, `docs/PROTOCOL.md`, and KaiBoard's install snippet).
- [ ] 如涉及对外文案，无夸大表述、无内部代号
  If public-facing copy changed: no overstatement, no internal codenames.

## 备注 / Notes
设计决策、兼容性影响、后续计划等。
Design decisions, compatibility impact, follow-up plans, etc.
