---
type: pick
area: Gameplay Systems
verdict: Cut, brought over by the owner's choices
effort: L
status: ported
dfo_paths:
  - src/systems/naval/shipCrew.js
  - src/systems/naval/crewLife.js
  - src/systems/naval/crewCompanions.js
  - src/scenes/crewAshore.js
  - src/systems/crewHall.js
  - src/systems/naval/captainTree.js
  - src/systems/fleet.js
  - src/systems/revenant/revenantStars.js
dfo_commit: 1c0fd68 (main)
---
# Pick - Crew and Ship Power

DFO's crew and its ship refits, read as the specification for the game's ship power and crew, which the owner asked
for ([[Ships Have Their Own Power, Modules and Crew Who Fight Beside You]]): named crew who hold posts aboard and go
ashore as companions, recruited and now and then taken; and a ship whose parts are raised apart from its captain. How
it works now: [[Ship Power]] and [[Crew]].

## What comes over

- **Posts aboard** (`shipCrew.js`): DFO's First Mate, Gunner, Bosun, Carpenter and Lookout, one holding each post, a
  better hand counting where two could. DFO's posts were flat factors (a Gunner's 4 to 13% reload); the game's change
  how it plays as well: the Gunner fires the broadside the player is not laying, the Carpenter patches part of each
  ball's harm in a fight, the Bosun keeps way torn canvas costs it, the First Mate leads more hands aboard and keeps
  its men's nerve, the Lookout sights farther ([[The Ship's Power, Crew and Islands as Claude Shapes Them]]).
- **Headcount** (`crewLife.js`): DFO's one named hand shown for every six crew becomes hands as a count of their own
  beside the named officers, ten on the player's Sloop, who load its guns and fall to balls.
- **Companions ashore** (`crewCompanions.js`, `crewAshore.js`): two ashore at most, following behind the leader at
  DFO's distances, put back at their place when left 40 m behind, knocked out rather than killed and resting before
  they come ashore again, fighting with the foes' own minds on the players' side and never harmed by the player.
- **Recruiting** (`crewHall.js`): a counter's officers of the day, the same for everyone that day, in grades whose
  wages rise; the game's are offered by the faction the player is pledged to, the better grades as their rank rises.
- **A grid of their own** (`captainTree.js`, `revenantStars.js`): DFO's trees of stars become the gear's own grid
  of columns, unlocked by service, each perk column a choice ([[Gear]]).
- **Refits** (`fleet.js`): DFO's refit lines (hold, rigging, hull, guns) and their materials become the four modules
  and the ship's own materials, each an item with a rarity and a grid as the character's gear is.

## Left behind

- DFO's morale, chanties, deck walking, watches and grog; its wagon seats and pack weight; its name banks, which are
  Daggerfall's (the game's names are its own, in `content/gear/crew.json`); its captain's level from a ledger, which
  the ship's own level and experience take the place of; its refit ores, which are Daggerfall's metals.
