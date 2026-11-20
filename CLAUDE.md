# CLAUDE.md

Overlook, the owner's own game. The client is strict TypeScript drawing with WebGPU only; the server and the game's
rules are Rust, with the server the sole authority. Everything else is in the Obsidian vault `bible/`: start at
`bible/Home.md`, and `bible/Hand-off.md` says where the work stands.

## Musts

- **The owner sets the vision.** Never invent game design. Record a decision only once the owner makes it, in the
  owner's words (`bible/04-Procedures/Recording a Decision.md`). When a choice is the owner's, ask.
- **More organisation, less bloat.** Whatever comes from DFO Online comes over better organised and smaller.
- **Done means `cargo xtask check` passes.** Run it before every push (after `npm ci` once). CI runs the same.
- **Ask before merging or deploying.** A pull request for each change; merge into `main`, deploy or release only
  after the owner says yes, every time. A merge deploys the page and the rooms, so its yes covers them.
- **Follow the rules** in `bible/00-Rules/Rules.md`. A new rule or check needs the owner's agreement.
- **Verify before claiming.** Before saying something is not in the source, check the file it would be in; until
  then call the claim "unchecked". Say "tested offline" or "tested live"; never call something fixed without the
  check that shows it. A run that is not of the head names the commit it covered; `cargo xtask check` prints it last.

## Every session

1. From the repo root: `KIT_DIR=$PWD/tools/claude-toolkit REPO_DIR=$PWD bash tools/claude-toolkit/install-all.sh`.
   Read any FAIL line it prints.
2. Read `bible/03-Code/Toolkit.md` (how to use each tool and worker) and `bible/Hand-off.md`.
3. Run `graphify update .`, then task-observer's scan:
   `bash ~/.claude/skills/task-observer/scripts/session-start-scan.sh ${SHARED_DIR:-$HOME/toolkit-data}/task-observer`.
4. At the end: `bash tools/claude-toolkit/claude-mem-save.sh`, then `headroom learn --project . --apply` (say so if
   Gemini is unreachable, or if it finds no data because the session started in another folder; never apply it to
   that folder's repository), then rewrite `bible/Hand-off.md`, and last
   `bash tools/claude-toolkit/toolkit-data.sh save` (the observation log, to the branch `toolkit-data`), so nothing
   logged after it is lost.

When a tool is skipped, clashes or misfires: fix the setup, log it with task-observer, and propose the rule change.
Rules for keys, security and deploys need the owner's named approval.

## Commands

- `cargo xtask check`: everything CI runs, both languages. `cargo xtask repo`: only the repo checks.
- `npm run dev`: the client in a browser with WebGPU.

## Porting and pull requests

- Take only picks the owner approved in `bible/06-Port/Pick List.md`; follow `bible/04-Procedures/Porting from DFO.md`.
- A pull request says what changed, why, and how it was tested. History goes there, never in the code or the bible.
