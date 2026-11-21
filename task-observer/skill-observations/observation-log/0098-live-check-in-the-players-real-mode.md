---
id: 98
title: "A live check in the player's real mode (no account) caught a gating bug every test missed; and malformed id-claim markers break new-observation.sh's floor"
status: open
type: open-source
skill: [task-observer]
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the first finding applies to any verification skill (superpowers:verification-before-completion); the second is instance-specific to task-observer's script"
area: "verification of features gated on who the player is; observation id claims"
date: 2026-11-21
session_context: "Overlook #131 houses' roads: the full check and unit tests passed, but the live headless run without an account showed no quest tracker, because the gear message's `claimed` flag was never set for an unkept player on land."
parked_until:
resolved:
resolution:
reference:
commands_verified: "node target/grab720.mjs '/?at=overlook-social&room=ws://127.0.0.1:8787' ':online-v4' against a local wrangler dev"
---

**Issue 1:** Every test built its player with a character already claimed, so a page shown only to a "claimed" player
passed every test while a real player without an account saw nothing. Only the live headless run in the mode a first
player actually uses (online, no account, no token) showed the gap.

**Improvement:** For any feature gated on who the player is (account, claim, pledge), the live check runs in the
plainest real mode first: no account, a fresh character. A test that sets the gate up by hand does not count as that
check.

**Issue 2:** `new-observation.sh` failed its floor write with `10#0099-: syntax error`: the claim directory held
malformed markers `0094-`, `0098-` and `0099-` (made 18:06, not by number alone), which `sort -n | tail -1` picks up
and `$((10#...))` cannot read. The observation file was created; the floor was fixed by hand to 98. The markers were
left, so the next run fails the same way until they are removed or the script filters `^[0-9]+$`.

**Improvement:** The floor's `top_claim` loop keeps only names that are all digits.
