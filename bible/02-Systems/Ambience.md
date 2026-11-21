---
type: system
status: live
code:
  - client/src/game/audio/ambience/ambience.ts#Ambience
  - client/src/game/audio/ambience/weatherLaw.ts#phasesOfSun
  - client/src/game/audio/ambience/weatherLaw.ts#weatherOf
  - client/src/game/audio/ambience/weatherLaw.ts#thunderOf
  - client/src/game/audio/ambience/player.ts#ScapePlayer
  - client/src/game/audio/ambience/graph.ts#callChain
  - client/src/game/audio/ambience/scapes.ts#SCAPES
  - client/src/game/audio/ambience/law.ts#ambienceOf
  - client/src/game/audio/ambience/law.ts#gapAfter
  - client/src/game/audio/ambience/law.ts#gustOf
  - client/src/game/audio/ambience/places.ts#placeCall
  - client/src/game/audio/ambience/recordings.ts#BED_RECORDINGS
  - client/src/game/audio/ambience/recordings.ts#CALL_RECORDINGS
  - client/src/game/audio/place.ts#placeOf
---
# Ambience

What the world sounds like where the player is: the open sea, Saltmere's social space and its port, and each of the
nine islands by its climate. Each is its own: beds of wind, water and leaves under it, and the calls of birds,
beasts, insects, timbers and a city's work over it, placed round the listener. It is DFO's soundscape ([[Pick - Soundscape]]), grown to eleven
places ([[Music and Ambience Come From DFO's Synthesiser]]), its every sound a Freesound recording the owner picked
([[Every Sound Comes From Freesound, and the Music Rests Between Pieces]]).

## How it works

- **Where the player is.** Each frame the game tells the ambience where the camera is: on foot in a node, or at sea
  aboard the ship. `placeOf` names the place; each place is one ambience. On foot the listener stands at the eye; at
  sea it stands on its deck and everything placed rides with it.
- **The story.** While the [[Prologue]] plays, its beats at sea and on the wreck are heard as the open sea round the
  Brig or the wreck, and its shore at dawn as Saltmere's coast, under the sky the story tells ([[Sky]]): its rain,
  its wind and the thunder of its strikes. The story's own beds keep only the fire, the deep and its moments.
- **Beds.** A recording played over and over, each play fading into the next over 4 s at equal power. A bed is wide
  about the ear or stands at a point through a panner: the nearest shore, the harbour, the nearest river within 400 m,
  or a city's streets; where there is no such place near, it is silent. Each breathes on slow waves that never come
  round within an hour. Wind, grass and leaves gust: a gust swells them, wandering without a beat.
- **Calls.** Each voice has a rate a minute by the time of day, a wandering mood (0.4 to 1.6 times its rate, over
  minutes), and gaps drawn at random, never under a quarter of the mean. Its recording sounds once a bout, and the
  bout's length passes before the next: a cuckoo's run, an anvil's blows.
- **Where calls sound.** Each call is placed at a spot of its kind: in the trees, on the ground, high overhead, on the
  highest ground near, at the shore, over the water, at the harbour, in the city, on the plaza's ledges, at the smith,
  in the hull or the rigging, or at the ear. Where there is no such spot near, it is not called. A call is heard
  through its own panner (by the ear's shape, HRTF, within 60 m; panned beyond), darkened by the air with distance,
  and sent to the place's room, more of it the farther it is. At most 20 sound at once; thunder is counted apart
  (below).
- **Rooms.** Each place answers in its own way: a forest's long, soft tail; a valley's echoes; the plaza's walls; the
  open steppe's short, dry air.
- **The sea.** The swell rises and falls on three long waves. The wash past its hull grows with its way: none hove
  to, more at each step of its pace dial. Its timbers, ropes, canvas and blocks are heard fully on its deck and at
  its helm, and a little off from the raised view. Gulls call only within 3 km of a coast.
- **Saltmere.** From the plaza: the townsfolk's steps where they walk, pigeons and sparrows, the Smith's anvil in
  the arcade, a market crowd and carts and hammers in the city below, and the harbour: water lapping, moored ships
  creaking, halyards, a bell, gulls, the surf along the coast.
- **The islands.** Each climate has its own beds and voices (the table below). Surf and gulls come only near a
  coast, a river's water only near a river.
- **Time of day.** Every rate and bed is set for dawn, day, dusk and night, and the sky's sun says which it is
  ([[Sky]]): dawn while it stands within a few degrees of the horizon rising in the east, dusk as it sets in the west,
  day above, night below. The phases turn smoothly with the sun, so the dawn chorus, the crickets at dusk and every
  night voice come and go in cross-fades. On foot in Saltmere by night the crowd and the work fall quiet; the harbour
  keeps on.
- **Wind.** The weather's wind ([[Weather]]) scales every gusty bed (wind, grass, leaves, rigging) and every gust's
  call: near silent in a calm, whole at the usual 6 m/s, up to 2.5 times in a gale, its gusts deeper the wilder they
  blow.
- **Rain, snow and sand.** Rain is beds of its own: a hiss of many drops all round and a patter near, both louder the
  harder it falls; in Saltmere its gutters drip, and at sea it drums on its canvas and planks. Snow makes
  no sound of its own but softens every other bed. A sandstorm hisses over the desert and the steppe. Rain or snow
  sends the day's birds and insects to shelter, the recorded parrots and heron with them: in a downpour by day most
  fall silent, while by night the rain silences none.
- **Thunder.** Each strike the sky reports within 25 km thunders once, arriving after its distance at 343 m/s, from
  the way it lies. A ground strike near (under 3 km at full power) cracks and rips; any other rolls, long and low. Its
  level and its top fall with distance. Thunder is the same in every place, its near crack well over the beds (about
  -15 LUFS at its loudest) and never past 0.6 of full scale. At most six rolls sound at once, apart from the calls, so
  a storm never crowds out the birds, the hull and the steps; a near crack always comes through.
- **Steps on its deck.** Walking the Sloop's deck, each stride is a step on wooden planks.
- **Crossfades.** A new place fades in over 4 s as the last fades out, at equal power. Behind a loading veil the
  game shows no place, so the ambience fades to nothing and comes back with the next place. A hidden page fades out.
- **Recordings.** Every bed and every call of every place is the owner's pick on the sound sheet
  ([[Sounds Come From Freesound, Judged on a Test Sheet]]), named by `BED_RECORDINGS` and `CALL_RECORDINGS`
  (`recordings.ts`), a place naming its own where it differs (the sea's wind and rain, the swamp's still water); the
  sea's ([[The Sea's Sounds Come From Freesound]]), Saltmere's gutters and both thunders
  ([[The Weather's Gutters and Thunder Come From Freesound]]) among them. Each is silent until its recording has come.
- **The sea fight.** A gun fired, a ball striking a ship, a ball falling in the sea and a ship breaking up as it goes
  down are heard where each happens, through the open sea's room, from the fight's own events, in the game's fights
  and the story's.
- **Levels.** A bed is levelled to 0.1 RMS over its whole length (the deck's timbers, the canopy's drips, the patter,
  the gutters and the rain on the deck a little softer); a thunder to a set loudness over its loudest 0.4 s, its peaks
  never past 0.6 of full scale; a call by the recordings' own levelling ([[Interface]]).
- **Volume.** Everything plays through the Ambience volume in Settings, under the music's duck ([[Interface]]).
  Each place is levelled to about -30 LUFS at the first volume.

| Place | Beds | Voices by day | Voices by night |
|---|---|---|---|
| Sea | Swell, wash, wind, rigging, timbers | Hull creaks and slaps, ropes, canvas, blocks, bow seas, gulls near a coast | The same, no gulls |
| Saltmere | City hum, wind, harbour lapping, surf, market crowd, rigging | Steps, pigeons, sparrows, anvil, carts, hammers, ships, halyards, bell, gulls | Crickets, an owl, the harbour |
| Temperate coast | Wind, grass, crickets at dusk | Lark, warblers, finches, thrush, curlew, buzzard, cuckoo | Tawny and deep owls, nightjar |
| Highland | Moaning wind, whistling gusts, grass | Gusts and whistles on the ridges, stone falls, ravens, buzzard, curlew, lark | Wolves on the ridges, an owl |
| Woodland | Leaves, wind, crickets at dusk | Warbler, thrush, finch, wren, chiffchaff, woodpecker, cuckoo, dove, crow, boughs, twigs | Tawny owls, deep owl, a far wolf |
| Desert | Blown sand, dry wind, rock whistles | Sand gusts, rock whistles, stone falls, hawk, raven, flies | Jackals, crickets, an owl |
| Savanna | Grass, wind, cicadas, crickets | Weavers, doves, fluting birds, hawk, cicadas, flies | Jackals, nightjar, owl, a lion |
| Rainforest | Canopy drips, cicadas, crickets, frogs, leaves | Fluting birds, warblers, drips, cicadas, mosquitoes, woodpecker, parrots | Tree frogs, frogs, owl |
| Steppe | Wide wind, grass, crickets at dusk | Larks, marmots, buzzard, gusts, raven | Wolves, crickets |
| Swamp | Marsh drone, frog chorus, still water | Gas bubbles, frogs, bullfrogs, mosquitoes, flies, a fish, reed warbler, raven, a heron | The full frog chorus, peepers, owl |
| Tundra | Gale, whistling gusts, blown snow | Gusts, rock whistles, ice groaning, cracking and singing, ravens, a far wolf | Wolves, an owl |

## Limits

- Ridges, trees and hollows are read off the land's 1 km cells, so on flat ground a wolf's ridge is any far point.
- Thunder rolls from one point on its bearing; a long bolt's parts do not each come from their own place.
- Townsfolk step only through Saltmere's plaza.
- Not tested in a running game with WebGPU: tested offline, through the same code, in an offline audio context.
