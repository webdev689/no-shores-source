---
type: decision
date: 2026-11-22
status: in force
---
# The Playlist and Its Dungeons as Claude Shapes Them

> "Please go above and beyond with this, take autonomy, and return when everything is 100% complete"

## What it settles

Claude's choices for [[Armour and Weapon Looks Belong to the Content That Gives Them]],
[[Elite and Abyss Dungeons Are Queued From a Playlist Beside Each Port]] and
[[Matchmade Dungeons Gain Encounters, Puzzles, Climbs and Raid Mechanics]]. The owner can change any of them.

### Looks by content

| Choice | Chosen | Why |
|---|---|---|
| What carries the content | Every item and Vestige keeps where it came from (`gear::source::Source`): the world, a faction, a dungeon, an Elite Dungeon, an Abyss Dungeon, a sea dungeon or a Breach; an opened Vestige's item keeps its Vestige's | A look can only follow its content if the item remembers it |
| The world | Patrols, missions, public events, the sea's fights, bounties' pay, the smiths' wares, a faction's packages and the Test Ground | Everything outside a dungeon |
| A dungeon | A patrol's three dungeons, at any tier | "Dungeon Specific" |
| An Elite Dungeon | The 18 at Normal, the Elite Dungeon of the week and the Elite Playlist | "Elite Dungeon Specific" |
| An Abyss Dungeon | An Elite Dungeon run at Abyss: the Abyss Dungeon of the week and the Abyss Playlist | "Abyss Dungeon Specific" |
| A sea dungeon | A sea island's dungeon, at any tier | "Sea Dungeon Specific" |
| The sets and metals | The world: leather, the thieves', chain, iron and steel, with iron and steel weapons. A dungeon: the knights' and dwarven, with dwarven. An Elite Dungeon: orcish and silver, with orcish and silver. An Abyss Dungeon: adamantium and ebony, with adamantium and ebony. A sea dungeon: elven and mithril, with elven and mithril. A Breach: daedric, with daedric, to become the Lattice's. The factions keep their guild sets, and their elven, silver and ebony weapons in their own colour (`content/gear/looks.json`) | Every armour set and metal the forge draws has one home; a faction's weapon is told by its colour, so its metal may be another content's |
| Guns | Plain, and gilded from Legendary up, from any content | A gun has no metal of the forge's |
| Clothes | A Normal piece, and a Magic torso or legs numbered for clothes, stay clothes from any content | Clothes are not an armour style |
| A named item | Keeps its own look, and belongs to the content its look belongs to (`source` in `content/gear/items.json`); a named gun or cloak to the world | A named piece is one thing, worn by everyone alike |
| The three daedric Atherics | Saltfang and the Ninth Wave take ebony, the Crown of the Drowned adamantium, and all three the Abyss Dungeons | Daedric waits for the Breaches, and a Breach's piece drops nowhere else, so leaving them daedric would take three Atherics out of the game |
| A Vestige whose content has no named piece of its slot and colour | Opens to another content's named piece, which keeps its own content | Until every content has named pieces of every slot, a Legendary must still open to one |

### The Playlist

| Choice | Chosen | Why |
|---|---|---|
| Where | A Playlist mark beside the harbour of each port city, Overlook, Sunspire and Rimeholt, on the sea's view and the island's | "a Playlist icon around each of the 3 port cities"; Sunspire's and Rimeholt's social spaces are shut, but the Playlist is not |
| What it holds | The Elite Playlist and the Abyss Playlist, then the Elite Dungeon of the week and the Abyss Dungeon of the week | The matchmade content, and the week's two beside it as Destiny's Vanguard screen shows the Nightfall |
| A playlist run | One of the 18 Elite Dungeons, drawn when a company is found, at the playlist's tier | Destiny's strike playlists |
| Its level | By bands of five levels: the Elite Playlist's foes two over the band's first level (12, 17, 22, 27, 32), the Abyss Playlist's three over (23, 28, 32); never past 32 | A player of the band can harm every foe |
| Opens | After the prologue, the Elite Playlist at level 10 and the Abyss Playlist at 20 | As Elite and Abyss seas open |
| Modifiers | The Elite Playlist the day's modifier; the Abyss Playlist the day's and one more of another kind, drawn for the day, with Abyss's rules (five revives, a wipe starting it over) | One rhythm with the dungeon of the day |
| Daily reward | Each playlist's first clear each day: a Boss Captain's kill at the run's level and tier, and a sure Vestige in a Boss's colours | As the dungeon of the day pays |
| Weekly reward | Each playlist's third clear each week: Essence of each stock (Elite 2, Abyss 3) and one sure Vestige in a Boss's colours (the Abyss two); shown as three marks filling | "weekly reward indicators"; Destiny 2's weekly strikes challenge |
| Farming | Every clear pays its kills, its cache and a dungeon's clear, as any run | "players can still farm for general rewards" |
| One pool | One queue a playlist for the whole game, banded by level, whichever port it is opened from | "the same pool in every city" |
| Launch | Find a Company, or Launch to enter a fresh run alone, which a company's members join | Destiny's playlists start with a fireteam or matchmake |
| The Abyss Dungeon of the week | Still never matched: Launch only, with a company | The owner's Nightfall, as Destiny 1's |
| Coming back | Out of a run to the sea beside the port it was launched from | Destiny returns a player to orbit |

### Encounters

| Choice | Chosen | Why |
|---|---|---|
| Which dungeons | Every Elite Dungeon run: at Normal, the week's two and both playlists | The matchmade content |
| Seals | Two encounters in a four-block Elite Dungeon, three in a five-block one, each in its own room along the walk, never two alike; the Boss stands only once every seal is broken | DFO's Elite Breach halls: the trials before the Court |
| The Litany (a puzzle) | Four to six runes on the floor, lit one after another while it waits; the company steps on them in the order shown. A wrong one darkens them all and wakes two of the dungeon's foes | DFO's Litany and the houses' puzzle step; a wrong answer never hurts by itself |
| The Weighing (split up) | Three plates apart in a room, two in a run of fewer than three, held together for 6 s in all; foes come every 15 s while it runs | DFO's Weighing and Winch |
| The Ascent (a climb) | Stone pads rising across a room over a drowned floor that harms a player standing on it while the seal holds (8% of their health a second); the seal stone at the top is held for 2 s | DFO's spans and climbs, inside a dungeon's ceilings |
| The Holdfast (a defence) | A relic's ring held for 45 s in all while foes come every 12 s; a foe at the relic drains it, and a drained relic halves the hold | DFO's Holdfast and Starfall |
| The Court (the Boss) | At two thirds and one third of its health the Boss is warded, its health held there, until its three anchors are each stood on for 3 s, with two of the dungeon's foes at each ward | DFO's lords' errands that hold the next threshold |
| The Reckoning | From the second ward on, every 50 s: 12 s of warning, then 70% of their health to every player outside the light, a ring 2.5 m wide at one of the anchors | DFO's Dagon's Reckoning, a check the whole company answers |
| Fury | From 8 minutes after the Boss wakes, its company's blows weigh a tenth more every 30 s, to three times | DFO's lords' Fury, a soft clock |
| A wipe at Abyss | Broken seals stay broken; the Court starts over | A checkpoint, as Destiny's raids keep one |
