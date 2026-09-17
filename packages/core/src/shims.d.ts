// 动态 import 的 Excalidraw 依赖在 @kaibuddy/kaiboard-core 包内不强制安装
// （声明为 peerDependencies / optional，运行时由宿主 app 或 MCP 服务端注入）。
// 此处仅做类型占位，使 tsc 通过；真实模块解析发生在已安装 @excalidraw/* 的宿主环境。
declare module "@excalidraw/mermaid-to-excalidraw";
declare module "@excalidraw/excalidraw";
