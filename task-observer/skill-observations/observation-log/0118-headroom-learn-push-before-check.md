# headroom learn wrote a push rule that breaks CLAUDE.md; new-observation.sh choked on dashed claims

- Date: 2026-11-22
- Project: overlook-source
- Kind: tool misfire (two)

## What happened

1. `headroom learn --project . --apply` wrote to the project memory (`MEMORY.md`, Workflow): "Push ... right after every
   commit and every merge, before starting a check". CLAUDE.md says "Done means `cargo xtask check` passes. Run it
   before every push." The pattern was learnt from the Stop hook's repeated "unpushed commits" demands, which the
   session rightly held until each check passed. Fixed by hand: the line now says CLAUDE.md wins, push once the check
   passes, merge `main` in as late as possible.
2. `new-observation.sh` created this file but failed its floor write: `10#0121-: syntax error`. The claim folder held
   markers with a trailing dash (`0118-` to `0121-`), from an older version of the script, and the `.id-floor` held
   `0121-`. Fixed by hand: dashed markers renamed to plain numbers, the floor set to 121.

## Proposed rule changes (the owner's to agree)

- headroom learn: a learnt pattern must never contradict CLAUDE.md; review its `--apply` diff before keeping it, as
  the session-end step runs it unattended.
- task-observer's `new-observation.sh`: read claim names through `grep -oE '^[0-9]+'`, as it already does for
  `top_active`, so a dashed marker cannot break the floor write.
- The Stop hook: it asks for a push at every turn's end, including while a required check runs; it could skip its
  demand while a `cargo xtask check` process is alive.
