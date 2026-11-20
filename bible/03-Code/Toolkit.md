---
type: reference
code:
  - tools/claude-toolkit/install-all.sh
  - tools/claude-toolkit/check-tools.sh
  - tools/claude-toolkit/hooks/kit-check.sh
  - tools/claude-toolkit/workers/run-worker.sh
  - tools/claude-toolkit/workers/brief-common-template.md
  - tools/claude-toolkit/workers/fidelity-review.sh
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
- Everything the install fetches is pinned: a commit's full hash, a version, or rtk's archive by its SHA-256. A
  session holds the owner's keys, so what it runs is what was read when it was pinned. Bump a pin on purpose, after
  reading what changed. Git trusts only `REPO_DIR` when another user owns it, never every repository.
- Plugins and MCP servers the install adds load in the next session. In the session that ran the install, use a
  skill by reading its `SKILL.md` (`find ~/.claude/plugins/cache -path '*skills/<name>/SKILL.md'`), and hand Serena
  and claude-mem work to a worker.
- `SHARED_DIR` defaults to `~/toolkit-data`, which a cloud container loses at its end. The task-observer log carries
  over on the repository's orphan branch `toolkit-data`: the install restores it (`toolkit-data.sh restore`), never over
  a file this container already holds, and `toolkit-data.sh save` at a session's end commits it over the commit it was
  restored from and lets git merge that onto the branch, so a parallel session's save is kept; a log never restored is
  never saved over the branch. `toolkit-data-test.sh`, run by check-tools, holds that. The claude-mem store, an
  archive the repository keeps out of git, carries over only where `SHARED_DIR` points at storage that survives.
- The SkillsMP and Context7 keys are network secrets the proxy adds to requests; their variables hold only the
  placeholder `proxy-injected`, which check-tools' key check passes without scanning. A real key is still looked for
  on disk.

## Tools

