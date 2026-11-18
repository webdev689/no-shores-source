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
"Try GitHub Actions". Told that a search by Freesound's API needs a key, the owner chose "Let's do no key".

On the sheet the owner then wrote of the gains: "Try to generate a unique consistant sound for each". Asked which
sounds that meant, the owner chose "The gains only".

Of a hold's sound the owner said: "It shouldnt be this overbearing sound. It should be a slight buildup, but not a sci fi
charge", then of the airs offered, "Breath, but not a human breath", and picked the Shimmer, noting "Its not an
electric charge".

## What it settles

- **Sounds and music may come from Freesound**, under CC0 or CC-BY, never a non-commercial licence: an exception to
  [[Own Work]]. Each CC-BY sound is credited by name in the game.
- **They take the place of generated sounds** once the owner picks them.
- **The gains are made by the game's synthesiser**: one family, a distinct sound for each rarity, the rest from
  Freesound.
- **A hold builds up slightly, never as a sci-fi or electric charge**: high, thin air swelling, made by the
  synthesiser.
- **Every sound and piece of music is judged on a test sheet**, a page on claude.ai where each plays beside where it
  is used, its source and its licence, and the owner keeps it or asks for it again.
- **Freesound is searched from GitHub Actions, with no key**: the search reads Freesound's public pages, as a person
  browsing would, never from a session.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| What is searched | A list in `content/audio/freesound.json`: each cue's words and how long it may run | The length is the real filter: a search for a click is full of long recordings |
| How many candidates | Four a cue, the first by Freesound's relevance that carry an allowed licence | Enough to choose between without a wall of sounds |
| What is auditioned | Freesound's high-quality preview of each | Previews are public; the original needs a login of the owner's |
| How a sound's licence is known | Read from its own page's licence link, kept only for CC0 or Attribution | A search's filter may name licences otherwise; the page is the record |
| Where picks are kept | R2, named by their hash, as the forge's renders are | The assets check keeps sound out of git |

Links: [[Own Work]], [[Interface]], [[Generated Files on Cloudflare R2]].
