# Group D triage (70 observations)

Checked against the tree at c8269c9b (2026-11-27). Note for the review: `CLAUDE.local.md` is now headroom's generated
block ("do not edit manually", rewritten each `headroom learn`), so lessons that targeted it (0142, 0170, 0175, 0184,
0185, 0194, 0203, 0217, 0252) need another home: `bible/03-Code/Toolkit.md` or `bible/03-Code/Testing.md`.

## Clusters to propose

### fast-checks-first
- ids: 0170, 0185, 0217, 0235, 0315 (RECUR: the last one broke CLAUDE.md:12-13 "Before a push, run `cargo xtask repo`", which was already written)
- target: `crates/xtask/src/main.rs`, `crates/xtask/src/toolchain.rs`, `tools/claude-toolkit/install-all.sh`, `bible/03-Code/Toolkit.md`
- change: `cargo xtask check` runs the repo checks first, not last (main.rs:26 runs them only after all 14 toolchain
  steps pass), and runs Rust tests with `--no-fail-fast` (toolchain.rs:35), so one run lists every failure. The install
  adds a pre-push hook that runs `cargo xtask repo` and refuses the push on a problem. Toolkit.md adds one line: after
  editing a file, run that file's own lint, types or clippy before the full check.
- kind: barrier (plus one line of text)

### pr-state-check
- ids: 0152, 0165, 0294, 0317 (RECUR: the last one broke CLAUDE.md:12 "Done means `cargo xtask check` passes in CI on the pull request's head")
- target: `tools/claude-toolkit/` (a new script, or a step in `claude-mem-save.sh`), `CLAUDE.md` "Every session" step 4
- change: a kit script prints, for each branch the session pushed: the commits not on `main`, the open PR number (or
  "none"), whether it conflicts with `main` (`git merge-tree`, or `mergeable_state`), and the last CI run's
  conclusion and the last step it reached. Run it after each push and before the hand-off is rewritten.
- kind: barrier

### cloud-r2-proxy
- ids: 0154, 0157
- target: `tools/claude-toolkit/install-all.sh`, `tools/claude-toolkit/check_tools.py`, `bible/03-Code/Toolkit.md`
- change: the install writes `NODE_USE_ENV_PROXY=1` into the settings' `env` (it is set nowhere in the kit today;
  only Hand-off.md:128 mentions it). check-tools fetches one mesh from `ships.base` and prints FAIL naming the
  `no-shores-source` environment when the proxy refuses it. Today `client/src/ships/shipTags.test.ts:19` still fetches
  from R2, so the full check cannot pass on the Default environment.
- kind: barrier

### rtk-push-exact
- ids: 0216 (RECUR: a second occurrence, and two more instances since; Toolkit.md:54 says rtk compacts only status, log and ls, which is not true for `git push`)
- target: `tools/claude-toolkit/install-all.sh` (rtk `exclude_commands`, line 159), `bible/03-Code/Toolkit.md:54`
- change: add `"git push"` to rtk's `exclude_commands`, so a refused push can no longer read "Everything up-to-date".
  The CI-timeout half of 0216 is done (ci.yml:23, 75 minutes).
- kind: barrier

### ci-r2-cache
- ids: 0111, 0242 (the first half of the first one, merging on a local check, conflicts with CLAUDE.md:13 "a merge waits for it to be green" and is superseded)
- target: `.github/workflows/ci.yml`
- change: cache the island packs (ci.yml:37-47, keyed on `content/islands/modules.json`) and the meshes that
  shipTags.test.ts fetches (keyed on `content/ships/ships.json`), and retry on a 429 or 5xx. Then a rate-limited
  r2.dev answer cannot skip main's deploys. Serving the bucket from a `noshores.online` name is the owner's choice.
- kind: barrier (needs the owner's yes for a workflow change)

### test-oracles
- ids: 0155, 0184, 0194, 0202, 0203, 0230, 0309
- target: `bible/03-Code/Testing.md` ("What a good test looks like", "Measuring")
- change: add these bullets. Build the oracle from what the player sees or by running the simulation, never by
  restating the code's formula, and never import the tolerance under test. Sweep the whole input domain and many seeds,
  measured on the full real data. Set a precondition directly with a helper, not through a lucky seed, and make a
  fixture fail loudly past a cap. After tuning through a shared function, pin each caller's path.
- kind: text (a helper for gear's capped values and room's Vestige grant would be code: 0155, 0202)

### headroom-learn-guard
- ids: 0126 (RECUR: the fifth time the same push rule was learnt, though CLAUDE.md held the opposite rule)
- target: `CLAUDE.md` step 4, `tools/claude-toolkit/` (end-of-session step)
- change: before keeping the output of `headroom learn --apply`, the end-of-session step diffs the learnt block and
  refuses any line about pushing or committing that contradicts CLAUDE.md. Current memory holds no push rule, but the
  Stop hook still feeds the pattern. The dashed-claim bug in new-observation.sh is fixed (lines 94 and 99 now parse
  digits only).
- kind: barrier

### picture-hooks
- ids: 0209, 0211, 0246, 0286, 0293
- target: `client/src/game/qaViews.ts`, the prologue's director, `tools/modules/render.py`, Toolkit.md's Browser QA row
- change: add the missing QA ways in: a told sky (`__qaSky`), a Breach run alone (as `&run=` does for dungeons), the
  story's `__qaEye` and a story clock, and a render.py flag that leaves out the ground (render.py:133 always lays it).
  Toolkit's Browser QA row says three things: `__qaView` re-arrives a fresh character away from boxes (check
  `__qaWhere`), a timed hold needs `noGpu`, and alone `Foot.gear` is null (read `held.alone`).
