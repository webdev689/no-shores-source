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
| A rolled piece's look past the world | Its set and metal by its name alone, as its content drops at its own levels; the world's climb with its level | Each content's every look is seen at every level it drops |
| From | On an item's card and page, capitalised, and a Vestige's line; a faction's piece names its faction ("The Veiled") | Where it was earned, said wherever the piece is |
| The room's look check | The room keeps any look the page could pick for the piece (any of its content's sets for its rarity, any make, its written look, its faction's, the forge's nearest where it draws none), not only the one it would pick; a body the forge does not draw holds no weapon and keeps no fallback; a pauldrons layer stays with its cuirass's set where the forge draws none | The owner's "Yes, server checks looks", with no legitimate look ever dropped |

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
| The Abyss Dungeon of the week | Never matched: Launch only, with a company | The owner's Nightfall, as Destiny 1's |
| Coming back | Out of a run to the sea beside the port it was launched from | Destiny returns a player to orbit |
| The weekly's record | Its clears counted to three, the third paying; a clear counts toward the week its run was opened in, and the daily only on the day it was opened | A run opened before a reset is paid as the period it was opened for, as the week's two are |
| The mark | A ☰ in amber (#e0a458), "Elite and Abyss dungeons", beside the port's own mark; the screen says "Beside <city>" | One mark a port, read apart from the port's |
| The screen | After the owner's reference: the four entries as crests on a dark chart, the playlists above and the week's dungeons below them, a gold dot on a crest while its reward waits, and the chosen one's card beside it with its level, rules, modifiers and rewards (the weekly as three marks and "2 of 3"); Launch, Find a Company and Close on a footer bar | The owner found the first screen of text tiles "really bad"; Destiny's Vanguard screen is nodes on a map and one card |
| Launch's dungeon | Drawn by the server, as Find a Company's: Launch asks the playlist's finder for a run at once (`?launch`), alone or for the company; a playlist's room lets in first only an account the server drew it for, or one of its company. Playing alone, with nothing kept, the page draws it | The owner's word: [[A Playlist's Launch Is Drawn by the Server]] |
| The week's two from the Playlist | Entered from the sea and left back to it, as a playlist's run is; the run is named `--sea` so the rooms know it, and one gone into by the dungeon's door is never entered from the sea | One way in from every port, and no run carries a player across the sea onto an island |
| Launch again | Each Launch draws anew: the daily and the weekly pay alike whichever dungeon is drawn (a Boss's colours, the playlist's tier) | As leaving and joining a playlist again draws anew in the owner's reference |
| A Roster join | A company member may join a playlist's run from another island; leaving puts them on the sea | Companies play together wherever they stood |
| Below a playlist's level | The finder closes the queue with the gate's words | The rooms would refuse the run anyway |
| The screen's presses | Find a Company the primary press; Launch reads "Go alone", or "Go with your company" when the Roster's company has more than one; Launch hidden while a search or a launch runs; no Stop while a Launch waits, though Close stops it | One clear first choice, and no press that does two things |
| A shut entry | Its padlock on the crest's shoulder, its reason in neutral ink with a padlock on its card and footer ("Opens at level 24 · You are 22"), its Launch dim; red only for a refusal | A lock is information, not an error |
| The crests' words | A crest's words drop its tier, which its shield and name say, one part a line; a week's dungeon's name on two lines, broken before "of"; the Abyss Playlist's rule "One of the 18 Elite Dungeons, at Abyss, drawn as each run starts." | Short lines that never break mid-phrase |
| The Playlist's mark on land | Replaced by the owner's [[The Playlist Shows Over Its Island, Not Only at Sea]]: shown over its island's side however the island is reached | Was shown there only when docking |

### Encounters

