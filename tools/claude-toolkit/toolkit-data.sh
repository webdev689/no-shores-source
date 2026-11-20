#!/bin/bash
# The kit's observation log outlives the container on the orphan branch toolkit-data of the repository.
#   restore (install-all.sh): takes the branch's log into $SHARED_DIR, never over a file already there, and notes the
#     commit a fresh log came from.
#   save (a session's end): commits the log over that commit, and git merges it onto the branch's tip, so what a parallel
#     session saved is kept and, where both changed one line, this container's wins; the merged log comes back here.
# A log that was not restored from an existing branch is never saved over it. The claude-mem store stays out: an archive.
set -euo pipefail
SHARED_DIR=${SHARED_DIR:-$HOME/toolkit-data}; REPO=${REPO_DIR:-$(git rev-parse --show-toplevel)}
TO="$SHARED_DIR/task-observer"; LOG="$TO/skill-observations"; FROM="$TO/restored-from"
case "${1:-}" in
restore)
  git -C "$REPO" fetch -q origin toolkit-data 2>/dev/null || { echo "toolkit-data: no branch to restore from"; exit 0; }
  fresh=no; [ -d "$LOG" ] || [ -f "$FROM" ] || fresh=yes
  mkdir -p "$SHARED_DIR" && git -C "$REPO" archive FETCH_HEAD task-observer | tar -x -C "$SHARED_DIR" --skip-old-files
  [ "$fresh" = no ] || git -C "$REPO" rev-parse FETCH_HEAD > "$FROM"
  echo "toolkit-data: restored" ;;
save)
  [ -d "$LOG" ] || { echo "toolkit-data: no observation log at $LOG"; exit 0; }
  BASE=$(cat "$FROM" 2>/dev/null || true)
  if [ -z "$BASE" ] && git -C "$REPO" ls-remote -q --exit-code origin refs/heads/toolkit-data >/dev/null; then
    echo "toolkit-data: this log was not restored from the branch (install-all.sh); not saving over it" >&2; exit 1
  fi
  WT=$(mktemp -d)/toolkit-data
  trap 'git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || true
        git -C "$REPO" branch -q -D toolkit-data-save 2>/dev/null || true' EXIT
  if [ -n "$BASE" ]; then
    git -C "$REPO" cat-file -e "$BASE^{commit}" 2>/dev/null || git -C "$REPO" fetch -q origin toolkit-data
    git -C "$REPO" worktree add -q --detach "$WT" "$BASE"
  else
    git -C "$REPO" worktree add -q --orphan -b toolkit-data-save "$WT"
  fi
  mkdir -p "$WT/task-observer"; rm -rf "$WT/task-observer/skill-observations"; cp -a "$LOG" "$WT/task-observer/"
  git -C "$WT" add -A
  if ! git -C "$WT" diff --cached --quiet; then git -C "$WT" commit -q -m "The kit's observation log, $(date -u +%F)"
  elif [ -z "$BASE" ]; then echo "toolkit-data: nothing to save"; exit 0; fi
  for wait in 2 4 8 16; do
    if git -C "$WT" fetch -q origin toolkit-data 2>/dev/null && ! git -C "$WT" rebase -q -X theirs FETCH_HEAD; then
      git -C "$WT" rebase --abort || true
      echo "toolkit-data: this log and the branch's could not be merged; nothing saved" >&2; exit 1
    fi
    if git -C "$WT" push -q origin HEAD:refs/heads/toolkit-data; then
      rm -rf "$LOG"; cp -a "$WT/task-observer/skill-observations" "$TO/"
      git -C "$WT" rev-parse HEAD > "$FROM"; echo "toolkit-data: saved"; exit 0
    fi
    sleep "$wait"   # another session saved first: merge onto its save and try again
  done
  echo "toolkit-data: the push failed four times" >&2; exit 1 ;;
*) echo "usage: toolkit-data.sh restore|save" >&2; exit 2 ;;
esac
