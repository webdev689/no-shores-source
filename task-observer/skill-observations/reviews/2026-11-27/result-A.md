# Group A triage (72 observations)

Checked against the tree at c8269c9b. The clone is shallow from 2026-11-23, so a rule's date before that is taken
from the observation's own text. Two files share id 227: they are written here as #227a
(0227-gh-api-used-for-ci-poll) and #227b (0227-merge-compiles-both-languages). The shared id is a log problem worth
fixing in its own right.

## Clusters to propose

### no-shared-cargo-target
- ids: #98, #109, #146, #228
- target: bible/03-Code/Toolkit.md (Workers), tools/claude-toolkit/workers/run-worker.sh, crates/xtask
- change: Never point two checkouts at one CARGO_TARGET_DIR. `cargo xtask check` should refuse to run when
  `files::repo_root()` (crates/xtask/src/files.rs:57, baked from CARGO_MANIFEST_DIR) is not the cwd's git toplevel, or
  when CARGO_TARGET_DIR points outside the checkout. run-worker.sh should unset CARGO_TARGET_DIR, and the brief template
  should forbid setting it. Testing.md:50-52 should stop implying that sharing a target is fine for timing runs.
- kind: barrier (xtask guard plus run-worker unset). Logged four times; caused silently stale "tested offline" results
  and a 15-21 GB clean.

### pre-push-fast-gate
- ids: #141, #227b, #245, #253
- target: tools/claude-toolkit/git-hooks (new pre-push; extend pre-commit), CLAUDE.md:12
- change: The kit's pre-commit hook should also run `prettier --check` on staged TS/JSON/CSS files, which would have
  stopped #253's piped check. A pre-push hook should run `npm run -s schema` when generated/ is stale, then
  `cargo check --workspace --all-targets`, `npm run -s types` (all tsconfigs, never one), eslint on changed files and
  `cargo xtask repo`, refusing the push on any non-zero exit. This catches merge breaks git auto-merged cleanly, and
  lint and format failures that otherwise cost a full CI run.
- kind: barrier. Partly RECUR: CLAUDE.md:12 asked for the tests of what changed before a push, and #227b pushed after
  checking only the page's side.

### publish-workflow-push-guard
- ids: #130
- target: tools/claude-toolkit/git-hooks (new pre-push)
- change: Add a pre-push hook that reads each workflow's `on.push.paths` where no `branches` filter is set, matches it
  against the pushed commits' files, and refuses the push unless `ALLOW_PUBLISH=1` is set. The hook should name the
  workflow it would start. Still live: dungeon-modules, flora, freesound, island-modules, modules, ships and wreck
  publish from any branch.
- kind: barrier. Second occurrence; nothing written protects it.

### no-pkill-pattern
- ids: #25
- target: tools/claude-toolkit/hooks/rtk-guard.py; Toolkit.md:97
- change: The Bash hook should refuse `pkill -f` and `pkill -P $(pgrep -f …)` in command position and point to TaskStop
  or stop-worker.sh instead. Move the "stop by pid" line out of the Workers section so it reads as everyone's rule.
- kind: barrier. RECUR: Toolkit.md:97 and brief-common-template.md:52-53 held the rule, and it was broken twice.

### ci-wait-no-gh-poll
- ids: #122, #227a
- target: Toolkit.md (a CI line), rtk-guard.py
- change: To wait on CI, subscribe to the PR's activity and end the turn, or read check runs once with the GitHub MCP
  tools. The Bash hook should refuse `gh api …/check-runs|actions/runs`, `gh run watch` and `gh pr checks` in a cloud
  session.
- kind: barrier. RECUR: the environment text, which was loaded, allows gh only for search, and it was broken twice.

