# CLAUDE.md

Overlook: the owner's own game. The client is strict TypeScript drawing with WebGPU only; the server and the game's
rules are Rust, with the server the sole authority. The bible is the Obsidian vault in `bible/`; start at
`bible/Home.md`, and read `bible/Hand-off.md` for where the work stands.

## Before anything

- **The owner sets the vision.** Never invent game design: no systems, mechanics, lore, names or features the owner
  has not decided. Propose engineering; record design only once the owner decides it, in the owner's words
  (`bible/04-Procedures/Recording a Decision.md`). When a choice is the owner's, ask.
- **More organisation, less bloat.** It is the project's goal: whatever comes from DFO Online comes over better
  organised and smaller.
- **Done means `cargo xtask check` passes.** Run it before every push (after `npm ci` once). CI runs the same command.
- **Ask before merging or deploying.** Open a pull request for each change; merge into `main`, deploy or release only
  after the owner says yes, every time.

## Every session (the co-dev's toolkit, `tools/claude-toolkit/`)

1. First run `KIT_DIR=$PWD/tools/claude-toolkit REPO_DIR=$PWD bash tools/claude-toolkit/install-all.sh` from the repo
   root. It ends with `check-tools.sh` and exits non-zero if any install step or check failed: read its FAIL lines.
   Plugins and MCP servers it installs load in sessions started after it. In the session that ran it, use a required
   skill by reading its SKILL.md (`find ~/.claude/plugins/cache -path '*skills/<name>/SKILL.md'`) and following it;
   Serena and claude-mem work goes to a headless worker started after the install.
2. Work in this clone (Serena is pinned here). Run `graphify update .` here.
3. Invoke the task-observer skill and run its session-start scan:
   `bash ~/.claude/skills/task-observer/scripts/session-start-scan.sh $SHARED_DIR/task-observer`.
4. End of a session: `bash tools/claude-toolkit/claude-mem-save.sh`, then `headroom learn --project . --apply` (skip it
   and say so if Gemini is unreachable), then rewrite `bible/Hand-off.md`.

- Call scripts as `bash x.sh` / `python3 x.py`.
- After any change to the kit: `bash tools/claude-toolkit/check-tools.sh --worker` (expect 0 FAIL).
- `SHARED_DIR` defaults to `~/toolkit-data`, which a cloud container loses at its end: the claude-mem store and the
  task-observer log carry over only where `SHARED_DIR` points at storage that survives.

## Commands

- `cargo xtask check`: format, lints, types, tests and the client build for both languages, then the repo checks.
- `cargo xtask repo`: only the repo checks (layout, crate names, size, comments, layers, assets, vault links).
- `npm run dev`: the client in a browser with WebGPU.

## Repo rules

- Branches and pull requests may be pushed. Merges into `main`, deploys, releases and production changes need the
  owner's explicit yes, every time.
- How things work goes in the bible; history goes in the pull request; worker reports stay in `~/wt/reports/` and are
  never committed.

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
- Generated files (renders, bakes, builds, `graphify-out/`) stay out of git; no file over 1 MB.
- Migrations are named by timestamp; versions are hashes, not counters.
- Verify before saying something is NOT in the source: find the exact file it would be in, check it, and search for
  any words the owner quotes. Until then call the claim "unchecked".
- Say "tested offline" or "tested live" plainly; never call something fixed without the check that shows it.
- When a tool is skipped, clashes or misfires: fix the setup, log it with task-observer, and propose the rule change
  (the steps, the line it changes, and a check that it contradicts no other rule). Rules for keys, security and
  deploys need the owner's named approval.

A new rule or check needs the owner's agreement, and holds everywhere the day it lands: no baselines. A new folder
under `client/src` is a layer: declare it in `crates/xtask/src/checks/layers.rs` and the Code Map note.

## Tools

- graphify: the code map. Use `graphify explain <symbol or file>` or `graphify path <A> <B>` for known names, and
  `graphify query` only with a pointed question naming a function or file. Ask it before grepping or opening big
  files; update it after every merge or commit. Its `graphify-out/` is ignored here.
- Serena (MCP, tools interface): find_symbol, find_referencing_symbols, get_symbols_overview, replace_symbol_body.
  graphify finds the file or system, Serena then finds the exact symbol. Plain Edit only for small in-line changes and
  files Serena can't parse. If only serena_repl shows, the install is broken: fix it first.
- claude-mem: search it before re-investigating anything. Its smart_search/smart_outline are not for code: use Serena.
- Headroom: compress big outputs (headroom_compress / headroom_retrieve). MCP only, never in the API path.
- Context7 (MCP): current docs for a library before guessing its API.
- superpowers: brainstorming, writing-plans, using-git-worktrees, subagent-driven-development, test-driven-development,
  verification-before-completion, systematic-debugging; requesting-code-review for the final review.
- ponytail: the smallest complete change; a ponytail review before each merge and on the final diff.
- Caveman: on for sub-agents and workers only. Replies to the owner stay in full sentences.
- rtk: compacts git status, git log and ls only; reads, greps, diffs and test runs stay exact. If an output looks cut,
  re-run it as `rtk bypass <command>`. Write `git --no-pager log ...` when you need the log exact.
- MarkItDown: convert uploaded files (PDF, Word, Excel, PowerPoint) with `markitdown <file>` before reading them.
- impeccable: web and UI layer only. SkillsMP: find a skill for a new kind of job.
- claude-code-setup: run "recommend Claude Code automations for this project" when the setup is reviewed or a new
  stack arrives; adopt only what the other tools don't already cover.
- task-observer: log each correction, tool clash or slow rule with its new-observation.sh into
  `$SHARED_DIR/task-observer` (never the repo); workers never log, they end with an "OBSERVATIONS:" line and the
  controller logs it; the owner approves every rule change at a review.
- Syntax hook: "syntax check failed" after an Edit/Write means fix it now.
- Commit guard: the clone's pre-commit hook refuses archives and C2PA-stamped PNGs. Never bypass it with --no-verify.
- Browser QA: Playwright with the preinstalled Chromium; never run `playwright install` in a cloud session.

## Workers (work that fans out)

- Start one with `bash tools/claude-toolkit/workers/run-worker.sh <worktree> <brief>` (Bash run_in_background,
  timeout 7200000). Each gets its own git worktree, Serena pinned to it, Context7, Headroom, claude-mem and SkillsMP.
  A late change goes in its inbox (`~/wt/reports/inbox-<name>.md`, under a `## <short heading>` line), not a stop and
  --resume. Stop one with TaskStop or `bash tools/claude-toolkit/workers/stop-worker.sh <name>`, never
  `pkill -f <pattern>`.
- Every brief starts from `tools/claude-toolkit/workers/brief-common-template.md`.
- A worker's first three actions: one claude-mem search; `graphify update .` and one `graphify explain`/`path`;
  Serena get_symbols_overview on each source file it will change.
- Every worker ends with superpowers:verification-before-completion, one reviewer sub-agent, then
  ponytail:ponytail-review on its diff, even for a one-line change.
- Before merging a worker branch: `python3 tools/claude-toolkit/workers/audit.py <worktree>` (its MISSING line must say
  none) and a ponytail review of its diff.

## Porting from DFO Online

Client code comes over as TypeScript and is typed strictly; GPU code is rewritten for WebGPU; server and rules code is
rebuilt in Rust. Follow `bible/04-Procedures/Porting from DFO.md`, and take only picks the owner has approved in
`bible/06-Port/Pick List.md`.

## Pull requests

Say what changed, why, and how it was tested. History goes in the pull request, never in the code or the bible.
