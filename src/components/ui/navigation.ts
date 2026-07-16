export type AppView =
  | "home"
  | "input"
  | "character"
  | "lorebook"
  | "analysis"
  | "planning"
  | "prose"
  | "style-risk"
  | "continuity"
  | "visual"
  | "assistant"
  | "setting-change"
  | "asset-library"
  | "document-ingestion"
  | "import-export"
  | "settings";

export interface NavigationItem {
  id: AppView;
  label: string;
  title: string;
  subtitle: string;
  index: string;
}

export interface NavigationGroup {
  id: string;
  label: string;
  items: NavigationItem[];
  utility?: boolean;
}

const view = (
  id: AppView,
  label: string,
  subtitle: string,
  index: string,
): NavigationItem => ({ id, label, title: label, subtitle, index });

export const NAV_GROUPS: NavigationGroup[] = [
  {
    id: "overview",
    label: "项目",
    items: [view("home", "项目首页", "进度、最近工作与下一步", "01")],
  },
  {
    id: "create",
    label: "创作",
    items: [
      view("input", "创意输入", "整理原始想法与创作约束", "02"),
      view("character", "角色卡", "编辑人物设定与互动内容", "03"),
      view("lorebook", "世界书", "管理条目、激活规则与格式", "04"),
    ],
  },
  {
    id: "plan",
    label: "规划",
    items: [
      view("analysis", "剧情分析", "检查因果、人物与连续性", "05"),
      view("planning", "小说规划", "故事圣经、章节与场景", "06"),
    ],
  },
  {
    id: "write",
    label: "写作",
    items: [
      view("prose", "正文写作", "生成、修订与版本管理", "07"),
      view("style-risk", "AI 味诊断", "机械感、模板化与文风偏离风险", "08"),
    ],
  },
  {
    id: "maintain",
    label: "维护",
    items: [
      view("continuity", "连续性中心", "Canon、状态、伏笔与进度", "09"),
      view("visual", "可视化工作台", "关系、时间线、剧情线与节奏", "10"),
      view("assistant", "项目助手", "查询项目、来源与安全变更提案", "11"),
      view("setting-change", "设定变更", "影响分析、传播方案与 Retcon", "12"),
      view("asset-library", "素材与模板", "跨项目复用、版本与更新提案", "13"),
      view("document-ingestion", "作品导入与重建", "解析多种作品文件并安全重建项目", "14"),
    ],
  },
  {
    id: "utility",
    label: "项目工具",
    utility: true,
    items: [
      view("import-export", "导入导出", "格式转换与本地备份", "15"),
      view("settings", "设置", "项目、写作、界面与隐私", "16"),
    ],
  },
];

const VIEW_META = new Map(
  NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.id, item]),
);

export function getViewMeta(id: AppView): NavigationItem {
  return VIEW_META.get(id) ?? VIEW_META.get("home")!;
}
