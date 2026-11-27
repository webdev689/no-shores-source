---
id: 328
title: "Since #237, a merge to main skips every deploy: rooms and desktop lack !cancelled(), so the skipped check parts skip them"
status: open
type: internal
skill: []
proposes_skill: []
target_file: [".github/workflows/ci.yml"]
siblings_checked: "checked: #241's and #228's push runs on main both skipped rooms, desktop, pages, site, bot deploy"
area: "CI, deploys"
date: 2026-11-27
session_context: "#228 merged at 902661c9; its push run skipped rooms, desktop, site, pages and bot deploy, as #241's had. ci.yml's part job is skipped on main when the pull request's check passed the code; rooms and desktop (needs: check) use an if without !cancelled(), so a skipped ancestor skips them, and pages, site and bot wait on rooms. Deployed by hand with workflow_dispatch of ci.yml on main (run 45943547621: all deployed). Fix proposed to the owner: start rooms' and desktop's if with !cancelled() && needs.check.result == 'success' &&. A deploy change: the owner's yes."
parked_until:
resolved:
resolution:
reference: "runs 45939457240 (skipped), 45935148840 (#241, skipped), 45943547621 (hand run, deployed)"
commands_verified: "list_workflow_jobs on each run"
---
