---
id: 308
title: "claude-mem's semantic search refused its connection in workers; only the keyword fallback answered"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/check-tools.sh"]
siblings_checked: "checked: check-tools WARNed only that no claude-mem store existed yet"
area: "claude-mem in a fresh container"
date: 2026-11-26
session_context: "music-pass's first claude-mem search: chroma connection refused, keyword fallback found nothing; check-tools had passed it with a WARN for no store."
parked_until: "PR #242 merge"
resolved:
resolution:
reference: "~/wt/reports/music-pass.log"
commands_verified: "none by the controller; the worker's report"
---
Proposed: check-tools makes one real semantic search and FAILs when chroma refuses.
