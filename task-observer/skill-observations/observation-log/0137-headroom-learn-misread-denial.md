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
session_context: "No Shores rename and logo. The auto-mode classifier refused a Python step that would have stripped the owner's logo PNG of its C2PA credentials (it named OpenAI/ChatGPT). headroom learn --apply then wrote to the project memory that 'an inline heredoc doing the same write was denied', advising to put the script in a repo file instead; it also wrote that the repo kept the Overlook name, when the owner had it renamed."
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
