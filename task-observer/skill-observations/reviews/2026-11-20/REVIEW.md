## Weekly Skill Review Complete — 2026-11-20

Interactive, on the owner's "Take care of the review". First review of this log (16 observations: 15 open, 1 already
actioned). No observation targets a skill: every one targets the repo's kit, bible notes or checks, so nothing is
staged under `skill-updates/`. Kit and worker-rule fixes went in under the owner's standing order, as draft PR #93
(`claude/toolkit-review`, d68f49a, stacked on #75); new checks and the session-start repository stay with the owner.

Updated files (11 observations, 0 principles applied), all in PR #93:

**tools/claude-toolkit/workers/run-worker.sh** — refuses to start at 90% disk; START/EXIT lines with minutes, and a
note when the last run ended with no EXIT line; tests claude-mem before the run and tells the worker; #11, #13, #14
**tools/claude-toolkit/check_tools.py, check-tools.sh** — `--only <check>`, an unknown name fails; #11
**tools/claude-toolkit/workers/audit.py** — failed claude-mem calls counted apart from missing ones; #11
**tools/claude-toolkit/hooks/syntax-check.py** — `rustfmt --check` on each edited .rs; #4
**tools/claude-toolkit/install-all.sh** — tracks the checked-out branch; #2
**tools/claude-toolkit/webgpu-shot.cjs** — `servedAt`, `initScript`, frames `timeout`, refuses a dev server; #8, #10, #15
**tools/claude-toolkit/workers/brief-common-template.md** — checks while working, picture budget and commit cadence,
hub headroom, rustfmt line; #10, #12, #14, #16
**bible/03-Code/Toolkit.md** — branch tracking, Serena's symbol extent, syntax hook, Browser QA serving, Workers
(hubs, time limit, disk, claude-mem); #2, #5, #12, #13, #14, #15
**bible/03-Code/Testing.md** — pinning a speed target when the clock is banned; #4

Workspace files written directly: `activation-tiers.txt` (first baseline), this record, the timestamps.

### Observations Actioned
#2 shallow clone hides pushed branch · #4 checks with no cheap twin in the edit loop · #5 Serena drops doc comments ·
#8 webgpu-shot's fixed port · #10 long checks past the 10-minute cap · #11 claude-mem unreachable in a worker ·
#12 hubs at the size cap under fan-out · #13 merged worktrees fill the disk · #14 the two-hour limit ·
#15 picture staging pitfalls · #16 checks that fail late. (#3 was actioned earlier, on the waters branch.)

Partial: #4's per-edit layer check was not put in the hook (a full `cargo xtask repo` per .ts edit is too slow); its
twin is the template's "after changing imports run cargo xtask repo". #8's "steps option to hide the HUD" is the
existing `eval` step; its NODE_PATH note is not needed (playwright resolves from any directory here).

### Needs the owner's input (left open)
1. #6 — enforce the 120-character width of comments and notes in the repo checks, or drop it from review. A new check
   needs the owner's agreement (CLAUDE.md).
2. #9 — compile every WGSL module the client builds inside `cargo xtask check` (headless Chromium or naga). A new
   check; same rule.
3. #7 — keep each cross-language fingerprint once (a shared file the Rust, page and server tests read) instead of a
   copy per suite. A test-layout change outside the kit.
4. #1 — a pick-up was set up in the wrong repository. No repo file can fire before the right repository is attached:
   the fix is which repository the owner's environment or session starts with.

### Family coherence
No observation lists more than one skill. No `skill-families.md` exists; no drift audit (no skill targets).
0 observations logged without a sibling check; 0 `assumed` exclusions.

### Published skills
none

### Parked
none

### Arrived during this run
none (Step 6 re-scan: no arrivals, no departures, no duplicate ids)

### Log integrity
No duplicate ids; `.id-floor` at or above the highest prefix; header conformance: 0 hits over 16 files (first run:
0 hits, 0 true defects, 0 normalised). `skill:` names: none to normalise; 0 qualified / 0 bare. Inbox not read: no
inbox store is configured for this workspace.

### Skipped (needs manual review)
- check-tools' SkillsMP key header FAIL: keys need the owner's named approval.
- Starter-set reconciliation: `starter-principles-reviewed.txt` is absent; offered to the owner in one line.
- Scheduled review: not offered for registration. The log lives in this container's `/root/toolkit-data`, which a
  cloud scheduler cannot reach and which ends with the container; reviews stay manual.

0 bundles staged, 0 bundles presented
