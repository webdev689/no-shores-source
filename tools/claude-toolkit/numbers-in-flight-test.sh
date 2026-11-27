#!/bin/bash
# numbers-in-flight.sh against a local origin: a pull request's new ask, refusal and foe type are listed, one already
# merged into main is not, one adding no number is not, a named pull request limits the list, and an origin serving
# no pull heads says it cannot.
# Exits non-zero naming what failed; check_tools.py runs it.
set -euo pipefail
KIT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail() { echo "numbers-in-flight-test: $1" >&2; exit 1; }
git init -q --bare "$T/origin.git"; git init -q "$T/repo"; cd "$T/repo"
git config user.email test@example.invalid; git config user.name test; git remote add origin "$T/origin.git"
mkdir -p crates/protocol/src crates/gear/src crates/foes/src
printf 'pub const SPEAK: u8 = 64;\n' > crates/protocol/src/gear_wire.rs
printf 'pub enum Refusal {\n    NoDive = 173,\n}\n' > crates/gear/src/refusal.rs
printf 'pub const RUNNER: u8 = 1;\n' > crates/foes/src/roster.rs
git add -A; git commit -q -m main; git push -q origin HEAD:refs/heads/main
run() { REPO_DIR="$T/repo" bash "$KIT/numbers-in-flight.sh" "$@" 2>&1 || true; }
run | grep -q 'serves no refs/pull' || fail "an origin with no pull heads did not say it cannot list them"
git checkout -q -b one
printf 'pub const SPEAK: u8 = 64;\npub const OPEN: u8 = 96;\n' > crates/protocol/src/gear_wire.rs
printf 'pub enum Refusal {\n    NoDive = 173,\n    FoesNear = 184,\n}\n' > crates/gear/src/refusal.rs
printf 'pub const RUNNER: u8 = 1;\npub const WARDEN: u8 = 49;\n' > crates/foes/src/roster.rs
git commit -q -am one; git push -q origin HEAD:refs/pull/1/head
git checkout -q main; git checkout -q -b two
printf 'pub const SPEAK: u8 = 64;\npub const KINDLE: u8 = 92;\n' > crates/protocol/src/gear_wire.rs
git commit -q -am two; git push -q origin HEAD:refs/pull/2/head HEAD:refs/heads/main
git checkout -q main; git checkout -q -b three; printf 'notes\n' > notes.md; git add notes.md
git commit -q -m three; git push -q origin HEAD:refs/pull/3/head
listed=$(run | grep '^#' || true)
[ "$(grep -c . <<<"$listed")" = 1 ] || fail "expected one pull request listed, got: $listed"
grep -qx '#1 asks: 96; refusals: 184; foe types: 49' <<<"$listed" || fail "pull request 1's numbers: $listed"
named=$(run 3)
grep -q '^numbers-in-flight: 1 pull' <<<"$named" && ! grep -q '^#' <<<"$named" ||
  fail "naming a pull request did not read it alone: $named"
echo "numbers-in-flight-test: ok"
