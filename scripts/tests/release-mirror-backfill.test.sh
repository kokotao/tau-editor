#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKFILL_SCRIPT="${SCRIPT_DIR}/release-mirror-backfill.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "$TMP_DIR/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
url="${@: -1}"
case "$url" in
  */releases/latest)
    printf '%s\n' '{"tag_name":"v0.3.0","draft":false,"assets":[{"name":"Tau.dmg","size":100}]}'
    ;;
  */releases\?per_page=100\&page=1)
    printf '%s\n' '[{"tag_name":"v0.1.0","draft":false,"assets":[{"name":"old.dmg","size":100}]},{"tag_name":"v0.2.0-beta.1","draft":false,"assets":[{"name":"beta.msi","size":200}]},{"tag_name":"v0.3.0","draft":false,"assets":[{"name":"current.dmg","size":300}]},{"tag_name":"v0.4.0","draft":true,"assets":[{"name":"draft.dmg","size":400}]},{"tag_name":"v0.5.0","draft":false,"assets":[]}]'
    ;;
  */releases\?per_page=100\&page=2)
    printf '%s\n' '[]'
    ;;
  *) echo "Unexpected URL: $url" >&2; exit 1 ;;
esac
MOCK_CURL
chmod +x "$TMP_DIR/curl"

cat > "$TMP_DIR/mirror" <<'MOCK_MIRROR'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MIRROR_CALLS_FILE"
MOCK_MIRROR
chmod +x "$TMP_DIR/mirror"

export CURL_BIN="$TMP_DIR/curl"
export GITHUB_API_BASE="https://api.test/repos/kokotao/tau-editor"
export RELEASE_MIRROR_ENV_FILE="$TMP_DIR/no-env"
export RELEASE_MIRROR_LOCK_FILE="$TMP_DIR/mirror.lock"
export RELEASE_MIRROR_LOCK_ENABLED=0
export TAU_MIRROR_LOG_DIR="$TMP_DIR/log"
export RELEASE_MIRROR_SCRIPT="$TMP_DIR/mirror"
export MIRROR_CALLS_FILE="$TMP_DIR/calls"

dry_run_output="$("$BACKFILL_SCRIPT" --dry-run)"
[[ "$dry_run_output" == *"release_count=3 supported_asset_bytes=600 latest=v0.3.0 dry_run=1"* ]]
[[ "$dry_run_output" == *$'v0.1.0\t100'* ]]
[[ "$dry_run_output" == *$'v0.2.0-beta.1\t200'* ]]
[[ ! -e "$MIRROR_CALLS_FILE" ]]

"$BACKFILL_SCRIPT" >/dev/null
[[ "$(wc -l < "$MIRROR_CALLS_FILE" | tr -d ' ')" == 3 ]]
sed -n '1p' "$MIRROR_CALLS_FILE" | rg -q '^--tag v0\.1\.0 --only note --version-only$'
sed -n '2p' "$MIRROR_CALLS_FILE" | rg -q '^--tag v0\.2\.0-beta\.1 --only note --version-only$'
sed -n '3p' "$MIRROR_CALLS_FILE" | rg -q '^--tag v0\.3\.0 --only note$'
echo "release-mirror-backfill tests passed"
