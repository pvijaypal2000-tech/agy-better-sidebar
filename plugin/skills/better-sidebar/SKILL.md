---
name: better-sidebar
description: >-
  Open the Better Sidebar IDE workbench in the Antigravity side panel for the
  active project or a specific file when the user wants to browse files, inspect
  code visually, read structured outlines, or preview Markdown/CSV/JSON/HTML/Notebook files.
---

# Better Sidebar IDE Helper

When the user asks to open the Better Sidebar IDE workbench, browse the current project in a visual IDE tree, or inspect a specific file in the Better Sidebar pane:

1. Call `agy-better-sidebar_sidebar`'s `open_sidebar_workbench` tool.
2. Pass `workspacePath` as the active workspace root directory (if a workspace is active) and optionally `openFile` if the user named a specific file to inspect immediately.
3. Keep the text reply concise — the interactive workbench opens directly in the side panel beside the conversation.
