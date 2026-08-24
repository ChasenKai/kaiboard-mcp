// @kaiboard/core —— Mermaid → 原生 Excalidraw 图元（纯逻辑，依赖经动态 import）
// 浏览器（app）与 Node（MCP --dir）共享；Node 下若无法加载 excalidraw，调用方应禁用本命令。

/**
 * 把 Mermaid 源码解析为可编辑的 Excalidraw 元素数组。
 * 解析失败时直接抛出，由 executor 捕获为 { ok:false, error }。
 */
export async function mermaidToElements(src: string, fontSize = 16): Promise<any[]> {
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }] = await Promise.all([
    import("@excalidraw/mermaid-to-excalidraw"),
    import("@excalidraw/excalidraw"),
  ]);
  const skeleton = await parseMermaidToExcalidraw(src, {
    themeVariables: { fontSize: `${fontSize}px` },
  });
  return convertToExcalidrawElements(skeleton.elements as any) as any[];
}
