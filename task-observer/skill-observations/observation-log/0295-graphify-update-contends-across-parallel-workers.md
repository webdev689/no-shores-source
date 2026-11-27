---
id: 295
title: "graphify update runs once per worker and contends when several workers start together; a query by plain words misses symbols"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is a project file, not a skill"
area: "worker first actions under parallel load"
date: 2026-11-26
session_context: "Deeper dungeons session: three workers started at once (storey-engine, dungeon-chests, dungeon-map); the chests worker reported graphify update taking over 2 minutes with about 14 graphify copies running, and graphify query on 'place line' missing placeWords, which grep found."
parked_until:
resolved:
resolution:
reference: "/home/user/wt/reports/dungeon-chests.log (ephemeral)"
commands_verified: none
---

**Issue:** Every worker's mandatory first actions include `graphify update .` in its own worktree. Started together, the workers' updates (and graphify's own watchers) ran some 14 copies at once on 4 CPUs, each taking over two minutes, beside three wasm builds. A plain-words `graphify query` then missed the function it was asked for.

**Suggested improvement:** Let a worker started from a fresh worktree of a commit the controller already graphed reuse the controller's graph (copy graphify-out, then `graphify update .` only after its own edits), or stagger worker starts; and say in the brief template that a query should name a function or file, as the Toolkit already says for the controller.

**Principle:** A per-worker setup step that is cheap alone becomes the bottleneck when workers start together; share what is identical across them.
