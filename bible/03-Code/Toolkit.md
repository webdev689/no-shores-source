---
type: reference
code:
  - tools/claude-toolkit/install-all.sh
  - tools/claude-toolkit/check-tools.sh
  - tools/claude-toolkit/hooks/kit-check.sh
  - tools/claude-toolkit/workers/run-worker.sh
  - tools/claude-toolkit/workers/brief-common-template.md
  - tools/claude-toolkit/toolkit-data.sh
---
# Toolkit

How Claude uses the co-dev's toolkit in `tools/claude-toolkit/` ([[The Co-Dev's Toolkit, Whole]]). `CLAUDE.md` says
when to install it and what each session does at its start and end; this note says how to use each tool.

## Running the kit

- Call its scripts as `bash x.sh` or `python3 x.py`.
- A session that starts, resumes or comes back from a compaction in a container without the kit is told so before
  any work: the repository's `.claude/settings.json` runs `hooks/kit-check.sh` at each start, where nothing the
  install adds exists yet.
- After any change to the kit, run `bash tools/claude-toolkit/check-tools.sh --worker` and expect no FAIL line.
- After editing a file, run its own lint, types or clippy (`npx eslint <file>`, `npm run -s types`,
  `cargo clippy -p <crate> --all-targets`) before the full check.
- The install sets `NODE_USE_ENV_PROXY=1` in the settings' `env`, and `cargo xtask check` sets it for its steps:
  Node's fetch ignores `HTTPS_PROXY` without it, and the page's tests fetch ship meshes from R2. check-tools fetches
  one; its FAIL means the environment's network rule refuses R2, so start the session in `no-shores-source`.
- After each push, and before rewriting the hand-off, run `bash tools/claude-toolkit/pr-state.sh`. For each local
  branch with commits not on `origin/main` it prints them, whether the branch merges cleanly (a pull request that
  conflicts starts no CI run, and the script fails) and whether origin holds its head. Then read that head's CI
  state with the GitHub tools.
- Everything the install fetches is pinned: a commit's full hash, a version, or rtk's archive by its SHA-256. A
  session holds the owner's keys, so what it runs is what was read when it was pinned. Bump a pin on purpose, after
  reading what changed. Git trusts only `REPO_DIR` when another user owns it, never every repository.
- Plugins and MCP servers the install adds load in the next session. In the session that ran the install, use a
  skill by reading its `SKILL.md` (`find ~/.claude/plugins/cache -path '*skills/<name>/SKILL.md'`), and hand Serena
  and claude-mem work to a worker.
- `SHARED_DIR` defaults to `~/toolkit-data`, which a cloud container loses at its end. The task-observer log carries
  over on the repository's orphan branch `toolkit-data`. The install restores it once a container
  (`toolkit-data.sh restore`); with origin out of reach it restores nothing and says so, and the next restore tries
  again. `toolkit-data.sh save`, last at a session's end, commits it over the commit it was restored from and rebases
  that onto the branch's tip: a parallel session's save is kept, lines both appended to a log (`*.log`) are both kept,
  where both changed one line this container's wins, and an observation number both took moves past the highest there.
  A log never restored, or a save with origin out of reach, saves nothing. `toolkit-data-test.sh`, run by check-tools,
  holds all of that. The claude-mem store, an archive the repository keeps out of git, carries over only where
  `SHARED_DIR` points at storage that survives.
- The SkillsMP and Context7 keys are network secrets the proxy adds to requests; their variables hold only the
  placeholder `proxy-injected`, which check-tools' key check passes without scanning. A real key is still looked for
  on disk.

## Tools

