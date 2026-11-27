# Group B triage (headless workers)

Checked against HEAD c8269c9b (branch claude/epic-lamport-ckvdzc; the local origin/main ref is stale, so "in place"
means in this tree). Two files share id 151: they are written #151a (0151-owner-held-work-...) and #151b
(0151-worker-brief-graphify-out-untracked).

## Clusters to propose

### canonical-precommit-checks
- ids: #15, #82, #128, #207, #291, #296
- target: tools/claude-toolkit/workers/brief-common-template.md (Hard rules line 56), bible/03-Code/Toolkit.md, run-worker.sh / audit.py
- change: Write one fixed set of checks into the template's Hard rules in place of the `<test suites to run>` placeholder:
  `npm run -s types && npm run -s lint && npm run -s format:check && cargo fmt --all --check && cargo xtask repo`, plus
  targeted Rust tests with `cargo test --no-fail-fast -p ...` and client tests with the package.json runner
  (`node --test`, never vitest). As a barrier, run-worker.sh refuses a brief that names `vitest` or a bare `tsc -p <one config>`,
  and audit.py runs `npm run -s types` on the worker's head and prints TYPES FAIL.
- kind: barrier (refusal in run-worker.sh plus an audit.py check) and text
- RECUR: not written at the time (git -S finds no `npm run -s types` in the template's history). It repeated 7+ times,
  by workers and by the controller, and each repeat cost a 15-50 min full check. The wording in hand-written briefs keeps failing.

### worker-target-cleanup
- ids: #64, #116, #182, #289, #310
- target: tools/claude-toolkit/workers/run-worker.sh, stop-worker.sh or a new merged-worker step, bible/03-Code/Toolkit.md (Workers)
- change: run-worker.sh refuses to start when less than about 15 GB is free (`df`). After a merge, the controller's step
  deletes the worktree's `target/` only. It keeps the worktree and its scratch, because #64 had running workers' briefs
  still naming those folders. Toolkit's Workers section says the same for Agent sub-agents' own CARGO_TARGET_DIRs (#310).
- kind: barrier
- RECUR: no (never written). It was seen 6+ times, and the disk filled every time (a check died on ENOSPC, output was lost).

### worker-concurrency-cap
- ids: #76, #115, #192, #196
- target: run-worker.sh, bible/03-Code/Toolkit.md (Workers), brief-common-template.md
- change: run-worker.sh refuses (or waits) when the number of live worker pid files has reached the cap. The cap is the
  owner's number: two or three on a 4-core, 15 GB machine. Only one browser picture run at a time: a lock in webgpu-shot.cjs.
  Workers run only targeted checks, and the controller runs the one full check after merging.
- kind: barrier
- RECUR: no. Note: #196's 2-hour-kill half is already done by the detached start (run-worker.sh:8-10).

### stray-preview-servers
- ids: #40, #198, #306
- target: tools/claude-toolkit/webgpu-shot.cjs, run-worker.sh, brief-common-template.md:52-53
- change: webgpu-shot.cjs reads the listening process's cwd for its port (`/proc/<pid>/cwd`) and refuses when that is not
  the checkout it runs from. run-worker.sh kills what is left in the worker's own session (it starts under setsid) when the
  worker exits. The template's stop rule adds "only the pids you started (`$!`), never a pid list from ps|grep".
- kind: barrier
- RECUR: #306 yes. template:52-53 already said "by pid, never pkill -f", and the worker built a pid list from a
  command-line match, which killed a sibling worker. #40 is a third occurrence with no barrier.

### template-graphify-out-stale
- ids: #151b, #169, #316
- target: brief-common-template.md:17-19 and :32, tools/claude-toolkit/git-hooks/pre-commit:9
- change: Delete the template's "graphify-out/ is tracked ... `git checkout -- graphify-out`" lines. graphify-out/ is
  ignored: .gitignore, and Toolkit.md:46 says so. Keep "never commit graphify-out". Remove the pre-commit hook's moot
  graphify-out refusal. Add "send a build's stderr to its log too (`> log 2>&1`)" (#169).
- kind: text (the template states a wrong fact)
- RECUR: no. It is a stale line that 4 workers each hit (#264 too).

### worker-owns-its-pins
- ids: #22, #129, #171, #221, #263
- target: brief-common-template.md (Hard rules / file ownership), bible/03-Code/Toolkit.md
- change: The template's file-ownership line says these belong to the worker that changes the code they pin: the tests that
  pin it (both halves of a Rust/TS pin, the room-wasm and server agreement tests, the module's own test file, the rooms'
  deploy-paths list `.github/workflows/rooms.yml` ROOMS_CODE), and the one-line mechanical follow-on in an off-limits file.
  Before committing, the worker greps the repo's tests for the old text and names any it may not edit (#182).
  A core others build on ships module-agnostic tests and the shared test rig (#221).
- kind: text
- RECUR: no

### serena-symbol-edit-guard
- ids: #20
- target: brief-common-template.md:20-24, a PostToolUse hook in tools/claude-toolkit/hooks
- change: A hook after Serena replace_symbol_body / insert_before_symbol refuses an edit that lowers the file's count of
  `///`, `/**` or `#[` lines. The template line also says that the symbol's range includes its doc comment and attributes.
- kind: barrier
- RECUR: no (never written), but 5 occurrences (4 in #20, plus a dropped `#[test]` in #264).

### worker-exit-audit
- ids: #244
- target: run-worker.sh (end, before `WORKER <name> DONE`)
- change: run-worker.sh runs audit.py on the worktree when the worker exits. On MISSING OBSERVATIONS or INBOX NOT ACKED it
  resumes the worker once with "end with the INBOX and OBSERVATIONS lines". This pairs with the audit.py types check above.
- kind: barrier
- RECUR: yes. template:41-42 and :66-70 already required both lines.

### pipefail-before-commit
- ids: #265, #283
- target: brief-common-template.md:34-35 (Test results)
- change: The template's Test results rule adds "never gate a commit on a piped check: run it bare or under
  `set -o pipefail`". Optionally the pre-commit hook runs `cargo xtask repo` (seconds) itself.
- kind: text, or a barrier if the hook runs the repo check
- RECUR: #265 yes. template:34 already said "read failures from the raw log, never from a summary", and a `| tail` is a summary.

### test-the-real-path
- ids: #95, #208, #267
- target: brief-common-template.md
- change: For each behaviour the owner asked for, one test drives the real path: the rules' or room's own output through
  to what is drawn or sent, and data that names generated things run against the generator's real output. A check built on
  a model of the system (its own pathing, a fake) proves only the model. It rules nothing out until the real system has
  been driven along what it found.
- kind: text
- RECUR: no

### integrated-area-review
- ids: #266
- target: bible/03-Code/Toolkit.md:71-75 (Audits)
- change: Change "one read-only audit agent" to read-only reviewers on the integrated diff (`origin/main...HEAD`), one
  per area, briefed with the code and notes and not with the controller's conclusions. This runs before a multi-worker PR
  leaves draft. Per-worker reviews stay.
- kind: text
- RECUR: no. The existing audit rule (since 11-23) ran and found 39 cross-worker findings, and the change sharpens its scope.

### ui-judged-against-reference
- ids: #66, #139
- target: brief-common-template.md:45-48 (Image checks), Toolkit.md Browser QA
- change: A UI brief names its target: the owner's reference picture, or the approved twin surface in the game. The review
  puts the latest picture beside it and first lists which structural elements (layout form, focal objects, how detail is
  revealed) the build has and lacks.
- kind: text
- RECUR: no

### visual-check-real-path
- ids: #18, #191
- target: brief-common-template.md:45-48, Toolkit.md Browser QA
- change: A drawn change is done only with a picture made with the real code, the real assets and the real container. A menu
  page is pictured inside the real menu (startGearWindow), never alone. A measured pixel check also counts: the share
  recoloured, or the contrast.
- kind: text
- RECUR: no

### agent-worktree-base
- ids: #187, #236
- target: bible/03-Code/Toolkit.md (Workers), brief-common-template.md
- change: An Agent-tool isolation worktree starts from main. A brief for one gives the base, and its first command is
  `git switch -c <name> <base>`. It links node_modules and generated/. A sub-agent has no Agent tool, so in its brief
  "spawn a reviewer" becomes "run the code-review skill on your diff".
- kind: text
- RECUR: no

### worktree-fixtures
- ids: #261, #264
- target: tools/claude-toolkit/workers/run-worker.sh:28-36
- change: run-worker.sh also builds the client's fixtures that cargo tests write (art_levels.json, schedule.json, native
  layouts). It rebuilds generated/, wasm and fixtures when the worktree's branch or head changed since the last build, not
  only when they are missing.
- kind: barrier (script)
- RECUR: no

### parallel-start-contention
- ids: #119, #305, #314
- target: run-worker.sh, install-all.sh
- change: install-all.sh runs `rustup toolchain install` for rust-toolchain.toml once. run-worker.sh holds a flock around
  its first-run setup (schema, wasm, fixtures, graphify update), so parallel starts queue instead of racing. A TS-only
  worker can link the main checkout's wasm and get a TypeScript-only Serena (#119).
- kind: barrier
- RECUR: no

### xtask-tree-identity
- ids: #147, #148
- target: crates/xtask/src/files.rs:57, crates/xtask/src/main.rs:47-62
- change: xtask finds the repo root at run time (`git rev-parse --show-toplevel` from cwd) and not from
  `env!("CARGO_MANIFEST_DIR")`. It prints the root, records `git status --porcelain` at start as well as at end, and says
  "tree changed during the check" when the two differ.
- kind: barrier
- RECUR: no

### line-cap-headroom
- ids: #180, #193
- target: brief-common-template.md, crates/xtask/src/checks/size.rs (optional)
- change: The template says that a file within about 20 lines of the 600 cap is split first, as its own commit, before the
  item. Run `cargo xtask repo` after `cargo fmt`. Optionally a repo check warns at 580 lines (a new check needs the
  owner's agreement). #180's inbox half is already done (run-worker.sh:73).
- kind: text (a barrier if the warning is added)
- RECUR: no

### serena-python
- ids: #114
- target: brief-common-template.md:8-13, workers/audit.py
- change: The template says that Serena's steps apply to Rust and TypeScript. Python under tools/ is read and edited with
  Read/Grep/Edit. serena-languages.sh adds python only when a pyproject.toml is at the root, and the repo has none.
- kind: text
- RECUR: no (3 instances)

### worker-review-base
- ids: #167
- target: run-worker.sh, brief-common-template.md:62-64
- change: run-worker.sh records the worktree's fork commit at its first run and names it in the task as `$WORKER_BASE`.
  The template's reviewer then diffs `$WORKER_BASE...HEAD` and not `origin/main`.
- kind: barrier (script)
- RECUR: no

### worker-long-timeouts
- ids: #204
- target: brief-common-template.md
- change: The template says to run `npm run -s types`, the client tests and any `cargo test` with a timeout of at least
  300000 ms or in the background. A background `vite preview` or full check gets a timeout of an hour or more. #115, #116
  and #206 met the same 10-minute default.
- kind: text
- RECUR: no

### protect-owner-words
- ids: #17, #298
- target: brief-common-template.md (Hard rules), audit briefs
- change: Add a hard rule: never reword or remove an existing line of dialogue or lore. Meet a limit by leaving the new line
  out. Before calling anything "never decided", search every remote branch's bible
  (`git for-each-ref refs/remotes` + `git grep`), and report a decision found there as "decided on <branch>".
- kind: text
- RECUR: no

### push-held-branches
- ids: #151a
- target: CLAUDE.md "At the end", tools/claude-toolkit (end-of-session script), brief-common-template.md
- change: The end-of-session steps list every local branch (wt/* included) whose head is not on origin, and push each one
  (e.g. `held/<name>`) or say it will be lost. A note naming a branch as the home of held work names a remote one.
- kind: barrier (script)
- RECUR: no

### python-check
- ids: #183
- target: crates/xtask/src/checks/
- change: Add a repo check that byte-compiles tools/**/*.py and fails on undefined names, so a rename in a Blender script
  fails `cargo xtask repo` instead of the push's bake.
- kind: barrier (a new check needs the owner's agreement)
- RECUR: no

### bake-only-flag
- ids: #205
- target: tools/modules/bake.py (takes only an output folder, :78)
- change: Give bake.py `--only <prefix>`: it bakes the named modules and rewrites only their manifest entries, and CI's
  whole bake stays the check. "Before" renders come from a `git archive` copy of the base.
- kind: barrier (script flag)
- RECUR: no

### ci-test-time-budget
- ids: #213
- target: brief-common-template.md, Toolkit.md
- change: Workers keep each new test under about 1 s on one core and report their slowest. Toolkit gets the one-line recipe
  for timing a test binary's tests alone. The owner already raised CI's limit (ci.yml:23, 75 min).
- kind: text
- RECUR: no

## Done
#24: port half done by `anyPort` (webgpu-shot.cjs:13, :186-198; Toolkit.md:63). Playwright now resolves from outside the repo (`require.resolve('playwright')` from /tmp ran just now and gave /opt/node-tools)
#34: run-worker.sh:28-36 builds schema, wasm and protocol fixtures in a fresh worktree; CLAUDE.local.md:7-9 covers the after-schema-change rebuilds
#71: tools/modules/kit.py:406 (`_in_order`), :341 (`+ 0.0`); CI's modules workflow compares the bake with the committed manifest
#72: Toolkit.md:63 "Capture a built page ... never the dev server"
#117: run-worker.sh:8-10 and Toolkit.md:81-85 (workers start detached; wait-worker.sh is the 2 h background task)
#136: Toolkit.md:95 names the fixed inbox path; run-worker.sh:72-73 tells the worker its path and exports WORKER_INBOX
#144: detached start (run-worker.sh:8-10), plus the UNCOMMITTED / REPORT STALE resumes (run-worker.sh:87-99)
#149: Toolkit.md:64 (room_qa_freeze / room_qa_encounter hooks, a Vite worktree of its own); the 2 h half is the detached start (run-worker.sh:8-10)
#179: detached start removes the 2 h kill (run-worker.sh:8-10); the REPORT STALE resume is at run-worker.sh:93-99
#288: run-worker.sh:8-10, Toolkit.md:81-85 (detached start)
#303: run-worker.sh:20-21 reads the brief once at start and refuses an empty one (still open and minor: skip the stale-report resume after a run that failed before its first turn)

## Drop
#37: one instance; Toolkit.md:74-75 already sizes a fix to what fails, not to the finding's wording
#75: one-off design slip by the controller; too narrow for a rule
#90: one-off success pattern (shared checkout, no git writes); it cuts against the worktree model. Reconsider only if worker-target-cleanup or worker-concurrency-cap is refused
#112: the agreement test caught it before the merge reached main; one instance
#186: one-off; its fix is in (artbirds-requirements.txt:35 pins scikit-image; forge.yml draws first person before the figure strips)
#206: the slowed-clock world plan (makeworld.mjs) is not in the repo, so that half is obsolete; the vite-preview timeout half is in worker-long-timeouts
