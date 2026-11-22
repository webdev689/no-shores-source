---
type: decision
date: 2026-11-22
status: in force
---
# The Playlist and Its Dungeons as Claude Shapes Them

> "Please go above and beyond with this, take autonomy, and return when everything is 100% complete"

> Shown the three built: "Lets do a deep comprehensive audit, and detailed design pass. I want the detail to be AAA
> grade and as close to bug free as possible. Come back when this is 100%"

## What it settles

The owner asked for a deep comprehensive audit and a detailed design pass, to AAA detail and as near bug free as can
be; the calls below are the work after it. Claude's choices for [[Armour and Weapon Looks Belong to the Content That Gives Them]],
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
| The sets and metals | The world: leather, the thieves', chain, iron and steel, with iron and steel weapons. A dungeon: the knights' and silver, with silver. A sea dungeon: elven and dwarven, with elven and dwarven. An Elite Dungeon: orcish and mithril, with orcish and mithril. An Abyss Dungeon: adamantium and ebony, with adamantium and ebony. A Breach: daedric, with daedric, to become the Lattice's. The factions keep their guild sets, and their elven, silver and ebony weapons in their own colour (`content/gear/looks.json`) | Each content's looks stand wholly above the one before on the sets and metals by worth, so a look says how hard its content was; a faction's weapon is told by its colour, so its metal may be another content's |
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
| The weekly's record | Its clears counted to three, the third paying; a clear counts toward the week its run was opened in, and the daily only on the day it was opened | A run opened before a reset is paid as the period it was opened for, as the week's two are |
| The mark | A ☰ in amber (#e0a458), "Elite and Abyss dungeons", beside the port's own mark; the screen says "Beside <city>" | One mark a port, read apart from the port's |
| The screen | After the owner's reference: the four entries as crests on a dark chart, the playlists above and the week's dungeons below them, a gold dot on a crest while its reward waits, and the chosen one's card beside it with its level, rules, modifiers and rewards (the weekly as a bar and three marks); Launch, Find a Company and Close on a footer bar | The owner found the first screen of text tiles "really bad"; Destiny's Vanguard screen is nodes on a map and one card |
| Launch's dungeon | Drawn by the server, as Find a Company's: Launch asks the playlist's finder for a run at once (`?launch`), alone or for the company; a playlist's room lets in first only an account the server drew it for. Playing alone, with nothing kept, the page draws it | The owner's word: [[A Playlist's Launch Is Drawn by the Server]] |
| The week's two from the Playlist | Entered from the sea and left back to it, as a playlist's run is | One way in from every port |
| A Roster join | A company member may join a playlist's run from another island; leaving puts them on the sea | Companies play together wherever they stood |
| Below a playlist's level | The finder closes the queue with the gate's words | The rooms would refuse the run anyway |

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
| A wipe at Abyss | Broken seals stay broken; the Court starts over, and every wave goes before the posts stand again | A checkpoint, as Destiny's raids keep one |
| Where the seals stand | The rooms past the way in's, but the end and any landmark's, in walk order; each seal tried in the room nearest the middle of its stretch of the walk, then outward; the kinds tried in an order drawn per dungeon, on a lane of the plan's own from the laid dungeon alone | The room and the page lay the same plan from the same dungeon |
| A seal starts | When a living player first stands in its room | No seal runs for a company still fighting elsewhere |
| The Litany's show | Each rune lights 1 s in turn, then a 2 s pause; a step counts within 0.9 m; a rune further on than the next is wrong, a lit one ignored; the show starts again 2 s after a wrong step | Long enough to read, short enough to keep the room moving |
| The Weighing alone | A plate stays held 3 s after its last player steps off, and alone the walk between its two plates besides, so one player walking can hold both | The two farthest plates, up to 21 m apart, could not be held by one player even at a sprint |
| The Ascent's pads | 1.6 m square, three to six, each 0.4 m over the one before, the top no higher than a body's height and 0.3 m under the room's lowest ceiling; the first reaches back to the doorway's cell, so the way on is dry; the drowned floor's harm is taken once a second | Every Ascent of the 18 is proven climbed by a scripted body, as DFO's route proofs were |
| The Holdfast's relic | A ring 3 m round it; each foe in the ring drains a twentieth of it a second; drained, the hold so far is halved and the relic stands whole again | "A drained relic halves the hold" |
| Waves | One foe for each player, two to four, Major or Elite from the dungeon's own garrison, at the seal room's doorways, hunting the nearest player; at most eight of a seal's standing at once | Fuller, not faster, as DFO's law has it |
| The Reckoning's light | Moves to the next anchor each round; its harm is the Boss's blow, reaching only the end room, and ends as the Boss falls | Each round asks the company to move together; a player standing again at the way in has no time to reach it |
| A fallen Boss | Never stands again in its run, though the dungeon's other bands do | Its Court, wards and Fury are fought once a run |
| Fury | Every foe's blow on a player anywhere in the dungeon while the Boss stands, from exactly 8:00 after it woke | A soft clock no corner of the run hides from, as DFO's lords' Fury |
| The banner | Under the compass: the seals broken of how many, the seal's task in a line, its progress, "Defeat the Boss" in the Court with no ward up, and the Reckoning's seconds in the large clock, red and pulsing; nothing once the Boss has fallen | The public events' banner, one place for a run's state |
| Sound | A victory sting as a seal or a ward breaks, a cadence as the Boss wakes or a ward rises, the refused sound for a wrong rune or a drained relic; the music tense while a seal runs and at its peak in the Court | Every moment heard, from the game's own cues |
