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
  - client/src/game/audio/music/directorLaw.ts#voyageSongFor
  - client/src/game/audio/music/director.ts#MusicDirector
  - client/src/game/audio/music/director.ts#overlookScores
  - client/src/game/audio/music/hearing.ts#hearFoot
  - client/src/game/audio/music/hearing.ts#hearSea
  - client/src/game/audio/music/seaScore.ts#seaSongs
  - client/src/game/audio/music/wrathScore.ts#wrathScore
  - client/src/game/audio/music/reckoningScore.ts#reckoningScore
  - client/src/game/audio/music/boardingScore.ts#boardingScore
  - client/src/game/audio/music/craft.ts#progression
  - client/src/game/audio/music/greenScore.ts#greenScore
  - client/src/game/audio/music/dryScore.ts#dryScore
  - client/src/game/audio/music/wetScore.ts#wetScore
  - client/src/game/audio/music/coldScore.ts#coldScore
  - client/src/game/audio/music/saltmereScore.ts#saltmereScore
  - client/src/game/audio/music/storyScore.ts#storyScores
  - client/src/game/audio/music/storyStorm.ts#stormSong
  - client/src/game/audio/music/storyBand.ts#THEME
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
- **Writing helps** (`craft.ts`). A score names its plan of sections; writes its harmony a bar at a time
  (`'Em | C/D'`), a bar's chords split where its metre says; holds a chord that follows itself as one note; and
  checks each tune's bars against its metre, so a slip in one note's length cannot shift the rest.
- **A score, written.** A fight score is a song like this, set in `overlookScores` as a family's
  `{ song, cadence, victory, defeat }`:

