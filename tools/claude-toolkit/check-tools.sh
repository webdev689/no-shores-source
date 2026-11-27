#!/usr/bin/env bash
# Is every tool installed and working, and do any of them clash? One line per check.
# usage: bash check-tools.sh [--worker] [--quiet]
#   --worker adds one combined headless worker that uses every tool in one session (5-8 min; after kit changes).
# install-all.sh runs it (without --worker) at the end and exits with its result.
KIT_DIR=${KIT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}; SHARED_DIR=${SHARED_DIR:-$HOME/toolkit-data}; export KIT_DIR SHARED_DIR
# The repository is the one this kit sits in (its main checkout, from a worktree too), not the home folder.
[ -n "${REPO_DIR:-}${REPO_URL:-}" ] || { c=$(git -C "$KIT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && export REPO_DIR=${c%/.git}; }
cd ~ || exit 1
export no_proxy="${no_proxy:+$no_proxy,}localhost,127.0.0.1" NO_PROXY="${NO_PROXY:+$NO_PROXY,}localhost,127.0.0.1"
exec python3 "$KIT_DIR/check_tools.py" "$@"
