#!/bin/bash
# SessionStart hook from the repo's .claude/settings.json, so it runs even where install-all.sh never ran, on a
# resume or after a compaction as well. The kit lives in the container, and the session's end-of-session tools need it.
missing=()
command -v graphify > /dev/null || missing+=(graphify)
command -v headroom > /dev/null || missing+=(headroom)
[ -d ~/.claude-mem ] || missing+=(claude-mem)
[ -d ~/.claude/skills/task-observer ] || missing+=(task-observer)
[ ${#missing[@]} -eq 0 ] && exit 0
echo "The co-dev's kit is not installed in this container (missing: ${missing[*]}). Before any other work, run" \
  "CLAUDE.md's every-session step 1 from the repo root:" \
  "KIT_DIR=\$PWD/tools/claude-toolkit REPO_DIR=\$PWD bash tools/claude-toolkit/install-all.sh"
