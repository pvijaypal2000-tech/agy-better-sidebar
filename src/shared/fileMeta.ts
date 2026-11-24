import type { PreviewKind } from "./types";

export const CLAIMED_FILE_EXTENSIONS: string[] = [
  // Code
  ".py",
  ".pyw",
  ".r",
  ".rmd",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".less",
  ".java",
  ".kt",
  ".kts",
  ".go",
  ".rs",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".cxx",
  ".hpp",
  ".cs",
  ".php",
  ".rb",
  ".swift",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
  ".dockerfile",
  // Data & Config
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".csv",
  ".tsv",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".properties",
  ".gitignore",
  ".editorconfig",
  // Docs & Visuals
  ".md",
  ".mdx",
  ".markdown",
  ".mmd",
  ".mermaid",
  ".html",
  ".htm",
  ".svg",
  ".ipynb",
  ".txt",
  ".log",
];

export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".ico",
  ".avif",
]);

export interface FileMetaInfo {
  languageId: string;
  languageLabel: string;
  roleDescription: string;
  accentColor: string;
  badge: string;
  previewKind: PreviewKind;
}

const SPECIAL_FILENAME_ROLES: Record<string, Partial<FileMetaInfo>> = {
  "package.json": {
    roleDescription: "Node.js 项目清单（依赖包、启动与构建脚本）",
    accentColor: "#22C55E",
    badge: "PKG",
  },
  "tsconfig.json": {
    roleDescription: "TypeScript 类型检查与编译配置",
    accentColor: "#3178C6",
    badge: "TS",
  },
  "plugin.json": {
    roleDescription: "Antigravity 插件声明清单",
    accentColor: "#6366F1",
    badge: "PLG",
  },
  "mcp_config.json": {
    roleDescription: "MCP 工具服务启动配置",
    accentColor: "#8B5CF6",
    badge: "MCP",
  },
  "hooks.json": {
    roleDescription: "Antigravity 生命周期钩子配置",
    accentColor: "#F59E0B",
    badge: "HK",
  },
  "readme.md": {
    roleDescription: "项目说明文档与使用指南",
    accentColor: "#38BDF8",
    badge: "DOC",
  },
  "agents.md": {
    roleDescription: "AI 助手协作规范与规则文档",
    accentColor: "#A855F7",
    badge: "AI",
  },
  "skill.md": {
    roleDescription: "Antigravity 技能操作指南",
    accentColor: "#A855F7",
    badge: "SKL",
  },
  "requirements.txt": {
    roleDescription: "Python 依赖库清单",
    accentColor: "#3572A5",
    badge: "PIP",
  },
  "pyproject.toml": {
    roleDescription: "Python 项目配置与依赖声明",
    accentColor: "#3572A5",
    badge: "PY",
  },
  dockerfile: {
    languageId: "dockerfile",
    languageLabel: "Dockerfile",
    roleDescription: "容器镜像构建脚本",
    accentColor: "#2496ED",
    badge: "DKR",
  },
  makefile: {
    languageId: "shell",
    languageLabel: "Makefile",
    roleDescription: "自动化构建任务清单",
    accentColor: "#89E051",
    badge: "MK",
  },
};

