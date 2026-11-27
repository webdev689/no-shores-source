---
id: 70
title: "Two branches take the same wire number at once (foe types 19 and 20; later ask 75): nothing checks a number is free"
parked_until: "PR #245 merge"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: wire numbers shared across branches (asks and close codes are in wip/COORD.md's registry; foe types were not)."
area: "overlook-source, parallel sessions"
date: "2026-11-20"
session_context: "Merging #88 into #97: main's #98 gave 19 and 20 to the Brig's crew while #97 gave 19 to 36 to the Elite Dungeons' Bosses."
commands_verified: "cargo test -p foes (two roster tests failed, then passed with the Bosses at 21 to 38)"
---

- Nine merge conflicts came from one cause: both sides appended to `foes::ROSTER` from 19. The released side (main)
  kept its numbers; the unreleased Bosses moved to 21 to 38 in the roster, `gear::activities`, the dress, the tests
  and the notes.
- The lead's COORD.md registry lists asks, refusals, close codes and dice, not foe types, so neither session saw it.
- Proposed: a number registry for every appended wire table (foe types, asks, refusals) that parallel sessions claim
  from before they build, kept where every session reads it (the bible, or the toolkit-data branch).

**Second instance (no-shores-source, 2026-11-24, #192 merging #179):** #179's guild-bounty claim and #192's open-find
ask both took ask 75. The merge raised no textual conflict on the numbers, since each was a separate `const` in a
different file and a separate key in the page's `ASKS`. It was caught only by grepping the ask constants during a
manual merge. #192 moved to 81 and added a structural barrier: `gearMessages.test.ts` asserts every value of `ASKS`
is distinct. The test fails on the clash, so a later collision fails the check rather than a review. Rust's own decode
`match` would also refuse two arms with one value (`unreachable_patterns` under `-D warnings`), but only where both
arms share one match.

**Third instance (no-shores-source, 2026-11-24, #201 the ships at the Harbourmaster):** the branch took refusals 150 to
156 and asks 79 to 83 against its base; main had meanwhile given 150 to 165 to guilds and outposts and 75 to 80 to
the guild bounty and outposts. Found only when main was merged in for an audit (refusal.rs came in as an add/add
conflict; the asks as a textual one). Renumbered to 166 to 172 and 81 to 85; then a check of the open pull requests'
branches (`git fetch origin <branch>`, grep of `ASKS` and `refusal.rs`) found #200 holding asks 82 to 84, so the ship
asks moved again, to 86 to 90. The distinct-`ASKS` test only fires once both sides are in one tree.

**What would have caught it early:** choosing a new number against main and every open pull request's branch, not the
branch's base. A small script (`tools/claude-toolkit/numbers-in-flight.sh`: fetch each open PR head, list the ask,
refusal and type numbers it adds over main) run before taking a number would make the check one command.
