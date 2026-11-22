---
type: pick
area: Gameplay
verdict: Clean
effort: M
status: ported
dfo_paths:
  - src/systems/soundscape/soundBeds.js
  - src/systems/soundscape/bedDsp.js
  - src/systems/soundscape/seaAir.js
  - src/systems/soundscape/worldAir.js
  - src/systems/soundscape/soundJobs.js
  - src/systems/soundscape/soundWorker.js
  - src/systems/soundscape/clipInstall.js
  - src/systems/soundscape/soundscapeSfx.js
  - src/scenes/soundscapeHost.js
  - src/systems/wind/windAudio.js
  - tools/soundscapeSfx.mjs
  - tools/sfxSynth.mjs
dfo_commit: 1c0fd681
---
# Pick - Soundscape

DFO's soundscape: the sea's air on a deck, the shore's surf, the wild by climate and hour, and a town's street, from
beds and calls its own synthesiser made off the main thread. The owner chose it as the root of Overlook's ambience
([[Music and Ambience Come From DFO's Synthesiser]]).

## What comes over

- The beds' way: seeded noise cut by second-order sections, each run twice over its loop so it has no seam, levelled
  last, and made in a worker one job at a time, with the page's thread as the fallback.
- The sea's laws: its swell on three long waves, the wash past the hull by the ship's way a beat behind the swell, the wind
  in its rigging, and gulls only near a coast.
- The shore's breakers: each wave curling, crashing and running back, a crash heard as its own sound when near.
- The wild's voices and their clocks: crows, owls, wolves, jackals and frogs at random gaps by the time of day, placed
  round the listener.
- The synthesiser kit (noise, sections, modes, bursts, bubbles, groans, splashes, a bell's note) and its surf crash,
  owls and wolf howls.
- The wind's bed and its law of gusts, now a gain, a filter and a pitch on every windy bed.

## What stays behind

- Everything that reads Daggerfall: DAGGER.SND's people, bell and lap of water, the town murmur and tavern made of
  them, the map's pixels and climate tables, and the bells struck on the world's clock.
- The CC0 recordings DFO baked from OpenGameArt (gulls, crows, frogs, anvils): Freesound's picks take their place.
- The sea's songs (`seaScore.js`): the music is its own system.
- The enhanced-sounds switch, the clip installer, and DFO's audio engine: the ambience plays through the game's own
  buses.

## Our version

[[Ambience]]: eleven ambiences of our own, each with its own beds, voices, room and time of day, its calls placed in
3D round the listener, and Freesound for the calls the synthesiser cannot make convincing.
