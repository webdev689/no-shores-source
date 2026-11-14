# CLAUDE.md

Overlook: the owner's own game, Rust throughout, one Cargo workspace. The bible is the Obsidian vault in `bible/`;
start at `bible/Home.md`.

## Before anything

- **The owner sets the vision.** Never invent game design: no systems, mechanics, lore, names or features the owner
  has not decided. Propose engineering; record design only once the owner decides it, in the owner's words
  (`bible/04-Procedures/Recording a Decision.md`). When a choice is the owner's, ask.
- **Done means `cargo xtask check` passes.** Run it before every push. CI runs the same command.

## Commands

- `cargo xtask check`: format, lints (warnings are errors), tests, then the repo checks.
- `cargo xtask repo`: only the repo checks (layout, crate names, size, comments, assets, vault links).

## Rules

The ten rules are in `bible/00-Rules/`, each with its reason. In short:

- Everything is our own work. No other author's art, sound, models, words or data; nothing of Bethesda's.
- The game's rules agree to the bit on the server and in every browser: one crate, no platform maths.
- A source file holds at most 600 lines; tests 800. Hosts wire, they do not implement.
- Names are spelled out.
- A comment says why, in eight lines or fewer, with no history: no dates, issue numbers, ticket tags or bible paths.
- Every system has a note saying how it works now, updated in the same change.
- Tests check behaviour, never line numbers or line text.
- Short branches, squash-merged; `main` always green; unfinished work merges switched off.
- Generated files (renders, bakes, builds) stay out of git; no file over 1 MB.
- Migrations are named by timestamp; versions are hashes, not counters.

A new rule or check needs the owner's agreement, and holds everywhere the day it lands: no baselines.

## Porting from DFO Online

DFO is the specification, never the source: read it, rebuild in Rust. Follow `bible/04-Procedures/Porting from DFO.md`
and only take picks the owner has approved in `bible/06-Port/Pick List.md`.

## Pull requests

Say what changed, why, and how it was tested. History goes in the pull request, never in the code or the bible.
