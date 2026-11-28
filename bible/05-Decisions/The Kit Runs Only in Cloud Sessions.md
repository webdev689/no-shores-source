---
type: decision
date: 2026-11-27
status: in force
---
# The Kit Runs Only in Cloud Sessions

> On changing `CLAUDE.md` so the kit's install runs only in cloud sessions: "Yes, cloud only"

## What it settles

- The co-dev's kit ([[The Co-Dev's Toolkit, Whole]]) is installed and used only in a cloud session, where
  `CLAUDE_CODE_REMOTE` is `true`; its install is built for the cloud's Linux containers ([[Toolkit]]).
- A session on the owner's own computer skips the kit's steps in `CLAUDE.md` and is not told the kit is missing: the
  repository's SessionStart hook runs `kit-check.sh` only in a cloud session. It still reads and rewrites the
  [[Hand-off]].
- The kit itself is unchanged.
