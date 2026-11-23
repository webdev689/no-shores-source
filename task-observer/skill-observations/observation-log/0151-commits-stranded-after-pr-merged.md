---
id: 151
title: "A session pushed fixes to its branch after the branch's PR had merged, with no new PR and no hand-off line, so the work sat unseen"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "tools/claude-toolkit/claude-mem-save.sh"]
siblings_checked: "none: the step belongs to the project's session-end list in CLAUDE.md, not to a skill"
area: "ending a session whose pull request merged while it kept working"
date: 2026-11-23
session_context: "Picking up session claude/zen-ritchie-u40hax: #163 merged, then the session pushed b20f8c15 (landing leave after a stand again, a cast as a strike) and 3cfc2199 (interface quads cleared each frame, the death-veil stack) to the same branch. No PR was opened for them and bible/Hand-off.md still listed the veil stack as unexplained. The next session found them only by fetching the branch the owner named and diffing it against main."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: git log origin/main..origin/claude/zen-ritchie-u40hax -> two commits; list_pull_requests state=open -> none for that head"
---

**Issue:** A pull request merged while its session went on fixing. The new commits were pushed to the merged branch.
GitHub opens no PR for commits that land on a branch after its PR merged, and the session ended before rewriting the
hand-off. The fixes were on no open PR and in no note. Only the owner naming the branch brought them back.

**Suggested improvement:** At a session's end, before the hand-off is rewritten, compare each branch the session
pushed with `main` (`git log origin/main..origin/<branch>`): any commit left there either goes on an open PR or is
named in the hand-off. Better as a check in the session-end script than as a sentence: `claude-mem-save.sh` or
`toolkit-data.sh save` could print the session's branches whose commits are on no open PR.

**Principle:** A merged pull request closes the review channel for its branch, but not the branch. Work pushed after a
merge needs its own carrier, and the end of a session is where to look for it, structurally, not by memory.
