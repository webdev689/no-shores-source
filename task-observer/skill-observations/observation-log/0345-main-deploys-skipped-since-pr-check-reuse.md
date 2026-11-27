---
id: 345
title: "Since main reuses the PR's check (#237), a merge's rooms, desktop, pages and site deploys are skipped: a skipped ancestor job skips every job whose `if` has no status function"
status: open
type: internal
skill: []
proposes_skill: []
target_file: [".github/workflows/ci.yml"]
siblings_checked: "checked: pages, site and bot already use !cancelled() and needs.check.result; rooms and desktop use a bare condition"
area: "deploying from main"
date: 2026-11-27
session_context: "PR #229 merged on the owner's yes (b60415980): ci run 1302 passed in 27 s with rooms, site, desktop, pages and bot/deploy all skipped; #228's run 1295 the same. The `part` matrix is skipped when `earlier` finds the PR's check passed, and GitHub skips jobs needing a skipped ancestor unless their `if` uses a status function. A workflow_dispatch run of ci.yml on main (which re-runs the parts) was started to deploy."
parked_until:
resolved:
resolution:
reference: "https://github.com/Lattymoy/no-shores-source/actions/runs/45997694364"
commands_verified: "list_workflow_jobs on runs 45997694364 and 45939457240: deploy jobs skipped"
---

**Issue:** `rooms` and `desktop` say `if: github.ref == 'refs/heads/main' && (push || workflow_dispatch)` with no status function, so the implicit `success()` fails on the skipped `part` ancestor; `pages` and `site` then wait on the rooms' outputs and skip too. Every merge since #237 that reused its PR's check deployed nothing, and the run still shows green.

**Suggested improvement:** give `rooms` and `desktop` `!cancelled() && needs.check.result == 'success' && ...` as `pages`, `site` and `bot` have; and make the run fail (or warn) when the check passed on main but no deploy job ran where code changed. Needs the owner's named approval (a deploy rule).

**Principle:** a green run whose deploy jobs were all skipped is not a deploy; a check that reports success must also prove the step it gates ran.