| Choice | Chosen | Why |
|---|---|---|
| Which dungeons | Every Elite Dungeon run: at Normal, the week's two and both playlists | The matchmade content |
| Seals | Two encounters in a four-block Elite Dungeon, three in a five-block one, each in its own room along the walk, never two alike; the Boss stands only once every seal is broken | DFO's Elite Breach halls: the trials before the Court |
| The Litany (a puzzle) | Four to six runes on the floor, each with its own glyph, lit one after another in a loop while it runs; the company steps on them in the order shown, 3 s allowed for each next rune once the first is stepped. A wrong one flashes red 1 s, darkens them all and wakes two of the dungeon's foes; too slow starts it over with no foes | DFO's Litany and the houses' puzzle step; a wrong answer never hurts by itself |
| The Weighing (split up) | Three plates apart in a room, raised slabs of its stone, two where fewer than three living players stand in its room; held together for 20 s in all; its first wave 3 s after it starts, then every 12 s | DFO's Weighing and Winch; long enough that its foes come |
| The Ascent (a climb) | Four to six stone pads across a room over foul water that harms a player standing in it while the seal runs (12% of their health a second, tinted and heard as harm); every living player in its room holds the seal stone at the top for 2 s ("2 of 4"); at least nine of the 18 Elite Dungeons lay one | The owner's "platforming or climbing": a real climb, in half the dungeons |
| The Holdfast (a defence) | A relic's ring held for 45 s in all; its first wave 2 s after it starts, then every 12 s; a foe at the relic drains it, and a drained relic halves the hold; the relic regains a fortieth a second while no foe stands in the ring | DFO's Holdfast and Starfall |
| The Court (the Boss) | At two thirds and one third of its health the Boss is warded under a dome of light, its health held there, until its three anchors are each stood on for 3 s; each ward a wave of the dungeon's foes (one a living player, two to four) and a second if it stands 15 s on; warded, the Boss stands at its post and slams a ring 4 m round it, shown 2 s, then 30% of their health to every living player inside, every 8 s; with three or more living players an anchor stood on empties 6 s after its last player leaves unless all three are filled; its health rises half again for each living player past the first as it wakes | DFO's lords' errands that hold the next threshold; the Court lasts about as long for one to four |
| The Reckoning | From the first ward broken, every 40 s: 10 s of warning, then 70% of their health to every player outside the light, a ring 2.5 m wide at one of the anchors, reaching the end room, the corridors its doorways open onto and the rooms those corridors touch; a tick each of its last three seconds, a flash and a boom as it lands | DFO's Dagon's Reckoning, a check the whole company answers |
| A wipe at Abyss | Broken seals stay broken; the Court starts over, and every wave goes before the posts stand again | A checkpoint, as Destiny's raids keep one |
| Where the seals stand | The rooms past the way in's, but the end and any landmark's, in walk order; each seal tried in the room nearest the middle of its stretch of the walk, then outward; the kinds tried in an order drawn per dungeon, on a lane of the plan's own from the laid dungeon alone, but an Ascent tried first across each stretch while none is laid, never in the walk's first room where there are four or more, nor in a room under 4.4 m; each piece 1.4 m clear of every prop and fixture, and a seal's room laying none of the dungeon's own floor medallions | The room and the page lay the same plan from the same dungeon |
| A seal starts | When a living player stands in its room and no living foe of the garrison stands in its room's cells | No seal runs for a company still fighting elsewhere, nor starts mid-fight to punish it |
| The Litany's show | Each rune lights 1 s in turn, then a 2 s pause, looping while it runs, runes stepped shown stepped; a step counts within 0.9 m, on the ground (a dodge or a jump across is no step); a rune further on than the next is wrong, a lit one ignored; wrong steps are ignored until the show starts again | Long enough to read, short enough to keep the room moving, and no foes to farm |
| The Weighing alone | A plate stays held 3 s after its last player steps off, and alone the walk between its two plates besides, so one player walking can hold both | The two farthest plates, up to 21 m apart, could not be held by one player even at a sprint |
| The Ascent's pads | 1.6 m square; the first 1.6 m up, mantled from the dry doorway; every next one over a body's reach from the floor (1.9 m or more) and 4.4 to 5.2 m from the last, edge to edge, so only a running jump crosses; each at most 0.4 m over the one before, 0.6 m under the ceiling for the jump, the top 0.3 m; none in a room under 4.4 m high; the foul floor can still be climbed out of, at the cost of its harm | Every Ascent of the 18 is proven climbed by a scripted body with a jump at every pad past the first, as DFO's route proofs were |
| The Holdfast's relic | A ring 3 m round it, coloured by the relic's strength while held, with its strength as an inner arc and "Relic 40%" in the banner; each foe in the ring drains a twentieth of it a second; the refused sound once as it falls past 30%; drained, the hold so far is halved and the relic stands whole again | "A drained relic halves the hold", seen and heard before it happens |
| Waves | One foe for each living player in the seal's room, two to four, Major or Elite from the dungeon's own garrison, at the seal room's doorways, hunting the nearest player; at most eight of a seal's standing at once; every foe an encounter stands drops nothing but pays its XP, as a re-pulled foe does | Fuller, not faster, as DFO's law has it; the seal's breaking and the cache are the reward |
| The Reckoning's light | Moves to the next anchor each round; its harm is the Boss's blow and ends as the Boss falls | Each round asks the company to move together |
| A fallen Boss | Never stands again in its run, though the dungeon's other bands do | Its Court, wards and Fury are fought once a run |
| Fury | Every foe's blow on a player anywhere in the dungeon while the Boss stands weighs a tenth more every 30 s, to three times, from 8:00 after a living player first stands in the end room with the Boss awake; the banner warns a minute before ("Fury in 1:00"), then shows its weight ("Fury ×1.4"), and the Boss's ring turns red | A soft clock no corner of the run hides from, as DFO's lords' Fury, that never runs on the walk from the last seal |
| The banner | Under the compass: the seals broken of how many, the seal's task in a line, its progress, "Defeat the Boss" in the Court with no ward up, "Get clear of the Boss" while its slam is shown, Fury and the relic, and the Reckoning's seconds in the large clock, red and pulsing; its lines as wide as their words; a compass mark on each unbroken seal's room, then on the end room once the Boss wakes; nothing once the Boss has fallen | The public events' banner and marks, one place for a run's state |
| The pieces' look | A Weighing's plates in plain view ahead of the doorway its room is entered by (within about 70 degrees of it), each under a blue beam at rest, filled gold with no beam while held; each rune's glyph its own (one to three strokes, a dot at the heart for the first three, a small ring for the last three); anchors shown from the run's start until the Boss falls, a ring and a dim 1.4 m beam over a stepped slab; the Ascent's pads banded in the seal's blue, brightening in a wave first to last, the last gold, lit while the seal is unbroken; its foul water a dark green that bubbles unevenly | Each piece reads at a glance from where a player first sees it, and none reads as another |
| Warnings in the banner | "Foul water harms", Fury, and a relic under three tenths read in red (a bonus that warns); away from every seal, the banner names the nearest unbroken one | Harm is red before it lands, and the way on is always named |
| The Court's display | The Boss's bar 26 px under the banner; a nameplate over a figure within 12 px of the display's top pieces hidden; nothing of the banner, the Boss's bar, the target's plate, a combat prompt or the call over another, at every size | A raid's display reads whole in the fight it is for |
| The call | "Get clear!" as the slam is shown, "Into the light!" as the Reckoning's warning starts (the Reckoning's first when both stand): the fight's warning red with a white edge, sliding in over 0.25 s, standing 1.8 s, fading over 0.4 s; under the banner, above the crosshair, or under it where above would cover it or the Boss; in a short view in the banner's place | A raid's mechanic called over the middle of the view, as the reference's raids call theirs |
| Foul water's edge | The view's edge sick green while the foul water harms, rising over 0.25 s, held 1.5 s after each harm, fading over 0.6 s | Harm felt where the eye is, not only read in the banner |
| A beam near the eye | Fades away within 4 m of the camera along the ground, gone within 1.5 m; the rings on the floor stay | A beam beside the camera never stands across the view as a wall of colour |
| A first look along the climb | None: the foul water harms from the first step into the Ascent's room, so a glide would take the camera away mid-hazard | Control stays the player's where it can cost them |
| Sound | A victory sting as a seal or a ward breaks, a cadence as the Boss wakes, a sting of its own as a ward rises, a thud as the Boss slams, the refused sound for a wrong rune or a relic falling past 30%, a hurt cue in the foul water; the music tense while a seal runs, and in the Court its Boss part rising with each ward broken | Every moment heard, from the game's own cues |
