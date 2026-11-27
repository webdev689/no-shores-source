---
id: 138
title: "A reviewer's suggested fix would have failed the reviewer's own failing example"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: []
siblings_checked: "none: no skill owns the review-then-fix step here; the code-review and ponytail-review skills report findings, they do not apply fixes"
area: "applying fixes proposed by a delegated code review"
date: 2026-11-22
session_context: "Overlook PR #154 audit: the chat's line filter refused 'lets go ok'. The reviewer proposed checking runs of one- and two-letter words; 'go ok' is two two-letter words, so the proposed fix still refused it. Running the failing examples against the change before committing caught it; the fix applied reads only runs of single letters."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: bible/03-Code/Toolkit.md:74-75 (each audit finding measured by a failing test before it is fixed)"
reference:
commands_verified: "run: node --import ./tools/testStyles.mjs scratchpad/star.ts printed each example line and its starred result before and after the change"
---

**Issue:** A delegated review reported a bug with concrete failing inputs and proposed a fix. Applied as written, the
fix would still fail one of the very inputs the report named. The reviewer verified the bug but not its own fix.

**Suggested improvement:** When applying a review's proposed fix, first run the report's own failing examples against
the fixed code, and add them to the test that guards the fix.

**Principle:** A proposed fix is a hypothesis: check it against the failing cases that motivated it before applying it.
