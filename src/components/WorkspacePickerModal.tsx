import React, { useEffect, useState } from "react";
import {
  ArrowUp,
  Check,
  Folder,
  FolderOpen,
  HardDrive,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import type { BrowseDirResult, SuggestedWorkspace } from "../shared/types";

interface WorkspacePickerModalProps {
  currentWorkspace: string;
  pinnedWorkspaces: string[];
  suggestedWorkspaces: SuggestedWorkspace[];
  onBrowse: (dirPath?: string) => Promise<BrowseDirResult>;
  onSelectWorkspace: (path: string) => void;
  onTogglePin: (path: string) => void;
  onClose: () => void;
}

export const WorkspacePickerModal: React.FC<WorkspacePickerModalProps> = ({
  currentWorkspace,
  pinnedWorkspaces,
  suggestedWorkspaces,
  onBrowse,
  onSelectWorkspace,
  onTogglePin,
  onClose,
}) => {
  const [browseData, setBrowseData] = useState<BrowseDirResult | null>(null);
  const [pathInput, setPathInput] = useState(currentWorkspace);
  const [loading, setLoading] = useState(false);

  const loadDir = async (dir?: string) => {
    setLoading(true);
    try {
      const res = await onBrowse(dir);
      setBrowseData(res);
      if (res.currentPath !== "__drives__") {
        setPathInput(res.currentPath);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDir(currentWorkspace || undefined);
  }, []);

  const isPinned = (p: string) =>
    pinnedWorkspaces.some((x) => x.toLowerCase() === p.toLowerCase());

  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pathInput.trim();
    if (cleaned) {
      onSelectWorkspace(cleaned);
      onClose();
    }
  };

  return (
    <div className="ide-modal-overlay" onClick={onClose}>
      <div className="ide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ide-panel-header" style={{ padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <FolderOpen size={16} style={{ color: "var(--ide-accent)" }} />
            <span>切换项目目录</span>
          </div>
          <button className="ide-icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {/* Direct path entry */}
        <form
          onSubmit={handleDirectSubmit}
          style={{
            display: "flex",
            gap: 6,
            padding: "9px 14px",
            borderBottom: "1px solid var(--ide-border-subtle)",
            background: "var(--ide-bg-sidebar)",
          }}
        >
          <input
            className="ide-search-input"
            style={{
              background: "var(--ide-bg)",
              border: "1px solid var(--ide-border)",
              borderRadius: 7,
              padding: "5px 9px",
              fontFamily: "var(--ide-font-mono)",
              fontSize: 12,
            }}
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="输入或粘贴本地项目完整路径，如 D:\MyProject"
          />
          <button type="submit" className="ide-ai-btn primary">
            <Check size={13} />
            <span>打开此目录</span>
          </button>
        </form>

        {/* Quick Places */}
        <div
          style={{
            padding: "8px 14px",
            borderBottom: "1px solid var(--ide-border-subtle)",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {suggestedWorkspaces.slice(0, 8).map((ws) => (
            <button
              key={ws.path}
              className="ide-ai-btn"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => {
                onSelectWorkspace(ws.path);
                onClose();
              }}
              title={ws.path}
            >
              {ws.kind === "pinned" && <Pin size={10} style={{ color: "#f59e0b" }} />}
              <span>{ws.label}</span>
            </button>
          ))}
        </div>

        {/* Interactive Local Browser */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 14px",
            fontSize: 11.5,
            color: "var(--ide-text-muted)",
            borderBottom: "1px solid var(--ide-border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {browseData?.parentPath && (
              <button
                className="ide-icon-btn"
                onClick={() => void loadDir(browseData.parentPath!)}
                title="返回上级目录"
              >
                <ArrowUp size={13} />
              </button>
            )}
            <span
              style={{
                fontFamily: "var(--ide-font-mono)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {browseData?.currentPath === "__drives__"
                ? "此电脑（选择磁盘）"
                : browseData?.currentPath ?? "..."}
            </span>
          </div>

          {browseData && browseData.currentPath !== "__drives__" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <button
                className="ide-icon-btn"
                onClick={() => onTogglePin(browseData.currentPath)}
                title={isPinned(browseData.currentPath) ? "取消收藏" : "收藏此目录"}
              >
                {isPinned(browseData.currentPath) ? (
                  <PinOff size={13} style={{ color: "#f59e0b" }} />
                ) : (
                  <Pin size={13} />
                )}
              </button>
              <button
                className="ide-ai-btn primary"
                style={{ padding: "3px 9px" }}
                onClick={() => {
                  onSelectWorkspace(browseData.currentPath);
                  onClose();
                }}
              >
                选定当前目录
              </button>
            </div>
          )}
        </div>

        <div className="ide-tree-scroll" style={{ padding: "6px 10px" }}>
          {loading ? (
            <div style={{ padding: 14, color: "var(--ide-text-faint)" }}>读取目录中...</div>
          ) : (
            (browseData?.entries ?? []).map((entry) => (
              <div
                key={entry.path}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <button
                  className="ide-tree-row"
                  onClick={() => void loadDir(entry.path)}
                  onDoubleClick={() => {
                    onSelectWorkspace(entry.path);
                    onClose();
                  }}
                >
                  {entry.isDrive ? (
                    <HardDrive size={14} style={{ color: "var(--ide-accent)" }} />
                  ) : (
                    <Folder size={14} style={{ color: "#60a5fa" }} />
                  )}
                  <span className="ide-tree-label">{entry.name}</span>
                </button>
                <button
                  className="ide-ai-btn"
                  style={{ fontSize: 11, padding: "2px 7px", flexShrink: 0 }}
                  onClick={() => {
                    onSelectWorkspace(entry.path);
                    onClose();
                  }}
                >
                  打开
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
