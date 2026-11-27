---
id: 242
title: "Main's CI fetches the island packs from an r2.dev address Cloudflare rate-limits, so a 429 blocks a merge's deploy"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: [".github/workflows/ci.yml", "content/islands/modules.json"]
siblings_checked: "checked: instance-specific to this repository's CI and its public bucket; observations 0154 and 0157 cover the R2 host in cloud sessions, not this limit"
area: "CI's island packs step, and every deploy behind it"
date: 2026-11-25
session_context: "#205 merged as 9e690992 on the owner's 'Deploy'. Main's run 45542496190 failed 80 s in at 'Fetch the island packs': curl got 429 from pub-d12f498b9e8d40e7a180531f21e17c18.r2.dev, so the check and every deploy job (rooms, accounts, pages, site, bot) were skipped and nothing deployed. The PR's own run on the same tree had passed 1 minute earlier. Its failed jobs were re-run once."
parked_until: "PR #240 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #240, merged 2026-11-27"
reference: "run 45542496190; bible/02-Systems/Sprite Forge.md ('Cloudflare limits how often an r2.dev address answers')"
commands_verified: "jq -r .base content/islands/modules.json -> https://pub-d12f498b9e8d40e7a180531f21e17c18.r2.dev/"
---

**Issue:** The packs CI needs come from a public `r2.dev` address, which Cloudflare limits and calls unfit for
production. Two CI runs close together (a PR's run, then main's on its merge) can draw a 429, and on main that skips
the deploy the owner said yes to.

**Suggested improvement:** For the owner to choose: serve the bucket under a name of the `noshores.online` zone (now
a Cloudflare zone), as the Sprite Forge note already plans for the renders; or cache the packs in CI by their hash
(their keys are hashes), so a run fetches only what changed.

**Principle:** A gate that depends on a rate-limited host fails on busy days; a deploy behind it fails with it.
