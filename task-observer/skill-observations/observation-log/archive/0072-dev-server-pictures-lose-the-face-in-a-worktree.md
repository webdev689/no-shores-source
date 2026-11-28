---
id: 72
title: "In a worktree whose node_modules is linked, the dev server refuses the face's fonts: every picture falls back to monospace"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "family: pictures taken from a worktree (webgpu-shot.cjs serves a built page and is untouched; the dev server is not)."
area: "overlook-source, browser QA"
date: "2026-11-21"
session_context: "The Journal's pictures: an independent critique saw a smooth monospace with a cursive italic where Pixelify Sans should be."
commands_verified: "curl the font's /@fs/ URL from the dev server: 403, 'outside of Vite serving allow list'; 200 with a scratch config allowing the main checkout's node_modules"
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: Toolkit.md:63 \"Capture a built page ... never the dev server\""
---

- Workers and reviewers link the main checkout's `node_modules` into their worktree. Vite resolves the fontsource
  files to the link's target, outside the worktree's root, and answers 403; the page falls back to the system
  monospace without any error a picture shows, so 19 pictures were judged in the wrong face.
- Worked round with a scratch `vite.harness.ts` that spreads the repository's config and adds
  `server.fs.allow: [worktree, main checkout's node_modules]`, and a harness that loads Pixelify Sans and checks
  `document.fonts.check` before any picture.
- Proposed: Toolkit.md's Browser QA row says to check `document.fonts.check('500 11px "Pixelify Sans Variable"')`
  before a picture, and to take dev-server pictures from a worktree only with the fonts allowed (or from a built
  page, as webgpu-shot does).
