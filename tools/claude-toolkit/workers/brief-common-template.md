# Worker rules template -- copy, then fill in the <...> lines for this job

You implement ONE item in your own git worktree (named in your task). You are a headless worker: nobody answers
questions, so make the call, write it down, keep going. Report BLOCKED only for a real blocker.

Read first: <the hand-off doc / ledger paragraphs / notes this item needs>.

Your FIRST three actions, in this order (the controller checks your transcript with audit.py):
1. One claude-mem search for your item's keywords.
2. `graphify update .` in your worktree, then at least one `graphify explain <symbol or file>` / `graphify path A B`
   (or a `graphify query` naming a function or file) for your item.
3. Serena get_symbols_overview on every source file you expect to change.
Then: every function you change is found with Serena find_symbol / find_referencing_symbols first.

Tools (all are expected to be used; your final reply must say how):
- graphify: before opening any big file; it finds the file or system, then Serena finds the exact symbol. Don't grep
  the repo for something graphify answers. Never commit graphify-out/ (git ignores it).
- Serena (MCP, pointed at your worktree, tools interface): find_symbol, find_referencing_symbols, get_symbols_overview,
  and replace_symbol_body / insert_after_symbol for whole-function edits. For a few lines inside a long or nested
  function, locate it with find_symbol, then edit with Serena replace_content. Call mcp__serena__initial_instructions
  once first. Onboarding and its "ask the user" mode are off: you make the call. Its line numbers are 0-based. Plain
  Edit only for small in-line changes or files Serena can't parse (minified or generated code). Serena serves Rust and
  TypeScript only: read and edit Python and shell under tools/ with Read, Grep and Edit.
  A symbol's range includes its doc comment and attributes: a replace_symbol_body body carries them, and after it
  re-read the lines above the symbol. A hook undoes an edit that lowers the file's `///`, `/**` or `#[` lines.
- claude-mem: search before re-investigating anything. Its smart_search/smart_outline are not for code: use Serena.
- Headroom: headroom_compress outputs over ~10k chars (test logs, long greps) instead of re-reading them.
- Context7: look up a library's current docs before guessing an API.
- SkillsMP: search_skills when the item is a kind of job no installed skill covers.
- superpowers: test-driven-development (failing test first), systematic-debugging, verification-before-completion.
- A PostToolUse hook syntax-checks every .py/.js you Edit/Write; a "syntax check failed" message means fix it now.
  The repo's pre-commit hook refuses archives and C2PA-stamped PNGs: never bypass it with --no-verify.
  It also refuses a file whose line endings flipped:
  scripted rewrites keep them with open(f, newline='') for both the read and the write; check `git diff --stat`.
  It refuses a symbolic link and a staged file Prettier would rewrite too. The commit-msg hook refuses a first line
  over 100 characters, a trailer on it, or a missing Claude-Session: trailer: write the message with
  `git commit -F - <<'EOF'`.
- Test results: read failures from the raw log (`grep -n -E 'FAIL|ERROR|Error|Traceback' <log>`), never from a
  summary. If an output ever looks condensed, rerun it as `rtk bypass <command>`. Send a build's stderr to its log too
  (`> log 2>&1`). Never gate a commit on a piped check (`| tail` hides its exit code): run it bare or under
  `set -o pipefail`.
- Timeouts: `npm run -s types`, the client tests and any `cargo test` run in the background or with a timeout of at
  least 300000 ms; a background `vite preview` or full check gets an hour or more.
- rtk compacts git status/log and ls only; reads, greps, diffs and tests stay exact, inside ( ) subshells too, and
  `A=x; B=y; cmd $A` keeps its variables (the Bash hook rtk-guard.py fixes both).
  `git log` is compacted (long lines cut with "..."): when you need it exact, write `git --no-pager log ...`.
- Your inbox is $WORKER_INBOX (run-worker.sh names it in your task): re-read it before each commit and before your
  final report, and do what any new line in it says. The controller appends the owner's late changes there. Your final
  reply has one line "INBOX: ..." naming each inbox heading (the `## ...` lines) and done / not done, or "INBOX: empty";
  audit.py prints INBOX NOT ACKED for any heading the reply doesn't name.
- Scope: before your final report, list every item of your task (brief and inbox) as done / not done. A not-done item
  that no other worker blocks is not a stopping point: do it. DONE_WITH_CONCERNS is for real limits, not a first batch.
