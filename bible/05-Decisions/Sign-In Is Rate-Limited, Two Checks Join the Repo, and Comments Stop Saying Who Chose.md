---
type: decision
date: 2026-11-26
status: in force
---
# Sign-In Is Rate-Limited, Two Checks Join the Repo, and Comments Stop Saying Who Chose

Walking the [[Open Questions]] one at a time, the owner answered those on hosting, the workflows and the repo.

Asked whether to move to the paid Workers plan, since a password sign-in takes about 50 ms of CPU, the owner answered:

> "Already paid"

Asked whether to add rate-limiting rules over the accounts' sign-in and required reviewers over the deploy jobs, the
owner answered:

> "Whatever is best"

Given Claude's pick, a rate limit on sign-in at Cloudflare and no reviewer gate over the deploys (the owner's yes to
a merge already gates them), the owner answered:

> "Approve"

Asked whether the Cloudflare token keeps its leave to edit D1, the owner answered:

> "Keep"

Asked whether the claude-mem store stays an archive kept out of git, the owner answered:

> "Keep as is"

Asked whether to fix the workflows' points (`site.yml` run by hand, the Lattice's concurrency group, `forge.yml`'s
paths) and that audit's (the foes' fall-back with no way out, a shot loosed inside a cliff, the city's picture cache's
budget, an upload held up while the room's snapshots still come in), the owner answered:

> "Yes, fix them"

Asked whether to strip the 158 comments that say a value is the owner's or Claude's call, the owner answered:

> "Strip them"

Asked which proposed checks to add, the owner chose:

> "Plain Text limits,Comments naming notes,Split wiki links"

Asked which other proposals to take (a ship deck's grid to R2, the Overworld's rise and fall kept out, deleting 37 old
branches, the ship meshes cached between CI runs, a real GPU measured before the desktop app's engine is switched),
the owner chose:

> "Cache ship meshes"

Asked whether the Overworld's rise and fall, ported but never wired, should be wired in or left out, the owner chose:

> "Leave it out"

Asked whether the bake should read the dungeon crate's families too, the owner answered:

> "Go ahead"

## What it settles

- **The accounts' sign-in is rate-limited at Cloudflare.** The deploy jobs gain no reviewer gate.
- **The Workers plan, the token's leave to edit D1, and the claude-mem store stay as they are**
  ([[The Audit's Calls Are Claude's]], [[Toolkit]]).
- **The workflows' and that audit's seven points are fixed.**
- **No comment says who asked for a value**: those that named the owner's or Claude's call (188, counted as they
  were stripped) say why instead ([[Comments Say Why]]).
- **Two checks join the repo, and a third holds**: [[Plain Text]]'s word limits, as DFO's, and a comment that names
  a note or links the bible; a wiki link split over two lines the vault check already refused ([[Rules]]).
- **The ship meshes `shipTags.test.ts` fetches are cached between CI runs.** The other proposals were not chosen.
- **The Overworld's rise and fall stays out** ([[Pick - Overworld]]).
- **The bake reads the dungeon crate's families.**

Built ([[Accounts]], [[Checks]]; Claude's calls in [[The Open Questions' Answers as Claude Builds Them]]). Already so:
the vault check refused a wiki link split over two lines, and the bake read the dungeon crate's families.