- kind: barrier (hooks) plus text

### tests-from-layout
- ids: 0199, 0218
- target: server/*.test.ts, `bible/03-Code/Testing.md`
- change: tests build intents and bodies from the layout constants (`INTENT_FLOATS`, `CONTROLS_FLOATS`) or one shared
  helper, never from a number literal. Five server tests still write an 18-number `Float64Array` by hand
  (outpostReload.test.ts:9, snapshotEdges.test.ts:14, climb.test.ts:38, garrison.test.ts:80, passageAgreement.test.ts:78).
  A conservation property test also asserts that its run did something.
- kind: barrier (shared helper) plus text

### merge-number-spaces
- ids: 0243, 0271
- target: `crates/xtask/src/checks/`, `bible/04-Procedures/Branches and Merging.md`
- change: a repo check refuses a FlatBuffers table whose fields are not origin/main's, in the same order, with new
  ones appended (no such check exists). Branches and Merging gains a step: on a merge, diff every number registry both
  sides touched. Several TS mirror tests already read the Rust source (gearMessages, passageMessages, passageHeard).
- kind: barrier

### claude-mem-health
- ids: 0212, 0308
- target: `tools/claude-toolkit/claude-mem-save.sh`, `tools/claude-toolkit/check_tools.py:242-257`
- change: the save refuses or warns when the store holds no observations (today it always prints "claude-mem saved").
  check-tools FAILs when the search answers only by keyword because chroma refused. Today any answer passes.
  Toolkit.md:35-37 already says the archive does not outlive the container.
- kind: barrier

### worktree-links
- ids: 0175, 0304
- target: `tools/claude-toolkit/git-hooks/pre-commit`, `.gitignore`, Toolkit.md "Workers"
- change: the pre-commit guard refuses a symlink (mode 120000; none is tracked today), and `.gitignore` ignores
  `/client/public` as a path (no file under it is tracked). A worktree that builds gets its own `CARGO_TARGET_DIR`;
  only a read-only reviewer links `target/` (Toolkit.md:89-90).
- kind: barrier

### pr-body-matches-head
- ids: 0278, 0295
- target: `bible/04-Procedures/Making a Change.md` step 6
- change: when a branch takes on more asks, or a design is reversed, rewrite the PR's title and body against
  `git diff origin/main...HEAD`. Every test, file and number the body names must exist on the head.
- kind: text (a check that backticked paths in the body resolve would be the barrier)

### handoff-entry-conflicts
- ids: 0153 (recurred four times; no rule was written)
- target: `bible/Hand-off.md` format, `CLAUDE.md` step 4
- change: each PR's entry under "Waiting on the owner" is one line (number and title), appended at the end, and its
  detail stays in the PR description, so two open PRs rarely touch the same line. The owner picks this or
  "write the entry last, after merging main".
- kind: text (format)

### decisions-at-change
- ids: 0161 (second instance; no rule)
- target: `crates/xtask` (a new `cargo xtask decisions`), `bible/04-Procedures/Recording a Decision.md`
- change: a command maps `git diff --name-only` through the system notes' `code:` frontmatter to the decision notes
  they link, and prints them. Then the ratios and laws an owner's decision sets are read before a tuning change, not
  while the note is written.
- kind: barrier (a new check needs the owner's yes)

### wgsl-tint-precedence
- ids: 0195
- target: `crates/xtask/src/shaders.rs`
- change: the shaders check refuses a bitwise operator (`^ & | << >>`) that shares an unparenthesised expression with
  another operator, which naga accepts and Chrome's Tint refuses. No such lint exists today.
- kind: barrier

### deploy-check-commit
- ids: 0223
- target: `.github/workflows/rooms.yml:152`
- change: the accounts deploy stamps `GITHUB_SHA` and its health check requires it, as bot.yml:108,144 already does.
  rooms.yml still asks only that `/v1/health` answers ok.
- kind: barrier

### owner-questions
- ids: 0106, 0320
- target: `CLAUDE.md:10` ("When a choice is the owner's, ask")
- change: a question to the owner names only what the player sees or does, one effect a question, with no code names
  or multipliers. When the owner names an effect, the first round asks what it should look like, or which game's
  version they picture.
- kind: text

### status-after-result
- ids: 0140 (RECUR: CLAUDE.md:18-20 "never call something fixed without the check that shows it" was written)
- target: `CLAUDE.md:18-20`
- change: a progress line describes an edit in the past tense only after its tool result is back. When the owner's
  report is broader than a delegated audit's candidates, ask where it happened before fixing. No practical barrier;
  text only.
- kind: text

### no-stash-mid-merge
- ids: 0142
- target: `tools/claude-toolkit/hooks/rtk-guard.py` (or Toolkit.md)
- change: the Bash guard refuses `git stash` while `MERGE_HEAD` exists, because the stash silently turns a resolved
  merge into plain changes.
- kind: barrier

### declined-draft
- ids: 0166
- target: `bible/04-Procedures/Recording a Decision.md`
- change: a draft the owner declined stays a draft until the owner's own yes. A later general grant of autonomy lets
  Claude build it, but not mark it in force.
- kind: text

### port-left-out-duties
- ids: 0222
- target: `bible/04-Procedures/Porting from DFO.md`
- change: for each DFO path that the pick lists but the port leaves out, the Pick note names what it did and where our
  version does it, or that it is dropped. Grep the port's comments for counterparts that have no code.
- kind: text

### schema-atomic
- ids: 0275
- target: `tools/schema.mjs:21`
- change: write the generated messages to a temporary folder and rename it into place, instead of `rmSync` first.
  Then a page build beside a running check cannot pull the files from under the check's tests.
- kind: barrier

### pytest-cache-ignore
- ids: 0225
- target: `.gitignore`
- change: add `.pytest_cache/` (absent from `.gitignore` and `.prettierignore`), so a pytest run cannot fail the local
  format step.
- kind: barrier

### check-tools-repo-dir
- ids: 0311
- target: `tools/claude-toolkit/check-tools.sh`, Toolkit.md:22
- change: check-tools defaults `REPO_DIR` to the repository it sits in (KIT_DIR/../..). Today it does `cd ~`, and
  check_tools.py:17-19 then takes `/root` as the repo, giving 4 false FAILs.
- kind: barrier

### bake-diff-artifact
- ids: 0113
- target: `.github/workflows/island-modules.yml:46`, `.github/workflows/dungeon-modules.yml:47`
- change: both compare a rebuild's bytes. Each keeps the two builds as an artifact on failure, as modules.yml:58-65
  does.
- kind: barrier

### manifest-test-unpublished
- ids: 0262
- target: `tools/islands/test_envelope.py:220-223`
- change: the committed-manifest test names the kits the manifest lacks, and passes while the contract's kits are a
  superset on an unpublished branch. Otherwise every new kit leaves the branch red until CI publishes.
- kind: barrier

### freesound-research
- ids: 0279
- target: `tools/freesound/candidates.mjs:21-22`, Toolkit.md
- change: with `ONLY` set, read only the searched cues' picks (the comment says "The picks are read whole either
  way"), so one cue's search takes minutes. A re-search starts from the owner's own words.
- kind: barrier plus text

### forge-local-traps
- ids: 0168 (its fourth trap is done: forge.yml:88 now runs fplayers.py)
- target: `bible/02-Systems/Sprite Forge.md`
- change: the how-to states the remaining traps: `fplayers.py --records 0,1` fails, `layers.py` writes its index only
  after a pull, and `rendercache.py --record` must be rerun after `layers.py` or `stage.py` change. Verify each first:
  the controller never ran them.
- kind: text

## Done
- #0118: tools/claude-toolkit/install-all.sh:49 runs `impeccable hooks on`; bible/03-Code/Toolkit.md:56
- #0138: bible/03-Code/Toolkit.md:74-75 (each audit finding measured by a failing test before it is fixed)
- #0176: client/src/game/gearWindow.ts:121,184 (fresh-open flag); bible/03-Code/Toolkit.md:63 (drive an interactive feature once before a PR)
- #0219: server/accounts/migrations/20261124175416_character_errands.sql:4, reused in 20261126003000_character_slots.sql:27 (json_valid guard)
- #0220: .github/workflows/ci.yml:21-23 (timeout 75 min, with the reason)
- #0257: .github/workflows/freesound.yml:40-43 (apt-get update, ffmpeg installed before the search at :48)
- #0268: client/src/game/travel.test.ts exists (travel.ts is testable now); Toolkit.md:63 (webgpu-shot keeps the device headless)
- #0280: .github/workflows/freesound.yml:46 ("Test the publish, as it loads here with no numpy")
- #0300: tools/wreck/export_wreck.py:146 writes masts; tools/wreck/wreck_level.py:29-35 holds the rank 2 boarders

## Drop
- #0133: covered by CLAUDE.md:18-20 "Verify before claiming"; the rule held, caught before commit
- #0164: obsolete; CLAUDE.md:12-13 no longer holds a push for the full check (repo plus changed tests only), so no conflict with the Stop hook
- #0174: obsolete, same as #0164
- #0240: obsolete, same as #0164; the full check before a push was one owner brief's ask
- #0241: obsolete; PRs merge with a merge commit now (Branches and Merging.md:13), so restarting the branch is a fast-forward push
- #0252: a grab-bag; item 1 is done (run-worker.sh:81 allows Agent, the brief's reviewer is one Agent call); the rest are harness quirks or one-offs
- #0299: cancel-in-progress is deliberate (ci.yml:11-13) and the final head still gets its run; batching pushes is judgement, not a rule
