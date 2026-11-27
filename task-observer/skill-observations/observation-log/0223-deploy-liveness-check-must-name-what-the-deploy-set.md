---
id: 223
title: "A deploy's liveness check compared /health against a hand-set version constant, so after the first deploy it passed with the old code still serving"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: [".github/workflows/rooms.yml", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: rooms.yml's accounts check reads /v1/health for ok only (same weakness, unfixed); bot.yml fixed to the commit; site.yml checks only that addresses answer"
area: "post-deploy health checks in CI workflows"
date: 2026-11-24
session_context: "PR #194: bot.yml first checked that /health answered BOT_VERSION ('core1'), a constant nobody bumps. A read-only review caught it; fixed by stamping GITHUB_SHA on the Worker as BOT_COMMIT and requiring /health to answer it. The accounts' check in rooms.yml asks only for ok."
parked_until: "PR #240 merge"
resolved:
resolution:
reference:
commands_verified: "run: node --test server/bot/worker.test.ts -> failed before the BOT_COMMIT fix, 17 pass after"
---

**Issue:** The new workflow's last step asked the deployed Worker's health route for a version string kept by hand
in the code. Nothing forces that string to change with the code, so from the second deploy on, the old Worker answers
the same string and the check passes whether or not the new code went live. The accounts' existing check in
rooms.yml has the same gap: it asks only that /v1/health answers ok.

**Suggested improvement:** Have each Worker deploy stamp the commit it came from (a deploy-time var) and have the
check require the health route to answer that commit. Apply it to the accounts' check in rooms.yml as well, after the
owner agrees; note the pattern in the Toolkit note's deploy guidance.

**Principle:** A post-deploy check proves the new code is live only if it compares against something the deploy
itself just set; a value carried in the source is the same before and after a deploy that failed to take.
