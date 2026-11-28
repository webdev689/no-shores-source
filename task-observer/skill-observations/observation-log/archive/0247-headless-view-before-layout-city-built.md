---
id: 247
title: "A headless view taken before a zone's layouts' city is built shows none of its buildings, with no word that it is still building"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "Toolkit.md's Browser QA says a cargo build beside the driver delays the world; nothing says the layouts' city is built a few steps a frame after arrival"
area: "picturing a layout's buildings headless"
date: "2026-11-25"
session_context: "The town fixes on #207 (claude/amazing-euler-gefw4k). Views inside the Saltgrass Downs' tavern after a 90 s wait showed open meadow where it stands; the same views after 240 s, or a few minutes later in the run, showed it whole. Mistaken first for walls seen through. The layouts' city is built in steps (landDrawers.ts standIn('city') while view.underWay)."
parked_until: "PR #243 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #243, merged 2026-11-27"
reference:
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs <plan> with { wait: 90 } (no buildings) and { wait: 240 } (the hamlet drawn)"
---

A picture of a layout's buildings needs the layouts' city built first, and nothing in the driver or the page says when
it is: a view arrived early shows the land bare, which reads as a rendering defect. Proposal: the driver's `views`
and `eval` steps wait until the land drawers report the city built (a `__qaWhere` field from `view.underWay`), or
Toolkit.md says to wait about four minutes headless before a layout's first view.
