#!/bin/bash
# Free a merged worker's disk: delete its worktree's target/ once its head is on origin/main and it is not running.
# The worktree and its scratch stay: running workers' briefs can still name them.
# usage: bash clear-target.sh <worktree dir | worker name>     (name = the worktree's folder name under ~/wt)
W=$1; [ -d "$W" ] || W=$HOME/wt/$W
W=$(cd "$W" 2>/dev/null && pwd) || { echo "clear-target: no worktree $1" >&2; exit 1; }
PIDF=$(dirname "$W")/reports/$(basename "$W").pid
if [ -s "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo "clear-target: $(basename "$W") is running; kept" >&2; exit 1; fi
git -C "$W" fetch -q origin main || { echo "clear-target: origin out of reach; kept" >&2; exit 1; }
git -C "$W" merge-base --is-ancestor HEAD FETCH_HEAD ||
  { echo "clear-target: $(basename "$W")'s head is not on origin/main; kept" >&2; exit 1; }
rm -rf "$W/target" && echo "clear-target: cleared $W/target"
