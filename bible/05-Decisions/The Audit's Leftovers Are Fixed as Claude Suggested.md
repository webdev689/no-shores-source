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

## Claude's calls

- **1.** `tools/r2.py` stages what a build would upload (`R2_STAGE`), and `r2.py upload` sends only files named by
  their own hash, in a folder and of a kind the publishers use. Each build runs with or without the token, as the
  dungeons' and islands' already did; the publishing job is skipped when nothing new was staged.
- **2.** A refused hand run ends red, with the reason in its log.
- **3.** The Sloop's hash is the one in its R2 key's name, so nothing separate can drift from it.
- **4.** A guest is unused when nothing made, saw or saved it for 30 days: its newest session's last sight, its
  character's last save and its making. A signed-out guest, which no one can reach again, goes the same way. Ten go at
  a time, as each new guest is made.
- **5.** A horse is a coat worn, which every character starts with: the room now decides, and refuses riding on any
  deck, a boarded one too.
- **6.** One who left fallen comes back fallen, to stand again at a spawn. The two minutes are counted in whole minutes,
  the room's clock.
- **7.** The room's chain is the page's, with a quarter of a metre either side of a stroke's reach taken as the page's
  own view, so the page is not corrected where the two see the foe a little apart.
- **8.** A ship put to sea by a page with no place kept goes in at the nearest port's roadstead; a sea with no port
  cities still puts it where the page asks.
- **10.** Not a hash: the sea's own seed is 32 bits and its islands' seeds show it, so a hash of it would show too. The
  sea is given the two random seeds a room on land is, never sent; a boarded deck's are mixed from them by its ship.
- **11.** After a Boss's first leash, every foe it calls drops nothing for as long as it stands.
- **12.** A patrol's nodes still turn every three minutes. A character keeps the latest 16 islands' nodes a day.
- **13.** The Anima and Tenets come back as left for ten minutes, as a room already kept them for a rejoin.
- **14.** A ship comes back where the sea last had it, as a ship sails nowhere while its player is away. A ship played
  unkept is known by its session (the token's SHA-256, never the token); a page with no session at all is no one the
  sea knows, and puts in at a roadstead as a new player does. The sea remembers the latest 1,024.
- **15.** A wave counts as fought once it stands, one count for each goal of the task.
- **16.** A trip that fails takes the player back where they stood (a node, a dungeon, an island or the ship), else to
  Overlook's hub, opening its landmass first; the reason stands as a toast for 8 seconds. The first arrival, with
  nowhere to go back to, stays on the veil as before. A room past its sockets now says it is full, as a browser never
  reads a refused join's status.
- **17.** A blow lands when it hits, is blocked, or breaks the guard. The room answers the ask; the page leaves only on
  its yes and says why not in a toast, and waits three seconds for an answer.
- **18.** A chunk late to come leaves another held to play meanwhile, never the one played last.
- **19.** Already so since [[Areas Load in Chunks With Proper Caching]]: oldest means first kept.
- **20.** CI reads the packs from R2's public address, each checked by the hash in its name.
- **22.** The quests' spoken lines are already scenes in `content/story/`, which the check reads; it now also holds
  every scene, speaker and shown word a quest names.
