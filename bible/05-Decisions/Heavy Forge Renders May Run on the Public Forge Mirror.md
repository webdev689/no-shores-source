---
type: decision
date: 2026-11-27
status: in force
---
# Heavy Forge Renders May Run on the Public Forge Mirror

The rigged cloaks and the new holsters had to be drawn again in every move, about 194,000 frames, some 49 hours on
the owner's PC. The owner wrote:

> "How can we push this to be much faster"

> "Is there a way we can do this in an open repo and then bring it over to the main private repo"

> Offered: the forge in a public repository of its own, whose GitHub runners draw it at no cost in Actions minutes,
> the strips brought back here: "Let's do that then. It's a solid work around"

> Offered: the forge published whole, the owner's own models, the horse and the specs from Daggerfall included:
> "Publish it all"

> Offered, for the strips' publish: "The token is in no shores source", then, between a workflow here that uploads
> what the owner's PC staged and a token on the PC: "A"

## What it settles

- A heavy forge render may run on GitHub's runners in the public mirror `webdev689/no-shores-forge`, where they cost
  no Actions minutes, when the owner says so; otherwise it runs on the owner's PC
  ([[Heavy Renders Run on the Owner's PC, Not on Actions]]).
- The mirror holds the forge from `tools/forge` whole, the owner's own models, the horse and the specs from Daggerfall
  included.
- Its strips come back through the owner's PC and are published with this repository's `CLOUDFLARE_TOKEN`: the PC
  stages the upload without the token (`R2_STAGE`, [[Sprite Forge]]), and a workflow here uploads the stage.

Links: [[Sprite Forge]], [[Toolkit]].
