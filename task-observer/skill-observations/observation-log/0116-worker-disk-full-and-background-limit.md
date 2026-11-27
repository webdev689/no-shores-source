---
id: 116
title: "Worker targets filled the disk allowance, and a background full check died at the default 10-minute limit"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "assumed: header rebuilt from the body at repair on 2026-11-26; the sibling check is due at the review"
area: "worker disk and background limits"
date: 2026-11-21
session_context: "Public events' second audit, worker biblefix2"
parked_until: "PR #242 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #242, merged 2026-11-27"
reference:
commands_verified: none
---
# worker-disk-full-and-background-limit

- Date: 2026-11-21
- Seen by: worker biblefix2 (OBSERVATIONS line and its exit), overlook-source, public events second audit
- What happened: with the main checkout's target (18 GB, 9.6 GB of it incremental) and two worker targets (13 GB and
  8.4 GB) on the session's disk allowance, the disk filled (ENOSPC): /tmp went to 0 MB, Bash was blocked for minutes,
  and the worker's transcript could not be saved, so its final reply ended in an error (audit.py: OBSERVATIONS
  missing). Separately, a full `cargo xtask check` started with run_in_background died at the default 10-minute limit.
- Proposed change: the controller removes each worker's worktree (and its target) as soon as its branch is merged,
  and checks `df -h /` before starting workers (each worker target grows to ~8-13 GB); the brief tells workers to
  give background full checks a long timeout (7200000).
- Status: open

## Seen again, 2026-11-26 (deeper dungeons)

- Five worker worktrees (dungeon-chests, dungeon-map, storey-engine, storey-generator, storey-client) each kept its
  own target/ (2.7 to 8.7 GB, 31 GB together) after its branch was merged. The controller's full check then died on
  "No space left on device", and the next run failed at link on the half-written incremental cache (undefined hidden
  symbols) until `cargo clean -p room -p room-wasm -p protocol -p dungeon`.
- Proposed barrier: the controller's merge step (or a `merged-worker.sh <name>`) deletes the worktree's target/ as soon
  as its branch is merged, and run-worker.sh warns at start when free space is under ~15 GB.
- Fourth instance (2026-11-27, PR #229 audit fixes): five fix workers' target/ folders (3.0 to 8.7 GB, 28 GB together)
  took free space to 4.2 GB while two still ran; the controller's `npm run wasm` and `cargo test -p room-wasm` both
  failed (exit 101, then undefined hidden symbols at link) until the three merged workers' target/ were deleted and
  `cargo clean -p room-wasm -p room -p protocol -p dungeon -p passage` ran. The barrier above is still unbuilt.
