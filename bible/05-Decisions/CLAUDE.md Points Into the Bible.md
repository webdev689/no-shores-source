---
type: decision
date: 2026-11-14
status: in force
---
# CLAUDE.md Points Into the Bible

> "Also do we need claude.md? We already have the obsiden bible"

> On keeping it but cutting it to the few musts and pointers into the bible: "Yes"

## What it settles

- `CLAUDE.md` stays, because it is the one file Claude Code loads into every session, sub-agent and worker. It holds
  only what every session must do: the musts, the session's start and end, the commands, and where to look.
- Everything else lives once, in the bible: the [[Rules]], how to use the toolkit ([[Toolkit]]), the procedures.
  `CLAUDE.md` links to them and does not repeat them ([[More Organisation, Less Bloat]]).
