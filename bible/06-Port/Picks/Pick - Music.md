---
type: pick
area: Gameplay
verdict: Clean
effort: L
status: ported
dfo_paths:
  - src/systems/gmSynth.js
  - src/systems/song/songPlayer.js
  - src/systems/soundscape/seaScore.js
  - src/systems/gate/gateScore.js
  - src/systems/superDungeon/sdScore.js
  - src/systems/eliteGates/egScore.js
dfo_commit: 1c0fd681
---
# Pick - Music

DFO's own music: its FM voice bank, its song player and the scores it wrote as notes in code. The [[Pick List]] names
"our synthesiser and its written scores" among DFO's Clean pieces, and the owner chose them for No Shores
([[Music and Ambience Come From DFO's Synthesiser]]). How it works now is [[Music]].

## What comes over

- The FM bank: every General MIDI family's voice, the programs with their own articulation, and the drum kit's keys.
- The song player: lookahead scheduling, the stall skip, loops on the bar line, unison voices with a sub and a
  spread, a song's own drums with a click and a body, its level, its press and soft ceiling, and the 30 Hz floor.
- The scores, note for note, renamed: the six sea songs; the gate's war songs and fall (the Wrath); the Hour's three
  wars, its last minute and its fall (the Reckoning); the Spire lord's wake, three phases on one lord's motif, the
  count, the end and the hymn (the Boarding).
- The sea score's law, its arms on the game's waters.

## What stays behind

The HMI decoding, MIDI out, music packs, the song tables of Daggerfall Unity and its music, music box and song
manager; pitch bends, controllers after a song's start and the sustain pedal, which no score uses; the intro's bowed
voices (vibrato, bite, bow, body, ensemble, the bow's arc and sway) and a song's tone; the arena and intro scores; the
Hour's place songs, the Spire's halls, trials, set pieces and its other lords' motifs; every Daggerfall name.

## Our version

- A layer role on every track and drum, and a director that brings a score in a layer at a time on the bar line,
  under a soft ceiling of the music's own at -1 dBFS, so songs crossing and stings over them never clip.
- The boss scores lend their phases to the game's Bosses by their health, with a last stand in a boss's last tenth.
- Measured and changed: every song is floored at 30 Hz (the gate's and the Hour's songs carried a standing offset
  of up to -21.6 dBFS without it); the boss scores' drive is lowered so a first phase sits at -18.5 dBFS under a soft
  ceiling at -3 dBFS, where the ceiling had flattened every peak at -1; the sea songs are 3 dB louder; a cymbal's
  noise loops, so a crash longer than a second rings to its end.
