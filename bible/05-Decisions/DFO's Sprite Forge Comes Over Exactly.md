---
type: decision
date: 2026-11-14
status: in force
---
# DFO's Sprite Forge Comes Over Exactly

> "I want to pull in the exact pipeline and sprite forge system with all the animations/assets and get a proper open
> area testing tool to use"

> Told that nine of the forge's moves use motion from Quaternius's CC0 library, the owner chose: "Allow CC0"

> Asked who made the horse, `orcish_swords.blend` and `crossbows.blend`: "Mine, I own them"

> Told that DFO's own notes call the horse "the Morrowind lane's, reused whole": "Its mine"

> Told that DFO's renders carry Daggerfall's fitting, and asked whether to re-render them clean or bring them as they
> are: "Bring them as they are". On where a re-render would run: "no re render"

> On where the renders are stored: "Use the secrets from dfo-online"

> Told that the forge's code breaks the size, comment and assets checks: "Exact, checks skip it"

## What it settles

- The [[Sprite Forge]] comes over exactly as DFO has it, in `tools/forge/`: its code, its fitted tables, its models
  and the tools that read Daggerfall's files. The size, comment and assets checks skip that folder.
- DFO's renders come over as they are, with all their moves and gear, and are not rendered again. They are stored on
  R2 in DFO's Cloudflare account ([[Generated Files on Cloudflare R2]]). The staff walk's body is the one exception
  ([[The Staff Walk's Body Is Drawn Again]]).
- These are exceptions to [[Own Work]] and [[Readers of Our Own Formats Only]]: the renders and fitted tables carry
  Daggerfall's fitting, and the nine moves carry Quaternius's CC0 motion.
- The horse and the two weapon models are the owner's own.
- The [[Test Ground]] is the open area for testing the forge's figures.
