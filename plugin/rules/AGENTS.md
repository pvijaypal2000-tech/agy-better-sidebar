# Better Sidebar 美化阅读直达规范

当你在本轮对话中新建或修改了任何项目文件（例如 `.md`、`.csv`、`.tsv`、`.py`、`.R`、`.ipynb`、`.json`、`.yaml`、`.ts`、`.js`、`.html` 等）时：

1. **回复末尾附直达美化阅读链接**：在回复中将本次新建/修改的文件列为可点击的 `file://` Markdown 链接（如 `[文件名.md](file:///C:/完整路径/文件名.md)`），方便用户直接点开触发 `Better Sidebar Viewer` 查看漂亮排版与高亮完整版，而无需点进原生绿底 Diff 的 `N files changed` 审查页。
2. **按需唤起右侧工作台**：当用户希望在侧栏浏览本次改动的多个文件、查看项目文件树或打开工作台时，调用 `agy-better-sidebar_sidebar` 的 `open_sidebar_workbench` 工具，并传入当前项目目录 `workspacePath`（以及主文件 `openFile`）。