### observation-script-hardening
- ids: #99, #103
- target: task-observer's scripts/new-observation.sh (kit tgz in tools/claude-toolkit/task-observer)
- change: The `top_claim` loop (new-observation.sh:159) should keep only all-digit names. A malformed `0125-` marker
  sits in archive/.id-claims now. The script should also write the `id:` line itself, so a body never needs an
  unquoted heredoc. #99's other finding, a live check in the player's plainest mode, goes with test-against-authority.
- kind: barrier. RECUR for #103: task-observer SKILL.md:397 already says to use a quoted heredoc. #103's other half (a
  check on an idle machine) is done at Testing.md:48-49.

### wire-numbers-in-flight
- ids: #70
- target: tools/claude-toolkit (new numbers-in-flight.sh), Toolkit.md
- change: Add a script that fetches each open PR's head and lists the ask, refusal and foe-type numbers it adds over
  origin/main. Run it before taking a new number. The distinct-ASKS test (gearMessages.test.ts:331, :470) fires only
  once both sides share a tree.
- kind: barrier (script). Three instances.

### audit-pinned-range
- ids: #105, #201, #248, #254
- target: Toolkit.md Audits (:71-75)
- change: Before an audit brief: `git fetch origin main`, commit the work, and give the auditor a pinned commit (a
  worktree at it, or `git show <sha>:<path>`). Name the range by commits: `<merge-base>..<sha>`, or `HEAD^2..HEAD` when
  the head merged main. Run `git merge-tree --write-tree --name-only HEAD origin/main` so conflicts with main become a
  finding. The controller edits elsewhere until the auditor reports.
