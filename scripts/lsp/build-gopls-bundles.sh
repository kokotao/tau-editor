#!/usr/bin/env bash
# @description 构建包含应用私有 Go SDK 与 gopls 的 Tau Editor macOS 发行资产。
# @author Albert_Luo
# @email 480199976@qq.com
# @date 2026-10-03 02:35
#
# The resulting archive intentionally carries the Go SDK. gopls invokes the Go
# toolchain while loading modules, so a gopls-only archive would still make
# users install Go globally. The archive has one stable launcher (`tau-gopls`)
# which sets GOROOT/GOPATH/GOCACHE and executes the bundled gopls binary.
set -euo pipefail

GOPLS_VERSION="${GOPLS_VERSION:-v0.23.0}"
GO_VERSION="${GO_VERSION:-1.27.1}"
OUT_DIR="${OUT_DIR:-$(pwd)/dist/lsp}"

case "$(uname -s)" in
  Darwin) ;;
  *) echo "此脚本需要在 macOS 上运行（当前：$(uname -s)）" >&2; exit 2 ;;
esac

mkdir -p "$OUT_DIR"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/tau-gopls-build.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

declare -A GO_SHA256=(
  [arm64]="ee215d57e0ec269c60cc9ceca68e6bda321ba9ee5afe24f4b0988703c2d87d12"
  [amd64]="8f8f52c6649542cf027bbc9b9c68d1ec042f9f34808a40413f0b8b3f66f3caa4"
)

for target in arm64 amd64; do
  archive="go${GO_VERSION}.darwin-${target}.tar.gz"
  archive_path="$work_dir/$archive"
  sdk_root="$work_dir/sdk-$target"
  build_root="$work_dir/build-$target"
  mkdir -p "$sdk_root" "$build_root"

  curl --fail --location --retry 3 --output "$archive_path" "https://go.dev/dl/$archive"
  actual_sha256="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  if [[ "$actual_sha256" != "${GO_SHA256[$target]}" ]]; then
    echo "Go SDK SHA-256 校验失败（$target）：期望 ${GO_SHA256[$target]}，实际 $actual_sha256" >&2
    exit 1
  fi
  tar -xzf "$archive_path" -C "$sdk_root"

  cat > "$build_root/go.mod" <<EOF
module tau-editor-gopls-build

go 1.27

require golang.org/x/tools/gopls ${GOPLS_VERSION}
EOF

  export GOROOT="$sdk_root/go"
  export PATH="$GOROOT/bin:$PATH"
  export GOPATH="$build_root/gopath"
  export GOMODCACHE="$GOPATH/pkg/mod"
  export GOCACHE="$build_root/gocache"
  export GOTOOLCHAIN=local
  export GOPROXY=https://proxy.golang.org
  mkdir -p "$GOPATH" "$GOCACHE"
  (
    cd "$build_root"
    go mod download "golang.org/x/tools/gopls@${GOPLS_VERSION}"
    GOOS=darwin GOARCH="$target" CGO_ENABLED=0 \
      go build -trimpath -buildvcs=false \
      -o "$build_root/gopls" golang.org/x/tools/gopls
  )

  cat > "$build_root/tau-gopls" <<'EOF'
#!/bin/sh
# Tau Editor managed gopls launcher; all Go files are private to this bundle.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export GOROOT="$SCRIPT_DIR/go"
export PATH="$SCRIPT_DIR/go/bin:$PATH"
export GOPATH="$SCRIPT_DIR/go"
export GOMODCACHE="$SCRIPT_DIR/go/pkg/mod"
export GOCACHE="$SCRIPT_DIR/go/cache"
export GOTOOLCHAIN=local
exec "$SCRIPT_DIR/gopls" "$@"
EOF
  chmod 755 "$build_root/tau-gopls" "$build_root/gopls"

  # Use a deterministic archive where metadata is independent of the build
  # machine. This makes the release SHA-256 auditable and repeatable.
  python3 - "$build_root" "$OUT_DIR/tau-gopls-${GOPLS_VERSION#v}-darwin-${target/amd64/x64}.tar.gz" <<'PY'
import gzip
import hashlib
import pathlib
import sys
import tarfile

root = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
with destination.open("wb") as raw:
    with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
            for path in sorted(root.rglob("*"), key=lambda item: str(item.relative_to(root))):
                relative = path.relative_to(root)
                info = archive.gettarinfo(str(path), arcname=str(relative))
                info.uid = info.gid = 0
                info.uname = info.gname = ""
                info.mtime = 0
                if path.is_file():
                    with path.open("rb") as stream:
                        archive.addfile(info, stream)
                else:
                    archive.addfile(info)
digest = hashlib.sha256(destination.read_bytes()).hexdigest()
print(f"{destination}\t{digest}")
PY
done

echo "已生成 Go/gopls 资产：$OUT_DIR"
