#!/bin/bash
# Waits until any named worker is done, run-worker.sh's last line ("WORKER <name> DONE", after any resume) past the
# count it started with, or gone: its pid file gone or its process dead with no DONE line (it died), or never written
# in its first two minutes (it never started). Prints which and the log's last lines.
# usage: wait-worker.sh <name> ... (from Claude: Bash run_in_background, timeout 7200000; started again if it
# reaches that limit, as the detached worker keeps running). REPORTS_DIR: the workers' reports folder, the one beside
# their worktrees (default ~/wt/reports).
[ $# -gt 0 ] || { echo "usage: wait-worker.sh <name> ..." >&2; exit 2; }
reports=${REPORTS_DIR:-$HOME/wt/reports}; declare -A start seen
count() { local found; found=$(grep -c "^WORKER $1 DONE" "$reports/$1.log" 2>/dev/null); echo "${found:-0}"; }
alive() { local pid; pid=$(cat "$reports/$1.pid" 2>/dev/null) && [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; }
for name in "$@"; do start[$name]=$(count "$name"); done
began=$SECONDS
while true; do
  for name in "$@"; do
    if [ "$(count "$name")" -gt "${start[$name]}" ]; then echo "DONE: $name"; tail -3 "$reports/$name.log"; exit 0; fi
    if alive "$name"; then seen[$name]=1; continue; fi
    # Its last line may land between the two reads: read the count once more before calling it gone.
    [ "$(count "$name")" -gt "${start[$name]}" ] && continue
    if [ -n "${seen[$name]:-}" ]; then echo "GONE: $name (no DONE line)"; tail -3 "$reports/$name.log" 2>/dev/null; exit 1; fi
    if [ $((SECONDS - began)) -ge 120 ]; then echo "NEVER STARTED: $name (no live pid file in $reports)"; exit 1; fi
  done
  sleep 30
done
