---
id: 7
title: "headroom learn finds no data when the session started in another repository's folder"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: [tools/claude-toolkit/README.md]
siblings_checked: "none"
area: "session end: headroom learn"
date: 2026-11-19
session_context: "Picking up overlook-source#63 from a cloud session whose working directory was dfo-online-source"
parked_until:
resolved: 2026-11-20
resolution: "Applied to CLAUDE.md's session end (headroom learn skipped with a line why) on https://github.com/Lattymoy/overlook-source/pull/100 (weekly review)"
reference:
commands_verified: "run: headroom learn --project . --apply in overlook-source printed 'No project data found' and listed only dfo-online-source"
---

**Issue:** The session's working directory was another repository, with overlook-source cloned beside it. headroom
keys its transcripts by the session's start folder, so learning for overlook-source found nothing, and applying it to
the start folder would have written into the wrong repository.

**Suggested improvement:** The end-of-session step names the project to learn from: the session's start folder,
applied to the repository the work was in, or skipped with a line saying why.

**Principle:** A tool keyed by the session's start folder must be pointed at the work explicitly when the work happens
in another checkout.
