// @kaibuddy/kaiboard-core —— 存储无关的 Agent 指令核心类型。
// 不依赖 window / DOM / postMessage；所有存储与渲染都经 StorageAdapter 注入。
//
// BoardData / FileNode 在包内自包含定义（与 app 仓 src/db.ts 的数据形状保持一致），
// 使本包完全存储无关、零外部类型依赖。App 的 db.ts 与 MCP 的 fsStore 都须产出兼容形状。

export interface FileNode {
  id: string;
  type: "folder" | "board";
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  /** 同层排序权重，越小越靠前；拖拽/移动时更新 */
  order?: number;
  /** 软删除时间戳；空 = 未删除（在回收站中可还原） */
  deletedAt?: number | null;
  /** 画板级元数据 */
  status?: string; // 如 draft / review / done
  version?: number; // 自增版本号
  history?: Array<{ ts: number; version: number; note?: string }>; // 版本历史
  comments?: any[]; // 批注 / 回环评论
}

/** 画板级元数据包（setMetadata 命令 / StorageAdapter 元数据方法的统一契约）。 */
export interface KbMeta {
  status?: string; // 如 draft / review / done
  version?: number; // 自增版本号
  history?: Array<{ ts: number; version: number; note?: string }>; // 整段替换（调用方自管历史数组）
  comments?: any[]; // 整段替换
}

export interface BoardData {
  id: string;
  elements: any[];
  appState: any;
  files: any;
}

export type AgentCmd =
  | "getBoard"
  | "addElement"
  | "replaceBoard"
  | "getScreenshot"
  | "patchElement"
  | "deleteElement"
  | "listBoards"
  | "createBoard"
  | "deleteBoard"
  | "fromMermaid"
  | "setMetadata";

/** 源随图走：随图携带的「生成来源」。 */
export interface KbSource {
  kind?: string;
  text?: string;
  [k: string]: any;
}

/** Core 指令体（传输层负责校验 type/token 后传入）。 */
export interface AgentCommand {
  cmd: AgentCmd;
  /** 寻址：目标画板 id；缺省 = 当前打开画板 */
  boardId?: string;
  /** addElement / replaceBoard：元素（数组或单个） */
  elements?: any[] | any;
  /** patchElement：[{ id, ...要合并的属性 }] */
  patches?: any[] | any;
  /** deleteElement：要删除的元素 id（数组或单个） */
  ids?: string[] | string;
  /** createBoard：新画板名 / 目标父文件夹 */
  name?: string;
  parentId?: string | null;
  /** fromMermaid：mermaid 源码 */
  mermaid?: string;
  /** setMetadata：画板级元数据包 */
  metadata?: KbMeta;
  /** 源随图走 */
  source?: KbSource | string;
  /** getScreenshot / fromMermaid 选项 */
  opts?: {
    maxWidthOrHeight?: number;
    background?: boolean;
    darkMode?: boolean;
    /** fromMermaid：整板替换而非追加 */
    replace?: boolean;
    fontSize?: number;
    /**
     * addElement / fromMermaid：跳过「自动下移到已有内容下方」（#41）。
     * 用途 = 同一张图内补/改元素时需要**精确落位**——否则新元素会被推到已有内容底边之下，
     * 落到卡片框外面（实测补 1 条要点 → 跑到卡片右下角）。
     * 默认 false，保持既有行为，完全向下兼容。
     * **逐命令生效**：每次调用按当前意图单独决定（策略规则见 Skill ）。
     */
    noOffset?: boolean;
  };
}

export interface Snapshot {
  boardId: string;
  ts: number;
  elements: any[];
}

/**
 * 存储适配器：把「实时画布 + idb/fs/dir 存储 + 设置 + 截图渲染」统一抽象。
 * 应用桥（agentBridge）与 MCP 服务端各自实现本接口，Core 逻辑完全复用。
 */
export interface StorageAdapter {
  /** 当前打开画板 id（live 模式）；无则为 undefined */
  currentBoardId: string | undefined;
  /** 读取目标画板元素（target 缺省 = 当前） */
  readElements(target?: string): Promise<any[]>;
  /** 读取目标画板完整元数据（截图用：元素 + 文件 + 状态） */
  readMeta(target?: string): Promise<{ elements: any[]; files: any; appState: any }>;
  /** 写回目标画板元素 */
  writeElements(target: string | undefined, elements: any[]): Promise<void>;
  /** 文件树（文件夹 + 画板） */
  listBoards(): Promise<FileNode[]>;
  getNode(id: string): Promise<FileNode | undefined>;
  putNode(node: FileNode): Promise<void>;
  /** createBoard：写入画板初始数据 */
  putBoardData(id: string, data: BoardData): Promise<void>;
  /**
   * deleteBoard：软删除节点（进回收站，可还原）及其全部子孙。
   * 可选实现——只有能操作文件树的后端（relay/页面 IndexedDB）才有；
   * --dir fs 模式不实现 → deleteBoard 命令返回 unsupported。
   */
  trashNode?(id: string): Promise<void>;
  getMaxOrder(parentId: string | null): Promise<number>;
  getSetting<T>(key: string, fallback: T): Promise<T>;
  setSetting(key: string, value: any): Promise<void>;
  /** 截图渲染（可选）：app 注入 exportToBlob+FileReader；MCP --dir 不注入 → 标记不支持 */
  renderPng?(elements: any[], files: any, appState: any, opts: any): Promise<{ dataUrl: string; bytes: number }>;
  /** 画板级元数据（可选）：仅 --dir fs 模式实现；relay/bridge 模式不实现 → setMetadata 命令返回 unsupported */
  getMetadata?(boardId: string): Promise<KbMeta | null>;
  setMetadata?(boardId: string, partial: KbMeta): Promise<boolean>;
}
