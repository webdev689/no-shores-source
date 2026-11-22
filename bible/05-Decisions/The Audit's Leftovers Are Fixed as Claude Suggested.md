---
type: decision
date: 2026-11-22
status: in force
---
# The Audit's Leftovers Are Fixed as Claude Suggested

After the whole-codebase audit merged with [[The Balance Pass Goes Halfway Back, and Loot Follows Destiny 1's Order]],
Claude listed what it had left for the owner and offered a fix for each.

> "Give me all your suggestions and ill approve/disapprove"

> "Take care of everything, research h properly and come back when everything is 100% done"

The suggestions were numbered to match the list of leftovers, and the owner took every one. The keys and deploys among
them (1 to 5) were offered as needing the owner's named yes; this is it.

## What it settles

**Keys and deploys**

1. Each asset workflow is split in two: the part that runs ffmpeg or Blender holds no secret, and a second job, which
   only uploads what the first made, holds `R2_TOKEN`.
2. A hand run of the rooms' deploy is refused unless `main`'s CI check passed on that commit.
3. `sloop.blend` is pinned by its SHA-256 and checked before use.
4. New guests are capped at 500 an hour across every address, and a guest account unused for 30 days is deleted.
5. A room takes a player as mounted only from a character who has a horse.

**Exploits**

6. A player's health and healing charges are kept with their account for 2 minutes after they leave, so a rejoin
   gets back what they had.
7. The room keeps the swings' chain, and a stroke out of order becomes the chain's next.
8. The first voyage starts at the port's roadstead.
9. A knocked-out companion's or officer's rest is kept with the character, so a rejoin keeps it.
10. The sea's loot seed comes from the host's secret seed through a one-way hash, so the island seeds cannot show it.
11. When a Boss leashes, the foes it called go with it and drop nothing.
12. An island's spent resource nodes are kept with the character until the day turns at 09:00 UTC.
13. The Arts' charge is kept with the character across rooms.
14. The sea refuses a ship's position farther than it could have sailed since its last word.
15. A quest's waves an account has fought drop nothing again, kept with their quest log.

**Design**

16. A failed trip puts the player back where they stood before it and tells them why; if that fails too, at the hub.
17. Returning to the ship is refused while dead or within 10 seconds of being struck.
18. A long ambient recording plays its chunks in order, its last part included, then loops.
19. The browser's Cache Storage is held within 1 GB, the oldest out first.

**Checks and tests**

20. `islands.test.ts` runs in CI, with the island modules it needs.
21. `runs_everywhere` runs, its known failures listed as expected, each with its reason, so a new one fails.
22. The dialogue check reads the quests' lines too.

The numbers (500 an hour, 30 days, 2 minutes, 10 seconds, 1 GB) were Claude's, in the suggestions the owner took.
