---
type: system
status: live
code:
  - crates/gear/src/crew/mod.rs#Crew
  - crates/gear/src/crew/mod.rs#earn_officer_xp
  - crates/gear/src/crew/officer.rs#Officer
  - crates/gear/src/crew/officer.rs#Post
  - crates/gear/src/crew/officer.rs#strength
  - crates/gear/src/crew/recruit.rs#offers
  - crates/gear/src/crew/recruit.rs#taken
  - crates/gear/src/crew/duties.rs#recruit
  - crates/gear/src/crew/duties.rs#station
  - crates/gear/src/ship/trim.rs#ship_trim
  - crates/room/src/crew.rs#pledge_of
  - crates/room/src/crew.rs#MUSTER
  - crates/room/src/ship_power.rs#officers_join
  - crates/room/src/boarding_hands.rs#boarding
  - crates/room/src/companions.rs#keep_companions
  - crates/naval/src/arms.rs#LARGE_BOAT
---
# Crew

A ship's people ([[Ships Have Their Own Power, Modules and Crew Who Fight Beside You]],
[[The Ship's Power, Crew and Islands as Claude Shapes Them]]): her hands, a headcount, and her named officers, few and
rare, who hold posts aboard or come ashore beside the player. Her power is [[Ship Power]]; DFO's crew is the
specification ([[Pick - Crew and Ship Power]]).

## Hands

- The player's Sloop carries ten hands (`LARGE_BOAT`). Balls cut them down as they cut a captain's men, at 3.2 blows a
  man, and they load her guns: whole, a side in 5.6 s, the pace one player alone always loaded it; thinned, slower, to
  10.1 s with none left. Her ship never strikes for want of them: the player is always aboard.
- The share left is kept with her hurts until a port city repairs her, and the ship's panel shows her hands of her
  complement.
- **Boarding** (`room::boarding_hands`): over a struck ship's rail with each player come two of their hands and as many
  more as her First Mate and her perks lead aboard, never more than she has left. They fight her crew on the players'
  side with a foe's own brain, as swordsmen of the deck roster at their ship's level, by gear's power as a matched
  player's; a kill they have a hand in is their player's, and her deck is won once her crew is down whoever of them
  stands. Each who falls is a man she has lost once the player is back aboard.

## Officers

- **An officer** (`crew::officer`) has a post, a grade, a name (a given and a family name from
  `content/gear/crew.json`), experience and a grid, and a duty: aboard, at their post, or ashore. A player keeps eight;
  one holds each post, two go ashore. Paid off, an officer leaves and nothing is given back.
- **The grades** are Able, Seasoned and Veteran, laid out as a Magic, Rare and Legendary armour piece's grid
  (`grid.rs`): perk columns to choose among, from their post's own perks and every officer's, and upgrades. Their
  experience raises their level to 20 on the player's own curve; past it each upgrade bought carries them one level
  (Able), two (Seasoned) or three (Veteran), to 29. Their service, the experience earned with the player, opens their
  columns as an item's experience does. Their nodes cost Aurem, a Veteran's upgrades Heartwood.
- **How well they hold their post** (`Officer::strength`) rises from 0.5 at level 1 to 1 at level 29, and is what
  their post's own work is times.
- **They earn** where they serve: those aboard or at their post from the sea's fights (a captain going down pays them
  the ship's experience), those ashore from the fights on land the player has a hand in.

## Ashore

- Two officers sent ashore stand beside their player in a land room as companions, by DFO's own rules: their post's
  type in the pirates' clothes, at their own level, following and fighting with a foe's brain on the players' side,
  knocked out rather than killed and resting eight minutes ([[Gear]], "Companions"). A boarded deck has none.

## Posts

Each post changes how she plays in a fight, its officer's strength times (`ship::trim`, `naval::fight::fitting`):

- **First Mate**: up to four more hands lead aboard a struck ship, and her men fall up to 15% slower.
- **Gunner**: fires the broadside the player is not laying, when it is loaded and squarely on a ship within its reach
  (cosine 0.7 off its square), laid on that ship's middle; and her guns reload up to 10% faster.
- **Bosun**: keeps up to half of the way her torn canvas costs her.
- **Carpenter**: patches up to a quarter of each ball's harm to her hull back, two hull points a second, while she is
  afloat; only a port city repairs her for good.
- **Lookout**: sights ships up to 40% farther.

## Signing on

- **At the muster** (`room::crew::MUSTER`, the Harbourmaster's counter in a social space), the faction a player is
  pledged to offers three officers a day, the same to everyone that day (`recruit::offers`): the first Able, the second
  Seasoned from rank 2 with it, the third Veteran from rank 4, at the player's level (to 20). Wages are 1,500,
  4,000 and 9,000 Aurem. An officer already kept is not signed on twice.
- **The pledge** is read in one place (`room::crew::pledge_of`), for the faction rules to decide; with no pledge no
  officer is offered.
- **Taken**: a boarded deck won, each boarder rolls for her captain's officer to join them (`recruit::taken`): a
  Minor's 3%, a Major's 5%, an Elite's 10% (Seasoned), a Miniboss's 18% and a Boss's 30% (Veteran), at her level.

## In the browser

- The gear message's ship part (`GearShip`) carries each officer and the officers offered at the muster, each with
  their grid's columns as an item's are. The crew's asks are 58 to 62: sign on (`column` the faction, `node` the
  offer), station (`item` the officer, `slot` 0 aboard, 1 at their post, 2 ashore), pay off, buy and choose a node.

## Limits

- Until the factions' pledges reach this branch, `pledge_of` answers none, so no counter offers an officer; officers
  join from won decks.
- A boarded deck refuses asks of the ship's modules, materials and crew (`room::crew::of_the_ship`): the sea keeps
  them while the player fights on foot, and gives them back as they were when the player comes aboard again.
