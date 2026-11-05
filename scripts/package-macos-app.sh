#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUNNER_OS:-}" != "macOS" && "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

BUNDLE_DIR="${1:-frontend/src-tauri/target/universal-apple-darwin/release/bundle}"
PRODUCT_NAME="${2:-TauEditor}"
VERSION="${3:-0.0.0}"
ARCH_LABEL="${4:-universal}"

case "${ARCH_LABEL}" in
  universal|aarch64) ;;
  *)
    echo "Unsupported macOS architecture label '${ARCH_LABEL}'; expected universal or aarch64." >&2
    exit 1
    ;;
esac

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

APP_BINARY="${APP_PATH}/Contents/MacOS/text-editor"
if [[ ! -x "${APP_BINARY}" ]]; then
  echo "Expected app executable is missing: ${APP_BINARY}" >&2
  exit 1
fi

actual_arches="$(lipo -archs "${APP_BINARY}" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
case "${ARCH_LABEL}" in
  universal)
    if [[ "${actual_arches}" != "arm64 x86_64" ]]; then
      echo "Universal DMG requires arm64 and x86_64 app slices; found: ${actual_arches}" >&2
      exit 1
    fi
    ;;
  aarch64)
    if [[ "${actual_arches}" != "arm64" ]]; then
      echo "Apple Silicon DMG requires an arm64-only app; found: ${actual_arches}" >&2
      exit 1
    fi
    ;;
esac
echo "Verified app architectures (${ARCH_LABEL}): ${actual_arches}"

# Strip quarantine/provenance attributes before packaging.
xattr -cr "${APP_PATH}"

# Tauri signs the bundle when bundle.macOS.signingIdentity is configured.
# Prebuilt bundles may only carry the linker signature, which makes Gatekeeper
# report the app as damaged, so repair them with an ad-hoc signature first.
if ! codesign --verify --deep --strict "${APP_PATH}" >/dev/null 2>&1; then
  signed_with_developer_id=0
  if codesign -dv "${APP_PATH}" 2>&1 | grep -q "Authority=Developer ID"; then
    signed_with_developer_id=1
  fi

  if [[ -n "${APPLE_SIGNING_IDENTITY:-}" || "${signed_with_developer_id}" == "1" ]]; then
    echo "Signature is invalid and a Developer ID identity is in use; refusing to replace it with an ad-hoc signature." >&2
    exit 1
  fi

  echo "App bundle is not validly signed; applying an ad-hoc signature."
  codesign --force --deep --sign - "${APP_PATH}"
fi

codesign --verify --deep --strict --verbose=2 "${APP_PATH}"

ZIP_NAME="${PRODUCT_NAME}_${VERSION}_${ARCH_LABEL}.zip"
DMG_NAME="${PRODUCT_NAME}_${VERSION}_${ARCH_LABEL}.dmg"
ZIP_PATH="${ARTIFACT_DIR}/${ZIP_NAME}"
DMG_PATH="${ARTIFACT_DIR}/${DMG_NAME}"

rm -f "${ZIP_PATH}" "${DMG_PATH}"

ditto -c -k --sequesterRsrc --keepParent "${APP_PATH}" "${ZIP_PATH}"

DMG_BACKGROUND="${REPO_ROOT}/frontend/src-tauri/icons/dmg-background.png"
DMG_SOURCE_ICON="${REPO_ROOT}/frontend/src-tauri/icons/icon.icns"
TAURI_DMG_SCRIPT="${BUNDLE_DIR}/dmg/bundle_dmg.sh"
DMG_SOURCE_DIR="${TMP_DIR}/dmg-source"
mkdir -p "${DMG_SOURCE_DIR}"
cp -R "${APP_PATH}" "${DMG_SOURCE_DIR}/$(basename "${APP_PATH}")"

if [[ -x "${TAURI_DMG_SCRIPT}" && -f "${DMG_BACKGROUND}" && -f "${DMG_SOURCE_ICON}" ]]; then
  # Reuse Tauri's create-dmg wrapper so manually packaged DMGs match CI:
  # custom background, Finder icon positions, and the Applications drop link.
  "${TAURI_DMG_SCRIPT}" \
    --volname "${PRODUCT_NAME}" \
    --volicon "${DMG_SOURCE_ICON}" \
    --background "${DMG_BACKGROUND}" \
    --window-size 660 400 \
    --icon "$(basename "${APP_PATH}")" 180 170 \
    --app-drop-link 480 170 \
    "${DMG_PATH}" "${DMG_SOURCE_DIR}"
