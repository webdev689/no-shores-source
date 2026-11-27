# The 2026-11-27 review: every open decision, by cluster

One line an entry: id, presence (outstanding / partial), who decides (owner: a new rule, check, CI, keys, security or deploys; kit: a kit or worker-rule fix under the owner's standing order; note: a wording fix in a note), the target, the finding. Restatements found within a reader's batch are named after the finding.

## browser-qa-pictures (42: 2 owner, 27 kit, 13 note)

- #18 partial, owner, `tools/claude-toolkit/workers/brief-common-template.md; CLAUDE.md`: Data-path tests passed a colour drawing nothing; drawn changes need a real-asset picture and a measured pixel check before done.
- #24 partial, kit, `tools/claude-toolkit/webgpu-shot.cjs; bible/03-Code/Toolkit.md`: Per-worker ports drew no R2 art (fixed by anyPort); the shot script still needs NODE_PATH when run from a scratch copy.
- #39 outstanding, kit, `tools/claude-toolkit/webgpu-shot.cjs`: Shot console 404s print no URL (webgpu-shot.cjs:179) and kill $! leaves vite serving; print location().url, stop vite properly. (restates 0040)
- #40 outstanding, kit, `tools/claude-toolkit/webgpu-shot.cjs; tools/claude-toolkit/workers/stop-worker.sh`: A stale vite on the port made captures of the wrong build (3 times); shot should refuse a server not from this checkout. (restates 0039)
- #41 partial, kit, `tools/claude-toolkit/webgpu-shot.cjs; bible/03-Code/Toolkit.md`: Beat captures needed dev features and a start click; on a wait timeout the shot should print the visible text.
- #65 outstanding, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit/workers/brief-common-template.md`: Separately staged inputs gave impossible pictures and overran the budget; stage from one target, count retakes in the budget.
- #66 outstanding, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit/workers/brief-common-template.md`: New HUD judged against the port source not the approved look; UI briefs name the approved twin and pictures sit beside it.
- #68 outstanding, owner, `client/src/editor/isleEditor.ts; bible/03-Code/Toolkit.md`: Islands editor mode draws no game plants (isleEditor.ts), so plants have no picture route; whether to add one is the owner's call.
- #69 partial, kit, `tools/claude-toolkit/; bible/03-Code/Toolkit.md`: A menu picture harness lived in a lost scratchpad; a repo harness now exists, the stricter spill check does not. (restates 0089)
- #72 partial, kit, `bible/03-Code/Toolkit.md`: Linked node_modules makes a worktree dev server 403 the fontsource face; check fonts load or picture a built page.
- #86 outstanding, kit, `tools/claude-toolkit/webgpu-shot.cjs; bible/03-Code/Toolkit.md`: Shot routes lose to the R2 route so unpublished meshes cannot be shown; add a folder route and the speed recipe to Toolkit.
- #96 partial, kit, `client/src/ui/shot.ts; tools/uiShot.mjs`: uiShot wrote blank pictures; it is in use again (fix unchecked) but still has no test that a shot holds more than one colour.
- #108 partial, kit, `tools/claude-toolkit/webgpu-shot.cjs; bible/03-Code/Toolkit.md; new-observation.sh`: Picture driver missed the game worker (now fixed and noted); new-observation.sh top_claim still lacks the ^[0-9]+ filter (stale marker 0125- remains). (restates 115,120)
- #115 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Render checks lost the device under load, vite preview hit the 10-min limit, size limit surfaced late; brief lacks one-render-worker and long-timeout lines. (restates 108,131,132)
- #120 partial, note, `bible/03-Code/Toolkit.md`: webgpu-shot could not picture the worker-drawn game (now fixed); the tip to use tools/uiShot.mjs for HUD checks is still not in Browser QA. (restates 108)
- #139 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md; bible/03-Code/Toolkit.md`: A screen was judged on legibility, not the owner's reference; brief names the reference and review lists its structural elements first.
- #149 partial, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit/workers/brief-common-template.md`: Timed moments need QA hooks not waits (now documented); brief still lacks split picture items, report-before-review and no-full-check lines. (restates 117,144,179)
- #177 partial, note, `bible/03-Code/Toolkit.md`: uiShot calls build every frame, so state made inside it restarts; say keep a shot's state across frames, as journalShots does.
- #178 outstanding, note, `bible/03-Code/Toolkit.md`: A noGpu waitFor matched words the arrival veil also holds; Browser QA should say wait for something laid only once the veil lifts.
- #181 partial, kit, `tools/claude-toolkit/webgpu-shot.cjs`: Plan routes never reach R2 files (driver's R2 route added later wins); fix route order or fallback, and give the world-shot recipe in Toolkit.
- #191 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Page-alone picture builders hid a z-order bug; brief's image rule should require menu pages pictured inside the real menu window.
- #197 outstanding, kit, `client/src/game/qaViews.ts`: Plans cannot set night (room resets the clock) and &spawn= also asks foes (foesAsked.ts, gates.ts); add a dev world-time hook and split keys. (restates 0209)
- #200 outstanding, note, `bible/03-Code/Toolkit.md`: Sea plans need to wait on flow.mode === 'sea' and place ships ahead of the camera; watchers should key on a driver sentinel, not 'Error'.
- #206 outstanding, kit, `tools/claude-toolkit/webgpu-shot.cjs`: A slowed Date.now hid motion in world pictures; plans should print their clock factor, and vite preview needs a long background timeout.
- #209 outstanding, kit, `client/src/game/qaViews.ts`: A plan cannot set the weather (offline room overrides the clock); lend a dev __qaSky hook and say so in Toolkit's Browser QA row. (restates 0197 0240)
- #211 outstanding, note, `bible/03-Code/Toolkit.md`: Notes lack: Foot.gear is null alone (read held.gear ?? held.alone), __qaView re-arrives a fresh body, a GPU run cannot finish a hold (code bug fixed).
- #215 outstanding, kit, `tools/uiShot.mjs`: uiShot reaches only exported builds, so one-off states need edits to tracked shot files; let a shot pass a gear override as data.
- #226 outstanding, note, `bible/03-Code/Toolkit.md`: Toolkit says __qaEye stands the camera anywhere, but at sea it does nothing; document the sea camera recipe or make __qaEye work there.
- #229 partial, note, `bible/03-Code/Toolkit.md`: uiShot's random port lost R2 art (fixed in code); Toolkit should say uiShot also needs 5173 and document the on and at event fields.
- #239 partial, note, `bible/03-Code/Toolkit.md`: A GPU run waited 15 min on a start screen; rehearse a flow with noGpu and ui dumps first, and count frames in game time.
- #246 outstanding, kit, `client/src/game/qaViews.ts`: A Breach run cannot be pictured offline (&run= opens dungeons only); add a QA view that opens a Breach run alone.
- #247 outstanding, kit, `tools/claude-toolkit/webgpu-shot.cjs`: Views before the layouts' city is built show bare land; driver should wait on a built flag via __qaWhere, or Toolkit say wait ~4 min.
- #250 outstanding, note, `bible/03-Code/Toolkit.md`: Playwright keys never reach Electron's shell and packed apps cannot attach; add a Desktop app QA row (xdotool under xvfb, app.log).
- #256 outstanding, note, `bible/03-Code/Toolkit.md; tools/claude-toolkit/webgpu-shot.cjs`: Headless public-event pictures must open just before the zone raid slot and finish in 8 minutes; say so in Browser QA or give the driver a minute override.
- #277 partial, note, `bible/03-Code/Toolkit.md`: A picture read only for the change missed rain inside a room; Browser QA should read each picture twice, the second time as a player, listing every fault.
- #285 outstanding, kit, `bible/03-Code/Toolkit.md; client/src/game/game.ts`: __qaSea() left a fresh offline character on foot for 10 minutes; give it a first ship or make it answer false, and name the character it works for.
- #286 outstanding, kit, `tools/modules/render.py; bible/03-Code/Toolkit.md`: render.py always lays a ground plane, hiding views from below; add a from-below view or no-ground flag and name it in the Toolkit.
- #290 partial, kit, `tools/uiShot.mjs; bible/03-Code/Toolkit.md`: Workers each patched uiShot for a port and lost R2 art off 5173; give uiShot a --port flag and say off-5173 pictures show initials.
- #293 outstanding, kit, `client/src/game/prologue; bible/03-Code/Toolkit.md`: The prologue has no QA camera hook (QA_EYE serves only the orbit camera); add __qaEye to the story director and a qa clock to jump to a beat. (restates 325)
- #307 outstanding, note, `bible/03-Code/Toolkit.md`: Hub and sea pictures needed unwritten steps (keepBuilding, hour pin, npm run wasm, sea.zoom, ownSeen); add them to Browser QA or as QA hooks. (restates 324)
- #322 partial, note, `tools/claude-toolkit/webgpu-shot.cjs; bible/03-Code/Toolkit.md`: A GPU story picture took ~10 min to reach a line and a 120 s poll timed out; say story pictures need long waitFor timeouts. (restates 329)
- #324 outstanding, kit, `tools/claude-toolkit/webgpu-shot.cjs; tools/claude-toolkit/webgpu-perf.cjs; bible/03-Code/Toolkit.md`: A pinned night hour drifts back to real time and webgpu-perf has no init; add a QA hook that holds the hour. (restates 307)

## test-design (35: 2 owner, 7 kit, 26 note)

- #16 outstanding, owner, `crates/xtask/src/checks; bible/00-Rules/Tests Check Behaviour.md`: Client tests still read Rust source text (fissureSpires.test.ts, voyage.test.ts); proposes a repo check refusing .rs reads from tests.
- #21 partial, note, `bible/03-Code/Testing.md`: Room tests leave gear_changed set, hiding staleness; wants a host-like tick helper used widely and a Testing.md note.
- #28 outstanding, note, `bible/03-Code/Testing.md`: A guard added to one test walker missed an inline copy; when adding a helper check, grep and fix every copy, check each tick.
- #54 outstanding, note, `bible/03-Code/Testing.md`: Fight fingerprints are pinned separately in Rust, client and server tests; keep each pin once in a shared file.
- #75 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: An "every X used" design missed 103 layers; inventory the set and write the coverage test before designing.
- #95 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Made-up nodes hid an unfinishable road; data naming generated things needs one test against the generator's real output.
- #107 partial, note, `bible/03-Code/Testing.md; bible/03-Code/Toolkit.md`: A key-naming fix was tested on US codes only; Testing.md should require a non-US layout case, and a big audit PR gets its own independent audit. (restates 135)
- #121 partial, note, `bible/03-Code/Toolkit.md`: A rules change moved fingerprints pinned in room-wasm and server tests; say run dependent crates and npm test and grep the old hash before repinning. (restates 129,158)
- #135 partial, note, `bible/03-Code/Toolkit.md`: One in five audit fixes was unguarded at the wiring seam; add a mutation pass, a side-effect review and a findings-vs-PR checklist to Audits. (restates 107)
- #138 outstanding, note, `bible/03-Code/Toolkit.md`: A reviewer's proposed fix failed its own example; before applying a review fix, run the report's failing inputs and add them to the test.
- #150 outstanding, note, `bible/03-Code/Toolkit.md`: Ship-aim tests checked the camera against itself; say measure a view against the real wasm rules answer, projected per frame, in pixels.
- #155 outstanding, kit, `crates/gear/src`: A test grant above AUREM_MOST was clamped silently and failed far away; give gear test setup a loud assert or test-only setter.
- #156 outstanding, note, `bible/03-Code/Toolkit.md; bible/03-Code/Checks.md`: Tightening a repo check: prototype it over the corpus, count false alarms and leaks, then plant a bad case to prove the port.
- #158 outstanding, note, `bible/03-Code/Toolkit.md`: A fingerprint moved after several fixes; before repinning, take each fix out alone to name the mover and measure what the pin guards. (restates 121,172)
- #172 outstanding, note, `bible/03-Code/Toolkit.md`: A pinned scripted outcome flipped on one seed; attribute it, sweep ten or more seeds with and without, repin only if counts barely move. (restates 158)
- #190 outstanding, note, `bible/03-Code/Toolkit.md`: A failing-first check passed since the fixture equalled the bug's output; revert only the fix's lines and pick fixtures the bug cannot produce.
- #199 outstanding, kit, `bible/03-Code/Toolkit.md`: A *_FLOATS change broke tests restating sizes by hand, and riding cannot be pictured offline; grep old numbers, run wasm, add a &horse= hook. (restates 0218)
- #202 outstanding, kit, `crates/room/src`: Many room tests rely on SEALING_SEED yielding a Vestige; give tests a helper that grants the precondition directly.
- #203 outstanding, note, `CLAUDE.local.md`: Geometry tests used the code's own idealised shapes and imported its tolerances; build oracles from what is drawn, over the full data range. (restates 0230)
- #218 partial, kit, `server/outpostReload.test.ts`: Hand-built intent literals went stale when the layout grew; build them from the layout's constants and assert each run did something. (restates 0199)
- #331 outstanding, note, `bible/03-Code/Testing.md`: A rate test read the transient, not the settled value, and a 6-sample table nearly drove a retune; test settled rates, state sample sizes.
- #230 outstanding, note, `bible/00-Rules/Tests Check Behaviour.md`: Tests restating the stats formula hid a one-tick fire-rate error; test a summary by running the simulation it summarises. (restates 0203)
- #231 outstanding, note, `bible/03-Code/Testing.md`: Moving code to meet the size limit dropped a per-frame side effect; list and keep moved side effects, test from the caller's order.
- #233 outstanding, owner, `crates/room-wasm/src/load_tests.rs`: Ignored load measurements rotted unseen; run a tiny form in CI or keep a cheap test that builds each scenario, and list them in Testing.
- #238 outstanding, note, `bible/03-Code/Testing.md`: A framing test used a 57 degree stand-in lens and a one-sided bound; use the game's lens constants and bound each share on both sides. (restates 0249)
- #249 outstanding, note, `bible/03-Code/Testing.md`: A fake dialog answered abort unlike Electron and hid a bug; Testing should say a stand-in does what the platform documents. (restates 0238)
- #255 outstanding, note, `bible/03-Code/Testing.md`: A moved pinned fingerprint is re-pinned only after switching the change off restores the old value; Testing.md should say so and re-pin both copies together.
- #268 partial, note, `bible/03-Code/Toolkit.md; client/src/game/travel.ts`: Font-importing modules cannot load in node tests, so decisions belong in a plain module; headless SwiftShader lost its GPU device after a few shots.
- #333 outstanding, note, `bible/03-Code/Testing.md`: A test script judged a foe alive by quantized health > 0; Testing.md should say read the explicit state (action, phase, flag), never a rounded number.
- #334 outstanding, note, `bible/03-Code/Testing.md`: A yield rule over a one-at-a-time baker blocked its own bake; Testing.md: test a single slot new consumer both for starving others and finishing its own.
- #273 outstanding, note, `bible/03-Code/Testing.md`: A probe walker died early so its readings measured a corpse; Testing.md: a probe reads its actor state by the rules own test, reported beside each reading.
- #276 outstanding, note, `bible/03-Code/Testing.md`: A clear-through test sampled only each opening centre and missed covered corners; Testing.md: sample centre plus inset corners and report how many block.
- #309 partial, note, `bible/02-Systems/Music.md; client/src/game/audio/music/variation.test.ts`: Music laws on few fixed dice and exact pitches hid defects; hold laws over 50+ dice, compare note names, and do a note-by-note pass before done.
- #323 outstanding, note, `bible/03-Code/Toolkit.md`: Undoing a mutant with git checkout -- file dropped an uncommitted fix; commit or copy the file before mutating, or reverse the sed.
- #325 outstanding, kit, `crates/room/src/sea_tests.rs; client/src/game/camera.ts; bible/03-Code/Toolkit.md`: Test rooms start at Unix 0, midnight, so night rules shift room tests, and __qaEye misses the sea; pin test hours and extend QA_EYE to sea. (restates 293)

## ci-and-push-gating (27: 15 owner, 3 kit, 9 note)

- #67 outstanding, owner, `CLAUDE.md; tools/claude-toolkit/git-hooks`: Pushes went out on failed checks (3 sessions); proposes a pre-push hook refusing a head without a passing check marker. (restates 0026,0087,0097)
- #78 outstanding, owner, `CLAUDE.md; bible/03-Code/Toolkit.md`: A check ran on a tree mid-merge and a dirty PR got no CI for pushes; no edits under a running check, read mergeable_state after push.
- #87 outstanding, owner, `crates/xtask/src/main.rs`: xtask check's last line "checked <sha>" prints on failure and was read as a pass; print passed/FAILED and read the exit code. (restates 0067)
- #97 outstanding, owner, `tools/claude-toolkit/install-all.sh`: The Stop hook asks to push mid-check or after a failed check (4 sessions); have the check write a verdict the hook reads. (restates 0026,0067)
- #111 outstanding, owner, `.github/workflows/ci.yml`: Merge-race part is settled by the CI decision; still open: ci.yml does not cache shipTags.test.ts's R2 meshes, so an R2 500 can skip deploys. (restates 110)
- #122 outstanding, note, `bible/03-Code/Toolkit.md`: A CI wait was polled with gh api where gh is allowed only for search; Toolkit should say read check runs via MCP or subscribe to PR activity.
- #130 outstanding, owner, `bible/03-Code/Toolkit.md; tools/claude-toolkit/git-hooks`: Publishing workflows have push paths with no branch filter, so a session-branch push publishes to R2; note it, and add a pre-push guard.
- #154 outstanding, owner, `bible/03-Code/Toolkit.md; tools/claude-toolkit/check_tools.py`: shipTags tests fetch R2, refused on Default and missed by Node fetch without NODE_USE_ENV_PROXY=1; note it and probe R2 in check-tools. (restates 157,163)
- #157 outstanding, owner, `tools/claude-toolkit/install-all.sh; tools/claude-toolkit/check_tools.py`: install-all.sh should set NODE_USE_ENV_PROXY=1 in settings env and check-tools should probe R2, so a Default-env session learns before its check. (restates 154,163)
- #163 outstanding, owner, `bible/03-Code/Toolkit.md`: Cloud full check fails shipTags on R2; Toolkit should say use the no-shores-source environment and NODE_USE_ENV_PROXY=1. (restates 154,157)
- #186 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: A CI step tested in a hand-grown venv failed in CI; brief should require testing a step in a fresh venv built from the workflow's pins.
- #213 partial, kit, `bible/03-Code/Toolkit.md`: CI check outgrew its limit as tests grew; brief should cap new tests near 1 s and Toolkit give a recipe to time a test binary. (restates 0216 0220)
- #220 partial, note, `bible/03-Code/Toolkit.md`: A check at 44 of 45 minutes went unremarked until main was cancelled; after each run compare duration to timeout, act past 80%. (restates 0213 0216)
- #223 partial, owner, `.github/workflows/rooms.yml`: A deploy health check compared a hand-set constant; stamp the commit and require /health to answer it, for the accounts too.
- #227 outstanding, note, `bible/03-Code/Toolkit.md`: CI was polled with a gh api loop where gh is search-only; Toolkit should say wait on the PR subscription and read runs via GitHub MCP. (restates 0240)
- #240 partial, note, `bible/03-Code/Toolkit.md`: The stop hook asks to push before an owner-asked full check; start the check before committing, write entries via quoted heredocs. (restates 0209 0227)
- #242 outstanding, owner, `.github/workflows/ci.yml`: CI fetches island packs from a rate-limited r2.dev host, so a 429 blocked a merge's deploy; serve from the zone or cache packs by hash.
- #253 outstanding, note, `bible/03-Code/Toolkit.md`: A check piped through tail passes any && chain; Toolkit should say gate a commit on a bare check or under set -o pipefail. (restates 265,283,315)
- #258 partial, note, `bible/03-Code/Toolkit.md`: Fixing one failed CI step hid the next; read every failed run you caused and dry-run later steps locally under runner conditions before pushing. (restates 280)
- #259 outstanding, note, `bible/03-Code/Toolkit.md`: A conflicting PR gets no CI run; after each push confirm a ci.yml run exists, else check mergeable_state and merge main, then npm run -s schema. (restates 294)
- #265 outstanding, owner, `tools/claude-toolkit/workers/brief-common-template.md; tools/claude-toolkit/git-hooks/pre-commit`: cargo xtask repo piped through tail let a failing commit through; template should require pipefail and the pre-commit hook run the repo check. (restates 253,283,315,328)
- #280 partial, note, `bible/03-Code/Toolkit.md; tools/freesound/publish.py`: A local pass with numpy hid a runner without it; after merging main, run path-triggered workflow Python steps with only the packages that workflow installs. (restates 258)
- #283 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: eslint piped through tail let a commit run through a lint error; the template Test results rule should require a bare check or pipefail before a commit. (restates 253,265)
- #294 outstanding, note, `bible/04-Procedures/Branches and Merging.md`: A conflicting PR runs no CI; after each push run git merge-tree against fresh origin/main, merge first on conflict, and rerun measured tests after. (restates 259)
- #299 outstanding, owner, `bible/03-Code/Toolkit.md; bible/04-Procedures/Branches and Merging.md`: Each push cancels the running 50-minute PR check (ci.yml cancel-in-progress); batch pushes, or let notes-only commits wait for a code push.
- #315 outstanding, owner, `CLAUDE.md; tools/claude-toolkit/git-hooks/pre-commit`: cargo xtask repo | tail; then commit and push let a failing check through; add a pre-push hook running the repo check, or gate with &&. (restates 328,253,265)
- #329 outstanding, owner, `CLAUDE.md; tools/claude-toolkit/git-hooks`: check; push ran the push after a failed check; gate with && and add a pre-push hook running the repo checks. (restates 315)

## worker-brief (25: 0 owner, 19 kit, 6 note)

- #22 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: A line-level file carve-out pushed a worker's test into a new file; template should say a carve-out covers the module's test file.
- #37 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Briefs copied auditors' fixes that contradicted; state each defect and wanted outcome and read items side by side first.
- #82 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Brief's tsc -p . misses tests, git rm staged into wrong commits, timing tests fail under load; template still lacks npm run -s types. (restates 0015,0076)
- #105 outstanding, note, `bible/03-Code/Toolkit.md`: Audit briefs name main...branch on a stale local main; Audits should say fetch origin main, name <merge-base>..<branch>, run merge-tree for conflicts. (restates 167)
- #112 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Two parallel workers had a hidden data dependency (SPIRES copied from a mesh); the brief should name it and its owner, or the controller sequences them.
- #128 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md; tools/claude-toolkit/workers/run-worker.sh`: Briefs twice named vitest instead of node --test; copy test commands from package.json, run one first, and have run-worker.sh refuse vitest.
- #129 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md; bible/03-Code/Toolkit.md`: Rule workers skipped room-wasm and server agreement tests; brief should name them. File body is corrupted: cargo test output pasted mid-sentence. (restates 121)
- #167 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md; tools/claude-toolkit/workers/run-worker.sh`: Reviewer diffs origin/main...HEAD, wrong for a worker forked from unpushed commits; run-worker.sh should record WORKER_BASE for the review. (restates 105)
- #169 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md; tools/claude-toolkit/git-hooks/pre-commit`: Brief lines 17-18 and 32 say graphify-out is tracked, but .gitignore:22 ignores it; drop the checkout steps and add > log 2>&1.
- #171 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md; bible/03-Code/Toolkit.md`: Off-limits files forced workaround state; allow the one-line mechanical change, give a pin's Rust and TS halves to one worker.
- #173 outstanding, note, `bible/03-Code/Toolkit.md`: Auditors re-found items the hand-off lists as left; build the brief's known-and-left list by grepping the hand-off and open PRs.
- #180 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Inbox now a real env var; brief still lacks "split a file near 600 lines first, run xtask repo after cargo fmt". (restates 0193)
- #187 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Agent isolation worktrees start from main, not the named base; brief should say "first git switch -c <name> <base>". (restates 0236 0252)
- #193 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: A file at exactly 600 lines made a worker fold distinct refusals into one; brief should split a near-cap file first as its own commit. (restates 0180)
- #201 outstanding, note, `bible/03-Code/Toolkit.md`: A read-only auditor read a tree being edited; Toolkit should run it in its own worktree or pin a commit read with git show. (restates 0248)
- #208 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Worker tests passed while the feature never ran on the real path; brief should ask one test per behaviour driving the real path.
- #221 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Module workers each patched one core test and built their own rig; brief a core to ship module-agnostic tests and a shared rig.
- #236 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Agent worktrees start at main and sub-agents lack the Agent tool; brief should give a base commit and replace "spawn a reviewer". (restates 0187 0252)
- #248 outstanding, note, `bible/03-Code/Toolkit.md`: An audit read a tree the controller kept editing; Audits section should say commit first and give the auditor the pinned commit. (restates 0201)
- #251 outstanding, note, `bible/03-Code/Toolkit.md`: A rule sweep was briefed without counting its 158 instances; count breaches repo-wide first, sweep whole or ask the owner.
- #254 outstanding, note, `bible/03-Code/Toolkit.md (Audits)`: Audit of a branch that merged main must use HEAD^2..HEAD; bible paths with spaces need Python, and auto mode refuses some read-only git: brief one per call. (restates 301)
- #263 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md; server/worker.ts`: A new rooms crate must join rooms.yml deploy paths and its test; the template should say so, and server/worker.ts (586 lines) be split by job.
- #267 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: A pass of a model-based stand-in check was taken as proof; the template should say a model test proves only the model until the real system is driven.
- #316 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: The template says graphify-out is tracked, but it is ignored here so its checkout step errors; make it conditional and note cargo clean -p for stale caches. (restates 264,329)
- #330 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md; bible/03-Code/Toolkit.md`: graphify-out checkout fails where untracked, and a stale wasm says only unknown variant; make the step conditional and say npm run wasm. (restates 264,316)

## type-and-lint-before-push (17: 3 owner, 5 kit, 9 note)

- #15 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md; tools/claude-toolkit/workers/audit.py`: Hand-picked tsc configs miss test files (5 instances); template Hard rules should name npm run -s types + lint + xtask repo, audit.py flag TYPES FAIL. (restates 0082,0038)
- #43 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md; tools/wreck`: Round-three worker gaps: run cargo clippy before the full check, a loose wreck export; the hud.css split is moot now.
- #44 outstanding, note, `bible/03-Code/Toolkit.md`: A wire change tested its own crate only; run cargo test on every crate cargo tree -i lists before the full check.
- #53 outstanding, owner, `crates/xtask/src/checks`: The 120-character width of comments and notes is held only by review; enforce it in the comments and vault checks or drop it.
- #141 partial, note, `bible/03-Code/Toolkit.md`: Full checks failed on Prettier, id-length and size; run prettier --check, eslint on changed files and cargo xtask repo before a push. (restates 132,170)
- #170 partial, note, `CLAUDE.local.md; bible/03-Code/Toolkit.md`: Scripted TS edits went to the full check unlinted; run prettier, eslint, npm run -s types and the file's tests first. (restates 141)
- #183 outstanding, owner, `crates/xtask/src/checks/`: No check compiles or lints tools/**/*.py, so a Blender script rename broke only CI's bake; add py_compile/pyflakes to xtask repo.
- #185 partial, note, `bible/03-Code/Toolkit.md`: Run a change's own fast guard at the edit: xtask repo after Cargo.toml, whole test files after a content edit, clippy --all-targets after new tests. (restates 0210)
- #198 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: A busy port pictured an old build and a targeted check list skipped rustfmt; driver should check the served build, brief list fmt and prettier.
- #207 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Targeted cargo test stops at the first failing binary; brief and Toolkit should say --no-fail-fast, in the background, long timeout. (restates 0224 0235)
- #210 outstanding, note, `bible/03-Code/Testing.md`: Bare tsc -p . skips test files; quick checks should use npm run -s types, regenerate fixtures after .fbs edits, clippy after the last edit. (restates 0245 0185 0187)
- #217 partial, note, `bible/03-Code/Toolkit.md`: A textwrap rewrap split an Obsidian link; rewrap with links and code spans protected, and run xtask repo before any full check.
- #224 outstanding, note, `bible/03-Code/Testing.md`: A baseline full check in the edited checkout judged half-written code; run baselines in a worktree, and use --no-fail-fast. (restates 0207 0235)
- #245 outstanding, note, `bible/03-Code/Toolkit.md`: The controller type-checked one tsconfig and read a killed tsc's empty output as clean; use npm run -s types and read exit codes. (restates 0210)
- #282 outstanding, note, `bible/03-Code/Testing.md`: tsc -p server/tsconfig.json misses server test type errors; Testing.md before-a-push should name npm run -s types, never one config. (restates 291,296,317)
- #291 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: A worker type-checked tsconfig.json only and missed test errors; the template should name the exact type-check command covering every config. (restates 282,296,317)
- #296 outstanding, owner, `bible/03-Code/Toolkit.md; tools/claude-toolkit/workers/brief-common-template.md`: Bare tsc -p tsconfig.json passed while npm run -s types failed, three sessions; name npm run -s types and make it a barrier, not a sentence. (restates 282,291,317)

## merge-and-branches (15: 8 owner, 1 kit, 6 note)

- #36 outstanding, note, `bible/03-Code/Toolkit.md`: A heredoc overwrote a merged worker's test file; after merges create files with Write or check git ls-files first.
- #70 partial, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit`: Parallel branches took the same wire numbers; a distinct-ASKS test exists, a numbers-in-flight script over open PRs does not.
- #94 outstanding, owner, `tools/claude-toolkit/git-hooks; bible/04-Procedures/Branches and Merging.md`: Amend after a fast-forward rewrote a worker commit; a clean merge lost trailers; merge --no-ff -m in one step, commit-msg hook.
- #124 outstanding, note, `bible/03-Code/Toolkit.md`: A catch-up brief listed main's merges but not their rules (no HTML, game in a worker); brief main's new decisions and xtask checks as constraints.
- #142 outstanding, note, `bible/03-Code/Toolkit.md; CLAUDE.local.md`: git stash during an uncommitted merge drops MERGE_HEAD; say commit the merge or trace in another worktree, never stash mid-merge.
- #151 outstanding, owner, `CLAUDE.md; tools/claude-toolkit/workers/brief-common-template.md`: Held work on an unpushed wt/ branch was lost with the container; at session end push local branches missing from origin or say they go. (restates 152,165)
- #152 outstanding, owner, `CLAUDE.md; tools/claude-toolkit/claude-mem-save.sh`: Commits pushed after a branch's PR merged sat on no PR; the session-end script should list branch commits on no open PR. (restates 151,165)
- #153 partial, owner, `CLAUDE.md; bible/Hand-off.md`: Hand-off entries at one spot made open PRs conflict and run no CI; hand-off now lists PRs, but reading mergeable_state is unwritten.
- #165 partial, owner, `CLAUDE.md`: A hand-off named a PR that did not exist; open the PR for any waiting work and name it by number before rewriting the hand-off. (restates 151,152)
- #235 partial, owner, `CLAUDE.md`: A shared timing change met main's 232 new commits only at the end; merge main right after such a change and run --no-fail-fast once. (restates 0207 0224)
- #241 partial, owner, `CLAUDE.md`: After a merge, the git rules' force-with-lease restart is refused by auto mode; keep the branch at its remote head, no force push.
- #243 outstanding, owner, `crates/xtask/src/checks/`: A three-way merge put new FlatBuffers fields mid-table, shifting shipped ids; add a repo check that fields only append versus main.
- #260 outstanding, note, `bible/03-Code/Toolkit.md`: A guessed full SHA made GitHub refuse the merge as head modified; take the full SHA from git ls-remote in the same turn as the merge call.
- #332 outstanding, note, `bible/03-Code/Toolkit.md`: A clean auto-merge broke Rust nobody compiled; after any merge of main run cargo check --workspace --all-targets and npm run -s types.
- #271 partial, note, `bible/04-Procedures/Branches and Merging.md; client/src/game/passages/passageHeard.test.ts`: Both sides took the same wire numbers and mirrors merged clean; diff number registries on merge, and test TS mirrors against the Rust source.

## worker-runtime (14: 1 owner, 13 kit, 0 note)

- #30 partial, kit, `bible/03-Code/Toolkit.md; CLAUDE.local.md`: A worktree linking target/ ran xtask check on the main tree; a building worktree needs its own target, said explicitly. (restates 0098)
- #42 outstanding, kit, `tools/claude-toolkit/workers/audit.py`: audit.py checks OBSERVATIONS only in the last assistant text; search the whole log and report too.
- #64 outstanding, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit/workers`: Worktrees removed while running workers' briefs named their scratch; grep briefs/inboxes before removal or add a guarded remove script.
- #98 partial, owner, `bible/03-Code/Toolkit.md; crates/xtask`: Shared target/ across checkouts or concurrent cargo runs corrupted builds (4 times); proposes xtask refusing a shared target. (restates 0030)
- #144 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md; tools/claude-toolkit/workers/run-worker.sh`: Long workers hit the 2h limit uncommitted; detaching fixes the kill, but the brief should ask for commits per step and the report before review. (restates 117,149,179)
- #179 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md; bible/03-Code/Toolkit.md`: A Blender worker was killed before its bake; commit per family, draft the report early, and cap a Blender item or let the controller bake. (restates 117,144,149)
- #204 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: On shared cores npm run types and client tests overran 120 s; brief should set timeout 300000+ and say the harness needs NODE_PATH for playwright. (restates 0192 0196)
- #205 outstanding, kit, `tools/modules/bake.py`: A full module bake took 2 h on shared cores; add bake.py --only <prefix>, and render "before" pictures from a git archive copy.
- #244 outstanding, kit, `tools/claude-toolkit/workers/run-worker.sh`: Workers ended without INBOX or OBSERVATIONS lines; run-worker.sh should check them at exit, as audit.py does, and resume once.
- #252 partial, kit, `bible/03-Code/Toolkit.md`: Fixers lacked the Agent tool, git in $(...) is refused, shared cores slowed Rust, dedupes hit the layer table; brief should say each. (restates 0236 0192)
- #261 outstanding, kit, `tools/claude-toolkit/workers/run-worker.sh; tools/claude-toolkit/workers/brief-common-template.md`: Fresh worktrees lack fixtures cargo tests write (art_levels, schedule, native layouts); run-worker.sh should build them, and briefs check folders exist.
- #264 outstanding, kit, `tools/claude-toolkit/workers/run-worker.sh; tools/claude-toolkit/workers/brief-common-template.md`: A reused worktree keeps the old build fixtures; run-worker.sh should rebuild them on a branch change, and the graphify-out checkout step be conditional. (restates 316,329)
- #288 outstanding, kit, `tools/claude-toolkit/workers/run-worker.sh; bible/03-Code/Toolkit.md`: Four workers were killed at 2 h before their report; size items to ~90 min or split build and finish runs, commit often, write the report skeleton first.
- #303 partial, kit, `tools/claude-toolkit/workers/run-worker.sh; bible/03-Code/Toolkit.md`: Detached workers started with an empty prompt; read and refuse an empty brief at start (done), skip the stale-report resume after a failed first run.

## worker-parallelism (13: 1 owner, 9 kit, 3 note)

- #76 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Parallel workers' full checks overran and failed timing tests; stagger checks in briefs; groundPaint still wall-clock bound. (restates 0082,0085,0103)
- #90 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Fix agents in one checkout worked when each owned files and none wrote git; add a shared-checkout mode to the template.
- #109 outstanding, note, `bible/03-Code/Toolkit.md`: Worktrees sharing one CARGO_TARGET_DIR take each other's crate builds; Workers section should say never share a target dir across worktrees. (restates 146,148,175)
- #119 outstanding, kit, `tools/claude-toolkit/workers/run-worker.sh; bible/03-Code/Toolkit.md`: Each run-worker.sh worker builds its own wasm and starts rust-analyzer, too heavy for 4 cores; link builds for TS-only workers, size fan-out to cores.
- #146 outstanding, note, `bible/03-Code/Toolkit.md`: Sharing the target dir made cargo xtask check run a worktree's xtask binary; say give each worker its own target and read the checked commit. (restates 109,148,175)
- #148 outstanding, owner, `crates/xtask/src/files.rs; bible/03-Code/Toolkit.md`: xtask finds its root by env!(CARGO_MANIFEST_DIR) (files.rs:57), so a shared target checks another tree; find it at run time. (restates 146,109,175)
- #175 outstanding, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit/workers/run-worker.sh`: Shared target/ kept builds baked with a deleted worktree's path; Toolkit still links target/ for reviewers; refuse linked targets. (restates 109,146,148)
- #192 outstanding, kit, `bible/03-Code/Toolkit.md`: Seven workers on four cores overloaded the box; cap workers at nproc, stagger starts, and have run-worker.sh warn past nproc. (restates 0196 0204 0252)
- #196 partial, kit, `tools/claude-toolkit/workers/run-worker.sh`: Workers ran out of memory and time; detached start is in, but run-worker.sh still lacks a cap (about three) and one-browser-at-a-time lock. (restates 0192 0182 0204)
- #292 partial, note, `bible/03-Code/Toolkit.md`: Four workers on 4 cores flaked a timing test and OOM-killed lint; cap workers at two or three or stagger picture runs, and rerun timing tests alone. (restates 326)
- #305 outstanding, kit, `tools/claude-toolkit/workers/run-worker.sh; tools/claude-toolkit/install-all.sh`: Parallel worker starts raced rustup and corrupted the toolchain; install rust-toolchain.toml once (install-all or flock) before any worker starts.
- #306 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: A worker stopping servers by command-line match killed a sibling; keep each started server pid ($!) and stop only those.
- #326 partial, kit, `tools/claude-toolkit/workers/wait-worker.sh; bible/03-Code/Toolkit.md`: Three workers at load 20 slowed graphify to 8 min and flaked timing tests; cap parallel workers and keep waits restartable. (restates 292,314)

## kit-install-and-tools (10: 4 owner, 4 kit, 2 note)

- #25 outstanding, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit/hooks`: Controller stopped servers by pkill -f twice; wants a Bash hook refusing pkill/pgrep -f and the rule moved out of Workers.
- #26 outstanding, owner, `CLAUDE.md; bible/03-Code/Toolkit.md`: headroom learn --apply wrote push-on-commit rules against check-before-push; review its diff before applying. (restates 0067,0097)
- #33 partial, owner, `tools/claude-toolkit/install-all.sh; bible/Hand-off.md`: SkillsMP/Context7 keys missing or quota spent on some environments; key placement is the owner's call. (restates 0092)
- #84 outstanding, note, `bible/03-Code/Toolkit.md`: A shared bpy venv lacked the forge's pinned packages; install artbirds-requirements.txt into its own venv, as CI does.
- #92 partial, owner, `tools/r2.py; tools/forge_publish.py; bible/03-Code/Toolkit.md`: Forge publish failed with no Cloudflare token; Toolkit line and a pre-check in forge_publish.py still missing; keys are owner's. (restates 0033,0081)
- #104 outstanding, kit, `tools/claude-toolkit/install-all.sh; bible/03-Code/Toolkit.md`: No pinned dead-code finder in the kit, so an unpinned npx fetch is refused; pin knip/ts-unused-exports (and a Rust one) and name it in Audits.
- #126 partial, owner, `CLAUDE.md; tools/claude-toolkit/install-all.sh; new-observation.sh`: headroom learn kept writing a push-before-check rule; the push conflict eased under the CI decision, but no review of learn's output exists. (restates 137,164,174)
- #137 outstanding, note, `bible/03-Code/Toolkit.md; CLAUDE.md`: headroom learn --apply writes wrong lessons (even from safety refusals) unreviewed; say read and correct its output after each run. (restates 126)
- #216 partial, kit, `tools/claude-toolkit/install-all.sh`: rtk printed "Everything up-to-date" over a refused push (four times); exclude git push from rtk or keep its fatal lines. (restates 0213 0220)
- #311 outstanding, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit/check-tools.sh`: check-tools.sh --worker as Toolkit writes it checks /root and FAILs; give REPO_DIR in the Toolkit line or default it to the git root.

## game-method (8: 1 owner, 1 kit, 6 note)

- #71 partial, kit, `tools/modules/kit.py; tools/claude-toolkit/workers/brief-common-template.md`: Module bakes were not byte-stable (fixed in kit.py); brief rule to bake twice and rebake every caller of a helper is missing.
- #113 partial, owner, `.github/workflows/flora.yml, ships.yml, wreck.yml, island-modules.yml; bible/03-Code/Toolkit.md`: Blender normals differ across CPUs; modules.yml now keeps bakes on failure, but other bake-comparing workflows lack the step and the normals rule is unnoted.
- #159 outstanding, note, `bible/03-Code/Toolkit.md`: Rewording content couples to code: camera cues, tests pinning lines, hashed content redeploys rooms; add a content-pass checklist.
- #168 partial, note, `bible/02-Systems/Sprite Forge.md; tools/forge/tools/sprite-forge/fplayers.py`: Forge local traps: fplayers multi-record failure and rendercache re-record after layers/stage changes are still unnoted and unfixed.
- #176 partial, note, `bible/02-Systems/Interface.md`: Escape opened and shut a window in one frame; note that a window opened by a back key ignores back on its first frame.
- #184 outstanding, note, `bible/04-Procedures/Porting from DFO.md`: A multiplier in a shared transform was overwritten by one caller; after tuning, grep callers and later assignments and pin each path.
- #188 outstanding, note, `bible/03-Code/Toolkit.md`: A broken layout test cost 40 min of brief-parameter search; Toolkit should say diff the geometry with/without the change (--nocapture) first.
- #194 outstanding, note, `CLAUDE.local.md`: A tolerance picked by feel multiplied boxes 10x; grep for an existing constant and probe the whole real population's cost before choosing.

## owner-decisions-and-words (7: 3 owner, 3 kit, 1 note)

- #17 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: An auditor called owner-approved lore invented; briefs judging "never decided" must search every remote branch's bible first.
- #31 outstanding, note, `bible/03-Code/Toolkit.md`: An audit input quoted the owner from memory; Toolkit Audits should say build owner quotes verbatim from the transcript.
- #101 partial, owner, `bible/04-Procedures/Recording a Decision.md`: A gameplay choice was filed as Claude's call; test each call: if it changes what the player sees or does, ask the owner.
- #161 outstanding, owner, `bible/04-Procedures/Recording a Decision.md; CLAUDE.md`: Tuning broke a ratio an owner decision sets; read whole linked decisions before changing; proposed xtask decisions map needs the owner.
- #166 outstanding, owner, `bible/04-Procedures/Recording a Decision.md`: A general autonomy grant was read as approving a draft the owner declined; say a declined draft stays a draft until the owner's own yes.
- #279 outstanding, kit, `tools/freesound/candidates.mjs; bible/03-Code/Toolkit.md`: Sound re-searches drifted from the owner's words and each cost 40 min; start from the owner's phrase, run variants in parallel, and let ONLY skip other picks.
- #298 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md`: A worker reworded owner-approved dialogue to meet a line limit; the template hard rules should forbid rewording existing lines and say leave new ones out.

## graphify-serena-claude-mem (7: 1 owner, 6 kit, 0 note)

- #20 outstanding, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit/workers/brief-common-template.md`: Serena replace_symbol_body drops doc comments and attributes (4 times); needs a brief warning or a hook refusing a drop in /// count. (restates 0077)
- #35 partial, kit, `tools/claude-toolkit/check_tools.py`: Chroma refused in workers so search fell back to keywords; check-tools should prove semantic search answers, not only that search runs.
- #77 outstanding, kit, `bible/03-Code/Toolkit.md`: Serena replace_symbol_body dropped #[test] and doc comments (3 times); Serena row should warn, or count tests before and after. (restates 0020)
- #114 outstanding, kit, `tools/claude-toolkit/workers/brief-common-template.md; tools/claude-toolkit/serena-languages.sh`: Serena has no Python server here (no root pyproject.toml), yet the brief demands Serena on every file; say Read/Edit for .py, or add python.
- #212 partial, owner, `tools/claude-toolkit/claude-mem-save.sh`: claude-mem captured nothing yet save said "saved"; save should refuse an empty store, install check capture; owner decides where the store lives.
- #308 outstanding, kit, `tools/claude-toolkit/check-tools.sh`: claude-mem semantic search refused (chroma) in workers while check-tools passed; check-tools should make one semantic search and FAIL on refusal.
- #314 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md`: Parallel workers each ran graphify update and contended for minutes; reuse the controller's graph or stagger starts. (restates 326)

## generated-artefacts-stale (6: 1 owner, 3 kit, 2 note)

- #13 outstanding, note, `bible/03-Code/Testing.md`: After a crates/ change, stale client/public/*.wasm fails unrelated client and server tests; Testing.md should say run npm run -s wasm first. (restates 0023,0034,0074)
- #23 partial, kit, `bible/03-Code/Toolkit.md; CLAUDE.local.md`: After a merge, target/ fixtures and wasm go stale; wants one refresh command run after any merge and named in the brief. (restates 0013,0034,0074)
- #34 partial, kit, `tools/claude-toolkit/workers/brief-common-template.md; bible/03-Code/Toolkit.md`: Fresh trees lack generated/ (fixed for workers); after a schema change, wasm and protocol fixtures still need a named rerun. (restates 0013,0023,0074)
- #74 partial, kit, `bible/03-Code/Toolkit.md`: npm test fails in a fresh tree or after a branch switch until schema, wasm and cargo-written fixtures exist; fetch R2 with curl. (restates 0013,0023,0034)
- #262 outstanding, owner, `tools/islands/test_envelope.py; bible/02-Systems/Island Modules.md`: The committed-manifest test is red from a new kit push until CI publishes and the line is committed; let it accept a superset or have CI commit it.
- #275 partial, note, `bible/03-Code/Toolkit.md; tools/schema.mjs`: A page build beside cargo xtask check deletes generated messages its tests read; build before the check, or make schema.mjs write then rename.

## verify-before-claiming (6: 2 owner, 0 kit, 4 note)

- #29 outstanding, note, `bible/03-Code/Testing.md`: Bible timings went stale and an ignored measurement bound never ran; rerun the named measurement when code under it changes.
- #99 outstanding, note, `bible/03-Code/Toolkit.md`: A gated feature passed tests but failed for a player without an account; run live checks in the plainest real mode first. (restates 0081,0091)
- #133 partial, note, `CLAUDE.md; bible/04-Procedures/Porting from DFO.md`: A decision reason cited DFO behaviour from memory; grep the DFO source when writing such a reason and name the file in the pick note.
- #140 partial, owner, `CLAUDE.md`: A status line claimed an edit before it existed; progress lines name only written edits, and confirm where a broad bug happens first.
- #147 partial, owner, `bible/03-Code/Toolkit.md; crates/xtask/src/main.rs`: A check run while editing tested uncommitted edits under the commit's name; xtask now stamps at start, but say run it in a clean worktree.
- #281 partial, note, `bible/03-Code/Toolkit.md`: A cause told to the owner came from a code read and was wrong; show it with a failing test or scratch run first, else call it unchecked. (restates 284)

## perf-probe (5: 0 owner, 1 kit, 4 note)

- #83 partial, kit, `bible/03-Code/Toolkit.md`: A measure on a random port never loaded the world silently; serve on the R2 port and assert the world drew before numbers.
- #102 outstanding, note, `bible/03-Code/Toolkit.md`: Memory audits read allocation sites and missed 2.5 GB of decoded audio; size what loaders fetch and rank by measured bytes.
- #234 outstanding, note, `bible/03-Code/Testing.md`: Same-output speedups need a before/after digest of all real outputs; keep ignored digest tests per heavy stage and a recipe in Testing.
- #312 partial, note, `bible/03-Code/Toolkit.md; tools/claude-toolkit/webgpu-perf.cjs`: The perf probe never reached foot beside two cargo builds; Toolkit should say run it on an idle machine.
- #313 partial, note, `bible/03-Code/Toolkit.md`: Pure client CPU cost is best measured in Node from a test harness, output cmp'd against a base worktree; add it to the Toolkit.

## disk-and-resources (5: 0 owner, 4 kit, 1 note)

- #116 outstanding, kit, `tools/claude-toolkit/workers/run-worker.sh; bible/03-Code/Toolkit.md`: Merged workers' targets (8-13 GB each) filled the disk twice; delete a worktree's target on merge and have run-worker.sh warn under ~15 GB free.
- #182 outstanding, kit, `tools/claude-toolkit/workers/run-worker.sh`: Worktree target/ dirs fill the disk; run-worker.sh should refuse under ~15 GB free and delete a finished worktree's target/. (restates 0196)
- #228 outstanding, note, `bible/03-Code/Toolkit.md`: Sharing CARGO_TARGET_DIR across checkouts bakes one checkout's paths into the other; Toolkit still has reviewers link main's target/.
- #289 outstanding, kit, `tools/claude-toolkit/workers/run-worker.sh; bible/03-Code/Toolkit.md`: Merged worktrees kept multi-GB targets until the disk filled; delete a worktree target once merged, or share one CARGO_TARGET_DIR where builds do not race. (restates 310)
- #310 outstanding, kit, `bible/03-Code/Toolkit.md; tools/claude-toolkit/workers/brief-common-template.md`: Sub-agents each given their own CARGO_TARGET_DIR filled the disk and killed the check; say not to, or delete them when done. (restates 289)

## other:session pick-up (3: 3 owner, 0 kit, 0 note)

- #6 outstanding, owner, `CLAUDE.md`: A pick-up naming a branch searched only the attached repo; check list_repos and git ls-remote on each repo before set-up. (restates 0048)
- #48 outstanding, owner, `tools/claude-toolkit/install-all.sh`: A pick-up was set up in the wrong repo; locate the named branch across list_repos before any set-up. (restates 0006)
- #73 outstanding, owner, `CLAUDE.md`: Two sessions resumed the same work; before resuming, list running sessions and stop on one naming the same branch.

## owner-questions (3: 1 owner, 0 kit, 2 note)

- #106 outstanding, note, `bible/04-Procedures/Recording a Decision.md`: An effect request was answered with lore only; when the owner names an effect, ask what it looks like (or which game's) in the first round.
- #284 outstanding, note, `bible/03-Code/Toolkit.md`: Options put to the owner broke a standing rule and promised an outcome the code could not give; check each against rules, tests and the code path first. (restates 281)
- #320 outstanding, owner, `CLAUDE.md`: A code-level question confused the owner; ask only what the player sees or does, one effect per question, code detail in the PR.

## research-and-web (3: 0 owner, 0 kit, 3 note)

- #160 outstanding, note, `bible/03-Code/Toolkit.md`: A research worker built every number from search summaries; Web research row should ask to tag each fact read-on-page or summary-only.
- #189 outstanding, note, `bible/03-Code/Toolkit.md`: destinypedia.com and pcgamer.com fail DNS from the cloud; add them to the Web research row as network-blocked, with the allowlist remedy.
- #214 outstanding, note, `bible/03-Code/Toolkit.md`: WebFetch returns a PDF as binary; Web research row should say to run pdftotext -layout on the saved file.

## pr-claims-and-descriptions (3: 1 owner, 0 kit, 2 note)

- #278 outstanding, owner, `bible/04-Procedures/Recording a Decision.md; CLAUDE.md`: After a reversed design the PR body still listed deleted tests; check every test, file and number in the body against the head before posting. (restates 295)
- #295 outstanding, note, `bible/04-Procedures/Branches and Merging.md; bible/04-Procedures/Making a Change.md`: A PR branch took on two more asks while title and body named only the first; update both whenever the branch takes on new work. (restates 278)
- #317 outstanding, note, `bible/04-Procedures/Making a Change.md`: A PR said tested while CI stopped at types on every head; read the check log and name its last step, and run npm run -s types when a test changes. (restates 282,291,296)

## flaky-tests (2: 1 owner, 0 kit, 1 note)

- #85 partial, owner, `bible/03-Code/Toolkit.md; client/src/cinema/flames.test.ts`: Timing tests failed under three workers' load; run push checks idle or scale margins to load (owner's rule call). (restates 0076,0103)
- #103 partial, note, `bible/03-Code/Toolkit.md`: Timing tests failed beside other heavy work (now in Testing.md); an unquoted heredoc ran a second check; new-observation.sh could fill id. (restates 0076,0085)

## porting-dfo (2: 0 owner, 0 kit, 2 note)

- #222 outstanding, note, `bible/04-Procedures/Porting from DFO.md`: A port dropped DFO's deploy step that registered commands; for each picked path left out, name what it did and where ours does it.
- #321 outstanding, note, `bible/04-Procedures/Porting from DFO.md`: The porting procedure never names DFO's source repository; add Lattymoy/dfo-online-source to it.

## other:suggestion tool timeout (1: 0 owner, 0 kit, 1 note)

- #32 outstanding, note, `bible/03-Code/Toolkit.md`: spawn_task timed out twice; put found work in Hand-off Next and tell the owner a card may exist.

## toolkit-data-and-log (1: 0 owner, 1 kit, 0 note)

- #81 partial, kit, `tools/claude-toolkit/toolkit-data.sh`: Save renumbered claim markers; fixed, but one stray dashed claim remains and new-observation.sh still reads it. (restates 0091,0092,0099)

## other:audit by area (1: 0 owner, 0 kit, 1 note)

- #88 outstanding, note, `bible/03-Code/Toolkit.md`: One broad audit found 10 issues, four area audits 34 more; Toolkit Audits still says one agent for a large change.

## other:commit hygiene (1: 0 owner, 0 kit, 1 note)

- #91 outstanding, note, `bible/03-Code/Toolkit.md; new-observation.sh`: A commit swept in earlier staged files; run git diff --cached --stat first; new-observation.sh misreads dashed claims. (restates 0081,0099)

## other:note rewrapping (1: 0 owner, 0 kit, 1 note)

- #93 outstanding, note, `bible/03-Code/Toolkit.md; bible/04-Procedures/Writing Notes.md`: Scripted rewrapping split [[wiki links]]; protect link spaces when wrapping, and audio modules take an injectable play.

## other:client layer placement (1: 0 owner, 0 kit, 1 note)

- #127 partial, note, `bible/03-Code/Code Map.md`: A new top-level client folder broke the layer check late; say decide the layer before writing it and run cargo xtask repo on the first file.

## other:shader-check-coverage (1: 1 owner, 0 kit, 0 note)

- #195 outstanding, owner, `crates/xtask/src/shaders.rs`: naga passes unparenthesised mixes of * and ^ that Chrome's Tint refuses; add a lint or Tint pass, and say the offline check is not sufficient.

## other:sqlite json index (1: 0 owner, 0 kit, 1 note)

- #219 partial, note, `bible/03-Code/Toolkit.md`: An index over json_extract failed writes of non-JSON bodies; note the json_valid guard pattern and EXPLAIN QUERY PLAN check.

## other:integrated diff review (1: 0 owner, 0 kit, 1 note)

- #266 partial, note, `bible/03-Code/Toolkit.md; tools/claude-toolkit/workers/brief-common-template.md`: Per-worker reviews miss cross-worker bugs; add read-only area reviewers on the integrated diff before a PR is done, each finding proved by a failing test.

## other:commit message shell (1: 0 owner, 0 kit, 1 note)

- #287 outstanding, note, `bible/03-Code/Toolkit.md`: $(printf newline) inside git commit -m loses the blank line; write bodies with git commit -F - and a quoted heredoc, perhaps guarded by a commit-msg hook.

## other:auto-mode git refusals (1: 0 owner, 0 kit, 1 note)

- #301 outstanding, note, `bible/03-Code/Toolkit.md`: Auto mode refuses git checkout <commit> -- <file>; restore with Edit or Write from git show into the scratchpad, then cmp. (restates 254)

## other:follow-ups when spawn_task fails (1: 0 owner, 0 kit, 1 note)

- #302 outstanding, note, `bible/03-Code/Toolkit.md`: spawn_task timed out twice; when it fails write the follow-up into the Hand-off at once, with files and what done looks like.

## other:worktree symlinks (1: 1 owner, 0 kit, 0 note)

- #304 outstanding, owner, `.gitignore; tools/claude-toolkit/git-hooks/pre-commit; bible/03-Code/Toolkit.md`: git add -A committed a worktree link as client/public; ignore /client/public as a path, refuse symlinks in pre-commit, stage by path in linked worktrees.

## other:stray cache files (1: 1 owner, 0 kit, 0 note)

- #225 outstanding, owner, `.prettierignore; .gitignore`: pytest leaves .pytest_cache that fails the local format check; add it to .prettierignore and .gitignore, or run unittest.
