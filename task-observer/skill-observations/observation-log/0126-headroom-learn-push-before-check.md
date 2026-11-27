---
id: 126
title: "headroom learn wrote a push-before-check rule into project memory five times; new-observation.sh choked on dashed claims"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "tools/claude-toolkit/install-all.sh"]
siblings_checked: "assumed: header rebuilt from the body at repair on 2026-11-26; the sibling check is due at the review"
area: "end-of-session headroom learn and the Stop hook"
date: 2026-11-22
session_context: "overlook-source, and again on #161"
parked_until: "PR #242 merge"
resolved:
resolution:
reference:
commands_verified: none
---
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

## Again, 2026-11-22 (No Shores, the owner's six prologue points, #161)

`headroom learn --project . --apply` wrote the same rule once more to `MEMORY.md` (Git Workflow): "A Stop hook requires
every commit to be pushed. Push to the session branch right after each commit". The session had held four pushes for
the check, as CLAUDE.md asks; the check failed three times (Prettier, a lint, test fixtures the plain `tsc -p` skips),
so pushing on the hook's word would have pushed three broken heads. Fixed by hand again. This is the fifth time the same
lesson has been learnt (0026, 0067, 0097, 0126, now): per the second-violation rule the fix is a barrier, not a
rewording, e.g. the end-of-session step filtering headroom's output for a push rule that does not name the check, or
the Stop hook itself saying "push once `cargo xtask check` passes" so the transcripts headroom learns from stop teaching
the bare push.
