#!/usr/bin/env bash
# @description Backfills published Tau Editor releases to the Lizi mirror without downgrading latest.json.
# @author Albert_Luo
# @email 480199976@qq.com
# @date 2026-11-16 14:10
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage:
  release-mirror-backfill.sh [--dry-run]

Lists all public GitHub releases, estimates supported installer sizes, then syncs
each version directory to the Lizi mirror. The root latest.json is updated last.
The script uses the normal mirror environment and runner lock on the WSL host.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${GITHUB_REPOSITORY:-kokotao/tau-editor}"
API_BASE="${GITHUB_API_BASE:-https://api.github.com/repos/${REPO}}"
ENV_FILE="${RELEASE_MIRROR_ENV_FILE:-/etc/tau-editor/release-mirror.env}"
LOG_DIR="${TAU_MIRROR_LOG_DIR:-/var/log/tau-editor-release-mirror}"
LOCK_FILE="${RELEASE_MIRROR_LOCK_FILE:-/run/lock/tau-editor-release-mirror.lock}"
MIRROR_SCRIPT="${RELEASE_MIRROR_SCRIPT:-${SCRIPT_DIR}/release-mirror.sh}"
CURL_BIN="${CURL_BIN:-curl}"
DRY_RUN=0
LOCK_ENABLED="${RELEASE_MIRROR_LOCK_ENABLED:-1}"

while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -r "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

mkdir -p "$LOG_DIR" "$(dirname "$LOCK_FILE")"
LOG_FILE="${LOG_DIR}/backfill-$(date +%F).log"
exec > >(while IFS= read -r line || [[ -n "$line" ]]; do
  printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$line"
done | tee -a "$LOG_FILE") 2>&1

if [[ "$LOCK_ENABLED" == 1 ]]; then
  command -v flock >/dev/null || { echo "Required command not found: flock" >&2; exit 1; }
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Another release mirror task is active; backfill was not started."
    exit 1
  fi
fi

for command_name in jq "$CURL_BIN"; do
  command -v "$command_name" >/dev/null || { echo "Required command not found: $command_name" >&2; exit 1; }
done
[[ -x "$MIRROR_SCRIPT" ]] || { echo "Mirror script is not executable: $MIRROR_SCRIPT" >&2; exit 1; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
ALL_RELEASES="$TMP_DIR/releases.json"
PAGE_FILE="$TMP_DIR/page.json"
GITHUB_CURL_CONFIG="$TMP_DIR/github-curl.conf"
: > "$GITHUB_CURL_CONFIG"
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  printf 'header = "Authorization: Bearer %s"\n' "$GITHUB_TOKEN" > "$GITHUB_CURL_CONFIG"
  chmod 600 "$GITHUB_CURL_CONFIG"
fi
GITHUB_CURL_ARGS=(--config "$GITHUB_CURL_CONFIG")
printf '[]\n' > "$ALL_RELEASES"

api_get() {
  local url="$1"
  local -a args=(-fsSL -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28')
  "$CURL_BIN" "${GITHUB_CURL_ARGS[@]}" "${args[@]}" "$url"
}

page=1
while :; do
  api_get "${API_BASE}/releases?per_page=100&page=${page}" > "$PAGE_FILE"
  jq -e 'type == "array"' "$PAGE_FILE" >/dev/null || { echo "GitHub releases page ${page} was not an array." >&2; exit 1; }
  count="$(jq 'length' "$PAGE_FILE")"
  jq -s '.[0] + .[1]' "$ALL_RELEASES" "$PAGE_FILE" > "$TMP_DIR/releases.next.json"
  mv "$TMP_DIR/releases.next.json" "$ALL_RELEASES"
  ((count < 100)) && break
  ((page += 1))
done

LATEST_RELEASE="$(api_get "${API_BASE}/releases/latest")"
LATEST_TAG="$(jq -r '.tag_name // empty' <<<"$LATEST_RELEASE")"
[[ "$LATEST_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || {
  echo "GitHub latest release returned an unsupported tag: ${LATEST_TAG:-<empty>}" >&2
  exit 1
}

FILTERED="$TMP_DIR/filtered.json"
jq '[.[]
  | select(.draft == false)
  | select(.tag_name | test("^v[0-9]+\\.[0-9]+\\.[0-9]+([.-][A-Za-z0-9.-]+)?$"))
  | select(any(.assets[]?; .name | test("\\.(dmg|zip|app\\.tar\\.gz|deb|AppImage|rpm|msi|exe)$")))
]' "$ALL_RELEASES" > "$FILTERED"
jq -e --arg tag "$LATEST_TAG" 'any(.[]; .tag_name == $tag)' "$FILTERED" >/dev/null || {
  jq --argjson latest "$LATEST_RELEASE" '. + [$latest]' "$FILTERED" > "$TMP_DIR/filtered.next.json"
  mv "$TMP_DIR/filtered.next.json" "$FILTERED"
}

RELEASE_COUNT="$(jq 'length' "$FILTERED")"
ASSET_BYTES="$(jq '[.[].assets[]? | select(.name | test("\\.(dmg|zip|app\\.tar\\.gz|deb|AppImage|rpm|msi|exe)$")) | (.size // 0)] | add // 0' "$FILTERED")"
echo "BACKFILL_PLAN release_count=${RELEASE_COUNT} supported_asset_bytes=${ASSET_BYTES} latest=${LATEST_TAG} dry_run=${DRY_RUN}"
jq -r '.[] | [.tag_name, ([.assets[]? | select(.name | test("\\.(dmg|zip|app\\.tar\\.gz|deb|AppImage|rpm|msi|exe)$")) | (.size // 0)] | add // 0)] | @tsv' "$FILTERED"

if ((DRY_RUN)); then
  echo "DRY_RUN_COMPLETE; no assets were downloaded or uploaded."
  exit 0
fi

while IFS=$'\t' read -r tag _; do
  [[ "$tag" == "$LATEST_TAG" ]] && continue
  echo "BACKFILL_VERSION_START tag=${tag}"
  "$MIRROR_SCRIPT" --tag "$tag" --only note --version-only
done < <(jq -r '.[] | .tag_name' "$FILTERED")

echo "BACKFILL_LATEST_START tag=${LATEST_TAG}"
"$MIRROR_SCRIPT" --tag "$LATEST_TAG" --only note
echo "BACKFILL_COMPLETE release_count=${RELEASE_COUNT} latest=${LATEST_TAG}"
