#!/bin/bash
# Saves the kit's observation log to the orphan branch toolkit-data of this repository, so it outlives the container;
# install-all.sh restores it. Run at the end of a session, from the repository. First it takes in any observation a
# parallel session saved that this container never had, so a save never drops another's; then the branch mirrors the
# log. Only the text log goes there: the claude-mem store is an archive, which the repository keeps out of git.
SHARED_DIR=${SHARED_DIR:-$HOME/toolkit-data}
set -euo pipefail
REPO=$(git rev-parse --show-toplevel); LOG="$SHARED_DIR/task-observer/skill-observations"
[ -d "$LOG" ] || { echo "toolkit-data: no observation log at $LOG"; exit 0; }
WT=$(mktemp -d)/toolkit-data
trap 'git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || true; git -C "$REPO" branch -q -D toolkit-data-save 2>/dev/null || true' EXIT
for wait in 2 4 8 16; do
  if git -C "$REPO" fetch -q origin toolkit-data 2>/dev/null; then
    git -C "$REPO" ls-tree -r --name-only FETCH_HEAD -- task-observer/skill-observations/observation-log | while read -r path; do
      name=${path##*/}
      [ -e "$LOG/observation-log/$name" ] || [ -e "$LOG/observation-log/archive/$name" ] ||
        { mkdir -p "$SHARED_DIR/${path%/*}"; git -C "$REPO" show "FETCH_HEAD:$path" > "$SHARED_DIR/$path"; }
    done
    git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || true
    git -C "$REPO" worktree add -q --detach "$WT" FETCH_HEAD
  else
    git -C "$REPO" worktree add -q --orphan -b toolkit-data-save "$WT"
  fi
  mkdir -p "$WT/task-observer"; rm -rf "$WT/task-observer/skill-observations"
  cp -a "$LOG" "$WT/task-observer/skill-observations"
  git -C "$WT" add -A
  if git -C "$WT" diff --cached --quiet; then echo "toolkit-data: nothing new to save"; exit 0; fi
  git -C "$WT" commit -q -m "The kit's observation log, $(date -u +%F)"
  git -C "$WT" push -q origin HEAD:refs/heads/toolkit-data && { echo "toolkit-data: saved"; exit 0; }
  sleep "$wait"   # another session saved first: take in its log and try again
done
echo "toolkit-data: the push failed four times" >&2; exit 1
