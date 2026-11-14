---
type: handoff
---
# Hand-off

Where the work stands now, for the next session. Each session rewrites this note at its end; history stays in git.

## Done

- The scaffold: the TypeScript client on WebGPU, the Rust repo checks, CI, this vault.
- The [[Pick List]] of DFO Online, and the owner's decisions on it ([[Decisions]]).
- The co-dev's toolkit, installed by each session's first step ([[Toolkit]]). Its SkillsMP and Context7 keys are
  network secrets on the Default environment. Four kit fixes are logged with task-observer for the co-dev.
- The [[World Map]]'s layout file and its rules, and the [[World Editor]], published on GitHub Pages
  ([[The World Editor Is on GitHub Pages]]). The owner has painted three continents into `main`.
- The [[Land]], on `main`: generated relief, erosion and water from the painted coasts; sculpting brushes; carved
  rivers, roads, towns and ports; and the ground anywhere to the metre, for the runtime. The World Editor's Land mode
  shows it in 2D and 3D.

## Waiting on the owner

- Merging the close-up view and walk mode (`land/close-up`, pull request #14), then the audit fixes pull request that
  follows it.
- The layout with all nine continents: on the site, Save it after Problems is clear and send it.
- [[Open Questions]]: which nine climates, which the owner will decide later. Until then every landmass uses one
  placeholder climate.

## Next

- Isles: how many, how big and how they are placed are the owner's to decide; the layout and its rules hold them
  already.
- The game itself: the client drawing the world from the land's door, and the server reading the same land crate.
