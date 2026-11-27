---
id: 266
title: "Every worker's own review said Ship, yet four area reviews of the integrated diff found 39 findings, most crossing worker boundaries"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: the per-worker review step (brief-common-template's reviewer sub-agent and ponytail-review on the worker's own diff) is the only review the template asks for; superpowers:requesting-code-review is per task too. Instance applies to any multi-worker build, not only this repo"
area: "multi-worker builds: review scope"
date: 2026-11-25
session_context: "Passages session: nine workers each ran the template's reviewer and ponytail-review on their own diff (all Ship or one fix round). After merging, the controller ran four read-only reviewers on `git diff origin/main...HEAD` (16k lines), split by area (rules crates, wire/door/server, client, content/tools/bible). They returned 6, 12, 12 and 9 findings."
parked_until: "PR #242 merge"
resolved:
resolution:
reference: "this session's four review hand-backs; briefs /root/wt/briefs/fixrules-item.md, fixsave-item.md, fixclient-item.md"
commands_verified: "run: git diff --stat origin/main...HEAD -> 276 files, +16047 -1616"
---

**Issue:** A worker's review sees only its diff, so the bugs that live between workers' pieces pass every review:
the week's turn handled in the join refusal but not in later asks, the wire or the server (one worker each); the
keeper's immediate-save key leaving out what the arrival rules read (server worker against rules worker); the page's
alone path never reaching the room it was built for (client worker against server worker); an owner number ("about
15 minutes") broken by a later worker's measured zone length. Several were also missed because each worker's tests
fixed its own side's assumption.

**Suggested improvement:** the controller's procedure (Toolkit.md, "Workers") gains one step before a pull request
is called done: read-only reviewers on the integrated diff, one per area, briefed with the code and the notes, not the
controller's conclusions, each finding with a concrete case; then fix workers that write a failing test per finding
first, so a finding that does not hold is dropped by evidence. The template's per-worker review stays.
