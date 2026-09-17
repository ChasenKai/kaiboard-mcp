# Third-party components and licenses / 第三方组件与许可

本仓以 **MIT** 许可发布（见 [`LICENSE`](./LICENSE)）。下表列出所有第三方组件。
This project is released under the **MIT** license (see [`LICENSE`](./LICENSE)). All third-party components are listed below.

**本仓未 fork 任何上游项目**，因此不包含上游源码副本；以下组件均以 npm 依赖形式引用。
**No upstream project is forked**, so no upstream source is vendored; every component below is used as an ordinary npm dependency.

## Runtime dependencies / 运行期依赖

| Component | Kind / 性质 | License | Purpose / 用途 |
|---|---|---|---|
| `@kaibuddy/kaiboard-core` | workspace package of this repo（本仓工作区包） | MIT | command core（指令核心；列出以便对照，非第三方） |
| `@excalidraw/excalidraw` | **optional** peerDependency（可选 peer 依赖） | MIT | element types and canvas rendering, provided by the host（元素类型与画布渲染，由宿主提供） |
| `@excalidraw/mermaid-to-excalidraw` | **optional** peerDependency（可选 peer 依赖） | MIT | `fromMermaid`: Mermaid source → native elements（缺失时该命令返回明确的「不支持」提示） |
| `mermaid` | transitive dependency（传递依赖） | MIT | Mermaid syntax parsing（Mermaid 语法解析） |

> Both `@excalidraw/*` packages are declared as `peerDependencies` with `optional: true`: the host
> (the KaiBoard app or your own runtime) supplies them at run time. When absent, the related commands
> **degrade gracefully** with a readable hint instead of crashing the server.
> 两个 `@excalidraw/*` 均声明为 `peerDependencies` 且 `optional: true`，由宿主在运行时提供；
> 缺失时相关命令**优雅降级**并返回可读提示，不会导致服务端崩溃。

## Build-time dependencies (not shipped) / 构建期依赖（不随包发布）

| Component | License | Purpose / 用途 |
|---|---|---|
| `typescript` | Apache-2.0 | compile `.ts`（编译 TypeScript） |
| `@types/node` | MIT | Node type definitions（Node 类型定义） |

## License texts / 许可文本

各组件均在其自身 npm 包内附带完整许可文本（`LICENSE` / `LICENSE.txt`），安装依赖后可在
`node_modules/<包名>/` 下查阅。Each component ships its full license text inside its own npm
package (`LICENSE` / `LICENSE.txt`); after installing dependencies you can find it under `node_modules/<package>/`.

- **MIT** full text / 全文：https://opensource.org/license/mit
- **Apache-2.0** full text / 全文：https://www.apache.org/licenses/LICENSE-2.0

各组件版权归其各自作者所有。本项目的 MIT 许可不改变、也不替代这些条款。
Copyright in each component belongs to its respective authors. This project's MIT license neither
changes nor replaces those terms.
