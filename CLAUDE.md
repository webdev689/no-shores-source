# CLAUDE.md

Overlook: the owner's own game. The client is strict TypeScript drawing with WebGPU only; the server and the game's
rules are Rust, with the server the sole authority. The bible is the Obsidian vault in `bible/`; start at
`bible/Home.md`.

## Before anything

- **The owner sets the vision.** Never invent game design: no systems, mechanics, lore, names or features the owner
  has not decided. Propose engineering; record design only once the owner decides it, in the owner's words
  (`bible/04-Procedures/Recording a Decision.md`). When a choice is the owner's, ask.
- **Done means `cargo xtask check` passes.** Run it before every push (after `npm ci` once). CI runs the same command.
- **Ask before merging or deploying.** Open a pull request for each change; merge into `main`, deploy or release only
  after the owner says yes, every time.

## Commands

- `cargo xtask check`: format, lints, types, tests and the client build for both languages, then the repo checks.
- `cargo xtask repo`: only the repo checks (layout, crate names, size, comments, layers, assets, vault links).
- `npm run dev`: the client in a browser with WebGPU.

## Rules

The ten rules are in `bible/00-Rules/`, each with its reason. In short:

- Everything is our own work. No other author's art, sound, models, words or data; nothing of Bethesda's.
- The game's rules are one Rust crate; the server is the authority. The TypeScript client never decides an outcome.
- WebGPU only: no WebGL anywhere in the client.
- A source file holds at most 600 lines; tests 800. The entry point wires, it does not implement.
- Names are spelled out.
- A comment says why, in eight lines or fewer, with no history: no dates, issue numbers, ticket tags or bible paths.
- Every system has a note saying how it works now, updated in the same change.
- Tests check behaviour, never line numbers or line text.
- Short branches, squash-merged; `main` always green; unfinished work merges switched off.
- Generated files (renders, bakes, builds) stay out of git; no file over 1 MB.
- Migrations are named by timestamp; versions are hashes, not counters.

A new rule or check needs the owner's agreement, and holds everywhere the day it lands: no baselines. A new folder
under `client/src` is a layer: declare it in `crates/xtask/src/checks/layers.rs` and the Code Map note.

## Porting from DFO Online

Client code comes over as TypeScript and is typed strictly; GPU code is rewritten for WebGPU; server and rules code is
rebuilt in Rust. Follow `bible/04-Procedures/Porting from DFO.md`, and take only picks the owner has approved in
`bible/06-Port/Pick List.md`.

## Pull requests

Say what changed, why, and how it was tested. History goes in the pull request, never in the code or the bible.
