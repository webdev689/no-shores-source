# Phase 5b: the factions' clocks onto the one clock, and the boon's reputation

Goal: after main (#92) is in claude/activities, every daily and weekly thing in the game turns on `gear::clock`
(days from 09:00 UTC, weeks from Tuesday 09:00 UTC), as the approved design says ("One clock"), and the Abyss boon
earns its quarter more in reputation too.

Spec: bible/02-Systems/Activities.md ("One clock"); bible/05-Decisions/"Dailies and Weeklies Follow Destiny 1, With
One Abyss Dungeon a Week.md"; COORD.md "#92" sections; PLAN-phase2.md Task 15.

Constraints: Phases 1 to 5's (files 600/800 lines, comments why in at most 8 lines, no history or dates, plain text,
the bible says how things work now, no new saved enum values, `cargo xtask check` before the push). No rule computed in
TypeScript: the page reads times from the room module. A decision page is never rewritten (read
bible/04-Procedures/Recording a Decision.md for how a "… as Claude Shapes Them" calls page is kept, and follow it).

## Task 1: Shape keeps the clock's week

- `crates/gear/src/shape.rs` (#92) counts its own week from Monday 00:00 UTC (`EPOCH_PAST_MONDAY`, its own
  `DAY_MINUTES`/`WEEK_MINUTES`), Shape coming Friday 09:00 and going Sunday 21:00 UTC (`COMES_AT`, `GOES_AT`).
- Make `shape::week_of` the clock's `gear::clock::week_of`, so his place and wares turn at the weekly reset (Tuesday
  09:00 UTC). Keep his visit at the same wall times: Friday 09:00 to Sunday 21:00 UTC, which are 3 days and 5 days
  12 hours after the clock week's start. Drop shape's own day and week constants for the clock's.
- Find every caller (room, room-wasm, server, client) and move each.
- Tests: he comes Friday 09:00 UTC and goes Sunday 21:00 UTC; his place and wares are the same from one Tuesday 09:00 to
  the next and change at it; a minute before Tuesday 09:00 is the old week.

## Task 2: the page counts to the clock's resets, from the rules

- `client/src/game/npc/npcClock.ts` (#92) counts to UTC midnight (`secondsToMidnight`) and to Shape's leaving with its
  own week maths in TypeScript.
- The keepers' stock turns at the daily reset (09:00 UTC) now: count to it from the room module
  (`activitiesAt(module, minute).untilDay`, or the nearest existing export). Shape's leaving: from the rules too (add
  his minutes left to the activities JSON or a small export beside it), not from TypeScript maths.
- Delete the TypeScript clock maths that is left unused. Tests: the stock's count at 08:59:30 UTC is 30 s; Shape's
  count on Sunday 20:59 UTC is a minute; both read the room module.

## Task 3: the day's wares turn at 09:00 UTC

- After the merge, `Room::day()` is the clock's day. Check every daily list reads it: the smiths' wares, the Tailor's
  emblems (`emblems::sold_on`), the dyes, coats and bardings (`cosmetics::sold_on(seller, day)`), and the vend-by-day
  check (`Ask::Vend { day }`, `Refusal::NotSold`).
- Tests: a ware sold at 08:59 UTC is still that day's; at 09:00 UTC the list turns, and a vend sent with the old day
  is refused `NotSold`.
- The Gear message's `day` comment says the day begins at 09:00 UTC (if the merge has not already).

## Task 4: the Abyss boon earns its reputation (PLAN-phase2.md Task 15)

- `boon_xp` passes its extra quarter to `Character::earn_reputation` as #92's kills do.
- Test (activity tests): with the boon held, a kill's reputation is a quarter more than without it, by #92's names.
- Activities.md "What it pays, once".

## Task 5: the bible

- The system pages for Shape, the keepers and the vendors say the clock (09:00 UTC days, Tuesday 09:00 UTC weeks).
- The "Factions and Vendors as Claude Shapes Them" page's "Weeks" and daily rows: follow the procedure for a calls
  page (add, don't rewrite, if it is a decision page).
- Activities.md "One clock": every daily and weekly list in the game turns on it.
