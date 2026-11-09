#!/usr/bin/env bash
set -Eeuo pipefail

LOG_DIR="${RELEASE_MIRROR_LOG_DIR:-/var/log/tau-editor-release-mirror}"
LOCK_FILE="${RELEASE_MIRROR_LOCK_FILE:-/run/lock/tau-editor-release-mirror.lock}"
SCRIPT="${RELEASE_MIRROR_SCRIPT:-/opt/tau-editor-release-mirror/release-mirror.sh}"
ENV_FILE="${RELEASE_MIRROR_ENV_FILE:-/etc/tau-editor/release-mirror.env}"

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$LOCK_FILE")"
LOG_FILE="${LOG_DIR}/mirror-$(date +%F).log"

if [[ -r "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  printf '%s [WARN] another release mirror run is already active; exiting\n' \
    "$(date --iso-8601=seconds)" | tee -a "$LOG_FILE"
  exit 0
fi

run_mirror() {
  printf '%s [INFO] release mirror run started; script=%s args=%q\n' \
    "$(date --iso-8601=seconds)" "$SCRIPT" "$*"
  local status=0
  "$SCRIPT" "$@" || status=$?
  if ((status == 0)); then
    printf '%s [INFO] release mirror run completed successfully\n' \
      "$(date --iso-8601=seconds)"
  else
    printf '%s [ERROR] release mirror run failed; exit=%s\n' \
      "$(date --iso-8601=seconds)" "$status"
  fi
  return "$status"
}

set +e
run_mirror "$@" 2>&1 | tee -a "$LOG_FILE"
status="${PIPESTATUS[0]}"
set -e
exit "$status"
