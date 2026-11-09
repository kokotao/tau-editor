#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  release-mirror.sh --tag v0.6.42 --assets-dir release-assets [--only all|note|sourceforge] [--dry-run]
  release-mirror.sh --tag v0.6.42 [--only all|note|sourceforge] [--dry-run]

When --assets-dir is omitted, assets are downloaded from the public GitHub API.
Uploads use rsync over SSH. Credentials must be provided by ssh-agent/SSH config.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TAG=""
ASSETS_DIR=""
ONLY="all"
DRY_RUN=0
LATEST=0
LOG_BASE="${XDG_STATE_HOME:-${HOME:-/var/lib}/.local/state}"
LOG_DIR="${TAU_MIRROR_LOG_DIR:-${LOG_BASE}/tau-editor-release-mirror}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/mirror-$(date +%F).log"
exec > >(awk '{ print strftime("[%Y-%m-%dT%H:%M:%S%z]"), $0; fflush() }' | tee -a "$LOG_FILE") 2>&1

trap 'status=$?; printf "[%s] ERROR: release mirror failed at line %s (exit %s)\n" "$(date "+%Y-%m-%dT%H:%M:%S%z")" "$LINENO" "$status" >&2; exit "$status"' ERR

while (($#)); do
  case "$1" in
    --tag) TAG="${2:?missing value for --tag}"; shift 2 ;;
    --latest) LATEST=1; shift ;;
    --assets-dir) ASSETS_DIR="${2:?missing value for --assets-dir}"; shift 2 ;;
    --only) ONLY="${2:?missing value for --only}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if ((LATEST)); then
  [[ -z "$TAG" ]] || { echo "Use either --latest or --tag, not both." >&2; exit 2; }
  command -v curl >/dev/null || { echo "curl is required with --latest" >&2; exit 1; }
  latest_release="$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPOSITORY:-kokotao/tau-editor}/releases/latest")"
  TAG="$(jq -r '.tag_name // empty' <<<"$latest_release")"
  [[ -n "$TAG" ]] || { echo "GitHub API did not return the latest release tag." >&2; exit 1; }
fi
[[ -n "$TAG" ]] || { echo "--tag or --latest is required" >&2; exit 2; }
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || {
  echo "Invalid release tag: $TAG" >&2
  exit 2
}
case "$ONLY" in all|note|sourceforge) ;; *) echo "--only must be all, note or sourceforge" >&2; exit 2 ;; esac
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
command -v rsync >/dev/null || { echo "rsync is required" >&2; exit 1; }

VERSION="${TAG#v}"
REPO="${GITHUB_REPOSITORY:-kokotao/tau-editor}"
RELEASE_URL="https://github.com/${REPO}/releases/tag/${TAG}"
NOTE_BASE_URL="${NOTE_MIRROR_BASE_URL:-https://note.lizipro.cn/taueditor/releases}"
CACHE_ROOT="${RELEASE_MIRROR_CACHE_DIR:-/var/cache/tau-editor-release-mirror}"
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "START tag=${TAG} version=${VERSION} mode=${ONLY} dry_run=${DRY_RUN}"
if [[ -z "$ASSETS_DIR" ]]; then
  command -v curl >/dev/null || { echo "curl is required when --assets-dir is omitted" >&2; exit 1; }
  ASSETS_DIR="${CACHE_ROOT%/}/${TAG}"
  mkdir -p "$ASSETS_DIR"
  release_json="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/tags/${TAG}")"
  while IFS=$'\t' read -r name url expected_size expected_digest; do
    [[ -n "$name" && -n "$url" ]] || continue
    case "$name" in
      *.dmg|*.zip|*.app.tar.gz|*.deb|*.AppImage|*.rpm|*.msi|*.exe)
        target="$ASSETS_DIR/$name"
        current_size=0
        [[ -f "$target" ]] && current_size="$(wc -c < "$target" | tr -d ' ')"
        cache_valid=0
        if [[ "$current_size" == "$expected_size" && "$expected_size" != "0" ]]; then
          if [[ "$expected_digest" == sha256:* ]]; then
            expected_sha="${expected_digest#sha256:}"
            actual_sha="$(sha256sum "$target" | awk '{print $1}')"
            [[ "$actual_sha" == "$expected_sha" ]] && cache_valid=1
          elif [[ -f "${ASSETS_DIR}/latest.json" ]]; then
            expected_sha="$(jq -r --arg name "$name" '.assets[]? | select(.name == $name) | .sha256 // empty' "${ASSETS_DIR}/latest.json" | head -n 1)"
            if [[ -n "$expected_sha" ]]; then
              actual_sha="$(sha256sum "$target" | awk '{print $1}')"
              [[ "$actual_sha" == "$expected_sha" ]] && cache_valid=1
            fi
          fi
        fi
        if ((cache_valid)); then
          echo "CACHE_HIT asset=${name} bytes=${current_size} sha256=${actual_sha}"
          continue
        fi
        echo "CACHE_MISS asset=${name} cached_bytes=${current_size} expected_bytes=${expected_size}"
        echo "DOWNLOAD_START asset=${name} expected_bytes=${expected_size} expected_digest=${expected_digest:-unavailable}"
        tmp_target="$target.part"
        rm -f "$tmp_target"
        curl -fL --retry 4 --retry-all-errors --retry-delay 2 "$url" -o "$tmp_target"
        actual_size="$(wc -c < "$tmp_target" | tr -d ' ')"
        [[ "$expected_size" == "0" || "$actual_size" == "$expected_size" ]] || {
          echo "Downloaded size mismatch: ${name}: expected=${expected_size} actual=${actual_size}" >&2
          exit 1
        }
        if [[ "$expected_digest" == sha256:* ]]; then
          expected_sha="${expected_digest#sha256:}"
          actual_sha="$(sha256sum "$tmp_target" | awk '{print $1}')"
          [[ "$actual_sha" == "$expected_sha" ]] || {
            echo "Downloaded digest mismatch: ${name}: expected=${expected_sha} actual=${actual_sha}" >&2
            exit 1
          }
        fi
        mv -f "$tmp_target" "$target"
        echo "DOWNLOAD_DONE asset=${name} bytes=${actual_size}"
        ;;
    esac
  done < <(jq -r '.assets[]? | [.name,.browser_download_url, (.size // 0), (.digest // "")] | @tsv' <<<"$release_json")
