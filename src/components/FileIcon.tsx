import React from "react";
import { Folder, FolderOpen } from "lucide-react";
import { getFileMeta } from "../shared/fileMeta";

interface FileIconProps {
  name: string;
  isDir?: boolean;
  isOpen?: boolean;
  size?: number;
}

export const FileIcon: React.FC<FileIconProps> = ({
  name,
  isDir = false,
  isOpen = false,
  size = 15,
}) => {
  if (isDir) {
    return isOpen ? (
      <FolderOpen size={size} style={{ color: "#38bdf8", flexShrink: 0 }} />
    ) : (
      <Folder size={size} style={{ color: "#60a5fa", flexShrink: 0 }} />
    );
  }

  const meta = getFileMeta(name);
  const label = meta.badge.slice(0, 3);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 22,
        height: 15,
        padding: "0 3px",
        borderRadius: 4,
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        fontFamily: "var(--ide-font-mono)",
        backgroundColor: `${meta.accentColor}22`,
        color: meta.accentColor,
        border: `1px solid ${meta.accentColor}44`,
        flexShrink: 0,
        lineHeight: 1,
      }}
      title={meta.languageLabel}
    >
      {label}
    </span>
  );
};
