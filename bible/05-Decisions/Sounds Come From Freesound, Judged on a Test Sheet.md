---
type: decision
date: 2026-11-18
status: in force
---
# Sounds Come From Freesound, Judged on a Test Sheet

The owner asked:

> "Can we develop an audio test sheet, so I can verify any sounds/music we implement? I also want to try and use
> freesound instead of generated assets"

Asked which Freesound licences may be used, the owner chose "CC0 and CC-BY". Asked where the test sheet should live,
"A claude.ai page". Freesound refuses Claude's cloud machines, so asked how its sounds should come in, the owner chose
"Try GitHub Actions".

## What it settles

- **Sounds and music may come from Freesound**, under CC0 or CC-BY, never a non-commercial licence: an exception to
  [[Own Work]]. Each CC-BY sound is credited by name in the game.
- **They take the place of generated sounds** once the owner picks them.
- **Every sound and piece of music is judged on a test sheet**, a page on claude.ai where each plays beside where it
  is used, its source and its licence, and the owner keeps it or asks for it again.
- **Freesound is searched from GitHub Actions**, with the repository's Freesound key, never from a session.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| What is searched | A list in `content/audio/freesound.json`: each cue's words and how long it may run | The length is the real filter: a search for a click is full of long recordings |
| How many candidates | Four a cue, the first by Freesound's relevance that carry an allowed licence | Enough to choose between without a wall of sounds |
| What is auditioned | Freesound's high-quality preview of each | A key fetches it; the original needs a login of the owner's |
| Where picks are kept | R2, named by their hash, as the forge's renders are | The assets check keeps sound out of git |

Links: [[Own Work]], [[Interface]], [[Generated Files on Cloudflare R2]].
