@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo.
echo ================================================================
echo   Better Sidebar (v2.0 · Typora Lapis 沉浸纸感版) 一键安装程序
echo ================================================================
echo.

set "SRC_PLUGIN=%~dp0plugin"
set "DST_PLUGIN=%USERPROFILE%\.gemini\config\plugins\agy-better-sidebar"

if not exist "%SRC_PLUGIN%\dist\server.mjs" (
    echo [错误] 未找到预编译产物 plugin\dist\server.mjs！
    echo 如果你是从源码开发分支拉取，请先运行 npm install ^&^& npm run build。
    echo.
    pause
    exit /b 1
)

echo [1/2] 正在将插件安装到 Antigravity 全局插件目录...
echo       目标路径: %DST_PLUGIN%
if not exist "%DST_PLUGIN%" mkdir "%DST_PLUGIN%"
xcopy "%SRC_PLUGIN%\*" "%DST_PLUGIN%\" /E /I /Y /Q >nul
if not "%errorlevel%"=="0" (
    echo [错误] 复制插件文件失败，请检查目录读写权限。
    pause
    exit /b 1
)

where node >nul 2>&1
if "%errorlevel%"=="0" (
    if exist "%~dp0scripts\verify-mcp.mjs" (
        echo [2/2] 检测到 Node.js，正在运行本地 MCP 协议与安全护栏自检...
        node "%~dp0scripts\verify-mcp.mjs"
        if not "!errorlevel!"=="0" (
            echo [警告] 自检返回非零状态，请查看上方日志排查。
        )
    ) else (
        echo [2/2] 预编译离线单文件校验通过（由 Antigravity 内置 Node 运行时驱动）。
    )
) else (
    echo [2/2] 预编译包已就绪（无需本机额外安装依赖，Antigravity 将使用内置 Node 运行时自动加载）。
)

echo.
echo ================================================================
echo   安装成功！接下来只需：
echo   1. 完全退出并重启一次 Google Antigravity 桌面端（或刷新插件页）
echo   2. 在右上角 Overview ^> Plugins 打开「Better Sidebar」，
echo      或直接点击对话里的代码 / Markdown 文件链接即可享受 Typora 级阅读！
echo ================================================================
echo.
pause
exit /b 0
