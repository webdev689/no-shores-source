# Observations review — 2026-11-27

> Ids moved after this review was written (two entries held each id): note 1 (push not gated on the check) is now 329; the newcomers saved at 321 to 325 are now 330 to 334. A second reading the same day, in parallel, is `second-reading.md` beside this file; it agrees on the decisions.

289 open notes, read in four slices (A: the Toolkit note, B: the workers, C: testing and pictures, D: CLAUDE.md,
procedures and the rest). Each slice's verdicts, one line per note, are in `result-A.md` to `result-D.md` beside this
file. Two notes that arrived from a parallel session mid-review (0318, 0319) were read here and join decision 7.

- **Already done, to be closed:** 49 (each with the file and line showing it).
- **To drop:** 31 (a duplicate, a one-off, or obsolete: e.g. the old "full check before every push" rule, now
  replaced by CLAUDE.md's `cargo xtask repo` before a push).
- **To act on:** about 210, grouped into the decisions below.

Log health: five ids are taken twice (151, 225, 227, 271, 272), to be renumbered; 0318 and 0319 have no header, to be
given one; one malformed id-claim marker (`archive/.id-claims/0125-`).

## Decisions, in plain words

Each says what keeps going wrong, then the fix. "Barrier" means a script or check that stops the mistake; "note"
means a line in the Toolkit or Testing note. Rules and checks need the owner's yes (CLAUDE.md); kit and worker-rule
fixes go in under the owner's standing order; deploys and workflows need the owner's named yes.

1. **A safety net before anything is pushed** (barrier). Pushes went out with failing quick checks, lint or format
   errors, each costing a 25 to 50 minute CI round; one push started a publishing workflow from a test branch; a
   refused push printed "Everything up-to-date". Fix: a pre-push hook runs the quick repo checks, types and lint and
   refuses the push on a failure; it refuses a push that would start a publishing workflow unless asked; push output
   is never shortened. Notes: 1, 67, 130, 141, 170, 185, 216, 217, 227b, 235, 245, 253, 315.
2. **The full check says plainly whether it passed** (barrier). Its last line reads the same after a failure, and was
   read as a pass; it stops at the first failing crate; it runs the quick checks last; run from one checkout it can
   test another's files. Fix: the quick checks run first, every failure is listed in one run, the last line says
   PASSED or FAILED, and it refuses a confusing setup. Notes: 87, 98, 109, 146, 147, 148, 228.
3. **Knowing a pull request's real state** (barrier). Pull requests that conflicted with main never started CI, and
   were still called tested. Fix: a script, run after each push and before the hand-off, shows for each branch
   whether its pull request can merge and what CI last said. Notes: 78, 152, 165, 258, 259, 278, 294, 295, 317.
4. **Helpers can't swamp the machine** (barrier; needs your number). The disk filled six times and the machine ran out
   of memory with too many helpers at once. Fix: no helper starts with under about 15 GB free, a cap on helpers
   running at once (two or three), one picture run at a time, build folders cleared after a merge, leftover processes
   stopped. Notes: 40, 64, 76, 115, 116, 119, 182, 192, 196, 198, 224, 289, 292, 305, 306, 310, 312, 314.
5. **Helpers' instructions fixed** (kit, standing order). The helper template still says a folder is tracked by git
   (it is not), leaves the checks to run as a blank, and lets helpers use the wrong test runner; a helper's exit is
   not audited. Fix: correct the template, one fixed list of checks, refuse a brief naming the wrong runner, audit
   each helper as it ends. Notes: 15, 22, 42, 82, 114, 128, 129, 151b, 167, 169, 171, 175, 180, 187, 193, 204, 207, 221,
   236, 244, 261, 263, 264, 265, 283, 291, 296, 304, 316.
6. **Guards against known slips** (kit, standing order). Refuse killing processes by name (it killed a sibling helper),
   polling CI from the shell, stashing in the middle of a merge, code edits that silently drop a test's marker or a doc
   comment, and commits without the session's attribution. Notes: 20, 25, 77, 94, 122, 142, 227a, 287.
7. **Tests read fresh data** (barrier). Tests ran on stale generated files and showed fake failures; a type check
   covered only part of the code. Fix: one command rebuilds everything the tests read, run after any Rust change;
   the cloud proxy setting is set for Node; the full type check named everywhere. Notes: 13, 23, 154, 157, 163, 225,
   275, 318, 319.
8. **New repo checks** (each needs your yes). Client tests that read Rust source files (four still do; they get fixed
   with it); message fields reordered on a merge; a shader operator Chrome refuses; broken Python scripts; one shared
   home for pinned test fingerprints. And your call on line width: hold notes and comments to 120 characters (559
   lines to fix), or stop asking for it. Notes: 16, 53, 54, 183, 195, 243, 255, 271.
9. **Workflow changes** (deploys: needs your named yes). Cache and retry the art the tests fetch, so a busy art server
   no longer skips main's deploys; the accounts deploy checks it runs the new code; two bake workflows keep their
   output when they fail. Notes: 111, 113, 223, 242.
10. **Test hooks in the game** (dev-only client code). Picture runs wasted 2 to 15 minutes each on hooks that quietly do
    nothing (a camera that will not move at sea, a ship not given). Fix: the hooks work everywhere or say why not; the
    picture tool prints why a wait failed and serves local files it is given. Two are your call: a world-time hook,
    and the World Editor's islands drawing the game's plants. Notes: 39, 41, 68, 86, 178, 181, 197, 200, 209, 211, 215,
    226, 246, 247, 256, 285, 286, 290, 293, 307.
11. **How I talk to you and keep records** (CLAUDE.md and procedures: your yes). Ask in what the player sees, one thing
    a question; check a cause before putting it to you; never report an edit before it is made; a declined draft
    stays a draft; look for another session on the same work before resuming; push held work at the session's end;
    each pull request's hand-off entry one line, so parallel sessions stop clashing on it. Notes: 73, 106, 140, 151a,
    153, 166, 281, 284, 320.
12. **Lessons written into the Toolkit and Testing notes** (notes; one yes for all). About 70 lessons on writing
    tests that catch real bugs, audits, pictures, research and the forge, each in a sentence or two where it belongs.
    The remaining notes in `result-A.md` to `result-D.md`.
13. **The kit fixing itself** (kit, standing order). The observation script's numbering, the memory save that reports
    success with nothing saved, the tool check pointed at the wrong folder, and checking what `headroom learn` writes
    (your call: keep it applying on its own, or have it propose only). Notes: 99, 103, 126, 137, 212, 308, 311.

## The owner's answers (2026-11-27)

> Which of the 13 fixes to make: "All 13 (Recommended)"

> How many helpers may run at once: "2 (Recommended)"

> Whether `headroom learn` keeps writing lessons by itself: "Suggest only (Recommended)"

Closed at once: the 80 already done or dropped (status `actioned` or `declined`, each with its evidence or reason).
Renumbered: #151b → #321, #225b → #322, #227b → #323, #271b → #324, #272b → #325 (the `a` of each pair keeps its id).
0318 and 0319 given headers as #318 and #319. The malformed claim marker `0125-` removed.
