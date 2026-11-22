---
type: rule
---
# Generated Files Stay Out of Git

Anything a tool makes (forge renders, world bakes, web builds) is generated from sources in the repository and stored
outside git. Renders and bakes go to Cloudflare R2, addressed by the hash of what it is
([[Generated Files on Cloudflare R2]]). The web build is built by CI and published to GitHub Pages
([[The World Editor Is on GitHub Pages]]). Git holds the sources and the tools, never their output; a ship's
hand-made model lives on R2 beside its mesh ([[Ship Models Live on R2]]). No file in git is over 1 MB, except in the
[[Sprite Forge]], kept as DFO shipped it. Its renders are on R2, named in `content/forge/renders.json`.

The exception is the small pixel pictures a tool writes into the client as rows of letters: the [[Item Pictures]]
baked in Blender, and the ship's glyphs beside them
([[Vestiges Are project-final's Crystals, and Physical Pictures Are Baked]]).

**Why.** DFO Online kept forge renders in 251 branches of their own, and its deploy needed size guards at 900 MB and
1.8 GB.

**Checked by.** The assets check.
