---
type: system
status: live
code:
  - client/src/game/audio/ambience/ambience.ts#Ambience
  - client/src/game/audio/ambience/weatherLaw.ts#phasesOfSun
  - client/src/game/audio/ambience/weatherLaw.ts#weatherOf
  - client/src/game/audio/ambience/weatherLaw.ts#thunderOf
  - client/src/game/audio/ambience/weatherSounds.ts#RAIN_BEDS
  - client/src/game/audio/ambience/weatherSounds.ts#THUNDER
  - client/src/game/audio/ambience/player.ts#ScapePlayer
  - client/src/game/audio/ambience/graph.ts#callChain
  - client/src/game/audio/ambience/scapes.ts#SCAPES
  - client/src/game/audio/ambience/law.ts#ambienceOf
  - client/src/game/audio/ambience/law.ts#gapAfter
  - client/src/game/audio/ambience/law.ts#gustOf
  - client/src/game/audio/ambience/places.ts#placeCall
  - client/src/game/audio/ambience/beds.ts#bedSamples
  - client/src/game/audio/ambience/sounds.ts#runJob
  - client/src/game/audio/ambience/bank.ts#Bank
  - client/src/game/audio/ambience/ambienceWorker.ts
  - client/src/game/audio/place.ts#placeOf
---
# Ambience

What the world sounds like where the player is: the open sea, Saltmere's social space and its port, and each of the
nine islands by its climate. Each is its own: beds of wind, water and leaves under it, and the calls of birds,
beasts, insects, timbers and a city's work over it, placed round the listener. It is DFO's soundscape, made by our
synthesiser, grown to eleven places ([[Music and Ambience Come From DFO's Synthesiser]]).

## How it works

- **Where the player is.** Each frame the game tells the ambience where the camera is: on foot in a node, or at sea
  aboard the ship. `placeOf` names the place; each place is one ambience. On foot the listener stands at the eye; at
  sea it stands on her deck and everything placed rides with her.
- **Beds.** A few seconds each of noise and of events laid round a loop, cut by filters. Each layer is filtered twice
  over its loop, so the loop has no seam. A bed is wide (two plays of one loop half a loop apart, one to each ear) or
  stands at a point through a panner: the nearest shore, the harbour, the nearest river within 400 m, or a city's
  streets. Each breathes on slow waves that never come round within an hour. Wind, grass and leaves gust: a gust
  swells them, opens their top and raises the wind's pitch, wandering without a beat.
- **Calls.** Each voice has a rate a minute by the time of day, a wandering mood (0.4 to 1.6 times its rate, over
  minutes), and gaps drawn at random, never under a quarter of the mean. Some call in bouts: a cuckoo's run, an
  anvil's blows. Each call is placed at a spot of its kind: in the trees, on the ground, high overhead, on the
  highest ground near, at the shore, over the water, at the harbour, in the city, on the plaza's ledges, at the
  smith, in the hull or the rigging, or at the ear. Where there is no such spot near, it is not called. A call is
  heard through its own panner (by the ear's shape, HRTF, within 60 m; panned beyond), darkened by the air with
  distance, and sent to the place's room, more of it the farther it is. Some drift as they sound: a gull, a cart, a
  mosquito. At most 20 sound at once; thunder is counted apart (below).
- **Rooms.** Each place answers in its own way: a forest's long, soft tail; a valley's echoes; the plaza's walls; the
  open steppe's short, dry air.
- **The sea.** The swell rises and falls on three long waves. The wash past her hull grows with her way: none hove
  to, more at each step of her pace dial. Her timbers, ropes, canvas and blocks are heard fully on her deck and at
  her helm, and a little off from the raised view. Gulls call only within 3 km of a coast.
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
  call: near silent in a calm, as made at the usual 6 m/s, up to 2.5 times in a gale, its gusts deeper the wilder they
  blow.
- **Rain, snow and sand.** Rain is beds of its own: a hiss of many drops all round and a patter near, both louder and
  brighter the harder it falls; in Saltmere its gutters drip, and at sea it drums on her canvas and planks. Snow makes
  no sound of its own but softens every other bed. A sandstorm hisses over the desert and the steppe. Rain or snow
  sends the day's birds and insects to shelter, the recorded parrots and heron with them: in a downpour by day most
  fall silent, while by night the rain silences none.
- **Thunder.** Each strike the sky reports within 25 km thunders once, arriving after its distance at 343 m/s, from
  the way it lies. A ground strike near (under 3 km at full power) cracks and rips; any other rolls, long and low. Its
  level and its top fall with distance. Thunder is the same in every place, its near crack well over the beds (about
  -15 LUFS at its loudest) and never past 0.6 of full scale. At most six rolls sound at once, apart from the calls, so
  a storm never crowds out the birds, the hull and the steps; a near crack always comes through.
- **Steps on her deck.** Walking the Sloop's deck, each stride is a step on wooden planks.
- **Crossfades.** A new place fades in over 4 s as the last fades out, at equal power. Behind a loading veil the
  game shows no place, so the ambience fades to nothing and comes back with the next place. A hidden page fades out.
- **Made off the page.** Beds and calls are made in a worker as a place is first heard, a place's whole set in about
  a second; until they come it is silent. Only the places sounding keep their sounds (about 18 to 30 MB each).
- **Recordings.** Gulls, a crow, a raven, a crowd, parrots, a heron and a lion are also cues on the sound sheet
  ([[Sounds Come From Freesound, Judged on a Test Sheet]]). Once the owner picks one, it plays in place of the
  synthesiser's call; parrots, the heron and the lion have no synthesised call and are silent until picked.
  Saltmere's gutters and both thunders play the owner's picks too ([[The Weather's Gutters and Thunder Come From
  Freesound]]), the synthesiser's until they come.
- **Recordings stand in at the synthesiser's level.** A recorded bed is as loud as the whole of the bed it replaces
  and heard from where that bed stands; each play fades into the next, and the first takes over from the synthesiser's
  bed, at equal power. A recorded thunder is as loud as its synthesised one over its loudest 0.4 s, its peaks never
  past the thunder's 0.6 of full scale.
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
| Savanna | Grass, wind, cicadas, crickets | Weavers, doves, fluting birds, hawk, cicadas, flies | Hyenas, jackals, nightjar, owl, a lion once picked |
| Rainforest | Canopy drips, cicadas, crickets, frogs, leaves | Fluting birds, warblers, drips, cicadas, mosquitoes, woodpecker, parrots once picked | Tree frogs, frogs, owl |
| Steppe | Wide wind, grass, crickets at dusk | Larks, marmots, buzzard, gusts, raven | Wolves, crickets |
| Swamp | Marsh drone, frog chorus, still water | Gas bubbles, frogs, bullfrogs, mosquitoes, flies, a fish, reed warbler, raven, a heron once picked | The full frog chorus, peepers, owl |
| Tundra | Gale, whistling gusts, blown snow | Gusts, rock whistles, ice groaning, cracking and singing, ravens, a far wolf | Wolves, an owl |

## Limits

- Ridges, trees and hollows are read off the land's 1 km cells, so on flat ground a wolf's ridge is any far point.
- Thunder rolls from one point on its bearing; a long bolt's parts do not each come from their own place.
- Townsfolk step only through Saltmere's plaza, the steps' recording once loaded, the synthesiser's until then.
- Not tested in a running game with WebGPU: tested offline, through the same code, in an offline audio context.
