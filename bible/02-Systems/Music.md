---
type: system
status: live
code:
  - client/src/game/audio/music/fmBank.ts#fmVoice
  - client/src/game/audio/music/fmBank.ts#drumOf
  - client/src/game/audio/music/score.ts#makeSong
  - client/src/game/audio/music/score.ts#ROLES
  - client/src/game/audio/music/songPlayer.ts#SongPlayer
  - client/src/game/audio/music/directorLaw.ts#hear
  - client/src/game/audio/music/directorLaw.ts#MOOD_ROLES
  - client/src/game/audio/music/director.ts#MusicDirector
  - client/src/game/audio/music/director.ts#overlookScores
  - client/src/game/audio/music/hearing.ts#hearFoot
  - client/src/game/audio/music/hearing.ts#hearSea
  - client/src/game/audio/music/seaScore.ts#seaSongs
  - client/src/game/audio/music/wrathScore.ts#wrathScore
  - client/src/game/audio/music/reckoningScore.ts#reckoningScore
  - client/src/game/audio/music/boardingScore.ts#boardingScore
---
# Music

The game's music: DFO's own FM synthesiser playing scores written as notes in code, synthesised while the game runs
([[Music and Ambience Come From DFO's Synthesiser]], [[Pick - Music]]). Roaming is silent, ambience alone; music comes
as danger nears, grows into the fight a layer at a time on the bar line, and falls back to silence when it ends.

## How it works

- **The voice bank.** Two-operator FM: a modulator sine bends a carrier's pitch, its depth settling over the note as
  a struck or blown sound dulls. Each General MIDI family has a voice; a harp, pizzicato, timpani, bells and a few
  more have their own articulation. Channel 9 is the drums: a sine falling in pitch, or a band of noise.
- **The player.** It wakes ten times a second and schedules the next quarter second's notes at their exact times. A
  page that stalls past that skips the gap. A song loops on its bar line to the tick. A score may give a track its
  own voice: unison copies a few cents apart, spread across the stereo, with a sub an octave under. Drums may carry a
  beater's click or a skin's body. Every song is high-passed at 30 Hz. A song may play through a press: a compressor
  under a soft ceiling. The whole plays at 0.22 into the Music bus ([[Interface]]), under a soft ceiling of the
  music's own at -1 dBFS, so songs crossing and stings over them never clip.
- **The score format.** A score lays notes with `note(track, bar, beat, beats, pitch, velocity)` and drums with
  `hit(drum, bar, beat, velocity)`, beats in quarter notes. `tune` reads a line as text (`'A4:1.5 D5:.5 | r:1'`).
  Each track names its program, level, place and layer role, and may name its own voice. A drum may have a role of
  its own. One note a key a moment: a note laid on one already struck is that note, its loudest and longest.
- **A score, written.** A fight score for the green family is a song like this, set in `overlookScores` as
  `green: { song }`:

```ts
const theme = tune('E4:1 G4:1 A4:2 | B4:3 r:1');
const song = makeSong(
  {
    name: 'green-fight',
    bpm: 120,
    bars: 8,
    tracks: {
      pad: { program: 89, volume: 90, pan: 64, role: 'bed' },
      lead: { program: 73, volume: 100, pan: 70, role: 'lead', voice: { unison: 2, cents: 6, spread: 0.2 } },
    },
    kit: { volume: 100, role: 'combat', keys: { kick: 36, snare: 38 }, roles: { kick: 'tension' } },
  },
  (w) => {
    for (let bar = 0; bar < 8; bar++) {
      w.note('pad', bar, 0, 4, 'E3', 80);
      w.hit('kick', bar, 0, 100);
      w.hit('snare', bar, 2, 90);
    }
    lay(w, 'lead', 0, theme, 96);
  },
);
```

- **Layers.** The roles in the order the director brings them in: `bed` (the harmony's floor), `tension` (the colour
  of danger: bells, a swell, high strings, a heartbeat drum), `pulse` (an ostinato, a clock), `combat` (the drums,
  the timpani), `lead` (the tune), `peak` (the choir, the orchestra hit, a theme doubled). Only the notes of the
  layers playing are built.

## The director

Each frame it hears where the player is (the social space, an island and its climate, or the sea), the
player's health, the blows they gave and took, and every foe's rank, alert, distance and health; at sea, the hostile
ships within 1,000 m and the fight.

| Mood | When | Layers | Level | Ambience |
|---|---|---|---|---|
| Silent | Nothing threatens | none | | whole |
| Tension | A foe within 40 m alert or searching; at sea, a hostile ship closing | bed, tension | 0.7 | 0.85 |
| Combat | A blow given or taken, or a foe targeting the player | and pulse, combat, lead | 1 | 0.6 |
| Peak | Three foes engaged, an Elite or a Miniboss, or the player at 35% health or under | all | 1 | 0.6 |
| Boss | A Boss engaged | all, its own score | 1 | 0.4 |

- **Holding and resolving.** The fight holds 6 s after its last blow or engagement, the peak 8 s, the tension 4 s.
  A fight that ends fades over two bars from its next bar line. Layers come and go on the next bar line; a layer let
  go fades over two beats while its notes ring out. A new song begins on the old one's bar line as the old fades
  over a beat, so two tempos never sound together for long; a song still fading out is brought back where it stands.
  A boss's fall ends its fight: only a foe still engaged keeps the music going.
- **Fight scores.** Each island's climate is in a family: green (temperate coast, highland, woodland), dry (desert,
  savanna, steppe), wet (rainforest, swamp) and cold (tundra). Each family's fight score is one song in layers, and
  may carry a cadence, a victory and a defeat. None is written yet, so a fight on an island is silent.
- **Bosses.** Captain Brannoc Thule plays the Boarding; High Assessor Corvane plays the Reckoning; any other Boss
  plays the Wrath. The phase is the boss's health: a phase a third, the last stand in its last tenth (the Wrath, with
  none, keeps its third phase). A new phase begins on the bar line.
- **Stings.** A boss engaged plays its wake if its score has one, straight into its first phase. A boss fallen plays
  its fall; the player dead plays the score's defeat. A fight that ends plays the family's cadence, or its victory
  if the player killed a foe in it. A sting holds the next song until it ends; where none is written, silence
  stands in.
- **The sea.** Sailing is silent. A hostile ship closing brings in a sea song's tension; the fight, its fight. The
  song is chosen as the encounter begins and kept to its end: the storm for two hostile ships or one of Elite rank or
  over, else the sea fight.
- **The social space.** Saltmere's theme plays whole there while nothing threatens, the ambience at 0.8. It is not
  written yet, so the social space is silent.
- **A hidden page** falls silent at once; the music starts again from the song's top when the page is seen.

## The scores

- **The sea**: six songs for a band of fiddle, flute, whistle, accordion, harp and bodhran over strings, horns and
  timpani: the still sea (6/8, D Dorian), the open sea (G), the storm (D Aeolian), the sea at night (3/4, A Dorian),
  landfall (a jig in D) and the sea fight (D minor).
- **The Wrath**: D minor on low brass, organ, choir, a tolled bell and low drums; three phases at 132, 138 and 150,
  the third on the Neapolitan; its fall turns to D major.
- **The Reckoning**: C minor and a clock: a broken quarter chime, a harpsichord's escapement, wood blocks ticking;
  three phases at 136, 142 and 152 (the second a canon), a last stand at 160 counting on the bell, and the chime
  mended in C major as the boss falls.
- **The Boarding**: E Phrygian: a broken fanfare on the horn over a crew's drums, low strings, a chant and shrieking
  strings; a two-bar wake, phases at 138, 144 and 152, a last stand at 160, a hymn in E major for the boss's fall,
  and the end for the player's.

Loudness at the full Music volume, measured: the boss scores' first phases -18 to -18.5 dBFS, their later phases
rising to -16, peaks -4 to -8 dBFS under a soft ceiling at -3; the sea's fights -20 to -22 dBFS, peaks -2 to -6; a
tension 4 to 6 dB under its fight.

## Limits

- The families' fight scores and Saltmere's theme wait on the composer; until then those places are silent.
- The still sea, the open sea, the sea at night and landfall play nowhere yet: sailing is ambience alone.
- A boss's score is chosen by the name over its bar.
