#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUNNER_OS:-}" != "macOS" && "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS."
  exit 1
fi

BUNDLE_DIR="${1:-frontend/src-tauri/target/universal-apple-darwin/release/bundle}"
PRODUCT_NAME="${2:-TauEditor}"
VERSION="${3:-0.0.0}"

MACOS_DIR="${BUNDLE_DIR}/macos"
ARTIFACT_DIR="${BUNDLE_DIR}/artifacts"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

mkdir -p "${ARTIFACT_DIR}"

APP_PATH="$(find "${MACOS_DIR}" -maxdepth 1 -type d -name '*.app' | head -n 1 || true)"
if [[ -z "${APP_PATH}" ]]; then
  APP_ARCHIVE="$(find "${MACOS_DIR}" -maxdepth 1 -type f -name '*.app.tar.gz' | head -n 1 || true)"
  if [[ -z "${APP_ARCHIVE}" ]]; then
    echo "No .app or .app.tar.gz found under ${MACOS_DIR}"
    exit 1
  fi

  tar -xzf "${APP_ARCHIVE}" -C "${TMP_DIR}"
  APP_PATH="$(find "${TMP_DIR}" -maxdepth 1 -type d -name '*.app' | head -n 1 || true)"
fi

if [[ -z "${APP_PATH}" ]]; then
  echo "Failed to resolve .app bundle."
  exit 1
fi

ZIP_NAME="${PRODUCT_NAME}_${VERSION}_universal-macos.zip"
DMG_NAME="${PRODUCT_NAME}_${VERSION}_universal-macos.dmg"
ZIP_PATH="${ARTIFACT_DIR}/${ZIP_NAME}"
DMG_PATH="${ARTIFACT_DIR}/${DMG_NAME}"

ditto -c -k --sequesterRsrc --keepParent "${APP_PATH}" "${ZIP_PATH}"

hdiutil create \
  -volname "${PRODUCT_NAME}" \
  -srcfolder "${APP_PATH}" \
  -format UDZO \
  -ov \
  "${DMG_PATH}"

echo "Created artifacts:"
echo "${ZIP_PATH}"
echo "${DMG_PATH}"
