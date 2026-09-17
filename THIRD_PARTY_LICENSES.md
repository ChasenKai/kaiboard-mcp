# 第三方组件与许可

本仓以 **MIT** 许可发布（见 [`LICENSE`](LICENSE)）。下表列出所有第三方组件。

**本仓未 fork 任何上游项目**，因此不包含上游源码副本；以下组件均以 npm 依赖形式引用。

## 运行期依赖

| 组件 | 性质 | 许可 | 用途 |
|---|---|---|---|
| `@kaibuddy/kaiboard-core` | 本仓内工作区包 | MIT | 指令核心（不属第三方，列出以便对照） |
| `@excalidraw/excalidraw` | **可选** peerDependency | MIT | 元素类型与画布渲染（由宿主提供；纯 `--dir` 运行时可缺失） |
| `@excalidraw/mermaid-to-excalidraw` | **可选** peerDependency | MIT | `fromMermaid` 命令：Mermaid 源码转原生图元（缺失时该命令返回明确的「不支持」提示） |
| `mermaid` | 传递依赖（上述组件所需） | MIT | Mermaid 语法解析 |

> 两个 `@excalidraw/*` 均声明为 `peerDependencies` 且 `optional: true`：
> 由宿主（KaiBoard 应用或你的运行环境）在运行时提供。缺失时相关命令**优雅降级**并返回可读提示，不会导致服务端崩溃。

## 构建期依赖（不随包发布）

| 组件 | 许可 | 用途 |
|---|---|---|
| `typescript` | Apache-2.0 | 编译 `.ts` |
| `@types/node` | MIT | Node 类型定义 |

## 许可文本

各组件均在其自身 npm 包内附带完整许可文本（`LICENSE` / `LICENSE.txt`），
安装依赖后可在 `node_modules/<包名>/` 下查阅。

- **MIT** 许可全文：https://opensource.org/license/mit
- **Apache-2.0** 许可全文：https://www.apache.org/licenses/LICENSE-2.0

各组件版权归其各自作者所有。本项目的 MIT 许可不改变、也不替代这些条款。
