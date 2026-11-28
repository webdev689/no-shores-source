---
id: 206
title: "The world picture harness slowed Date.now 20x, which hid the banner cloth's motion the audit then called missing; a background vite preview died at the 10-minute default"
status: declined
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: the menu harness (auditShots.ts/run.mjs) does not slow the clock; only the world plan (world-plan.json from makeworld.mjs) does, so only motion in the world is affected"
area: "judging motion from world pictures"
date: 2026-11-24
session_context: "PR #179's third audit: the visual auditor said the banner cloth 'is a flat sheet with no movement' from two world frames. fix3-world found the audit's plan slows Date.now 20x, so 'one second apart' was 1/20 s of game time; it then measured the cloth truly barely moved, and made it sway. It also saw a background `npx vite preview` die at the 10-minute default timeout mid-run, and webgpu-shot frames take 30-80 s on shared cores."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: the slowed-clock world plan (makeworld.mjs) is not in the repo, so that half is obsolete; the vite-preview timeout half is in worker-long-timeouts"
reference:
commands_verified: "worker's report /root/wt/reports/fix3-world.md and fix3-world.log OBSERVATIONS lines"
---

**Issue:** A picture plan that slows the game clock makes "two frames a second apart" mean far less game time, so the pictures understate motion. Here the finding happened to be true, but it was found by accident. A preview server started in the background with the default timeout also died partway through a run.

**Suggested improvement:** webgpu-shot plans should print the clock factor they use, and a brief asking to judge motion should say to compare frames a stated span of game time apart. Start `vite preview` with `run_in_background` and a timeout of an hour or more.

**Principle:** A picture of motion means nothing without the clock it was taken on. Long-lived helpers need timeouts that outlast the run they serve.
