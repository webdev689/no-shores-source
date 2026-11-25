#!/bin/bash
# Waits until any named worker's log gains a "WORKER <name> EXIT" line past the count it started with, and prints
# which. usage: wait-worker.sh <name> ... (from Claude: Bash run_in_background, timeout 7200000; started again if it
# reaches that limit, as the detached worker keeps running).
names="$*"; reports=${REPORTS_DIR:-$HOME/wt/reports}; declare -A start
count() { local found; found=$(grep -c "^WORKER $1 EXIT" "$reports/$1.log" 2>/dev/null); echo "${found:-0}"; }
for name in $names; do start[$name]=$(count "$name"); done
while true; do
  for name in $names; do
    if [ "$(count "$name")" -gt "${start[$name]}" ]; then echo "EXITED: $name"; tail -2 "$reports/$name.log"; exit 0; fi
  done
  sleep 30
done
