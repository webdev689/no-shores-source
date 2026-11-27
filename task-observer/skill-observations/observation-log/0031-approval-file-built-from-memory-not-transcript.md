---
id: 31
title: "The fidelity review's approval file paraphrased what the owner was shown, so the review measured a correct note against wrong words"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "0003 (approved design drifts in scope and wording): the same drift, here in the reviewer's input rather than in a note; no skill-families.md in this workspace"
area: "Toolkit, Audits: the owner's words an audit brief is given (the fidelity reviewer itself was taken out at the owner's word, #105)"
date: 2026-11-20
session_context: "#102's fourth fidelity review, after the comprehensive audit"
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: "run: a python scan of the session's transcript for the assistant text before the owner's 'Dont use the blurbs please' found 'a \"mood\" byte on each foe (steady, broken, raging) so the page can show it' and 'how to picture the emotes', and no message naming fear and anger emotes with their sounds"
---

**Issue:** the approval file handed to `fidelity-review.sh` was written by the controller from memory. Its item 5 said
Claude "told the owner it would pop the speech system's fear and anger emotes (with their sounds)". The transcript
shows the owner saw only a mood byte "so the page can show it" and "the emotes". An earlier records audit had already
corrected the decision note to those words. The review then flagged the correct note as a paraphrase, measured
against the wrong file. Its finding had to be traced back through the transcript before it could be answered.

**Suggested improvement:** the owner has since taken the fidelity reviewer out (#105). The lesson stands for any
audit or review brief that quotes the owner: build it from the transcript, never from memory. Quote each of the
owner's messages verbatim, together with the assistant text the owner saw just before it (a script that pulls both
from the session's `.jsonl` would do it). The Toolkit's Audits section could say so.

**Principle:** a reviewer measures against its input. An input paraphrased from memory moves the reference itself,
and its findings then point the wrong way.
