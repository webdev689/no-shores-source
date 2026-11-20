---
id: 17
title: "An auditor called owner-approved lore invented because its brief never said to search other branches' decisions"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["/root/wt/reports/audit-common.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is the project's audit and worker brief, not a skill"
area: "independent audit briefs"
date: 2026-11-20
session_context: "Overlook factions round, second audit pass: six parallel auditors on PR #92; the keepers auditor reported the Grey Tithe's tenth as invented lore breaking the Dialogue rule, while the bible auditor found the owner's approving decision on open PR #77's branch"
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/audit-keepers.md finding 4; /root/wt/reports/audit-bible.md finding 6"
commands_verified: "git for-each-ref refs/remotes + git grep 'take a tenth' -- bible: run, found the decision on origin/ccr-e003e24b-5hcnat"
---

**Issue:** The shared audit brief told auditors where the owner's decisions live on this branch but not that sessions
in flight record owner decisions on their own branches. One auditor, finding lore with no decision on the branch,
called it invented and proposed removing it; a second auditor searched every remote branch and found the owner had
approved it on another open pull request. Following the first report would have deleted owner-approved lines.

**Suggested improvement:** Every audit or worker brief that judges "the owner never decided X" must first search
every remote branch's bible (the headroom-learned loop over `refs/remotes`), and report a decision found elsewhere
as "decided on <branch>, not yet merged" rather than as invented.

**Principle:** A claim that something was never decided is a claim about every place decisions are recorded; when
parallel work records decisions on its own branches, the absence check must cover all of them.