- kind: text (brief-common-template.md:63-64 covers origin/main only for a worker's reviewer).

### qa-hooks-answer
- ids: #178, #226, #256, #285, #307
- target: client/src/game/qaViews.ts, tools/claude-toolkit/webgpu-shot.cjs, Toolkit.md:63
- change: Make the QA hooks fail loud and work in every mode:
  - `__qaSea()` gives a fresh offline character a ship, or answers false with the reason. Toolkit.md:63 still says
    it always puts the player aboard.
  - `__qaEye` moves the sea view's camera too. It now returns true and does nothing at sea (qaViews.ts:69-75).
  - Hooks for the own hull and dress, and for the hour.
  - A `minute` override using localRoom's minuteShift, so public events can be pictured.
  - The driver's waitFor and clickText skip nodes the arrival veil covers.
- kind: barrier (code and driver). Each one wasted 2-15 minute SwiftShader runs.

### fix-proven-by-reverting-its-lines
- ids: #135, #190
- target: Toolkit.md Audits (:74-75)
- change: Before an audit's fixes are called done:
  - Run a mutation pass: revert only each fix's own lines (never the whole file or a stash), and see the new
    assertion's own message fail.
  - Use fixture values where the buggy output differs from the expected one.
  - Brief a side-effect review of the merged diff to look only for behaviour beyond each fix's stated change.
  - Check off each finding against the PR text.
- kind: text (a mutation script is possible later). One in five fixes was unguarded at the wiring seam.

### repin-attributed
- ids: #121, #158, #172
- target: bible/03-Code/Testing.md (Agreement tests, :21-29)
- change: Before moving a pinned fingerprint or scripted outcome:
  - Grep the old hash across crates, client and server. SEA_CLASH_HASH's pair is missing from Testing.md's list.
  - Name the fix that moves it by taking each change out alone.
  - Measure the quantity the pin guards, or sweep 10+ seeds or minutes, with and without the change. Put the numbers
    in the commit and the PR.
- kind: text.

### brief-from-records
- ids: #31, #124, #173
- target: Toolkit.md Audits/Workers
- change: Build briefs from records, not memory:
  - Quote the owner verbatim from the session transcript, with the text the owner saw just before.
  - Take the "known, left" list from a grep of bible/Hand-off.md and open PR texts.
  - A catch-up brief lists main's new decisions and repo checks since the base
    (`git diff <base> origin/main -- bible/05-Decisions crates/xtask`) as constraints.
- kind: text.

### headroom-learn-review
- ids: #137
- target: Toolkit.md Headroom row (:49), CLAUDE.md:29
- change: After `headroom learn --apply`, read what it wrote to CLAUDE.local.md and MEMORY.md, and correct any lesson
  drawn from a refusal or that contradicts a tool's own instructions. The file says "do not edit manually" and the next
  run overwrote a hand fix, so a correction needs a home learn reads, or the owner drops `--apply`. Unchecked:
  CLAUDE.local.md:18 now teaches a foreground `sleep` poll loop, which the harness may block.
- kind: text, plus the owner's choice on --apply. Three instances.

### serena-replace-keeps-attributes
- ids: #77
- target: Toolkit.md Serena row (:47), brief-common-template.md:21, workers/audit.py
- change: After `replace_symbol_body`, re-read the lines above the symbol (attributes, doc comments). audit.py should
  flag a diff that deletes `#[test]` or `///` lines above a function it keeps.
- kind: barrier (audit.py) plus text. Three instances in four days.

### ci-follow-through
- ids: #258, #259
- target: Toolkit.md (a CI line)
- change: After each push to a PR, confirm a ci.yml run exists for the new head. If none exists, read mergeable_state
  and merge main. Read every failed run you caused. Before pushing a fix to a long workflow, dry-run its later steps
  locally on the run's own artifact, under the runner's conditions.
- kind: text.

### check-before-asking-owner
- ids: #281, #284
- target: CLAUDE.md:18-20 (Verify before claiming)
- change: A cause or consequence put to the owner in a question or option is first reproduced (a failing test or a
  scratch run) or traced through the code path that delivers it, and checked against standing rules and their tests.
  Otherwise the question calls it unchecked.
- kind: text. RECUR (CLAUDE.md:18 "Verify before claiming"); no clear barrier.

### read-whole-picture
- ids: #277
- target: Toolkit.md Browser QA (:63)
- change: Read each picture twice: once for the change, once as a player would, and list every fault in the frame
  (light, weather, clipping, missing pieces), saying which ones the change predates.
- kind: text. RECUR: brief-common-template.md:45-48 already asks workers what is WRONG in each image.

### web-research-row
- ids: #160, #189, #214
- target: Toolkit.md Web research row (:58)
- change: Ask research workers to tag each fact as read on the page or taken from a search summary, and to say up front
  when fetches failed. A DNS failure is the environment's allowlist (fixable by the owner), not a refusal. A PDF comes
  back as binary: run `pdftotext -layout` on the file WebFetch saved.
- kind: text.

### node-fetch-proxy
- ids: #163
- target: package.json test script or the xtask toolchain; Toolkit.md Running the kit
- change: Set `NODE_USE_ENV_PROXY=1` for `node --test`. shipTags.test.ts fetches R2, and Node's fetch ignores
  HTTPS_PROXY without it. It has no effect off a proxy.
- kind: barrier (env in the script).

### audit-per-area
- ids: #88
- target: Toolkit.md Audits (:71)
- change: A change over about 20 files is audited by one agent per area it touches, each with its own files and spec
  sections. One agent found 10 findings where four found 34 more.
- kind: text.

### browser-qa-text
- ids: #177, #239
- target: Toolkit.md Browser QA (:63), tools/uiShot.mjs header
- change: Before a GPU picture deep in a flow, rehearse the plan with `"noGpu": true` and `ui` dumps, and count frames
  by game time under SwiftShader. In uiShot, keep a shot's state across frames (as journalShots does). The Browser QA
  row is already one 4,000-character cell, so consider splitting it into its own note.
- kind: text.

### worker-cap
- ids: #292
- target: run-worker.sh, Toolkit.md Workers
- change: At most two or three workers on a 4-core machine (run-worker.sh could refuse past `nproc`-1 live pid files),
  and picture runs staggered.
- kind: barrier (cheap) or text.

### commit-msg-hook
- ids: #287
- target: tools/claude-toolkit/git-hooks (new commit-msg)
- change: Refuse a message whose first line holds `Co-Authored-By:` or runs past 100 characters. Write bodies with
  `git commit -F - <<'EOF'`.
- kind: barrier.

### test-against-authority
- ids: #150
- target: bible/03-Code/Testing.md
- change: A client view that must line up with a rules answer is tested by driving it on the real wasm rules and
  projecting the rules' output. Likewise (#99's first finding), a gated feature is checked live in the player's
  plainest mode: no account, a fresh character.
