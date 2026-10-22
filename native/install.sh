#!/usr/bin/env bash
# Builds and installs the widget host into ~/Applications, then launches it.
# Run this from Terminal (not from the app sandbox).
set -euo pipefail
cd "$(dirname "$0")"

./build.sh

DEST="$HOME/Applications"
mkdir -p "$DEST"
rm -rf "$DEST/Arena Watch Widgets.app"
ditto "dist/Arena Watch Widgets.app" "$DEST/Arena Watch Widgets.app"
open "$DEST/Arena Watch Widgets.app"

echo
echo "Installed: $DEST/Arena Watch Widgets.app"
echo "Now: 右键桌面 → 编辑小组件 → 搜索 Arena Watch"
