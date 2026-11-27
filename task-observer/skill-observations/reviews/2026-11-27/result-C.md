# Group C triage

Checked against the working tree at c8269c9b (2026-11-27). Two files in the slice share id 272: `272a` is
0272-picture-driver-fetches-nothing-behind-proxy.md and `272b` is 0272-priority-rule-for-shared-slot-must-exempt-own-work.md.

Context for several verdicts: CLAUDE.md:12-13 now asks only `cargo xtask repo` and the tests of what changed before
a push, and CI runs the full check. Observations written against the older rule ("full check before every push") are
judged against the new one.

## Clusters to propose

### client-tests-read-rust-source
- ids: #16
- target: crates/xtask/src/checks (new repo check), bible/00-Rules/Tests Check Behaviour.md ("Checked by. Review.")
- change: a repo check refuses a `*.test.ts` that reads a path under `crates/` (or any `.rs`) at run time, and its
  message names the two accepted patterns: a fixture a Rust test writes under `target/`, or a content file both sides
  read. The rule's "Checked by" line then names the check.
- kind: barrier. RECUR: the rule was written and in both briefs, broken twice in one round, and still broken now:
  client/src/combat/foeBars.test.ts:356, client/src/game/fissureSpires.test.ts:16,
  client/src/game/publicNumbers.test.ts:10, client/src/overworld/voyage.test.ts:99 read crates/room/src/*.rs.
  The check must land with those four fixed (Checks.md:56-58, no baselines).

### pr-mergeable-after-push
- ids: #78
- target: tools/claude-toolkit/ (a small post-push script), bible/03-Code/Toolkit.md
- change: after each push to a pull request, a kit script reads the PR's `mergeable_state` and fails loudly on
  "dirty", since a conflicting PR starts no `ci` run and CI is now the only full check. The observation's other half
  (no edit or merge in a tree a background run reads) goes in isolate-long-runs.
- kind: barrier. Recurred three times (#113 twice, #209); the rule was never written, so not RECUR.

### shot-routes-serve-local
- ids: #181, #86
- target: tools/claude-toolkit/webgpu-shot.cjs, bible/03-Code/Toolkit.md Browser QA row
- change: the driver registers the plan's `routes` after its own R2 route (Playwright runs the last-registered route
  first), or its R2 route calls `route.fallback()` for a URL a plan route covers, and prints at the end each route that
  was never served. Optionally `--routes-from <manifest> <folder>` maps each unpublished mesh to the local bake. The
  Toolkit row names the recipe for content not yet on R2 (routes, a clock held at a clear hour, `waitFor` the HUD).
- kind: barrier. Still broken: webgpu-shot.cjs registers plan routes before the R2 route. Hit in two sessions, and #85
  saw it too; each worked round it with an `init` fetch rewrite.

### refresh-derived-before-tests
- ids: #13, #23
- target: package.json (a script), bible/03-Code/Testing.md, tools/claude-toolkit/workers/brief-common-template.md
- change: one npm script (for example `npm run -s fixtures`: schema, wasm, `cargo test -q -p protocol`) refreshes
  everything the page's tests read. Testing.md says to run it after any change under `crates/` or to a `.fbs`, and
  after every merge. Optional barrier: a `pretest` that rebuilds when a crate is newer than `client/public/*.wasm`.
- kind: barrier (script) plus text. Today only a fresh worktree is covered (Toolkit.md:86-88), and the line
  headroom wrote in CLAUDE.local.md:8-9, which is regenerated.

### quick-local-gate
- ids: #210, #282, #43, #44
- target: bible/03-Code/Testing.md (or Making a Change.md step 5)
- change: spell out "the tests of what changed" that CLAUDE.md now asks before a push: type-check with
  `npm run -s types` (all five configs, never one `tsc -p`), `cargo clippy -q --all-targets --workspace -- -D warnings`
  and `npm run -s lint` run after the last edit, and `cargo test -p` on every crate `cargo tree -i <crate>` lists after
  a wire change.
- kind: text, or a barrier if the owner wants a `cargo xtask quick`. #44's code fix landed
  (crates/naval/src/wire_tests.rs:136); its habit half is what remains.

### measurements-kept-honest
- ids: #29, #233, #273
- target: bible/03-Code/Testing.md "Measuring", cargo xtask check
- change: every `#[ignore]` measurement keeps one cheap non-ignored test that builds its scenario and asserts it
  happened (players met, a fight begun, the probe's actor alive by the same test the code uses), so CI breaks when the
  rules move. Testing.md lists the measurements and what each needs (`npm run bake`). A number quoted in the bible
  names its command, and is rerun when the code under it moves.
- kind: barrier plus text.

### exact-output-digest
- ids: #234
- target: bible/03-Code/Testing.md, one ignored digest test per heavy pure stage
- change: keep ignored tests that print `name digest` for every real input of the navmesh bake and the like, with the
  recipe (run on base, run after, `diff`, say how many compared). A claim of "same to the bit" cites that diff. Never
  a golden in CI.
- kind: text plus kept harness.

### tests-match-production
- ids: #238, #249, #271, #276, #225, #107
- target: bible/03-Code/Testing.md "What a good test looks like"
- change: one or two bullets. A test uses the game's own constants (the real lens) and a stand-in does what the
  platform documents. It covers the input's whole range (corners of an opening, non-US keyboard layouts, a rate
  settled and not only in its transient), bounds both sides, and reads explicit state (an action, a flag), never a
  rounded or packed number compared with zero.
- kind: text. Six separate escapes, each caught only by an audit or a later failure.

### fix-reaches-every-copy
- ids: #28, #231
- target: bible/03-Code/Testing.md
- change: a check added to a test helper goes to every copy of it (grep for the same loop) or the copies fold into
  the helper, and a walk is checked at every tick. Code moved for a size limit keeps every side effect, with a test
  written from the caller's order of use.
- kind: text.

### one-pin-per-fingerprint
- ids: #54, #255
- target: bible/03-Code/Testing.md "Agreement tests", the pinned tests
- change: each cross-language fingerprint lives once in a small shared file the Rust, client and server tests read.
  Still copied today, for example SEA_CLASH_HASH (crates/room-wasm/src/door_tests.rs:240, server/roomDoor.test.ts:371)
  and HULL_FIGHTS (crates/land-wasm/src/fight_tests.rs:212, client/src/rules/fightRules.test.ts:84). A pin moves only
  after switching the change off restores the old value.
- kind: barrier (shared file) plus text.

### pre-push-repo-check
- ids: #1, #67
- target: tools/claude-toolkit/git-hooks/ (only `pre-commit` exists), installed by install-all.sh
- change: a `pre-push` hook runs `cargo xtask repo`, the pre-push rule CLAUDE.md:12-13 now holds, so a chained or
  misread command cannot push past it.
- kind: barrier. RECUR: the older rule "run the check before every push" was in CLAUDE.md and was broken three times
  (#1, #67, #87).

### check-last-line-verdict
- ids: #87
- target: crates/xtask/src/main.rs:24-29
- change: the last line says the verdict, for example "passed: checked <sha>" or "FAILED (<steps>): checked <sha>".
  Today it prints "checked <sha>, nothing uncommitted" after a failure too, and CLAUDE.md:20 points readers at that
  line.
- kind: barrier (tool). RECUR: twice, read as a pass while the check-before-push rule was written.

### shot-waits-and-says-why
- ids: #39, #41, #247, #200
- target: tools/claude-toolkit/webgpu-shot.cjs, client/src/game/qaViews.ts (`__qaWhere`), Toolkit.md Browser QA row
- change: when a `frames`, `waitFor` or `views` wait times out, the driver prints the interface's words (`__ui()`).
  It prints a failed resource's URL (`message.location().url`). `__qaWhere` reports whether the layouts' city is
  still building, so `views` can wait for it. The Toolkit's sea recipe waits for `flow.mode === 'sea'`, asking
  `__qaSea()` again. A beat capture (`?prologue=`, dev server only) runs in a worktree of its own and clicks past
  "to start". The preview server is stopped by its own pid, not the npx wrapper's, and not by `pkill -f` (the brief bars
  that).
- kind: barrier (driver) plus text.

### picture-controls-held-fixed
- ids: #197
- target: client dev hooks (client/src/game/foesAsked.ts, client/src/game/gates.ts), Toolkit.md
- change: a dev-only world-time hook the room honours (as with `&speed=`), and separate address keys for where the
  arrival stands and which foes are asked. Today `foesAsked.ts:10` and `gates.ts:14` both read `spawn`. Owner's call:
  it changes the client.
- kind: barrier (tooling).

### stage-from-one-state
- ids: #65
- target: bible/03-Code/Toolkit.md Browser QA, tools/claude-toolkit/workers/brief-common-template.md "Image checks"
- change: every staged input (lay, aim, card, hull) comes from one staged target. Staging files live under
  `target/`. The brief sizes the picture budget from its time aim, counts retakes against it, and stops and reports
  when it is spent.
- kind: text. It recurred in the plus worker although its brief said to stage from one target.

### uishot-in-toolkit
- ids: #290, #215
- target: tools/uiShot.mjs, client/src/game/journalShots.ts, bible/03-Code/Toolkit.md
- change: uiShot gets a `--port` flag (default 5173), and the Toolkit gains a row for uiShot. The row says R2 art loads
  only on 5173, that a copy under `target/` cannot find its modules, and documents the `on` and per-event `at` fields.
  Export `menuShot`, or let a shot pass gear as data, so a one-off state needs no edit to a tracked file. uiShot
  appears nowhere in Toolkit.md today.
- kind: barrier (flag, export) plus text.

### merge-with-trailers
- ids: #94
- target: tools/claude-toolkit/git-hooks (commit-msg), bible/04-Procedures/Branches and Merging.md
- change: merge in one step with `git merge --no-ff -m "<message with trailers>"` and never amend after a merge that
  may have fast-forwarded. A commit-msg hook refuses a Claude session's commit without its trailer.
- kind: barrier. Second violation of the trailer rule.

### line-width-check
- ids: #53
- target: crates/xtask/src/checks (comments, vault)
- change: the owner chooses. Either the comments and vault checks hold comment and note lines to 120 characters, with
  the 559 lines already past it in bible/02-Systems fixed in the same change, or reviewers stop asking for it. Prettier
  skips `bible/` (.prettierignore) and nothing in the vault states the width.
- kind: barrier. Hit twice.

### audit-reads-whole-log
- ids: #42
- target: tools/claude-toolkit/workers/audit.py:40-47
- change: look for "OBSERVATIONS:" in every assistant turn of the log and in the report `.md`, not only the last text,
  so a multi-turn finish is not flagged as a false defect.
- kind: barrier (script fix).

### long-background-timeout
- ids: #92
- target: bible/03-Code/Toolkit.md "Running the kit"
- change: a long background job (bake, render, full check, capture) is started with `timeout: 7200000`. Today
  Toolkit.md:83 says so only for wait-worker. The default limit killed renders, bakes and a full check (also reported
  in #43 and #86).
- kind: text. #92's other parts are in place: r2.py:2-4 says the Default environment holds no token, and the
  claim-file renumber is fixed (toolkit-data.sh:26-27).

### isolate-long-runs
- ids: #224, #312
- target: bible/03-Code/Testing.md "Measuring", Toolkit.md Performance probe and Browser QA rows
- change: a long run measures whatever surrounds it. Run a baseline before the first edit or in a worktree of its own,
  with no edit, merge or checkout in a tree a background run reads (#78's first half). Run the picture driver and
  webgpu-perf on an idle machine, not beside cargo builds. Use `cargo test --workspace --no-fail-fast` to see every
  failure. Testing.md:48-49 covers only the check's own timing.
- kind: text. The Browser QA "idle machine" line #312 cites is no longer in Toolkit.md.

### islands-mode-game-plants
- ids: #68
- target: client/src/editor/isleEditor.ts, Toolkit.md
- change: the owner decides whether the World Editor's Islands mode draws the game's plants (`IslesNature`, perhaps
  behind `?islePlants=game`), so the island as players see it has a fast picture route. isleEditor.ts still does not
  draw them.
- kind: barrier (tooling), owner's call.

### resume-check-other-sessions
- ids: #73
- target: CLAUDE.md "Every session" or bible/Hand-off.md
- change: before resuming work from a hand-off, list the account's running sessions. If one names the same branch or
  plan, stop and ask.
- kind: text. One instance.

### pinned-dead-code-finder
- ids: #104
- target: tools/claude-toolkit/install-all.sh, Toolkit.md "Audits"
- change: pin one dead-code finder (knip or ts-unused-exports at a version and hash; cargo-machete for Rust) in the
  install, and name it in Audits.
- kind: barrier (tool). Nothing is pinned today.

## Done
- #21: crates/room/src/gear_tests.rs:71-76 (`sent()` ticks as the host does, then takes the gear change); also drops_tests.rs:318
- #27: tools/claude-toolkit/toolkit-data.sh:47-48 (restore lays the branch's log and always notes its base), :19-35 (save renumbers colliding ids); Toolkit.md:29-36
- #30: bible/03-Code/Toolkit.md:86-90 (workers build their own target; only read-only reviewers link `target/`) with :73 (reviewers run no builds)
- #33: bible/03-Code/Toolkit.md:38-40 (keys are proxy-injected network secrets); Context7's quota is the owner's key to grant
- #35: tools/claude-toolkit/check_tools.py:249-257 (check-tools runs a real MCP search and FAILs if it answers nothing)
- #45: tools/claude-toolkit/toolkit-data.sh:47-48, :19-35
- #47: tools/claude-toolkit/toolkit-data.sh:48 (restore writes restored-from every time)
- #56: bible/03-Code/Checks.md:23-28 (`cargo xtask check` step 5 validates every shader with naga; `cargo xtask shaders`)
- #69: tools/uiShot.mjs:1-7 and bible/02-Systems/Interface.md:383-391 (the menu pictured headless from journalShots.ts); a DOM spill check is moot now that the menu is GPU-drawn
- #81: tools/claude-toolkit/toolkit-data.sh:26-27 (only `NNNN-*.md` files move)
- #84: bible/02-Systems/Sprite Forge.md:163-165 and bible/03-Code/Toolchain.md:104-105 (each pipeline installs its own hashed requirements)
- #85: bible/03-Code/Testing.md:48-49 (run the check idle; rerun a timing failure idle before reading it as a regression)
- #89: tools/uiShot.mjs:1-7, client/src/game/journalShots.ts:201-287 (menu pages from fixture gear, no rooms)
- #93: crates/xtask/src/checks/vault.rs:296 (a wikilink broken across lines fails the vault check)
- #100: tools/claude-toolkit/webgpu-shot.cjs:7-11 (the driver patches the game's worker; the device loss was #108's cause)
- #101: bible/04-Procedures/Recording a Decision.md:17-19 (Claude's calls only for a system the owner hands over)
- #108: tools/claude-toolkit/webgpu-shot.cjs:7-11, Toolkit.md:63 (worker patch landed); the new-observation.sh misparse has its cause fixed at toolkit-data.sh:26-27
- #229: tools/uiShot.mjs:17-18 (5173 first); client/src/ui/shot.ts:3-5 (`on` and `at` events). Its doc half is in uishot-in-toolkit
- #237: tools/claude-toolkit/webgpu-shot.cjs:18-19 (down/up steps), :28-30 (World Editor `frames` note); Toolkit.md:63
- #272a: tools/claude-toolkit/webgpu-shot.cjs:165-170 (HTTPS_PROXY launch, localhost bypassed); Toolkit.md:63

## Drop
- #6: out of the repo's reach (a session started in another repository never reads this one); handed to the owner on 2026-11-20
- #26: obsolete. CLAUDE.md:12-13 no longer asks for the full check before a push, and CLAUDE.local.md now holds no push rule
- #46: obsolete. No HTML or CSS interface is left to match against (no `*.css` under client/; the html check refuses stylesheets, Checks.md:42)
- #48: duplicate of #6
- #91: the id misparse's cause is fixed (toolkit-data.sh:26-27); "check what is staged before commit" is a one-off git habit
- #96: obsolete. Later sessions drew real pictures with uiShot (#215 and #229 on 2026-11-24; Passages.md:449 relies on it)
- #97: obsolete. Pushing before the full check is now allowed (CLAUDE.md:12-13), so the Stop hook's push request no longer fights the rule
- #272b: too narrow. A one-off design slip in reinforcements.rs that its own unit tests caught
