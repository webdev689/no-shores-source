#!/usr/bin/env bash
# Self-check for pr-state.sh: in a scratch clone, a pushed branch that merges cleanly passes, and one that conflicts
# with origin/main and was never pushed fails with both said.
set -eu
script="$(cd "$(dirname "$0")" && pwd)/pr-state.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git init -q --bare -b main "$tmp/origin.git"
git clone -q "$tmp/origin.git" "$tmp/clone" 2>/dev/null
cd "$tmp/clone"
git config user.email test@example.invalid
git config user.name test
git config push.negotiate false
echo one >file && git add file && git commit -qm one && git push -q origin main
git switch -qc clean && echo other >other && git add other && git commit -qm clean && git push -q origin clean
git switch -q main && git switch -qc clash && echo two >file && git commit -qam clash
git switch -q main && echo three >file && git commit -qam three && git push -q origin main
git switch -q clean
out=$(bash "$script") && { echo "FAIL: a conflict did not fail the script"; exit 1; }
for want in "== clean: 1 commit(s)" "merges cleanly" "origin: holds its head" "== clash: 1 commit(s)" \
  "CONFLICTS with origin/main" "origin: no branch clash" "GitHub tools"; do
  grep -qF "$want" <<<"$out" || { echo "FAIL: missing \"$want\" in:"; echo "$out"; exit 1; }
done
echo "pr-state-test: ok"