| Tool | How to use it |
|---|---|
| graphify | The code map. `graphify explain <symbol or file>` or `graphify path <A> <B>` for known names; `graphify query` only with a pointed question naming a function or file. Ask it before grepping or opening big files; update it after every merge or commit. Its `graphify-out/` is ignored by git. |
| Serena | MCP, tools interface: `find_symbol`, `find_referencing_symbols`, `get_symbols_overview`, `replace_symbol_body`. graphify finds the file or system, Serena the exact symbol. Plain Edit only for small in-line changes and files Serena cannot parse. A symbol's range takes in its doc comment and attributes: a new body carries them, and after `replace_symbol_body` re-read the lines above the symbol. The kit's Serena guard undoes a `replace_symbol_body` or `insert_before_symbol` that lowers the file's count of `///`, `/**` or `#[` lines. If only `serena_repl` shows, the install is broken: fix it first. Its project lists both `typescript` and `rust`. |
| claude-mem | Search it before re-investigating anything. Its `smart_search` and `smart_outline` are not for code: use Serena. |
| Headroom | Compress big outputs with `headroom_compress` and `headroom_retrieve`. MCP only, never in the API path. |
| Context7 | MCP: a library's current docs before guessing its API. |
| superpowers | brainstorming, writing-plans, using-git-worktrees, subagent-driven-development, test-driven-development, verification-before-completion, systematic-debugging; requesting-code-review for the final review. |
| ponytail | The smallest complete change; a ponytail review before each merge and on the final diff. |
| Caveman | Through the kit's SubagentStart hook only: sub-agents and workers are terse; replies to the owner stay in full sentences. |
| rtk | Compacts `git status`, `git log` and `ls` only; reads, greps, diffs, test runs and `git push` stay exact. If an output looks cut, run it again as `rtk bypass <command>`; write `git --no-pager log ...` for an exact log. |
| MarkItDown | Convert uploaded files (PDF, Word, Excel, PowerPoint) with `markitdown <file>` before reading them. |
| impeccable | The web and UI layer only. `install-all.sh` turns its design hook on in each session, so UI edits are reviewed as they land; `impeccable doctor` says what has drifted. |
| SkillsMP | Find a skill for a new kind of job. |
| Web research | WebSearch, then WebFetch on the pages that hold the answer. A page that answers 200 with almost no text was built by JavaScript, not refused: read it with the preinstalled Chromium (`page.goto(url, { waitUntil: 'networkidle' })`, then `document.body.innerText`). reddit is closed to WebSearch; GameSpot, GameFAQs, Tom's Hardware and dotesports refuse WebFetch, and fandom answers 402, so spend no calls on them. |
| claude-code-setup | Run "recommend Claude Code automations for this project" when the setup is reviewed or a new stack arrives; adopt only what the other tools do not already cover. |
| task-observer | Log each correction, tool clash or slow rule with its `new-observation.sh` into `$SHARED_DIR/task-observer`, never the repo. Workers never log; they end with an "OBSERVATIONS:" line and the controller logs it. The owner approves every rule change at a review. |
| Syntax hook | "syntax check failed" after an Edit or Write means fix it now. |
| Commit guard | The clone's pre-commit hook refuses archives, C2PA-stamped PNGs, `graphify-out/`, line-ending flips, symbolic links and staged files Prettier would rewrite; its commit-msg hook refuses a first line over 100 characters or holding a trailer, and in a cloud session a commit without its `Claude-Session:` trailer. Write a body with `git commit -F - <<'EOF'`. Never bypass a hook with `--no-verify`. |
| Push guard | The clone's pre-push hook runs the quick checks on the worktree pushed (`cargo xtask repo`; `npm run -s schema` when `generated/` is older than the schema; `npm run -s types` and eslint on the changed files when TypeScript changed; `cargo check --workspace --all-targets` when Rust changed) and refuses the push at the first that fails, naming it; run the push with a Bash timeout of 600000 ms. It also refuses a push from a branch other than `main` that would start a publishing workflow (one with push paths and no branch filter), naming it; `ALLOW_PUBLISH=1 git push ...` only with the owner's yes. A branch that merged `main` where `main` changed such a path is refused too: the push would start that workflow. |
| Bash guard | `hooks/rtk-guard.py` refuses three commands and says what to do instead. `pkill -f`: stop a process by its pid (TaskStop, or `stop-worker.sh <name>` for a worker), since the pattern also matches the shell that typed it. Polling CI with `gh` in a cloud session: to wait on CI, subscribe to the pull request's activity and end the turn, or read its check runs once with the GitHub MCP tools. `git stash` while a merge is in progress: commit the merge first. |
| Browser QA | Tests in a browser and pictures of the game headless: the picture driver (`tools/claude-toolkit/webgpu-shot.cjs`), the QA hooks, the way into each place, staging and reading a picture. All in [[Browser QA]]. |
| Interface pictures | `node tools/uiShot.mjs <shots.json> [--port 5173]` starts Vite on the port (the next free one where it is taken) and draws each shot's interface headless through the real renderer to a PNG; its header says the fields. R2 answers CORS for port 5173 alone, so uiShot fetches R2's reads for the page as from 5173. A shot's `build` is called every frame, so it keeps its state across them, as `menuShot` (`journalShots.ts`) keeps its layer. An event is heard on the shot's frame `at`, or its own `at`; with `on`, at the middle of the node of that id. To picture a one-off menu state, write a scratch module under `target/` that imports `menuShot` from `/src/game/journalShots.ts`, and name it in the shot as `"module": "/@fs/<absolute path>"`. A copy of uiShot itself under `target/` cannot find its modules, since Vite's root is `client/`. |
| Desktop app QA | Playwright's keys and mouse reach the page but never Electron's `before-input-event`, so the shell's own keys (F11, Alt+Enter, F12) need real X input: `xdotool windowfocus --sync <window>` (not `windowactivate`: xvfb has no window manager), then `xdotool key F11`. A packed app with the inspect fuse off cannot be attached by Playwright's `_electron`: run the binary and read its `app.log`. The app loads at once, so a driver reloads the page after `context.route(...)`. |
| Sound search | The freesound workflow's `only` input searches only the cues named and reads only their picks; `publish.py` keeps every other cue's sound as published while its picks in the list stand unchanged. A search asked again starts from the owner's own words (the cue's first query, or the words they gave), with several phrasings run side by side. |
| Encounter pictures | Every moment of an Elite Dungeon's seals and Court a player meets, headless: `QA_NOFOES=1 bash tools/claude-toolkit/dungeon-qa-build.sh <dir>` (a scratch room module, never shipped: its garrison but the Boss left out, no waves, and the QA hooks `room_qa_move`, `room_qa_freeze` to hold the room's clock for a moment, and `room_qa_encounter` to set one, from healing and lifting the body onto a pad to raising a ward, filling anchors, showing the slam or a Reckoning, starting Fury's clock, holding the body's health whole from the Court on so no death hides a moment, and standing the Boss on the camera's line; `roomModuleShipped.test.ts` holds the shipped module to none), a development page in a worktree of its own (`npx vite --port <free port>`, so edits elsewhere do not reload it), then `node tools/claude-toolkit/encounter-plan.ts <dir>/room-qa.wasm <elite place> <out> <plan.json> [port]` and `node tools/claude-toolkit/webgpu-shot.cjs <plan.json>`; a port other than 5173 makes the plan ask for `anyPort`. Each seal is pictured from the corridor outside the doorway its room is entered by and from inside while it waits (the clock held, so standing there does not start it), running, and in its own moments (a Litany's show and a wrong rune's flash, a Weighing's plates held, an Ascent's foul water and a body on a pad and its stone, a Holdfast's ring held, draining and drained); then the Court before and after the Boss wakes, a ward, anchors filling, the slam, Fury's warning and weight, and the Reckoning's light. A moment that runs in time is held with the clock frozen before its picture. The address goes into the run with the development `&run=` and opens the QA hooks with `&spawn=`; each stand is asked again until the page's own body (`__qaWhere`) stands there (the run fails if it never does), and `__qaLook` turns the camera. The run loads in about 150 s and a frame takes some 20 s, so a dungeon's two dozen pictures take about an hour. |
| Freeze probe | For a freeze or a hang (the picture stops, a thread's heap climbs), build unminified (`npx vite build --minify false --outDir <dist>`) and run `node tools/claude-toolkit/webgpu-stall.cjs <dist> [seconds] [beat] [--gpu]`. It serves the build on port 5173 with the picture driver's patches in the game's worker and, without `--gpu`, its GPU submissions dropped: SwiftShader draws a frame of the story every few seconds, too slow to reach a hang minutes in, while with nothing submitted the worker's JavaScript runs every frame. A beat (`sighted`, `wreck`, ...) starts the story there. Every 10 s it prints the worker's heap after a collection and its frames; a worker that does not answer for 8 s is paused and its stack printed, and it exits 2. Run each beat in turn. |
| Performance probe | Where a frame's time and garbage go, in the game's worker: build unminified (`npx vite build --minify false --outDir <dist>`, `NODE_ENV=development` for `&spawn=` and the QA hooks), write a plan and run `node tools/claude-toolkit/webgpu-perf.cjs <dist> <plan.json> <out>` (its header says the steps). It serves the build on port 5173 with the picture driver's patches and, without `"gpu": true`, its submissions dropped, so the worker's JavaScript runs every frame. Each `measure` step writes `<name>.json` (frame times and their mean, p50, p95, p99 and worst; the GPU calls and objects a frame; the heap; the heaviest functions by self and total time and, with `"alloc"`, by bytes allocated) and a `.cpuprofile` and `.heapprofile` for DevTools. A 20 s window varies some 15% from run to run in its frame times: compare two builds by their allocation profiles, exact per site, or by several runs each. For V8's own count of collections and their pauses, run it with `TRACE_GC=1 DEBUG=pw:browser`. |
| Dungeon pieces | Blender is a Python module: a Python 3.13 venv with `pip install bpy==5.3.0 pillow`. `python -I tools/dungeon/build.py --out <a folder outside the repo> [--style crypt] --preview` builds the packs and a contact sheet a style in the game's pictures by torchlight (`--preview flat`: a colour a part); `python3 -I tools/dungeon/test_envelope.py` checks the envelopes without Blender. Look at each sheet, and at a piece from more than one side: the sheet shows a door from its corridor. The `dungeon-modules` workflow publishes on push; take the manifest line from its log into `content/dungeon/modules.json` ([[Dungeon Modules]]). |

## Audits

- After a feature of more than a few days, one read-only audit agent reviews it before it is called done, beside the
  reviewer each worker ends with. Its brief gives the scope, what is already fixed and a findings format (file and
  line, the failing case, confidence), and none of the builder's conclusions; it runs no builds, so the CPU stays free.
- Each finding is measured before it is fixed: write the test that would catch it, run it, and size the fix to what
  fails, not to the finding's wording.

## Workers

Work that fans out goes to headless workers, each in its own git worktree.

- Start one detached, `setsid nohup bash tools/claude-toolkit/workers/run-worker.sh <worktree> <brief> >/dev/null 2>&1
  </dev/null &`, and wait on it with `tools/claude-toolkit/workers/wait-worker.sh <name>` (Bash, in the background,
  timeout 7200000, started again at that limit): a worker run as the background task itself dies with it at 2 h. The
  waiter answers `DONE` at the log's last line, `WORKER <name> DONE`, written after any resume, and `GONE` for a worker
  whose process died without it. Each
  gets Serena pinned to its worktree, Context7, Headroom, claude-mem and SkillsMP, and a
  worktree ready to test: the main checkout's `node_modules` linked, `npm run -s fixtures` run, and
  `CARGO_TARGET_DIR` unset, so it builds into its own `target/`.
  A read-only reviewer sub-agent in a worktree of its own links `node_modules`, `generated/`, `target/` and
  `client/public/` from the main checkout instead. Only a read-only reviewer links `target/`: a worktree that builds
  gets its own `CARGO_TARGET_DIR`, since builds keep the path of the checkout that made them.
- Every brief starts from `tools/claude-toolkit/workers/brief-common-template.md`.
- A run that ends with tracked work left uncommitted, or with its report (`~/wt/reports/<name>.md`) older than its last
  commit, is resumed once with the finish steps; its log says `WORKER <name> UNCOMMITTED` or `REPORT STALE`. A worker
  waits on its own sub-agents (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`), so a reviewer it ends its turn on wakes it.
- A late change goes in the worker's inbox (`~/wt/reports/inbox-<name>.md`, under a `## <short heading>` line), not a
  stop and `--resume`. A fresh run of a worker's name starts an empty inbox, keeping an earlier worker's aside.
- A worker's first three actions: one claude-mem search; `graphify update .` and one `graphify explain` or `path`;
  Serena `get_symbols_overview` on each source file it will change.
- Every worker ends with superpowers:verification-before-completion, one reviewer sub-agent, then
  ponytail:ponytail-review on its diff, even for a one-line change.
- Before merging a worker's branch: `python3 tools/claude-toolkit/workers/audit.py <worktree>` (its MISSING line must
  say none, and it says UNCOMMITTED for edits left out of the worker's commits) and a ponytail review of its diff.
