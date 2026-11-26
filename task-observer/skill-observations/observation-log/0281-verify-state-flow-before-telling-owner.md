---
id: 281
title: "Told the owner every arrival puts the weapon away, from reading newPlayer alone; the walker takes drawn from the dress, so it was wrong"
status: open
type: internal
skill: ["superpowers:systematic-debugging"]
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: a cause stated to the owner before a test showed it. The same session's other two hypotheses (a server-side standing input queue after a hiccup, a slow solo room) were each run in a scratch test before being reported, and both were disproved there; only the drawn-weapon claim went to the owner on a code read."
area: "diagnosis reported to the owner"
date: "2026-11-25"
session_context: "PR #212, the owner's 'it happens outside of the tutorial also': footPlace.ts stand() builds newPlayer (drawn: false), but Walker.step overwrites player.drawn with you.dress.outfit.drawn each step, so the dress keeps the weapon out across arrivals."
commands_verified: "run: a scratch test in client/src/combat/playerFight.test.ts setting only walker.player.drawn = false left the dress drawn and the first click swung; setting the dress's outfit.drawn = false reproduced the click that only draws."
---

Diagnosing why hits did not register outside the tutorial, the first click after the weapon was put away only drew
it. Reading `stand()` (a fresh `newPlayer`, `drawn: false`) the controller told the owner, in an AskUserQuestion, that
every arrival puts the weapon away. Writing the failing test then showed the walker reads `drawn` from the figure's
dress each step, which arrivals leave as it was: the weapon starts put away only as the game begins, after the
prologue and when put away by hand. The owner's decision stood, but the question had carried a false fact, corrected
in the next message.

Proposal: a cause that goes to the owner in a question is first shown by the failing test (or a scratch run) that
reproduces it, as the other hypotheses in the same session were; a code read alone is called unchecked.
