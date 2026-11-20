---
type: system
status: live
code:
  - client/src/game/audio/ambience/ambience.ts#Ambience
  - client/src/game/audio/ambience/ambience.ts#GAME_HOUR
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
  mosquito. At most 20 sound at once.
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
- **Time of day.** Every rate and bed is set for dawn, day, dusk and night. The game has no clock: its sun stands
  fixed in the afternoon, so every place is heard at 15:00 (`GAME_HOUR`). Night is heard on the sound sheet.
- **Crossfades.** A new place fades in over 4 s as the last fades out, at equal power. Behind a loading veil the
  game shows no place, so the ambience fades to nothing and comes back with the next place. A hidden page fades out.
- **Made off the page.** Beds and calls are made in a worker as a place is first heard, a place's whole set in about
  a second; until they come it is silent. Only the places sounding keep their sounds (about 15 to 22 MB each).
- **Recordings.** Gulls, a crow, a raven, a crowd, parrots, a heron and a lion are also cues on the sound sheet
  ([[Sounds Come From Freesound, Judged on a Test Sheet]]). Once the owner picks one, it plays in place of the
  synthesiser's call; parrots, the heron and the lion have no synthesised call and are silent until picked.
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
- The game has no clock and no weather, so the ambience never hears night, rain or a storm in play.
- Townsfolk step only through Saltmere's plaza, the steps' recording once loaded, the synthesiser's until then.
- Not tested in a running game with WebGPU: tested offline, through the same code, in an offline audio context.
