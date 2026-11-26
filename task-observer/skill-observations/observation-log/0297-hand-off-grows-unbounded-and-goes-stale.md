---
id: 297
title: "The hand-off grew to 1,216 lines (some 48k tokens), keeps merged work under 'Waiting on the owner', and its open-PR list was stale; superseded hand-off drafts stay open"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/Hand-off.md", "CLAUDE.md", "bible/04-Procedures/Branches and Merging.md"]
siblings_checked: "checked: 0153 covers hand-off entries conflicting between PRs, not the note's size or staleness; 0165 a PR named that never opened; this is the note's growth and its PR list against GitHub"
area: "keeping the hand-off a note of where work stands"
date: 2026-11-26
session_context: "Orientation and bible review at 611cb8ef: Hand-off.md is the largest note but Interface.md; 'Waiting on the owner' (lines 225-1042) is mostly merged and deployed PRs with merge words and CI run numbers; its 'Open pull requests' line names #162 (no longer open) and misses #221, #223, #218; GitHub shows superseded draft PRs open: #182 (superseded by #200), hand-off-only drafts #189, #197, #198, #213, #214, and #204 beside #218."
parked_until:
resolved: 2026-11-26
resolution: "On the owner's 'Take on all of this': PR #225 rewrote the hand-off (1,216 to about 280 lines), its intro saying a merged PR leaves it at the next rewrite, the owner's points moved to Open Questions; the superseded drafts closed. No size check proposed: that would be a new check, the owner's to agree."
reference: "bible/Hand-off.md at 611cb8ef; list_pull_requests state=open on 2026-11-26"
commands_verified: "wc -l bible/Hand-off.md: run, 1216; list_pull_requests open: run, 15 open"
---

**Issue:** CLAUDE.md asks each session to rewrite the hand-off at its end, but sessions append: the note is 1,216
lines, so reading it costs a session about 48k tokens (the Read tool cut it at half). Its "Waiting on the owner"
holds some 40 merged and deployed PRs, each with the owner's merge words and CI run numbers (history, which the
rules put in PRs), while the points actually waiting on the owner are scattered in their tails rather than in Open
Questions. Its open-PR line was stale against GitHub, and superseded draft PRs (old hand-off rewrites, #182) stay open.

**Suggested improvement:** For the owner to decide: the hand-off keeps only what is in flight (open PRs, checked
against GitHub at each rewrite) and what waits on the owner, each point once; a merged PR's entry leaves at the next
rewrite, its open points moving to Open Questions or Next. Superseded drafts are closed with the owner's yes.

**Principle:** A note every session must read and every session rewrites needs a size bound and a rule for what
leaves it, or append-only growth turns a status page into a second changelog.
