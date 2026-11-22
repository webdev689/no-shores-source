---
id: 97
title: "The stop hook asks for a push while the full check is still failing or still running"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh"]
siblings_checked: "none: the hook is the harness's stop hook, not a skill"
area: "stop hooks and the check-before-push rule"
date: 2026-11-21
session_context: "Background builders were mid-work on a design commit whose wire fields broke the build; the stop hook asked three times to commit and push. Again in the combat-notes session (#135): a full `cargo xtask check` takes several minutes and failed four times on golden hashes and tests; the hook asked to push at each of seven turn ends while a run was in flight."
parked_until:
resolved:
resolution:
reference:
commands_verified: "none"
---

**Issue:** The stop hook asks to commit and push whenever the branch has unpushed commits or changes. The project
says the full check must pass before every push. While background builders work, the controller ends a turn with a
commit that cannot pass yet, and the hook asks again at every turn end.

**Suggested improvement:** Let the stop hook accept a marker (a file under .git, or a note in the turn) that says work
is in flight and the check is pending, or have it ask only for commits whose check has passed.

**Principle:** An automatic reminder must yield to the project's own gate, or it trains the agent to ignore it.

**Second instance (combat notes, #135):** Each full `cargo xtask check` ran in the background for several minutes, and
four runs failed (golden hashes, a lint, test fixtures) before one passed. The stop hook fired at seven turn ends,
asking to push commits the check had not yet passed or had just failed. The rule held only because the agent kept
refusing; a run that is never finished could not be told apart from one the agent forgot.

**Second occurrence: a barrier, not a rewording.** Have `cargo xtask check` write its verdict and the commit it
covered (`.git/overlook-check`), and have the stop hook stay quiet while the head's verdict is "running" or "failed",
asking for a push only once the head has passed. Proposing this needs the owner's agreement (a change to the hook).


2026-11-22, the codebase audit session: the Stop hook asked for a push four times while a full check ran (twice
mid-check, twice with commits a later check was to cover); each time the push waited for the check, as CLAUDE.md
says. `headroom learn --apply` then wrote a rule from those four firings: push once "ready and checked", which keeps
the check first. The hook still cannot tell a checked head from an unchecked one.
