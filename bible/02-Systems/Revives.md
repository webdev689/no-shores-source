---
type: system
status: live
code:
  - crates/room/src/revive.rs#REVIVE_TICKS
  - crates/room/src/revive.rs#raise_the_dead
  - crates/room/src/revive.rs#darkness_for
  - crates/room/src/revive.rs#stand_up
  - crates/room/src/respawns.rs#near_where_fell
  - crates/room/src/checkpoints.rs#Checkpoint
  - crates/room/src/checkpoints.rs#doorway_of
  - crates/room/src/checkpoints.rs#holds_ground
  - crates/room/src/encounters.rs#court_start_over
  - client/src/game/footRevive.ts#reviveHere
  - client/src/game/footRevive.ts#fallenOf
  - client/src/game/footRevive.ts#ReviveNotices
---
# Revives

A player who falls in a fight lies where they fell until another player revives them or they respawn, as in Destiny
([[Fallen Players Are Revived as in Destiny]]). A respawn stands them near where they fell in a patrol zone and at
the last checkpoint in a dungeon or a mission
([[Activities Keep Checkpoints, and Patrol Zones Respawn the Player Near Where They Fell]]). The numbers and words are
Claude's ([[Revives, Respawns and Relogs as Claude Shapes Them]]). The room judges all of it ([[Server]]); the page
shows what the room says.

## How it works

- **Falling.** A player whose health runs out in a fight is down (combat's `Dead`): they lie where they fell, their
  inputs taken without steering them. A death past a node's section or by a fall in a social space is [[Reach]]'s and
  stands again only by its own respawn.
- **Revived.** Another player in the room, alive, on foot and not riding, who holds Use within 2.5 m across and 2 m up
  or down of the fallen body (`REVIVE_REACH_M`, `REVIVE_RISE_M`) holds a revive. Each input says whether Use is held
  (`revive`); a hold counts a tick of the room's clock at a time and, at 120 ticks (2 s, `REVIVE_TICKS`), stands the
  fallen player where they lay. Letting go, leaving the reach, falling or mounting lets it go, and it starts again from
  nothing; a blow taken does not. Each ally holds on over the player they were reviving, or takes up the nearest within
  reach no one else revives, so one fallen player has one hold.
- **Respawned.** Once they have lain 4 s (`RESPAWN`), the fallen may ask to respawn (`respawn`), as the page asks when
  Respawn is pressed; nothing stands them up unasked, but in a room with no section (the Test Ground, the prologue's
  wreck), whose page never asks. Where they stand (`stand_again`):
  - At their activity's checkpoint, once one is won (below).
  - In a patrol zone or a world boss's node, near where they fell (`near_where_fell`): of the section's spawns and the
    points every 25 m along the node's ways (`ALONG_M`), each 8 m or more inside the section with room for a body, the
    one nearest the fall with no living foe within 25 m, facing where they fell; where a foe stands by every one, the
    spawn nearest them.
  - Anywhere else, the section's spawn nearest them, or the room's spawn.
- **Standing up**, either way, is whole with every healing charge, inside the section, a fall measured from where the
  feet stand, the foes leaving them be for 3 s unless they strike first (`stand_up`). Everyone is told: `Revived`
  (35), its striker the ally, or `Respawned` (9).
- **Checkpoints** (`checkpoints.rs`). A dungeon lays one at each room whose band stands, and in an Elite Dungeon one at
  each seal's room and one at the Court in its end room: each at the doorway cell the walk from the way in enters its
  room by, facing in from the cell before it (`doorway_of`). One is won while its band has fallen, its seal is broken,
  or the Court's Boss has woken. A mission lays one at each of its garrison's posts, won while its group is cleared,
  along by its distance from the first spawn. The fallen stand at the one won farthest along, before any at the way
  in; every player is told `Checkpoint` (36) as the one used moves on. In a run's own room (`holds_ground`) a band or
  group whose fall won a checkpoint holds its ground: it does not stand again while anyone is in the room. In a shared
  room it stands again as any group does, and its checkpoint falls back to the one won before it ([[Enemies]],
  "Standing again").
- **Darkness zones** (`darkness_for`). A body lying on a cell of an Elite Dungeon's Court while its Boss stands, or
  anywhere in an Abyss run with no revive left, takes no ask to respawn: only an ally stands them up. One fallen
  outside the Court, come back down at the way in, may still respawn. When every player the room judges (those it
  keeps, where it keeps anyone) is down while the Court's Boss stands, below Abyss, each is told `FellBack` (37),
  shots, blows waiting and spells are dropped, the Court starts over (`court_start_over`: its waves gone, its ward,
  anchors and Fury as they first were, its Boss stood again whole and awake) and every player stands whole at the
  Court's checkpoint. Every seal stays broken.
- **An Abyss run** spends one of the company's five revives on every stand, revived or respawned; with none left no
  hold is taken up, and an Abyss wipe ends the run ([[Activities]], "Abyss's rules").
- **Revived where they lay**: on the ground under the body, a ledge or a floor above as much as the terrain, facing as
  they fell.
- **On the wire.** Each input carries `revive`, Use held to revive. Each snapshot on land, and on a ship's deck,
  carries `darkness`, whether the darkness holds the player it is sent to, and `reviving`: each fallen player being
  revived, their reviver and the hold's share per mille ([[Server]]).

## On the page

- **E over a fallen ally** (`reviveHere`): the use prompt says "Hold to revive" and their name (none for a guest), or
  "No revives left" in an Abyss run with none; held, the fight sends `revive` with each input, and the prompt's ring
  shows the room's share. It comes before any other use where the player stands.
- **The fallen ally's mark** (`fallenMarks`): a faceted shell of light round a glowing eye, after Destiny's Ghost,
  1.1 m over the body, lit, so it beats and shows through walls ([[What a Player Can Use Wears Its Mark Over It]]).
- **The player fallen** (`fallenOf`): the world greys and the screen's edge darkens, the pointer kept to look round
  while an ally comes, and death's words stand over the view: "YOU DIED", then "Respawn in 3 s" and Respawn waiting,
  "You fell." and Respawn once it may be pressed (the respawn key, Enter or the pad's A, the keys' "dead" context),
  "Ada is reviving you  40%" while an ally holds, or "Darkness zone. Only an ally can raise you." and "No revives
  left. Only an ally can raise you." with no Respawn. The key strip shows Respawn only once it may be pressed. The
  place line adds "Darkness zone" while the darkness holds the player ([[Interface]]).
- **Told** over the view for 3 s (`ReviveNotices`): "Ada is down" as another player falls, "Ada revived you", "You
  revived Ada", "Checkpoint reached", and "Your company fell. Back to the checkpoint".
- **Standing again**, revived or respawned, the player's figure arrives as a respawn does
  ([[Players Arrive as Destiny's Transmat Does, Unexplained]]).
- **Scripted players** (the public events' bots, `&bots=`, and the rules' agreement runs) ask to respawn every tick,
  so they stand again as soon as they may.

## Limits

- A fallen player who leaves and comes back stays down (`left.rs`), and asks again; in an Abyss run their body is kept
  by the run.
- The points near a patrol's fall are laid only from the ways the node's file names; a page playing alone writes them
  into its own node file from the layout, as the bake does.
- Nothing yet speeds a revive or raises a fallen player alone (Destiny 1's Fireborn had no match here).
- Tested offline: the rules' tests, the agreement runs, the page's tests; not yet played by hand or in a deployed room.
