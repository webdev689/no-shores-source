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
