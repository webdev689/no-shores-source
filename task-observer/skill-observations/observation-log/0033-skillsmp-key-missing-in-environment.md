---
id: 33
title: "check-tools FAIL: SkillsMP has no key in this cloud environment, and Context7's anonymous quota runs out"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh", "bible/Hand-off.md"]
siblings_checked: "family: the kit's keyed MCP servers. context7: same cause, WARN not FAIL (anonymous tier works), noted here. No other keyed server."
area: "session setup, install-all.sh step 1"
date: "2026-11-19"
session_context: "Taking over branch claude/loving-darwin-sw4eae (the prologue) after the earlier session paused; first-step install."
commands_verified: "run: KIT_DIR=$PWD/tools/claude-toolkit REPO_DIR=$PWD bash tools/claude-toolkit/install-all.sh returned 21 PASS, 4 WARN, 1 FAIL"
---

check-tools printed "FAIL skillsmp: no SKILLSMP_API_KEY in the environment" and "WARN context7 key: no CONTEXT7_API_KEY".
The hand-off already says the kit's keys are network secrets on one of two environments named Default, and a session on
the other fails these lines. This session runs on the keyless one. A key is the owner's call: nothing was changed.
Proposal for the owner: say which environment sessions should run on, or add the two keys as network secrets here.

2026-11-20, a later session (same keyless Default): the owner pointed to the repository's GitHub Actions secret
SKILLSMP_API_KEY. Actions secrets reach only workflow runs, never a cloud session, so it cannot feed the kit. The
session's environment shows no network secrets; the owner declined the in-session credential form. Proposal stands:
the key goes on the cloud environment (Network secrets, host skillsmp.com), or the kit treats SkillsMP as optional.

2026-11-21, the codebase audit session (env_01B5thiSk5DV9ZZPHmpEGrYc, a "Default" with no network secrets and no
variables): SkillsMP FAIL again, and Context7 now FAILs too: its anonymous tier answered "Monthly quota exceeded",
so the keyless fallback the hand-off relies on is spent for the month. Neither tool was needed for the audit.
