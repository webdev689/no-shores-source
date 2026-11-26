---
id: 117
title: "A picture worker was stopped by the 2-hour background limit again, losing its end steps"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "assumed: header rebuilt from the body at repair on 2026-11-26; the sibling check is due at the review"
area: "picture briefs and the background limit"
date: 2026-11-22
session_context: "The public events' picture pass, resume-pictures2"
parked_until:
resolved:
resolution:
reference:
commands_verified: none
---
# 0095 picture worker stopped by the 2-hour background limit again

- Date: 2026-11-22
- Where: run-worker.sh on ~/wt/pictures (resume-pictures2.md), run in the background with the maximum timeout.
- What happened: the third picture run was killed at 2 hours. It made two fix commits (55dd1bef, aa8c9fc6) and only
  a few raid shots, at about 18 s a frame on SwiftShader. Its report has no review, no full check and no reply.
- Why it matters: a picture brief that covers every beat cannot finish inside one background run. Each kill also
  loses the worker's end steps (review, ponytail, check, report).
- Proposed change: split picture briefs into groups that each fit in about 90 minutes (for example, raid; Fissure
  rest; end and night; banner sizes), with the end steps after the last group. Or have run-worker.sh warn at 100
  minutes so the worker commits and writes its report before the kill.
- Seen after: the merged picture work failed `format (TypeScript)` (publicBanner.test.ts), since the kill came before
  its own check; the controller formatted it and checked again before the push.
- Status: open (proposal for the owner).
