#!/usr/bin/env bash
# Installs Google's flatc, the FlatBuffers compiler the messages are made with, at the one pinned version, and
# refuses the download unless its checksum matches. CI, the Pages build and a cloud session's setup run this.
# Usage: bash tools/install-flatc.sh [folder on the PATH, default ~/.local/bin]
set -euo pipefail
VERSION=25.12.19
SHA256=50c1915deeeb714f2a05c8ec795bd1af898d251a62e2774067703b29188efc90
target=${1:-$HOME/.local/bin}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -sSLf -o "$work/flatc.zip" \
  "https://github.com/google/flatbuffers/releases/download/v$VERSION/Linux.flatc.binary.clang++-18.zip"
echo "$SHA256  $work/flatc.zip" | sha256sum -c --quiet -
mkdir -p "$target"
unzip -q -o "$work/flatc.zip" flatc -d "$target"
chmod +x "$target/flatc"
"$target/flatc" --version
