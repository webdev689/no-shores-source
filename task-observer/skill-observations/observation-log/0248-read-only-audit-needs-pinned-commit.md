---
id: 248
title: "A read-only audit read a tree the controller kept editing"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "the Toolkit's Audits section: it says what the brief holds, not that the tree is frozen or the commit pinned"
area: "Audits (one read-only audit agent before a feature is called done)"
date: 2026-11-25
session_context: "The desktop app session: the audit was started on the working tree; the controller then committed 202536ce and edited main.ts, pageHost.ts and desktop.ts; the auditor reported findings across both states."
parked_until: "PR #244 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #244, merged 2026-11-27"
reference:
commands_verified: "reported by the audit agent (OBSERVATIONS line): 'the work being audited was committed and edited by another agent during the audit, so a read-only auditor needs the commit pinned'"
---

The audit was briefed on the working tree, and the controller went on editing it. Its findings stayed right, but its
line numbers spanned two states. Proposal for the owner: the Audits section says to commit first and give the
auditor the commit (`git show <sha>`, or a worktree at it), and the controller works elsewhere until it reports.
