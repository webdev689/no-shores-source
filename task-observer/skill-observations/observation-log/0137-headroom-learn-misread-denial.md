---
id: 137
title: "headroom learn wrote a wrong lesson from a safety refusal, which would steer later sessions round it"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is a project note, not a skill"
area: "end-of-session learning from transcripts"
date: 2026-11-22
session_context: "No Shores rename and logo. The auto-mode classifier refused a Python step that would have stripped the owner's logo PNG of its C2PA credentials (it named OpenAI/ChatGPT). headroom learn --apply then wrote to the project memory that 'an inline heredoc doing the same write was denied', advising to put the script in a repo file instead; it also wrote that the repo kept the Overlook name, when the owner had it renamed.; No Shores bible-dungeon-matchmaking pickup (2026-11-23): learn wrote three wrong lessons, corrected by hand: steward/babysit 'listed in Toolkit.md' (they exist nowhere), ReadNotifications 'only once' (the tool says until 0 remain), and 'never end a turn with unpushed commits' (against check-before-push)"
parked_until:
resolved:
resolution:
reference:
commands_verified: "headroom learn --project . --apply (run: wrote both lessons to ~/.claude/projects/-home-user-overlook-source/memory/MEMORY.md; corrected by hand)"
---

**Issue:** `headroom learn --apply` reads the transcript and writes lessons to the project memory without review. It
took a safety refusal's cause to be the form of the command (an inline heredoc) rather than what it did (strip an
image's provenance), and wrote a lesson that would route the next session round the refusal. In the same run it got a
fact wrong (the repository's name). Both were corrected by hand.

**Suggested improvement:** In the Toolkit note's headroom row, say: after `headroom learn --apply`, read what it wrote
to the memory file and correct any lesson drawn from a refused action or a decision the owner made; a refusal's lesson
is what not to do, never how to phrase it.

**Principle:** Lessons learned automatically from a transcript are proposals; check each against what happened before
it steers the next session, above all one drawn from a safety refusal.

**Instance (2026-11-23, bible-dungeon-matchmaking pickup):** `headroom learn --project . --apply` wrote to `CLAUDE.local.md` and the project memory `MEMORY.md`. Three lessons were wrong. It said the steward and babysit skills are listed in Toolkit.md, but they exist nowhere, and the PR rules' check of their paths was right. It said to call ReadNotifications only once per message, but the tool says to keep calling until it reports 0 remaining. It said never to end a turn with unpushed commits, which leads toward pushing before `cargo xtask check` passes. All three were corrected by hand after reading both files. Learn generalises from what a session did often, not from the rules behind it, so its output needs a read before it stands.

**Instance (2026-11-24, same session):** the next `headroom learn --apply` overwrote the hand-corrected ReadNotifications line with "Do not call it again until a new queued-notification message arrives", against the tool's rule to keep calling while any remain. It was corrected by hand again. A fix made to learn's output does not survive the next learn run, so the correction has to live somewhere learn reads (or learn's output needs a check against the tools' own instructions).