fi
[[ -d "$ASSETS_DIR" ]] || { echo "Assets directory does not exist: $ASSETS_DIR" >&2; exit 1; }

ASSETS=()
while IFS= read -r -d '' file; do
  ASSETS+=("$file")
done < <(find "$ASSETS_DIR" -type f \
  \( -name '*.dmg' -o -name '*.zip' -o -name '*.app.tar.gz' -o -name '*.deb' -o -name '*.AppImage' -o -name '*.rpm' -o -name '*.msi' -o -name '*.exe' \) \
  -print0 | sort -z)
((${#ASSETS[@]} > 0)) || { echo "No supported release assets found in $ASSETS_DIR" >&2; exit 1; }

NOTE_ENABLED=0
SF_ENABLED=0
if [[ "$ONLY" == all || "$ONLY" == note ]]; then NOTE_ENABLED=1; fi
if [[ "$ONLY" == all || "$ONLY" == sourceforge ]]; then SF_ENABLED=1; fi

if ((NOTE_ENABLED)) && [[ -z "${NOTE_MIRROR_HOST:-}" || -z "${NOTE_MIRROR_ROOT:-}" ]]; then
  if ((DRY_RUN)); then
    echo "NOTE_MIRROR_HOST/NOTE_MIRROR_ROOT not set; note upload will be skipped in dry-run."
    NOTE_ENABLED=0
  else
    echo "Set NOTE_MIRROR_HOST and NOTE_MIRROR_ROOT for the note mirror." >&2
    exit 1
  fi
fi
if ((SF_ENABLED)) && [[ -z "${SOURCEFORGE_PROJECT:-}" || -z "${SOURCEFORGE_USER:-}" ]]; then
  echo "SOURCEFORGE_PROJECT/SOURCEFORGE_USER not set; SourceForge upload will be skipped."
  SF_ENABLED=0
fi

NOTE_VERSION_URL="${NOTE_BASE_URL}/${VERSION}"
SF_BASE_URL=""
if ((SF_ENABLED)) || [[ "$ONLY" == all || "$ONLY" == sourceforge ]]; then
  if [[ -n "${SOURCEFORGE_PROJECT:-}" ]]; then
    SF_BASE_URL="https://sourceforge.net/projects/${SOURCEFORGE_PROJECT}/files/releases/${VERSION}"
  fi
fi

MANIFEST="$TMP_DIR/latest.json"
ASSET_JSON="$TMP_DIR/assets.json"
printf '[]\n' > "$ASSET_JSON"
for file in "${ASSETS[@]}"; do
  name="$(basename "$file")"
  size="$(wc -c < "$file" | tr -d ' ')"
  if command -v sha256sum >/dev/null; then
    sha="$(sha256sum "$file" | awk '{print $1}')"
  else
    sha="$(shasum -a 256 "$file" | awk '{print $1}')"
  fi
  encoded_name="$(jq -rn --arg value "$name" '$value|@uri')"
  note_url=""
  if ((NOTE_ENABLED)); then
    note_url="${NOTE_VERSION_URL}/${encoded_name}"
  fi
  sf_url=""
  [[ -n "$SF_BASE_URL" ]] && sf_url="${SF_BASE_URL}/${encoded_name}/download"
  github_url="https://github.com/${REPO}/releases/download/${TAG}/${encoded_name}"
  jq --arg name "$name" --argjson size "$size" --arg sha "$sha" \
    --arg note "$note_url" --arg sourceforge "$sf_url" --arg github "$github_url" \
    '. + [{name:$name,size:$size,sha256:$sha,urls:{note:$note,sourceforge:$sourceforge,github:$github}}]' \
    "$ASSET_JSON" > "$TMP_DIR/assets.next.json"
  mv "$TMP_DIR/assets.next.json" "$ASSET_JSON"
done

jq -n --arg version "$VERSION" --arg tag "$TAG" --arg release_url "$RELEASE_URL" \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --slurpfile assets "$ASSET_JSON" \
  '{version:$version,tag:$tag,release_url:$release_url,generated_at:$generated_at,assets:$assets[0]}' > "$MANIFEST"

echo "RELEASE_READY tag=${TAG} version=${VERSION} asset_count=${#ASSETS[@]}"
jq -r '.assets[] | "ASSET name=\(.name) bytes=\(.size) sha256=\(.sha256)"' "$MANIFEST"

if ((DRY_RUN)); then
  echo "DRY_RUN_COMPLETE tag=${TAG} version=${VERSION}"
  exit 0
fi

if ((NOTE_ENABLED)); then
  REMOTE_VERSION="${NOTE_MIRROR_ROOT%/}/${VERSION}"
  echo "NOTE_UPLOAD_START version=${VERSION} asset_count=${#ASSETS[@]}"
  if [[ "$NOTE_MIRROR_HOST" == local || "$NOTE_MIRROR_HOST" == localhost ]]; then
    mkdir -p "$REMOTE_VERSION" "${NOTE_MIRROR_ROOT%/}"
    rsync -avc --partial --delay-updates "${ASSETS[@]}" "${REMOTE_VERSION}/"
    while IFS=$'\t' read -r name sha; do
      remote_sha="$(sha256sum "${REMOTE_VERSION}/${name}" | awk '{print $1}')"
      [[ "$remote_sha" == "$sha" ]] || { echo "note mirror checksum mismatch: $name" >&2; exit 1; }
    done < <(jq -r '.assets[] | [.name,.sha256] | @tsv' "$MANIFEST")
    rsync -av --delay-updates "$MANIFEST" "${REMOTE_VERSION}/latest.json"
    rsync -av --delay-updates "$MANIFEST" "${NOTE_MIRROR_ROOT%/}/latest.json"
  else
    ssh "${NOTE_MIRROR_HOST}" "mkdir -p '${REMOTE_VERSION}' '${NOTE_MIRROR_ROOT%/}'"
    rsync -avc --partial --delay-updates "${ASSETS[@]}" "${NOTE_MIRROR_HOST}:${REMOTE_VERSION}/"
    while IFS=$'\t' read -r name sha; do
      remote_sha="$(ssh "$NOTE_MIRROR_HOST" "sha256sum '${REMOTE_VERSION}/${name}' | awk '{print \\\$1}'")"
      [[ "$remote_sha" == "$sha" ]] || { echo "note mirror checksum mismatch: $name" >&2; exit 1; }
    done < <(jq -r '.assets[] | [.name,.sha256] | @tsv' "$MANIFEST")
    rsync -av --delay-updates "$MANIFEST" "${NOTE_MIRROR_HOST}:${REMOTE_VERSION}/latest.json"
    rsync -av --delay-updates "$MANIFEST" "${NOTE_MIRROR_HOST}:${NOTE_MIRROR_ROOT%/}/latest.json"
  fi
  echo "NOTE_UPLOAD_DONE version=${VERSION} url=${NOTE_VERSION_URL}/"
fi

if ((SF_ENABLED)); then
  SF_HOST="${SOURCEFORGE_HOST:-frs.sourceforge.net}"
  SF_REMOTE="${SOURCEFORGE_USER},${SOURCEFORGE_PROJECT}@${SF_HOST}:/home/frs/project/${SOURCEFORGE_PATH:-${SOURCEFORGE_PROJECT}/releases}/${VERSION}"
  echo "SOURCEFORGE_UPLOAD_START version=${VERSION} asset_count=${#ASSETS[@]}"
  rsync -avc --partial --delay-updates "${ASSETS[@]}" "$SF_REMOTE/"
  # Publish the manifest last; --delay-updates replaces it atomically at the destination.
  rsync -av --delay-updates "$MANIFEST" "$SF_REMOTE/latest.json"
  echo "SOURCEFORGE_UPLOAD_DONE version=${VERSION} url=${SF_BASE_URL}/"
fi
echo "COMPLETE tag=${TAG} version=${VERSION} note=${NOTE_ENABLED} sourceforge=${SF_ENABLED}"
