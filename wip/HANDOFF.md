# Activities build: hand-off (saved when the usage limit stopped the session)

## Where it stands
- PRs (draft, none merged, owner's yes needed for each): #72 dungeons (ccr-05431442-jb8u3u, 4f35da20), #88 dungeon
  modules (claude/dungeon-modules, f5fa4291, CI green), #97 activities (claude/activities, 1fab584e, CI was running).
- Built, reviewed four times, fixed, pushed on claude/activities: Phases 1 to 5 and 5b (clock, gates, dungeon of the
  day, Elite Dungeons and Bosses, the week's two, modifiers, Abyss revives and wipes, private runs, This Week, the
  entrance card, the voyage card's shut tiers, companies of four, Find a Company, quests and bounties on one engine,
  the bounty board in Overlook's plaza, Shape and the daily wares on the one clock, the boon's reputation).
- Main moved to 4da959f5 (#105, #98): #72 conflicts with main ("dirty"), so its CI cannot run.

## In progress when stopped
1. **Journal (Phase 6)**: Task 1 half done (objectives.rs, objectives_tests.rs, quests.rs, a new decision page),
   saved on branch `claude/activities-journal-wip` (one WIP commit on 1fab584e, not for merge). The same changes stay
   uncommitted in the activities worktree. Plan: wip/PLAN-phase6.md, with its three closing sections (the lead's
   rulings; the owner's "This is what bounties should look like. Not text bloat"; the bounty names, owner: "Yeah come
   up with catchy short names").
2. **Third catch-up**: main 4da959f5 merged into #72 locally as 4322284a in worktree pr72-main, NOT yet checked
   (the agent stopped at a cold `cargo check`). Saved on branch `claude/pr72-merge-main-wip`. Next: full
   `cargo xtask check` there, push to ccr-05431442-jb8u3u, then #72 into #88 (main checkout), then #88 into
   claude/activities (after the Journal), each verified so no file outside a branch's own changes differs from base.

## Next, in order
1. Finish the catch-up above and push.
2. Resume the Journal: Tasks 1 to 7 of wip/PLAN-phase6.md (quest cards, bounty tiles and card on the board and in
   the Journal, DFO's hourglass and the timers panel, names, pictures side by side with the owner's screenshots).
   game.ts and gearWindow.ts are at exactly 600 lines: net zero added to either.
3. Review the Journal, fix, push.
4. Finish: live pictures in the game, the PR #97 description from wip/PR-NOTES.md (the owner's calls and the one
   question: should dungeon interiors fall back and call waves like main's #102 encounters), CI green, hand-off.
5. When others land: the bounty board's place from the hub rebuild (`city::hub::BOARD_LANDING_M`, the board facing
   east; its clearance test against `Social.ways`); the sea's ship count in `Sea::after_fights` (claude/waters-from-
   islands); the sea islands' `trips.enterSeaDungeon` line. All in wip/COORD.md.

## Notes
- wip/COORD.md holds every cross-session contract and the number registry (asks, refusals, close codes, dice).
- Leave CARGO_TARGET_DIR unset; node_modules is a shared symlink (no `npm ci` in worktrees); disk is tight (~14 GB).