- kind: text.

### desktop-app-qa-row
- ids: #250
- target: Toolkit.md (new row)
- change: For the desktop app's shell keys, send real X input with `xdotool windowfocus --sync` and `xdotool key`,
  since Playwright's keys never reach before-input-event. A packed app (inspect fuse off) is read from app.log, not
  attached. Reload after `context.route`.
- kind: text.

### check-change-measured
- ids: #156
- target: bible/03-Code/Checks.md "Adding a check" (:54-58)
- change: Before tightening a check, prototype it over the whole repo. Count its false alarms on real cases and its
  miss rate on a generated bad set, then prove the port by planting one bad case per new rule.
- kind: text.

### content-reword-consumers
- ids: #159
- target: Toolkit.md or bible/00-Rules/Dialogue.md
- change: Before rewording content, grep each line's opening across code, tests and notes. Read the scene's consumers
  for order coupling, and check which content files feed the protocol hash or a deploy.
- kind: text.

### count-before-sweep
- ids: #251
- target: Toolkit.md Workers
- change: Before a rule's breaches go into a fixer's brief, count them repo-wide. Past a handful, sweep them whole with
  one hand, or ask the owner first if the rule's reach is unclear.
- kind: text.

## Done
- #38: CLAUDE.md:12-13 and Making a Change.md:10 (`cargo xtask repo` before a push; CI runs the full check)
- #74: run-worker.sh:31-37 builds schema, wasm and protocol fixtures in each worktree; Toolkit.md:86-88
- #83: Toolkit.md:63 ("serve the page on port 5173, the only origin R2 answers"; `anyPort`); uiShot.mjs:16
- #120: Toolkit.md:63 (webgpu-shot draws "in the game's worker as on the page"); Code Map.md:187 lists tools/uiShot.mjs
- #123: Toolkit.md:65 Freeze probe (webgpu-stall.cjs: submissions dropped, the worker paused, beats)
- #125: run-worker.sh:31-37 builds generated/ in the worktree (only node_modules is linked); Toolkit.md:86-88
- #131: Testing.md:48-49 (the check on an idle machine, no picture driver beside it; rerun a timing failure idle)
- #132: CLAUDE.md:12 and Making a Change.md:10 (`cargo xtask repo` before a push; the local full check is no longer the gate)
- #143: Testing.md:48-49 and CLAUDE.md:12-13 (CI gates a merge, so pushes no longer wait on a local full check)

## Drop
- #32: no gap. The session did the fallback, and the Hand-off rewrite (CLAUDE.md:31) carries found work. Tool flakiness.
- #36: one-off (11-19). The Write tool's read-first guard covers it; no repeat logged.
- #102: too narrow, a one-off memory audit. Toolkit.md:74 already says to measure each finding.
- #110: conflicts with CLAUDE.md:12-13 (a merge waits for CI green on the PR's head).
- #127: one-off. `cargo xtask repo` (seconds, CLAUDE.md:12) catches an undeclared layer.
- #188: covered by superpowers:systematic-debugging; the layout-specific part is too narrow.
- #260: one-off. GitHub's expectedHeadSha guard refused it, and nothing merged wrong.
- #301: narrow auto-mode classifier quirk with a known workaround.
- #302: duplicate of #32.
- #313: no proposal written; a one-off technique. Testing.md:50-52 covers comparing against a base worktree.