const EXT_META: Record<string, FileMetaInfo> = {
  ".py": {
    languageId: "python",
    languageLabel: "Python",
    roleDescription: "Python 程序脚本",
    accentColor: "#3B82F6",
    badge: "PY",
    previewKind: "none",
  },
  ".pyw": {
    languageId: "python",
    languageLabel: "Python",
    roleDescription: "Python 桌面脚本",
    accentColor: "#3B82F6",
    badge: "PY",
    previewKind: "none",
  },
  ".r": {
    languageId: "r",
    languageLabel: "R",
    roleDescription: "R 语言统计与数据分析脚本",
    accentColor: "#276DC3",
    badge: "R",
    previewKind: "none",
  },
  ".rmd": {
    languageId: "markdown",
    languageLabel: "R Markdown",
    roleDescription: "R Markdown 科研分析报告",
    accentColor: "#276DC3",
    badge: "RMD",
    previewKind: "markdown",
  },
  ".ipynb": {
    languageId: "notebook",
    languageLabel: "Jupyter Notebook",
    roleDescription: "Jupyter 交互式实验笔记本",
    accentColor: "#F97316",
    badge: "NB",
    previewKind: "notebook",
  },
  ".ts": {
    languageId: "typescript",
    languageLabel: "TypeScript",
    roleDescription: "TypeScript 类型安全逻辑代码",
    accentColor: "#3178C6",
    badge: "TS",
    previewKind: "none",
  },
  ".mts": {
    languageId: "typescript",
    languageLabel: "TypeScript",
    roleDescription: "TypeScript ES 模块代码",
    accentColor: "#3178C6",
    badge: "TS",
    previewKind: "none",
  },
  ".cts": {
    languageId: "typescript",
    languageLabel: "TypeScript",
    roleDescription: "TypeScript CommonJS 模块代码",
    accentColor: "#3178C6",
    badge: "TS",
    previewKind: "none",
  },
  ".tsx": {
    languageId: "tsx",
    languageLabel: "TSX / React",
    roleDescription: "React + TypeScript 界面组件",
    accentColor: "#38BDF8",
    badge: "TSX",
    previewKind: "none",
  },
  ".js": {
    languageId: "javascript",
    languageLabel: "JavaScript",
    roleDescription: "JavaScript 脚本代码",
    accentColor: "#EAB308",
    badge: "JS",
    previewKind: "none",
  },
  ".mjs": {
    languageId: "javascript",
    languageLabel: "JavaScript",
    roleDescription: "JavaScript ES 模块代码",
    accentColor: "#EAB308",
    badge: "MJS",
    previewKind: "none",
  },
  ".cjs": {
    languageId: "javascript",
    languageLabel: "JavaScript",
    roleDescription: "JavaScript CommonJS 脚本",
    accentColor: "#EAB308",
    badge: "CJS",
    previewKind: "none",
  },
  ".jsx": {
    languageId: "jsx",
    languageLabel: "JSX / React",
    roleDescription: "React 界面组件",
    accentColor: "#38BDF8",
    badge: "JSX",
    previewKind: "none",
  },
  ".vue": {
    languageId: "vue",
    languageLabel: "Vue",
    roleDescription: "Vue 单文件界面组件",
    accentColor: "#41B883",
    badge: "VUE",
    previewKind: "none",
  },
  ".svelte": {
    languageId: "html",
    languageLabel: "Svelte",
    roleDescription: "Svelte 前端界面组件",
    accentColor: "#FF3E00",
    badge: "SVL",
    previewKind: "none",
  },
  ".html": {
    languageId: "html",
    languageLabel: "HTML",
    roleDescription: "网页结构与可视化页面",
    accentColor: "#F97316",
    badge: "HTML",
    previewKind: "html",
  },
  ".htm": {
    languageId: "html",
    languageLabel: "HTML",
    roleDescription: "网页结构与可视化页面",
    accentColor: "#F97316",
    badge: "HTML",
    previewKind: "html",
  },
  ".svg": {
    languageId: "xml",
    languageLabel: "SVG",
    roleDescription: "SVG 矢量图形文件",
    accentColor: "#F59E0B",
    badge: "SVG",
    previewKind: "svg",
  },
  ".css": {
    languageId: "css",
    languageLabel: "CSS",
    roleDescription: "界面视觉样式表",
    accentColor: "#A855F7",
    badge: "CSS",
    previewKind: "none",
  },
  ".scss": {
    languageId: "css",
    languageLabel: "SCSS",
    roleDescription: "SCSS 预处理样式表",
    accentColor: "#EC4899",
    badge: "SCSS",
    previewKind: "none",
  },
  ".less": {
    languageId: "css",
    languageLabel: "Less",
    roleDescription: "Less 预处理样式表",
    accentColor: "#6366F1",
    badge: "LESS",
    previewKind: "none",
  },
  ".md": {
    languageId: "markdown",
    languageLabel: "Markdown",
    roleDescription: "Markdown 富文本文档",
    accentColor: "#38BDF8",
    badge: "MD",
    previewKind: "markdown",
  },
  ".mdx": {
    languageId: "markdown",
    languageLabel: "MDX",
    roleDescription: "MDX 交互文档",
    accentColor: "#38BDF8",
    badge: "MDX",
    previewKind: "markdown",
  },
  ".markdown": {
    languageId: "markdown",
    languageLabel: "Markdown",
    roleDescription: "Markdown 富文本文档",
    accentColor: "#38BDF8",
    badge: "MD",
    previewKind: "markdown",
  },
  ".mmd": {
    languageId: "mermaid",
    languageLabel: "Mermaid",
    roleDescription: "Mermaid 流程图 / 架构图源码",
    accentColor: "#EC4899",
    badge: "MMD",
    previewKind: "mermaid",
  },
  ".mermaid": {
    languageId: "mermaid",
    languageLabel: "Mermaid",
    roleDescription: "Mermaid 流程图 / 架构图源码",
    accentColor: "#EC4899",
    badge: "MMD",
    previewKind: "mermaid",
  },
  ".json": {
    languageId: "json",
    languageLabel: "JSON",
    roleDescription: "JSON 结构化数据 / 配置",
    accentColor: "#EAB308",
    badge: "JSON",
    previewKind: "json",
  },
  ".jsonc": {
    languageId: "json",
    languageLabel: "JSONC",
    roleDescription: "带注释的 JSON 配置文件",
    accentColor: "#EAB308",
    badge: "JSON",
    previewKind: "json",
  },
  ".yaml": {
    languageId: "yaml",
    languageLabel: "YAML",
    roleDescription: "YAML 层次化配置文件",
    accentColor: "#F43F5E",
    badge: "YML",
    previewKind: "yaml",
  },
  ".yml": {
    languageId: "yaml",
    languageLabel: "YAML",
    roleDescription: "YAML 层次化配置文件",
    accentColor: "#F43F5E",
    badge: "YML",
    previewKind: "yaml",
  },
  ".toml": {
    languageId: "toml",
    languageLabel: "TOML",
    roleDescription: "TOML 项目配置文件",
    accentColor: "#94A3B8",
    badge: "TOML",
    previewKind: "toml",
  },
  ".xml": {
    languageId: "xml",
    languageLabel: "XML",
    roleDescription: "XML 结构化标记文档",
    accentColor: "#FB923C",
    badge: "XML",
    previewKind: "none",
  },
  ".csv": {
    languageId: "csv",
    languageLabel: "CSV",
    roleDescription: "CSV 表格数据集（支持筛选与排序）",
    accentColor: "#22C55E",
    badge: "CSV",
    previewKind: "csv",
  },
  ".tsv": {
    languageId: "csv",
    languageLabel: "TSV",
    roleDescription: "TSV 制表符分隔数据表",
    accentColor: "#22C55E",
    badge: "TSV",
    previewKind: "csv",
  },
  ".sql": {
    languageId: "sql",
    languageLabel: "SQL",
    roleDescription: "SQL 数据库查询 / 建表脚本",
    accentColor: "#F59E0B",
    badge: "SQL",
    previewKind: "none",
  },
  ".sh": {
    languageId: "shell",
    languageLabel: "Shell",
    roleDescription: "Shell 终端脚本",
    accentColor: "#22C55E",
    badge: "SH",
    previewKind: "none",
  },
  ".bash": {
    languageId: "shell",
    languageLabel: "Bash",
    roleDescription: "Bash 终端脚本",
    accentColor: "#22C55E",
    badge: "SH",
    previewKind: "none",
  },
  ".zsh": {
    languageId: "shell",
    languageLabel: "Zsh",
    roleDescription: "Zsh 终端脚本",
    accentColor: "#22C55E",
    badge: "SH",
    previewKind: "none",
  },
  ".ps1": {
    languageId: "powershell",
    languageLabel: "PowerShell",
    roleDescription: "Windows PowerShell 自动化脚本",
    accentColor: "#3B82F6",
    badge: "PS1",
    previewKind: "none",
  },
  ".bat": {
    languageId: "shell",
    languageLabel: "Batch",
    roleDescription: "Windows 批处理脚本",
    accentColor: "#64748B",
    badge: "BAT",
    previewKind: "none",
  },
  ".cmd": {
    languageId: "shell",
    languageLabel: "Batch",
    roleDescription: "Windows 命令脚本",
    accentColor: "#64748B",
    badge: "CMD",
    previewKind: "none",
  },
  ".java": {
    languageId: "java",
    languageLabel: "Java",
    roleDescription: "Java 面向对象源码",
    accentColor: "#EF4444",
    badge: "JAVA",
    previewKind: "none",
  },
  ".kt": {
    languageId: "java",
    languageLabel: "Kotlin",
    roleDescription: "Kotlin 源码",
    accentColor: "#8B5CF6",
    badge: "KT",
    previewKind: "none",
  },
  ".go": {
    languageId: "go",
    languageLabel: "Go",
    roleDescription: "Go 后端/系统程序代码",
    accentColor: "#06B6D4",
    badge: "GO",
    previewKind: "none",
  },
  ".rs": {
    languageId: "rust",
    languageLabel: "Rust",
    roleDescription: "Rust 系统级源码",
    accentColor: "#EA580C",
    badge: "RS",
    previewKind: "none",
  },
  ".c": {
    languageId: "cpp",
    languageLabel: "C",
    roleDescription: "C 语言源码",
    accentColor: "#60A5FA",
    badge: "C",
    previewKind: "none",
  },
  ".h": {
    languageId: "cpp",
    languageLabel: "C/C++ Header",
    roleDescription: "C/C++ 头文件声明",
    accentColor: "#818CF8",
    badge: "H",
    previewKind: "none",
  },
  ".cpp": {
    languageId: "cpp",
    languageLabel: "C++",
    roleDescription: "C++ 源码",
    accentColor: "#3B82F6",
    badge: "C++",
    previewKind: "none",
  },
  ".cc": {
    languageId: "cpp",
    languageLabel: "C++",
    roleDescription: "C++ 源码",
    accentColor: "#3B82F6",
    badge: "C++",
    previewKind: "none",
  },
  ".cxx": {
    languageId: "cpp",
    languageLabel: "C++",
    roleDescription: "C++ 源码",
    accentColor: "#3B82F6",
    badge: "C++",
    previewKind: "none",
  },
  ".hpp": {
    languageId: "cpp",
    languageLabel: "C++ Header",
    roleDescription: "C++ 头文件声明",
    accentColor: "#818CF8",
    badge: "HPP",
    previewKind: "none",
  },
  ".cs": {
    languageId: "java",
    languageLabel: "C#",
    roleDescription: "C# 源码",
    accentColor: "#22C55E",
    badge: "C#",
    previewKind: "none",
  },
  ".php": {
    languageId: "php",
    languageLabel: "PHP",
    roleDescription: "PHP 服务端脚本",
    accentColor: "#818CF8",
    badge: "PHP",
    previewKind: "none",
  },
  ".rb": {
    languageId: "ruby",
    languageLabel: "Ruby",
    roleDescription: "Ruby 脚本代码",
    accentColor: "#EF4444",
    badge: "RB",
    previewKind: "none",
  },
  ".swift": {
    languageId: "swift",
    languageLabel: "Swift",
    roleDescription: "Swift 源码",
    accentColor: "#F97316",
    badge: "SWF",
    previewKind: "none",
  },
  ".ini": {
    languageId: "ini",
    languageLabel: "INI",
    roleDescription: "键值对配置文件",
    accentColor: "#94A3B8",
    badge: "INI",
    previewKind: "none",
  },
  ".cfg": {
    languageId: "ini",
    languageLabel: "Config",
    roleDescription: "应用配置文件",
    accentColor: "#94A3B8",
    badge: "CFG",
    previewKind: "none",
  },
  ".conf": {
    languageId: "ini",
    languageLabel: "Config",
    roleDescription: "服务配置文件",
    accentColor: "#94A3B8",
    badge: "CNF",
    previewKind: "none",
  },
  ".env": {
    languageId: "ini",
    languageLabel: "ENV",
    roleDescription: "环境变量配置",
    accentColor: "#FACC15",
    badge: "ENV",
    previewKind: "none",
  },
  ".properties": {
    languageId: "ini",
    languageLabel: "Properties",
    roleDescription: "属性配置文件",
    accentColor: "#94A3B8",
    badge: "PRP",
    previewKind: "none",
  },
  ".gitignore": {
    languageId: "ini",
    languageLabel: "Git Ignore",
    roleDescription: "Git 忽略规则清单",
    accentColor: "#F97316",
    badge: "GIT",
    previewKind: "none",
  },
  ".txt": {
    languageId: "plaintext",
    languageLabel: "Plain Text",
    roleDescription: "纯文本文档",
    accentColor: "#94A3B8",
    badge: "TXT",
    previewKind: "none",
  },
  ".log": {
    languageId: "plaintext",
    languageLabel: "Log",
    roleDescription: "运行日志文件",
    accentColor: "#94A3B8",
    badge: "LOG",
    previewKind: "none",
  },
};