- Image checks (screenshots, art, layouts): every new image gets a new name (v2_, v3_ ...), never an overwrite. Your
  report says what is WRONG in each image, not only what is right. Any lost detail compared with the reference (holes,
  missing outline, something cut off or smaller than its siblings, two different things drawn the same) is a defect to
  fix, never a concern or "should be fine". A UI brief names its target: the owner's reference picture, or the approved
  twin surface in the game. Put the latest picture beside it and list first which structural elements (layout form,
  focal objects, how detail is revealed) the build has and lacks. A drawn change is done only with a picture made with
  the real code, assets and container (a menu page inside the real menu, startGearWindow, never alone), or a measured
  pixel check (the share recoloured, the contrast). Stage every input of a picture from one staged target and keep
  staging files under `target/` (bible/03-Code/Browser QA.md). The picture budget is sized from the brief's time aim (a
  GPU picture with its staging takes about five minutes); every retake counts against it, and once it is spent, stop and
  report.
- Browser check scripts you write: a navigation step that didn't land fails the step; a click that must do something
  is retried until the server's reply shows it; another page's view is compared against what it showed before the
  action; run a new script 3 times side by side before trusting it.
- Stopping a process: by its pid (TaskStop, or `bash $KIT_DIR/workers/stop-worker.sh <name>` for a
  worker), never `pkill -f <pattern>`: the pattern also matches the shell that typed it. Only the pids you started
  (`$!`), never a pid list from `ps | grep`: one killed a sibling worker. run-worker.sh stops what you leave running.
- Never set `CARGO_TARGET_DIR`: each worktree builds into its own `target/`. After a change under `crates/` or to a
  `.fbs`, and after every merge or rebase, run `npm run -s fixtures` before the page's or server's tests.
- Sub-agents and you get a terse "caveman" voice automatically; code, comments, commits and docs stay in normal prose.

Hard rules: <project rules: what never to touch, secrets/data rules, ports, files shared with other workers running in
parallel>.
- Checks before each commit, run bare: `npm run -s types && npm run -s lint && npm run -s format:check &&
  cargo fmt --all --check && cargo xtask repo` (after `cargo fmt`), then the tests of what changed: Rust with
  `cargo test --no-fail-fast -p <crate>`, the client with `node --test <files>` (package.json's runner). Never vitest,
  never one `tsc -p <config>`: run-worker.sh refuses a brief naming either, and audit.py runs the full type check.
  Only targeted tests: the controller runs the one full check after merging.
- Each new test stays under about 1 s on one core; the report names your slowest.
- A file within about 20 lines of the 600-line cap is split first, in its own commit, before the item.
- The tests that pin code you change are yours to update, whoever owns their files: both halves of a Rust/TS pin, the
  room-wasm and server agreement tests, the module's own test file, the rooms' deploy paths (ROOMS_CODE in
  `.github/workflows/rooms.yml`), and a one-line mechanical follow-on in an off-limits file. Before committing, grep the
  tests for the old text and name in the report any you may not edit. A core others build on ships module-agnostic
  tests and the shared test rig.
- For each behaviour the owner asked for, one test drives the real path: the rules' or room's own output through to
  what is drawn or sent, and data naming generated things checked against the generator's real output. A check built
  on a model of the system (its own pathing, a fake) proves only the model, and rules nothing out until the real system
  has been driven along what it found.
- Never reword or remove an existing line of dialogue or lore: meet a limit by leaving the new line out. Before calling
  anything "never decided", search every remote branch's bible (`git for-each-ref refs/remotes`, then `git grep`) and
  report one found there as "decided on <branch>".
- A sub-agent you send into an Agent-tool worktree starts from main: its brief gives the base and its first command is
  `git switch -c <name> <base>`, and it links node_modules and generated/. It has no Agent tool, so its brief says "run
  the code-review skill on your diff" in place of a reviewer.
- A note naming a branch as the home of held work names a branch on origin.

Before finishing, ALWAYS (even for a one-line diff or no diff at all; audit.py flags a skip and you get a --resume to do
it; with no diff, run verification-before-completion and say "no diff" on the reviewer and ponytail lines):
Skill superpowers:verification-before-completion, the reviewer sub-agent, then Skill ponytail:ponytail-review on
your diff. The reviewer is ONE Agent call (general-purpose) on `git diff $WORKER_BASE...HEAD` (run-worker.sh sets
`$WORKER_BASE` to your worktree's fork commit; after merging or rebasing onto main, `origin/main...HEAD`):
correctness, project rules, tests; fix what is real (one fix round).
Then:
1. Commit in your worktree. Commit trailer: <the session's attribution lines>.
2. Report to <reports dir>/<worktree name>.md, then a final reply under 15 lines: Status (DONE | DONE_WITH_CONCERNS |
   BLOCKED), commits, test summary, what a user now sees, concerns, the INBOX line, one line per tool (serena, graphify,
   claude-mem, headroom, context7, skillsmp, ponytail; "not needed, because ..." is fine), plus one line
   "OBSERVATIONS: ..." listing friction worth keeping (a tool clash, a rule that slowed you down, a step you had to
   work out yourself), or "OBSERVATIONS: none". Do not invoke task-observer or write to the task-observer workspace.
