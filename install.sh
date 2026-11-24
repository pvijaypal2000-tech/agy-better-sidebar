#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_PLUGIN="${SCRIPT_DIR}/plugin"
DST_PLUGIN="${HOME}/.gemini/config/plugins/agy-better-sidebar"

echo ""
echo "================================================================"
echo "  Better Sidebar (v2.0 · Typora Lapis Edition) Installer"
echo "================================================================"
echo ""

if [[ ! -f "${SRC_PLUGIN}/dist/server.mjs" ]]; then
  echo "[Error] Missing prebuilt bundle ${SRC_PLUGIN}/dist/server.mjs."
  echo "Run 'npm install && npm run build' first if installing from an unbuilt branch."
  exit 1
fi

echo "[1/2] Installing plugin to ${DST_PLUGIN} ..."
mkdir -p "${DST_PLUGIN}"
cp -R "${SRC_PLUGIN}/." "${DST_PLUGIN}/"

if command -v node >/dev/null 2>&1 && [[ -f "${SCRIPT_DIR}/scripts/verify-mcp.mjs" ]]; then
  echo "[2/2] Running MCP protocol & security self-check..."
  node "${SCRIPT_DIR}/scripts/verify-mcp.mjs"
else
  echo "[2/2] Prebuilt bundle copied (Antigravity's bundled Node runtime will run it automatically)."
fi

echo ""
echo "✅ Installed successfully! Restart Google Antigravity (or refresh MCP servers) to enjoy Typora Lapis reading."