else
  echo "Tauri DMG helper or background asset unavailable; refusing to create an unverified plain DMG." >&2
  exit 1
fi

# Verify the final DMG carries the exact background selected from the source
# tree. This catches stale Tauri bundle helpers or accidental plain-DMG
# fallbacks before an artifact is uploaded to a release.
DMG_MOUNT_DIR="$(mktemp -d)"
DMG_ATTACHED_DEVICE=""
cleanup_dmg_mount() {
  if [[ -n "${DMG_ATTACHED_DEVICE}" ]]; then
    hdiutil detach "${DMG_ATTACHED_DEVICE}" >/dev/null 2>&1 || true
  else
    hdiutil detach "${DMG_MOUNT_DIR}" >/dev/null 2>&1 || true
  fi
  rmdir "${DMG_MOUNT_DIR}" 2>/dev/null || true
}
trap 'cleanup_dmg_mount; cleanup' EXIT

DMG_ATTACH_OUTPUT="$(hdiutil attach -nobrowse -readonly -mountpoint "${DMG_MOUNT_DIR}" "${DMG_PATH}")"
DMG_ATTACHED_DEVICE="$(printf '%s\n' "${DMG_ATTACH_OUTPUT}" | awk '$1 ~ /^\/dev\// {print $1; exit}')"
DMG_EMBEDDED_BACKGROUND="${DMG_MOUNT_DIR}/.background/dmg-background.png"
if [[ ! -f "${DMG_EMBEDDED_BACKGROUND}" ]]; then
  echo "DMG is missing .background/dmg-background.png; refusing to publish a stale/plain installer." >&2
  exit 1
fi

DMG_EMBEDDED_DS_STORE="${DMG_MOUNT_DIR}/.DS_Store"
if [[ ! -s "${DMG_EMBEDDED_DS_STORE}" ]]; then
  echo "DMG is missing Finder layout metadata .DS_Store; refusing to publish an unstyled installer." >&2
  exit 1
fi
echo "Verified Finder layout metadata: ${DMG_EMBEDDED_DS_STORE} ($(stat -f '%z' "${DMG_EMBEDDED_DS_STORE}") bytes)"
if ! cmp -s "${DMG_BACKGROUND}" "${DMG_EMBEDDED_BACKGROUND}"; then
  echo "DMG background differs from ${DMG_BACKGROUND}; refusing to publish a stale installer." >&2
  echo "Source:   $(shasum -a 256 "${DMG_BACKGROUND}" | awk '{print $1}')" >&2
  echo "Embedded: $(shasum -a 256 "${DMG_EMBEDDED_BACKGROUND}" | awk '{print $1}')" >&2
  exit 1
fi
echo "Verified DMG background: $(shasum -a 256 "${DMG_EMBEDDED_BACKGROUND}" | awk '{print $1}')"

APP_IN_DMG="$(find "${DMG_MOUNT_DIR}" -maxdepth 1 -type d -name '*.app' -print -quit)"
DMG_EMBEDDED_ICON="${APP_IN_DMG}/Contents/Resources/icon.icns"
if [[ -z "${APP_IN_DMG}" || ! -f "${DMG_SOURCE_ICON}" || ! -f "${DMG_EMBEDDED_ICON}" ]]; then
  echo "DMG is missing the expected Tau Editor app icon; refusing to publish a stale installer." >&2
  exit 1
fi
if ! cmp -s "${DMG_SOURCE_ICON}" "${DMG_EMBEDDED_ICON}"; then
  echo "DMG app icon differs from ${DMG_SOURCE_ICON}; refusing to publish a stale installer." >&2
  echo "Source:   $(shasum -a 256 "${DMG_SOURCE_ICON}" | awk '{print $1}')" >&2
  echo "Embedded: $(shasum -a 256 "${DMG_EMBEDDED_ICON}" | awk '{print $1}')" >&2
  exit 1
fi
echo "Verified DMG app icon: $(shasum -a 256 "${DMG_EMBEDDED_ICON}" | awk '{print $1}')"

echo "Created artifacts:"
echo "${ZIP_PATH}"
echo "${DMG_PATH}"