| Tool | How to use it |
|---|---|
| graphify | The code map. `graphify explain <symbol or file>` or `graphify path <A> <B>` for known names; `graphify query` only with a pointed question naming a function or file. Ask it before grepping or opening big files; update it after every merge or commit. Its `graphify-out/` is ignored by git. |
| Serena | MCP, tools interface: `find_symbol`, `find_referencing_symbols`, `get_symbols_overview`, `replace_symbol_body`. graphify finds the file or system, Serena the exact symbol. Plain Edit only for small in-line changes and files Serena cannot parse. If only `serena_repl` shows, the install is broken: fix it first. Its project lists both `typescript` and `rust`. |
| claude-mem | Search it before re-investigating anything. Its `smart_search` and `smart_outline` are not for code: use Serena. |
| Headroom | Compress big outputs with `headroom_compress` and `headroom_retrieve`. MCP only, never in the API path. |
| Context7 | MCP: a library's current docs before guessing its API. |
| superpowers | brainstorming, writing-plans, using-git-worktrees, subagent-driven-development, test-driven-development, verification-before-completion, systematic-debugging; requesting-code-review for the final review. |
| ponytail | The smallest complete change; a ponytail review before each merge and on the final diff. |
| Caveman | Through the kit's SubagentStart hook only: sub-agents and workers are terse; replies to the owner stay in full sentences. |
| rtk | Compacts `git status`, `git log` and `ls` only; reads, greps, diffs and test runs stay exact. If an output looks cut, run it again as `rtk bypass <command>`; write `git --no-pager log ...` for an exact log. |
| MarkItDown | Convert uploaded files (PDF, Word, Excel, PowerPoint) with `markitdown <file>` before reading them. |
| impeccable | The web and UI layer only. |
| SkillsMP | Find a skill for a new kind of job. |
| Web research | WebSearch, then WebFetch on the pages that hold the answer. A page that answers 200 with almost no text was built by JavaScript, not refused: read it with the preinstalled Chromium (`page.goto(url, { waitUntil: 'networkidle' })`, then `document.body.innerText`). reddit is closed to WebSearch; GameSpot, GameFAQs, Tom's Hardware and dotesports refuse WebFetch, and fandom answers 402, so spend no calls on them. |
| claude-code-setup | Run "recommend Claude Code automations for this project" when the setup is reviewed or a new stack arrives; adopt only what the other tools do not already cover. |
| task-observer | Log each correction, tool clash or slow rule with its `new-observation.sh` into `$SHARED_DIR/task-observer`, never the repo. Workers never log; they end with an "OBSERVATIONS:" line and the controller logs it. The owner approves every rule change at a review. |
| Syntax hook | "syntax check failed" after an Edit or Write means fix it now. |
| Commit guard | The clone's pre-commit hook refuses archives and C2PA-stamped PNGs. Never bypass it with `--no-verify`. |
| Browser QA | Playwright with the preinstalled Chromium; never run `playwright install` in a cloud session. Before a PR, drive an interactive feature once in the real editor with Playwright's keys and mouse. Poll the panel for state, not the clock: headless frames run the sim at about a fifth of real time. Pin a random outcome with an `addInitScript` stub of `crypto.getRandomValues`. Page screenshots of a WebGPU canvas are blank, and presenting to one loses the device headless: `node tools/claude-toolkit/webgpu-shot.cjs <steps.json>` gives the page's canvas a texture of its own and lays it under the HUD for each picture (its header says the steps; serve the page on port 5173, the only origin R2 answers). It prints each shader that fails to compile, which WebGPU reports only as a warning; `cargo xtask shaders` checks every shader offline first ([[Checks]]). Capture a built page, `npm run build` then `npx vite preview --port 5173`, never the dev server: an edit reloads a dev server's page mid-run and loses the rest of it. To picture a place from a camera the player has, the address asks for it as for a spawn: `/?at=<node>&spawn=<east>,<south>,<bearing in degrees>&view=first` (or `&view=third,<metres>`); an interior is pictured with the spawn a metre inside its room, from first person and from third (the boom pulls in off the walls, so it shows the room from inside), a wheel step's fourth number sends that many notches a frame apart, and `{ "hold": ["w", seconds] }` holds a key. Where another checkout holds port 5173, run Vite on another port and give the steps `"anyPort": true`: the driver fetches R2 for the page. Many views in one load: a `{ "views": "target/shots/saltmere.json", "zone": "<id>", "into": "<folder>", "settle": 15 }` step arrives the body (the offline room places it, so a view is an arrival in the same node) at each `[east, south, bearing, "first" | "third,<m>", "name"]` (offline, with any `&spawn=` in the address; a view outside the loaded node is refused) and writes `<into>/<name>.png`; `cargo test -p room --test shots_listed shot_list -- --ignored` writes `target/shots/saltmere.json` (git-ignored, or `$SHOT_LIST`; Saltmere's three zones: each area from where its first way enters, facing its middle; each run beat from its own line, at its rim or inside a building's room, facing its middle; a zone with a river in its section from its bank, looking along it, first and `third,60,25`; into each cavern and back out; up each ledge's stair and down over it; before each module's first socket; three `third,200,40` views from areas' ways in, facing the zone, the last number the degrees looking down; every view in the open, no box at the body) from the layouts as laid, so rerun it before taking pictures. For a visual defect, patch one shader layer off per run at `GPUDevice.prototype.createShaderModule`, measure a crop, and look at one montage per round. Before fixing a box's width to fit a text, lay the real element on the built page, its sheets and face loaded, and compare `scrollWidth` with `clientWidth` for the longest text it holds: write the width only from that. |

## Workers

Work that fans out goes to headless workers, each in its own git worktree.

- Start one with `bash tools/claude-toolkit/workers/run-worker.sh <worktree> <brief>` (Bash, in the background,
  timeout 7200000). Each gets Serena pinned to its worktree, Context7, Headroom, claude-mem and SkillsMP, and a
  worktree ready to test: the main checkout's `node_modules` linked, and its generated messages, WebAssembly and the
  message fixtures `cargo test -p protocol` writes built.
  A read-only reviewer sub-agent in a worktree of its own links `node_modules`, `generated/`, `target/` and
  `client/public/` from the main checkout instead.
- Every brief starts from `tools/claude-toolkit/workers/brief-common-template.md`.
- A late change goes in the worker's inbox (`~/wt/reports/inbox-<name>.md`, under a `## <short heading>` line), not a
  stop and `--resume`.
- Stop one with TaskStop or `bash tools/claude-toolkit/workers/stop-worker.sh <name>`, never `pkill -f <pattern>`.
- A worker's first three actions: one claude-mem search; `graphify update .` and one `graphify explain` or `path`;
  Serena `get_symbols_overview` on each source file it will change.
- Every worker ends with superpowers:verification-before-completion, one reviewer sub-agent, then
  ponytail:ponytail-review on its diff, even for a one-line change.
- A change that builds or records an owner's decision: `bash tools/claude-toolkit/workers/fidelity-review.sh
  <approval file> <base>..<head>` measures it against the owner's words with a fixed brief; its verdict goes in the
  pull request's description under "## Fidelity review" ([[Recording a Decision]]).
- Before merging a worker's branch: `python3 tools/claude-toolkit/workers/audit.py <worktree>` (its MISSING line must
  say none) and a ponytail review of its diff.