```ts
const theme = tune('E4:1 G4:1 A4:2 | B4:3 r:1');
const song = makeSong(
  {
    name: 'example-fight',
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
ships within 1,000 m, the fight, whether it lies off a coast to land on, and the sky over it.

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
  savanna, steppe), wet (rainforest, swamp) and cold (tundra). Each family's fight score is one song in layers, with
  a cadence, a victory and a defeat. A family with no score is silent.
- **Bosses.** Captain Brannoc Thule plays the Boarding; High Assessor Corvane plays the Reckoning; any other Boss
  plays the Wrath. The phase is the boss's health: a phase a third, the last stand in its last tenth (the Wrath, with
  none, keeps its third phase). A new phase begins on the bar line.
- **Stings.** A boss engaged plays its wake if its score has one, straight into its first phase. A boss fallen plays
  its fall; the player dead plays the score's defeat. A fight that ends plays the family's cadence, or its victory
  if the player killed a foe in it. A sting holds the next song until it ends; where none is written, silence
  stands in.
- **The sea.** Out of danger a sea song comes now and then, played whole and once through: the sea at night once dusk
  is gone, the still sea in a wind under 4 m/s, the open sea otherwise. After a song 4 to 8 minutes of silence pass
  before another may come, and after any danger or time ashore at least four. None plays in rain or snow, a storm or
  fog; a sky turning foul fades the one playing. As it comes off a coast where it may dock or go ashore, landfall
  plays once through, whatever the sky or the silence, and not again for four minutes.
- **Danger at sea.** A hostile ship closing brings in a sea song's tension; the fight, its fight. The song is chosen
  as the encounter begins and kept to its end: the storm for two hostile ships or one of Elite rank or over, else the
  sea fight.
- **The social space.** Saltmere's theme plays whole there while nothing threatens, the ambience at 0.8.
- **The story.** While the [[Prologue]] plays, each beat tells the director what plays: a song of the story's own in
  the layers of the mood it asks; a silence, let ring out or cut at once (the crash, and the black after it); or the
  fight it plays, heard as any fight. At sea that is the sea's own fight song. On the wreck it is the Boarding's first
  phase in the fight's layers, tense at least, until Thule wakes his own score; the player beaten plays its end. The
  story's songs leave the ambience at 0.8.
- **A wake holds what follows it.** A boss's wake is never heard over the song it leads into, even when that song was
  playing before it: the song begins again once the wake has played.
- **A hidden page** falls silent at once; the music starts again from the song's top when the page is seen, but a
  sea song cut short by it is not begun again.

## The scores

- **The sea**: six songs for a band of fiddle, flute, whistle, accordion, harp and bodhran over strings, horns and
  timpani: the still sea (6/8, D Dorian), the open sea (G), the storm (D Aeolian), the sea at night (3/4, A Dorian),
  landfall (3/4 at 88, D Mixolydian: a homecoming, the fiddle's tune and the whistle's over held strings and horn,
  the harp rolling each chord, the harbour's bell; [[Landfall Is Kept as Made Again]]) and the sea fight (D minor).
- **The Wrath**: D minor on low brass, organ, choir, a tolled bell and low drums; three phases at 132, 138 and 150,
  the third on the Neapolitan; its fall turns to D major.
- **The Reckoning**: C minor and a clock: a broken quarter chime, a harpsichord's escapement, wood blocks ticking;
  three phases at 136, 142 and 152 (the second a canon), a last stand at 160 counting on the bell, and the chime
  mended in C major as the boss falls.
- **The Boarding**: E Phrygian: a broken fanfare on the horn over a crew's drums, low strings, a chant and shrieking
  strings; a two-bar wake, phases at 138, 144 and 152, a last stand at 160, a hymn in E major for the boss's fall,
  and the end for the player's.
- **Green**, the coast, the highland and the woodland: E Dorian in 6/8 at a dotted quarter of 104, a war jig. A
  fiddle's tune runs over the cellos' gallop, a horn's counter-line under it, a bodhran and a big drum; then the
  horn's own broad tune under the fiddle's descant, and a break of horn calls. Its tension is strings gated in
  sixteenths over a heartbeat; its peak puts the whistle an octave over the tune, the choir and the low brass's
  stabs under it. The cadence turns the tune's hemiola home, the victory ends in E major, the defeat lets the call
  fall to the low strings. 80 bars, 92 s round.
- **Dry**, the desert, the savanna and the steppe: A Phrygian with its major third, in 7/8 (two, two, three) at 150.
  An oboe's tune over an oud's ostinato and a darbuka's doum and tek, the strings' counter-line slow under it; then
  the steppe's gallop, repeated notes rising F, G, A. Its tension is cellos rubbing A against B flat in sixteenths
  over a frame drum and a hiss of sand; its peak lays the brass under the tune, the choir in open fifths and stabs on
  the bar. The cadence falls D, C, B flat, A; the victory rises F, G, A into A major; the defeat leaves the oboe
  alone. 64 bars, 90 s round.
- **Wet**, the rainforest and the swamp: F sharp Aeolian in 4/4 at 104, the sixteenths grouped three, three, three,
  three and four. A pan flute's tune over a marimba in that grouping, a clarinet's counter-line low under it,
  congas, log drums and a deep drum; then the clarinet's own tune under the flute's long notes. Its tension is a
  kalimba dripping in dotted eighths, a log drum's heartbeat, insects in a shaker and a bassoon creeping a half
  step; its peak sets the strings an octave over the tune, the voices' oohs and the horns swelling. The cadence
  turns G, C sharp, F sharp minor; the victory rises into F sharp major; the defeat sinks on the clarinet. 48 bars,
  111 s round.
- **Cold**, the tundra: B Aeolian with its flat second borrowed, in 5/4 (three and two) at 120. A horn calls the tune
  over the low strings' ostinato and a taiko, a fiddle's counter-line above, the harmony spaced wide: a low bass and
  open fifths high. Then the fiddle's own tune over the horns. Its tension is high strings shivering in fifths,
  gusts of wind, the strings' wood ticking and the taiko's slow heart; its peak doubles the horn with the brass and
  sets the choir high. The cadence closes on the low B, the victory rises into B major, the defeat falls through C.
  40 bars, 100 s round.
- **The story's songs**, one theme told through six songs ([[Prologue]]) for strings, harp, flute, fiddle, horns, low
  brass, a choir, bells and a celesta. The theme is D, A, B flat, A: a rise of a fifth and a sigh from the minor sixth.
  - The title, 79 in 4/4, 67 s round: first light for the intro's 6 s over the cloud, then the theme on the horn and
    the fiddle with the choir, the brass and the drums as the camera goes down to Saltmere and the title rises; then,
    as the game waits, its answer on the flute over the cello, and the title's quiet bars.
  - The storm, 112: the low strings drive in eighths with the theme's sigh in them, the theme slowed on the horns.
  - The calm, 66: the theme on one flute, its answer on the fiddle.
  - The ram, 96, played once: the Boarding's E against F, swelling bar by bar, cut by the crash.
  - The deep, 54: the theme slowed on voices, a celesta glinting its first notes high.
  - The shore, 76: the theme raised to D major, its sixth a B natural, ending on D, which leads into Saltmere's G.
- **Saltmere's theme**: G major in 3/4 at 126, a folk waltz with the lilt on its second beat, 183 s round. Its tune
  climbs G, A, B, D in a dotted step and leans on the sixth. It passes from the flute to the fiddle with the cello
  under it, to the accordion's second tune under the fiddle's descant, to the cello in E minor over the harp for a
  quiet passage, a tide of harp and flute alone, a dance the whistle, fiddle, flute and accordion trade two bars at a
  time, the second tune on the fiddle and flute with the horn under it, and the whole band. A lute strums the waltz
  over a plucked bass and a warm pad; hand drums keep it light under the harbour's sounds.

Loudness at the full Music volume, measured: the boss scores' first phases -18 to -18.5 dBFS, their later phases
rising to -16, peaks -4 to -8 dBFS under a soft ceiling at -3; the families' fights -17.5 to -18 dBFS, peaks about
-5 dBFS under a soft ceiling at -3, their peak layers half a decibel over the fight; the sea's fights -20 to -22
dBFS, peaks -2 to -6; a tension 4 to 6 dB under its fight; Saltmere's theme -21.7 dBFS, 3.7 dB under a fight; the
story's songs -20 to -22.8 dBFS, the deep -24.3 under the sea, the ram -18.4 as it swells.

## Limits

- One fight score serves every climate of its family: the coast and the highland share green's.
- Saltmere's theme begins from its top each time the player comes into the social space.
- The sea songs out of danger play while it is at sea, whether it is under way or hove to.
- A boss's score is chosen by the name over its bar.
- At its peak a family's fight renders 12 to 15 times faster than it plays in headless Chromium: under a tenth of one
  audio core.
