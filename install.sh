#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/agy-capsule"
DST_DIR="$HOME/.gemini/config/plugins/agy-capsule"

if [ ! -f "$SRC_DIR/plugin.json" ]; then
  echo "[错误] 未找到 $SRC_DIR/plugin.json，请在完整仓库目录中运行本脚本！"
  exit 1
fi

mkdir -p "$HOME/.gemini/config/plugins"
rm -rf "$DST_DIR"
cp -R "$SRC_DIR" "$DST_DIR"

echo "[成功] agy-capsule 已安装到: $DST_DIR"
echo "请重启 Antigravity 客户端以启用底部上下文与额度胶囊。"
