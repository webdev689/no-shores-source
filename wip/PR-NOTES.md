# Notes for PR #97's description (collect as we go)

## Deploy and rollback
- Main's `Character` drops unknown keys on save. A rollback to main and roll-forward erases `activity` and `story`:
  the day's and week's first clears pay again in that period, and `story` reads as past the prologue (Story::kept_before).
  #92 adds `#[serde(flatten)] unknown` to Character; merging #92 first makes a rollback keep them. Say: merge after #92,
  or never roll back across this change.

## Claude's calls for the owner (collected)
- Each Elite Dungeon's Boss takes its garrison's faction (`foe_type(REEVE).faction`, the Grey Tithe), no new faction.
- Bosses wear Corvane's clothes; bodies female for Isolde, Mabry, Aldith, Renna, Odile, Hester, Ylva (by name).
- A first clear pays only a kept (signed-in) character; an unkept player keeps nothing, so a sign-in mid-dungeon
  after the cache opens misses that clear's bonus.
- A run's first clear pays only in the day (or week) it was opened for; a run carried past the reset pays no clear.
- The shared Normal patrol room judges the day's clear as its cache opens (it stays open across days).
- The day's clear XP goes to the player and armour (`earn_xp(xp, None)`), not a weapon.
- Phase 3-4: This Week is the Journal tab's page (no new tab without the owner's yes); E opens the entrance card,
  E again enters; bands of ten levels; a lone seeker goes in alone after a minute; a found group is admitted to that
  run only, not made a company; Find a Company is online only.
- Phase 5: bounty templates/targets/pay (PLAN-phase5.md "builder's numbers"); bounties count on any island; the board
  at (24, -45) in the plaza frame; built of the courtyard's own solids.
- A run remembers each kept player who leaves (dead, or the health left with), so leaving never revives or heals.
- A private run admits only signed-in players ("Sign in to enter this run."); a run remembers the accounts it admitted
  for its life, so a company never loses its own run to a stranger who signs in while all are reconnecting.
- A run once won is never wiped. Known, older behaviour kept: a dungeon's end post stands again after 120 s with no
  player near, so its cache (not the first clear's bonus) can be taken again, in shared rooms and runs alike.
- Every way out of a run lands at the run's own seas, so a company leaves together.
- Coming out of a sea island's dungeon stands the player before its door, facing out.
- The second-review note on Lightswitch: a foe's telegraphed *aimed shot* lands as a Shot, so Lightswitch (melee) does
  not double it. Matches "Foes' melee deals double damage."
- Phase 3-4 builder's calls: a player entering an Elite Dungeon at Normal from an Elite/Abyss approach comes out at the
  Normal approach (the run's seas); accounts trouble gives a rejoinable close with "Something went wrong. Try again.";
  This Week chips mixed case; the entrance card 520 px wide; offline the screens show no taken/shut and no Find a
  Company (no gear offline by design).
- Pictures of the screens were made in a harness page with the real modules and room.wasm (the full game cannot reach
  these screens headless offline): scratchpad/shots-34/.
- The voyage card's shut tiers use the kit's own disabled look (dim border, dark fill), with the reason line under.
- A room holds one player per account: a second sign-in of the same account replaces the first (in every room, not
  only runs), and the rules' `Room::own` refuses a second. A run is full by accounts, not sockets.
- Find a Company: a socket that sends no token is closed after the rooms' token wait; the finder checks a base's
  shape only (the accounts Worker does not load the rules); a group matched just after the week turns is told "The
  week turned. Try again."
- Finish: set Activities.md front-matter `status:` to live when all is built.
- Phase 5 calls: quests' data in content/gear/quests.json (empty); clears count for kept players only, kills and
  gathers for everyone sharing them; taking and turning in only at the board; a run sends away an unreadable kept
  body with "Something went wrong. Try again."; finder lets a tokenless socket go after 5 s; the "Six a day" line
  until a room sends a board; "The week turned. Try again." (new string).
- Pictures: scratchpad/shots-5/ (board screen states, This Week's bounties, the board in the plaza by day and night,
  from the spawn: the headless player could not be walked closer).
- Fourth review (Phase 5): the sea count is rebuilt as one rules call the sea room makes on the characters it keeps
  (the outside-claim adapter could never count); 4001 ("your character joined another room") is final on the page, so
  two tabs no longer trade the character for ever; a room counts a clear for an account at most once a day (a new run
  counts again); socket caps on runs (RUN_MOST*2) and the finder (FINDING_MOST*2); This Week at sea shows no stale
  board after the reset.
- Rollback note: a build that drops Today.turned_in could pay a bounty twice; main keeps `activity` whole (#92's
  top-level unknown keys), so a rollback to main is safe.

## Questions for the owner (batch at the report)
- #102's encounters (bands fall back halfway, gather at a last stand, call waves) run on Mission and Dungeon NODES via
  `stand_garrison`; #72's dungeon interiors stand their garrison another way, so they get groups (leaders, breaking,
  defending at half) but no encounter. Should dungeon interiors give ground and call waves the same way?
