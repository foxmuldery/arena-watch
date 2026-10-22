#!/usr/bin/env bash
# Builds the native WidgetKit host app.
#
#   ./build.sh                 # ad-hoc signature (local testing)
#   SIGN_IDENTITY="Developer ID Application: … (TEAMID)" ./build.sh
#
# The app is written to native/dist/Arena Watch Widgets.app.
set -euo pipefail
cd "$(dirname "$0")"

CONFIG="${CONFIG:-Release}"
ROOT="$(cd .. && pwd)"
XCODEGEN="${XCODEGEN:-$ROOT/../tools/xcodegen/bin/xcodegen}"
if [ ! -x "$XCODEGEN" ]; then
  XCODEGEN="$(command -v xcodegen || true)"
fi
if [ -z "$XCODEGEN" ]; then
  echo "xcodegen not found: put it in tools/xcodegen or install with 'brew install xcodegen'" >&2
  exit 1
fi

# App icon comes from the shared generated icon so both apps match.
if [ ! -f "$ROOT/build/icon.png" ]; then
  (cd "$ROOT" && npm run generate-icon)
fi
mkdir -p ArenaWatchWidgets/App/Resources
sips -s format icns "$ROOT/build/icon.png" --out ArenaWatchWidgets/App/Resources/AppIcon.icns >/dev/null

"$XCODEGEN" generate --spec project.yml --project . >/dev/null

xcodebuild \
  -project ArenaWatchWidgets.xcodeproj \
  -scheme ArenaWatchWidgets \
  -configuration "$CONFIG" \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  build >/dev/null

SRC="build/Build/Products/$CONFIG/Arena Watch Widgets.app"
rm -rf dist
mkdir -p dist
cp -R "$SRC" "dist/Arena Watch Widgets.app"

APP="dist/Arena Watch Widgets.app"
if [ -n "${SIGN_IDENTITY:-}" ]; then
  echo "Signing with: $SIGN_IDENTITY"
  codesign --force --options runtime --timestamp \
    --sign "$SIGN_IDENTITY" \
    --entitlements ArenaWatchWidgets/Widget/ArenaWatchWidget.entitlements \
    "$APP/Contents/PlugIns/ArenaWatchWidgetExtension.appex"
  codesign --force --options runtime --timestamp \
    --sign "$SIGN_IDENTITY" \
    --entitlements ArenaWatchWidgets/App/ArenaWatchWidgets.entitlements \
    "$APP"
else
  echo "Signing ad-hoc (local testing only)"
  codesign --force --sign - \
    --entitlements ArenaWatchWidgets/Widget/ArenaWatchWidget.entitlements \
    "$APP/Contents/PlugIns/ArenaWatchWidgetExtension.appex"
  codesign --force --sign - \
    --entitlements ArenaWatchWidgets/App/ArenaWatchWidgets.entitlements \
    "$APP"
fi

codesign --verify --deep --strict --verbose=2 "$APP"
echo "Built: $APP"