export function getExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const lower = base.toLowerCase();
  if (lower === ".gitignore" || lower === ".env" || lower === ".editorconfig") {
    return lower;
  }
  const idx = lower.lastIndexOf(".");
  if (idx <= 0) return "";
  return lower.slice(idx);
}

export function getFileMeta(filename: string): FileMetaInfo {
  const base = (filename.split(/[\\/]/).pop() ?? filename).toLowerCase();
  const ext = getExtension(base);

  if (IMAGE_EXTENSIONS.has(ext)) {
    return {
      languageId: "image",
      languageLabel: ext.slice(1).toUpperCase() + " Image",
      roleDescription: "图像素材预览",
      accentColor: "#EC4899",
      badge: "IMG",
      previewKind: "image",
    };
  }

  const baseInfo: FileMetaInfo = EXT_META[ext] ?? {
    languageId: "plaintext",
    languageLabel: ext ? ext.slice(1).toUpperCase() : "Text",
    roleDescription: "项目文本文件",
    accentColor: "#94A3B8",
    badge: ext ? ext.slice(1, 4).toUpperCase() : "TXT",
    previewKind: "none",
  };

  const special = SPECIAL_FILENAME_ROLES[base];
  if (special) {
    return { ...baseInfo, ...special };
  }
  return baseInfo;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function defaultViewModeFor(previewKind: PreviewKind): "code" | "preview" | "split" {
  switch (previewKind) {
    case "markdown":
    case "mermaid":
    case "notebook":
    case "csv":
    case "image":
    case "svg":
    case "html":
      return "preview";
    case "json":
    case "yaml":
    case "toml":
    case "none":
    default:
      return "code";
  }
}
