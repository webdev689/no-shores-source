---
id: 221
title: "Parallel module workers on one core each had to edit the same core test and build their own fake-Discord rig; the proxy refuses Context7 and SkillsMP in every worker"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: worker briefs and parallel workers. checked: no entry covers a core's tests pinning an empty registry or a shared rig left to each worker."
area: "no-shores-source, workers porting DFO's Discord bot (#194)"
date: 2026-11-24
session_context: "The bot core worker's worker.test.ts pinned the command list to ['panel'], so all three module workers (safety, community, engagement) edited that same core line and conflicted on merge; standGateway's fake Discord remembers no posts, so each module worker wrote its own remembering fake. Context7 and SkillsMP were refused by the proxy (403) in all seven workers; check-tools reports SkillsMP FAIL (no key) and Context7 FAIL (not registered) at install. graphify update took over 2 minutes with four workers running. A worker's regex rename of the short name `at` changed words inside strings ('Today at' to 'Today moment')."
parked_until: "PR #242 merge"
resolved:
resolution:
reference:
commands_verified: "python3 tools/claude-toolkit/workers/audit.py ~/wt/<name> for each worker; git merge of wk-bot-safety, wk-bot-community, wk-bot-engagement (conflicts in server/bot/registry.ts, worker.test.ts, the Discord Bot note each time)"
---
Proposed: a brief for a core that others build on asks the core worker to leave its tests module-agnostic (behaviour,
not a pinned list) and to ship the shared test rig the modules need; the template says a renamer must skip string
literals. Context7 and SkillsMP need their keys or the proxy's allowance, or the template should stop asking workers
to use them.
