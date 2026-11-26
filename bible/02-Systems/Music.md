---
type: system
status: live
code:
  - client/src/game/audio/music/fmBank.ts#fmVoice
  - client/src/game/audio/music/directorLaw.ts#courtPart
  - client/src/game/audio/music/fmBank.ts#drumOf
  - client/src/game/audio/music/score.ts#makeSong
  - client/src/game/audio/music/score.ts#ROLES
  - client/src/game/audio/music/songPlayer.ts#SongPlayer
  - client/src/game/audio/music/form.ts#makeForm
  - client/src/game/audio/music/form.ts#Arranger
  - client/src/game/audio/music/form.ts#takeAfter
  - client/src/game/audio/music/form.ts#openingOf
  - client/src/game/audio/music/directorLaw.ts#hear
  - client/src/game/audio/music/directorLaw.ts#MOOD_ROLES
  - client/src/game/audio/music/directorLaw.ts#voyageSongFor
  - client/src/game/audio/music/director.ts#MusicDirector
  - client/src/game/audio/music/director.ts#overlookScores
  - client/src/game/audio/music/hearing.ts#hearFoot
  - client/src/game/audio/music/hearing.ts#hearSea
  - client/src/game/audio/music/seaScore.ts#seaSongs
  - client/src/game/audio/music/seaFights.ts#seaFight
  - client/src/game/audio/music/seaFights.ts#seaStorm
  - client/src/game/audio/music/wrathScore.ts#wrathScore
  - client/src/game/audio/music/reckoningScore.ts#reckoningScore
  - client/src/game/audio/music/boardingScore.ts#boardingScore
  - client/src/game/audio/music/craft.ts#progression
  - client/src/game/audio/music/greenScore.ts#greenScore
  - client/src/game/audio/music/dryScore.ts#dryScore
  - client/src/game/audio/music/wetScore.ts#wetScore
  - client/src/game/audio/music/coldScore.ts#coldScore
  - client/src/game/audio/music/calm.ts#calmPiece
  - client/src/game/audio/music/socialPieces.ts#socialPieces
  - client/src/game/audio/music/islandPieces.ts#islandPieces
  - client/src/game/audio/music/islandPiecesMore.ts#moreIslandPieces
  - client/src/game/audio/music/seaPieces.ts#seaPieces
  - client/src/game/audio/music/score.ts#CEILING_NOTE
  - client/src/game/audio/music/songPlayer.ts#depthOf
  - client/src/game/audio/music/storyScore.ts#storyScores
  - client/src/game/audio/music/storyStorm.ts#stormSong
  - client/src/game/audio/music/storyBand.ts#THEME
  - client/src/game/audio/music/sampled.ts#sampledNote
  - client/src/game/audio/music/sampled.ts#rateOf
  - client/src/game/audio/music/sampled.ts#playsOf
  - client/src/soundSamples.ts#recordingOf
  - client/src/game/audio/music/valeTakes.ts#valeSong
  - client/src/game/audio/music/valeScore.ts#valeFights
  - client/src/game/audio/music/valeBosses.ts#valeBosses
  - client/src/game/audio/music/valeCalm.ts#valeCalm
  - client/src/game/audio/music/breachHearing.ts#hearBreach
  - client/src/game/audio/music/breachHearing.ts#momentOf
  - client/src/game/audio/music/director.ts#askedSting
  - client/src/game/audio/music/vale.ts#valeMusic
  - client/src/game/audio/music/sampled.ts#lowpassInto
  - tools/freesound/root.py
---
# Music

The game's music: DFO's own FM synthesiser playing scores written as notes in code, synthesised while the game runs
([[Music and Ambience Come From DFO's Synthesiser]], [[Pick - Music]]); the Drowned Vale's scores are written for
instruments recorded on Freesound ([[The Drowned Vale Has Its Own Music and Ambience From Freesound]]), each played on
its pick once the owner has picked it and on the synthesiser until then. Out of danger a calm piece comes now and then,
at sea, in the social space and on the islands, with minutes of silence between pieces
([[Every Sound Comes From Freesound, and the Music Rests Between Pieces]]); music comes as danger nears, grows into the
fight a layer at a time on the bar line, and falls back to silence when it ends. A fight's music never plays the same
bars over for minutes, nor opens the way the last fight did: each fight song is written as takes, recombined as it
plays ([[The Fight Music Varies, Recombined From Takes]]); each place has pieces and takes enough that minutes pass
before any repeats ([[The Music Repeats Less, Patrol Zones First]]). Nothing in it rings or whines: no note sounds
over B5, no note's partials reach past 6 kHz, no struck tone over
1.5 kHz lasts past a tenth of a second, and no fight sweeps a pitched swell: its risers and gusts are noise.

## How it works

- **The voice bank.** Two-operator FM: a modulator sine bends a carrier's pitch, its depth settling over the note as
  a struck or blown sound dulls. A note's depth is held so its carrier and widest sidebands stay under 6 kHz
  (`depthOf`): a high note dulls rather than rings, or folds back into the band as a whine; a low or middle note
  keeps its voice's whole depth. Each General MIDI family has a voice; a harp, pizzicato, timpani, bells and a few
  more have their own articulation. Channel 9 is the drums: a sine falling in pitch, or a band of noise.
- **The player.** It wakes ten times a second and schedules the next quarter second's notes at their exact times. A
  page that stalls past that skips the gap. A song loops on its bar line to the tick; a song written as takes plays,
  at each seam, the take its arranger chooses, again on the bar line and to the tick. A score may give a track its
  own voice: unison copies a few cents apart, spread across the stereo, with a sub an octave under. Drums may carry a
  beater's click or a skin's body. Every song is high-passed at 30 Hz. A song may play through a press: a compressor
  under a soft ceiling. The whole plays at 0.22 into the Music bus ([[Interface]]), under a soft ceiling of the
  music's own at -1 dBFS, so songs crossing and stings over them never clip.
- **Sampled voices** (`sampled.ts`). A track may name a `music.*` cue of `content/audio/freesound.json`, its
  envelope (attack, release) and its gain; a drum of a kit may too. Each note plays the pick's recording, fetched as
  the world's recordings are (`recordingOf`), at playbackRate 2^((note - root)/12), into the track's level and place
  as an FM note goes. The root is the pick's measured pitch with its cents ("C3-38", 38 cents flat of C3), which
  `tools/freesound/root.py` finds by YIN over the preview's steady middle; it is written on the cue in
  freesound.json and `publish.py` copies it onto the pick in `sounds.json`, where the page reads it. A textural or
  percussive cue has none and plays from the note its score names its home. A note longer than the recording plays
  on in further plays of its middle (from a quarter in), each crossfaded into the last at equal power. A drum plays
  its recording `shift` semitones off, shaped as its kit drum is (rising over its attack, dying over its decay), the high ones
  (metal, the bowed cymbal, the riser) cut a tenth of a second after their peak; a swell is started, or entered
  part way, so its recording ends on the beat the kit drum's lands on. Each channel's sampled voices pass two
  lowpasses in a row at 5.6 kHz (24 dB an octave; 8 kHz some 20 dB down), so no partial of a recording played high
  passes the music's ceiling; the score's B5 ceiling, the 30 Hz high-pass and the soft ceilings hold for it as for
  the FM bank. Until a recording has come, or while a pitched cue has no pick or no root, the track plays its FM
  program, the drum the kit's own. The Breach's instruments are fetched as its gate or its run is first heard, and
  let go on leaving it, so its fights open on recordings.
- **The score format.** A score lays notes with `note(track, bar, beat, beats, pitch, velocity)` and drums with
  `hit(drum, bar, beat, velocity)`, beats in quarter notes. `tune` reads a line as text (`'A4:1.5 D5:.5 | r:1'`).
  Each track names its program, level, place and layer role, and may name its own voice. A drum may have a role of
  its own. One note a key a moment: a note laid on one already struck is that note, its loudest and longest. Nothing
  pitched sounds over B5 (`CEILING_NOTE`): a track that reaches past it plays an octave down, the whole of it where
  that keeps it at or over G3, its line kept whole, else only its notes over the ceiling. No drum rings: a struck tone
  over 1.5 kHz dies within a tenth of a second, in the bank and in every score's own kit.
- **Writing helps** (`craft.ts`). Writes its harmony a bar at a time
  (`'Em | C/D'`), a bar's chords split where its metre says; holds a chord that follows itself as one note; and
  checks each tune's bars against its metre, so a slip in one note's length cannot shift the rest.
- **A score, written.** A fight score is a song written as takes (`makeForm`), set in `overlookScores` as a family's
  `{ song, cadence, victory, defeat }`. Each take names its section, its length, the sections that may follow it and
  whether a fight may open on it, and lays its notes from its own bar 0; a note laid past its edges stays inside it:

```ts
const theme = tune('E4:1 G4:1 A4:2 | B4:3 r:1');
const vamp = (snare: number) => (w: Writer<'pad' | 'lead', 'kick' | 'snare'>) => {
  for (let bar = 0; bar < 8; bar++) {
    w.note('pad', bar, 0, 4, 'E3', 80);
    w.hit('kick', bar, 0, 100);
    w.hit('snare', bar, snare, 90);
  }
};
const song = makeForm(
  {
    name: 'example-fight',
    bpm: 120,
    tracks: {
      pad: { program: 89, volume: 90, pan: 64, role: 'bed' },
      lead: { program: 73, volume: 100, pan: 70, role: 'lead', voice: { unison: 2, cents: 6, spread: 0.2 } },
    },
    kit: { volume: 100, role: 'combat', keys: { kick: 36, snare: 38 }, roles: { kick: 'tension' } },
  },
  [
    { section: 'vamp', bars: 8, next: ['tune'], opens: true, write: vamp(2) },
    { section: 'vamp', bars: 8, next: ['tune'], opens: true, write: vamp(1.5) },
    {
      section: 'tune',
      bars: 8,
      next: ['vamp'],
      write: (w) => {
        vamp(2)(w);
        lay(w, 'lead', 0, theme, 96);
      },
    },
  ],
);
```

- **Takes.** A fight song is its takes laid end to end, one song with one set of tracks, so the ceiling and the
  layers hold across all of them. The takes of a section share its harmony and its tune and differ in how they are
  played: each family's and each boss's takes come in three feels (the drums' groove and fills, the bass's figure,
  the pulse's figure, the strings' voicing, and the danger's own figures, a gate, a heartbeat, a rub, drips or the
  clock's woods). Two takes of a section differ in every bar, even in the tension's layers alone: they are in
  different feels, or a turned take's chords and its voicing set it apart; and no two takes of a song are the same in
  the tension's layers. Some takes answer the tune (one instrument
  states it, another takes its second half) or set it over turned chords, and every song but the last stands has a
  breakdown where the drums thin and the tune's head comes back alone.
- **The arranger** (`Arranger`, one for every player of the director, its die the director's) chooses each take at
  its seam: one of a section the take before may lead to, never the same take twice running; a pairing of takes not
  yet heard before one heard (else the one heard longest ago), and among those a take heard longest ago, by the die.
  A fight opens on one of its opening takes (a vamp, an intro, a break of calls, a breakdown), never the one the last
  fight on that song opened on. The arranger remembers each song's last 64 takes and breaks between fights across its fights, so a run of short
  fights each hears different music.
- **Layers.** The roles in the order the director brings them in: `bed` (the harmony's floor), `tension` (the colour
  of danger: bells, a swell, high strings, a heartbeat drum), `pulse` (an ostinato, a clock), `combat` (the drums,
  the timpani), `lead` (the tune), `peak` (the choir, the orchestra hit, a theme doubled). Only the notes of the
  layers playing are built.

## The director

Each frame it hears where the player is (the social space, an island and its climate, a Breach's run, or the sea),
the
player's health, the blows they gave and took, and every foe's rank, alert, distance and health (an ally fighting on
the players' side is no foe); at sea, the hostile ships within 1,000 m, the fight, whether it lies off a coast to land
on, and the sky over it.

| Mood | When | Layers | Level | Ambience |
|---|---|---|---|---|
| Silent | Nothing threatens: a calm piece now and then, else silence | the piece's all | 1 | 0.8 under a piece |
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
  savanna, steppe), wet (rainforest, swamp) and cold (tundra). Each family's fight score is one song in layers,
  written as takes, with two cadences, two victories and a defeat. A family with no score is silent.
- **Bosses.** Captain Brannoc Thule plays the Boarding; High Assessor Corvane plays the Reckoning; any other Boss
  plays the Wrath. The phase is the boss's health: a phase a third, the last stand in its last tenth (the Wrath, with
  none, keeps its third phase). An Elite Dungeon's Boss, whose wards hold its health at two thirds and one third,
  plays its phase by its wards broken instead, its last stand still by its health (`courtPart`). A new phase begins on the bar line, on one of its opening takes.
- **Stings.** A boss engaged plays its wake if its score has one, straight into its first phase. A boss fallen plays
  its fall; the player dead plays the score's defeat. A fight that ends plays the family's cadence, or its victory
  if the player killed a foe in it; a family has two of each, heard in turn (`stingOf`). A sting holds the next song
  until it ends; where none is written, silence
  stands in.
- **Calm pieces.** Out of danger a calm piece comes now and then, played whole and once through, the ambience at 0.8
  under it; none in rain or snow, a storm or fog, and a sky turning foul fades the one playing. Each place has its own
  pieces and silences (`RESTS`): at sea the sky's two in turn (the sea at night's once dusk is gone, the still sea's
  in a
  wind under 4 m/s, the open sea's otherwise), 4 to 8 minutes of silence after it, the first at least four minutes after
  arriving or after danger; in the social space one of its four, 2½ to 5 minutes of silence after it, the first half
  a minute after arriving; on an island one of its family's four, 5 to 9 minutes of silence after it, the first two
  minutes after arriving or after danger. A piece is never the one begun last in its place while there is another. As
  the ship comes off a coast where it may dock or go ashore, landfall plays once through, whatever the sky or the
  silence, and not again for four minutes.
- **Danger at sea.** A hostile ship closing brings in a sea song's tension; the fight, its fight. The song is chosen
  as the encounter begins and kept to its end: the storm for two hostile ships or one of Elite rank or over, else the
  sea fight.
- **A Breach** (`hearBreach`, from the room's `BreachSeen` and the space the player stands over, `spaceAt`). In a
  run the song of the encounter under way plays in place of the island family's, or, with none under way, the
  song of the encounter fought in the space the player stands in (the Waking's between spaces); an encounter running
  holds at least the tension (the page's), its foes bring the fight's layers as any fight does, and its moments
  (begun, won, a wipe) are the cadence, victory and defeat of the encounter the room tells them of, wherever the
  player stands (`momentOf`, `askedSting`); the Steward's encounter plays the Two Shores' cadence and defeat, and its
  win, the Breach cleared, the Steward's fall. The zone hears no other company's clear, and an event of the zone's
  own plays its own sting under its banner. The Scrivener and the Steward play their own boss
  scores by the names over their bars, the Scrivener from its waking, the Steward's court from its encounter's start
  whether or not the Steward is engaged; the Steward's fall is the Breach cleared. While a Watcher has seen the
  company the Ways play their peak. Between encounters a calm piece comes after 20 s, and 45 to 120 s of silence
  after one: the Descent's in the Descent, the Broken Stair's on the Stair, After the Bells elsewhere, never the
  one begun last while there is another. At the Sunken
  Gate, while the player's company holds the Waking and the Spire has not woken, the Waking's song plays as the
  hollow's fight.
- **The story.** While the [[Prologue]] plays, each beat tells the director what plays: a song of the story's own in
  the layers of the mood it asks; a silence, let ring out or cut at once (the crash, and the black after it); or the
  fight it plays, heard as any fight. At sea that is the sea's own fight song. On the wreck it is the Boarding's first
  phase in the fight's layers, tense at least, until Thule wakes his own score; the player beaten plays its end. A death
  before Thule is not heard as one (`heardOnWreck`): the player rises at the last checkpoint in seconds, and the
  Boarding plays on. Its
  tension, heard for minutes on the wreck, changes take by take: the taiko's heartbeat, the bass's strikes, the
  strings' voicing, the bell, a soft shriek, the organ swelling into a rising take, the chords turned. The story's
  songs leave the ambience at 0.8.
- **A cut sting lets in what waits.** A new fight cuts a sting short on its bar line, and a song already waiting
  behind the sting comes in there, where the sting now ends, not where it would have.
- **A wake holds what follows it.** A boss's wake is never heard over the song it leads into, even when that song was
  playing before it: the song begins again once the wake has played.
- **A hidden page** falls silent at once; the music starts again when the page is seen, from the song's top or, for
  a fight, on an opening take, but a sea song cut short by it is not begun again.

## The scores

- **The calm pieces** (`calm.ts`), weathered and never happy, each its own data laid by one hand: a pad swelling
  under the harmony, a bass held or pulsing (struck, then let go before the next, as if pressed down by the beat), an
  ostinato over the chords' own tones, the tune and its counter-line, soft low drums; every chord voiced by hand. Each
  closes on the world's leitmotif in its key, the story's rise of a fifth and sigh from the minor sixth. A minute and
  a half to two and a half each.
  - Saltmere's: its own theme, the climb G, A, B flat, D in a dotted step leaning on the sixth, in G Dorian in 3/4 at
    76 on the cello then the fiddle over a harp and a pulsing bass; Lamplight, a nocturne in D minor at 62, a low
    flute over the piano, the horn answering; the Tithe, E Phrygian at 70, low strings ticking E against F under a
    bassoon and a far taiko, the levy's weight; the Ropewalk, C Dorian at 80, the oboe over plucked strings, the horn
    answering. The plaza's band (`band.ts`, `bandScore.ts`) plays where it stands, through the silences between pieces
    as through a piece, and a piece gives way to it near it.
  - The islands', four to a family (`islandPieces.ts`, `islandPiecesMore.ts`): green, Moorlight (E Aeolian in 6/8, a
    low whistle over a rolling harp) and Cairn
    (E Dorian, horn calls over a pulsing piano); dry, Sunscorch (A Phrygian dominant, an oud's ostinato under the
    oboe) and Dust Road (F sharp Phrygian, a lone cello over a sparse harp); wet, Mistwrack (F sharp Aeolian, a low
    marimba in three, three and two under the clarinet) and Fen (C sharp minor, a bassoon over a kalimba dripping);
    cold, Rime (B Aeolian, a horn over open fifths) and Whiteout (B Phrygian at 56, the cello over the piano's half
    notes). And a second pair each: green, Bracken (A Dorian at 72, a fiddle over plucked strings) and Barrow (D
    Aeolian in 3/4 at 58, the cello over a slow harp); dry, Mirage (D Phrygian dominant in 7/8 at 80, a low flute
    over the oud) and Caravan (G harmonic minor in 3/4 at 63, a low clarinet, the horn answering); wet, Mangrove (C
    Aeolian in 6/8 at 70, a low flute over the marimba, the bassoon under it) and Peat (A Aeolian in 5/4 at 64, the
    oboe over a kalimba); cold, Floe (E Aeolian in 3/4 at 60, a flute over the harp and open fifths) and Polar Night
    (C sharp Aeolian in 5/4 at 66, a fiddle over plucked strings). No two of a family share a tempo or a lead.
  - The sea's, two to a sky: Open Water (D Dorian in 6/8, a horn over the harp's long swell) and the Long Swell (E
    Dorian at 76, a fiddle over the harp); Still Water (A minor at 56, a low flute over the piano's quarters) and Glass
    (F Aeolian at 52, a low clarinet over the harp, a flute far over it); Night Watch (G minor in 3/4, the cello over a
    soft piano) and the Lantern (C minor in 3/4 at 62, the oboe over the piano, the horn low).
- **The sea's band**: three songs for fiddle, flute, whistle, harp and bodhran over strings, horns and timpani: the
  storm (D Aeolian), landfall (3/4 at 88, D Mixolydian: a homecoming, the fiddle's tune and the whistle's over held
  strings and horn, the harp rolling each chord, the harbour's bell; [[Landfall Is Kept as Made Again]]; its whistle
  now an octave down, under the ceiling) and the sea fight (D minor). The storm (`seaFights.ts`) is twelve takes: the
  drive growing in, the horn's theme (on the strings, with the brass, or answered over turned chords), the second
  harmony's unrest (bare, or with a line on the horn or the strings) and the breath of drive, choir and bass, each in
  one of three feels of the drive, the bass, the timpani and the choir's voicing. The sea fight is twelve: an intro of
  stabs or a fiddle's pickup, the brass's tune (on the fiddle and strings, with the horns, or answered over turned
  chords), its second strain, and a break where the drums thin to the drive under the tune's head; each in one of
  three feels of the drive, the timpani, the bass, the strings and the march. A take sharing its feel with another of
  the same harmony (each song's turned take, and the sea fight's intro of stabs beside its first strain) voices its
  choir or its strings as another feel does.
- **The Wrath**: D minor on low brass, organ, choir, a tolled bell and low drums; three phases at 132, 138 and 150,
  the third on the Neapolitan; its fall turns to D major. Each phase is twelve takes: the march of stabs, the theme
  (its own, or the one it recalls with the strings over it), the theme answered by the strings, in full, over turned chords,
  and the drums stopped to the ostinato and the surdo under the theme's head; the march and the stopped drums voice
  the strings as the next feel does.
- **The Reckoning**: C minor and a clock: a broken quarter chime, a harpsichord's escapement, wood blocks ticking;
  three phases at 136, 142 and 152 (the second a canon), a last stand at 160 counting on the bell, and the chime
  mended in C major as the boss falls. Each phase is twelve takes: the clock alone, the theme, the theme answered (or
  the canon turned round), in full, over turned chords, and the clock stopped to its woods and its chime (a change of
  it the theme's takes do not toll); the last stand is nine: counting, tolling with the changes struck in turn and
  the strings voiced as the next feel does, and hammered from D-flat.
- **The Boarding**: E Phrygian: a broken fanfare on the horn over a crew's drums, low strings, a chant and shrieking
  strings; a two-bar wake, phases at 138, 144 and 152, a last stand at 160, a hymn in E major for the boss's fall,
  and the end for the player's. Each phase is eleven takes: rising (the organ swelling), the motif called and the
  horn answering, driven with the motif hammered twice, the horn leading over turned chords, and a breakdown to the
  taiko and the chant, the rising and driven takes voicing the strings as the next feel does; the last stand is
  nine: counting, at its height, and hammered from F.
- **Their feels.** Each boss's takes come in three feels: the Boarding's kick, taiko heartbeat, toms, hats, fills,
  bass strikes, ostinato's lean, low strings' figure and voicing; the Reckoning's escapement figures, woods, surdo,
  bass, voicing, kick and fills; the Wrath's ostinato accents, bass, voicing, surdo, bell and drums.
- **Green**, the coast, the highland and the woodland: E Dorian in 6/8 at a dotted quarter of 104, a war jig. A
  fiddle's tune runs over the cellos' gallop, a horn's counter-line under it, a bodhran and a big drum; then the
  horn's own broad tune under the fiddle's descant, and a break of horn calls. Its tension is strings gated in
  sixteenths over a heartbeat; its peak sets the choir and the low brass's stabs under the tune, and noise swells
  into each section. The cadence turns the tune's hemiola home, the victory ends in E major, the defeat lets the call
  fall to the low strings; its second cadence lets the horn's last phrase fall home over A minor and B minor, its second
  victory runs the gale's rise on the fiddle into E major. Twenty-seven takes of eight bars, 249 s of music: three
  vamps, the tune's two halves six ways each (each feel over its own chords and over the turned ones: over the
  counter-line, answered by the horn, in octaves), the horn's tune's two halves three
  ways each (under the descant, with the fiddle an octave over, or on the fiddle over the horn held low), two breaks
  of calls (the horn's or the fiddle's) and three breakdowns (the call slowed on the fiddle or the horn over the
  gallop).
- **Dry**, the desert, the savanna and the steppe: A Phrygian with its major third, in 7/8 (two, two, three) at 150.
  An oboe's tune over an oud's ostinato and a darbuka's doum and tek, the strings' counter-line slow under it; then
  the steppe's gallop, repeated notes rising F, G, A. Its tension is cellos rubbing A against B flat in sixteenths
  over a frame drum and a hiss of sand; its peak lays the brass under the tune, the choir in open fifths and stabs on
  the bar. The cadence falls D, C, B flat, A; the victory rises F, G, A into A major; the defeat leaves the oboe
  alone; the second cadence falls G, F, E to A, the second victory leaps D, F, A and G, B flat, A into A major.
  Twenty-seven takes, 302 s: three vamps, the tune's halves six ways each (each feel over its own chords and over the
  turned ones), the gallop's halves three ways each (on the oboe, on the strings, or traded two bars at a time), three
  breaks (the oboe's calls, or the strings' answered) and three breakdowns.
- **Wet**, the rainforest and the swamp: F sharp Aeolian in 4/4 at 104, the sixteenths grouped three, three, three,
  three and four. A low clarinet's tune over a marimba in that grouping, a second clarinet's counter-line under it,
  congas, log drums and a deep drum; then the second clarinet's own tune under the first's long notes. Its tension is
  a kalimba dripping in dotted eighths, a log drum's heartbeat, insects in a shaker and a bassoon creeping a half
  step; its peak sets the strings an octave over the tune, the voices' oohs and the horns swelling. The cadence turns
  G, C sharp, F sharp minor, the second from B down to C sharp; the victories rise into F sharp major from D or from B;
  the defeat sinks on the clarinet. Twenty-four takes, 443 s: three vamps, the tune's halves six ways each, the second
  clarinet's tune three ways (under the first,
  swapped, or both an octave down), three breaks and three breakdowns.
- **Cold**, the tundra: B Aeolian with its flat second borrowed, in 5/4 (three and two) at 120. A horn calls the tune
  over the low strings' ostinato and a taiko, a fiddle's counter-line above, the harmony spaced wide: a low bass and
  open fifths high. Then the fiddle's own tune over the horns. Its tension is strings shivering in fifths, gusts
  of noise as wind, the strings' wood ticking and the taiko's slow heart; its peak doubles the horn with the brass and
  sets the choir high. The cadences close on the low B, from C or from E minor, the victories rise into B major
  through G and A, or E minor and F sharp minor; the defeat falls through C. Twenty-three takes, 460 s: three vamps,
  the tune's halves six ways each (each feel over its own chords and over the turned ones), the fiddle's tune three
  ways (over the horns, on the horn under the fiddle, or the two answering), two breaks and three breakdowns.
- **The families' feels.** Green's: the bodhran's grooves and fills, the gallop, the bass (held, struck on the dotted
  beats, or a jig), the voicing, the gate's sixteenths, the heartbeat and the tremolo's bars. Dry's: the darbuka's
  grooves and fills, the oud's figure, the bass, the voicing, the rub, the heart and the sand. Wet's: the congas'
  and logs' grooves and fills, the marimba's figure, the bass, the voicing, the drips, the heart, the insects and the
  croak. Cold's: the taiko's grooves and fills, the low strings' figure, the bass, the voicing, the shiver (held,
  bowed again, or in octaves), the gusts, the ticks and the heart.
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

- **The Drowned Vale** (`valeParts.ts`, `valeTakes.ts`, `valeScore.ts`, `valeBosses.ts`, `valeCalm.ts`;
  [[The Drowned Vale as Claude Builds It]], "Its music"). One theme for the whole raid in D Phrygian, low (D, E
  flat, F, G and home; then up to B flat and down through the mode), carried by the choir and the organ, its second
  strain on the cello or the horn. Its band: a double bass, the organ and a drone under it all; the bells, the
  Lattice's glass or the waterphone as the danger's colour over a taiko heartbeat and a bowed cymbal; the low cellos'
  ostinato; taiko, frame drums and timpani for the fights; the high choir, booms, struck metal and a riser of noise
  as the peak. Each fight is twelve takes of eight bars, four sections (a vamp, the theme, the strain, a breakdown
  to the frame and the heartbeat under the theme's head) each in three feels (the bass held, struck or pulsing; the
  heartbeat; the ostinato; the drums' grooves; where the bells toll or the waterphone sounds; the organ's voicing),
  the third over turned chords. The Waking in D at 92 on the glass; the Mending in C at 100, driving hardest; the
  Choir in E at 84 on the bells; the Unlit Ways in B flat at 66 with no drums, its four sections (creeping, held,
  near, still) only its drone, the waterphone, a heartbeat, a low pulse and its peak; the Two Shores in E flat at 108
  turning the tonic against its flat second. Each has a cadence (the minor four home into a boom), a victory
  (through the flat sixth and seventh into the major) and a defeat (the theme's head falling on the cello). The
  Scrivener's score in G at 112, 118 and 126 (its third phase lifted a half step), a last stand at 134, on the glass;
  the Steward's in D at 120, 126 and 132, a last stand at 140, on the bells, the horn doubling the theme and the
  choir under the strain, its fullest statement; each with a two-bar wake, a fall and the player's end, the
  Steward's fall the theme in D major. The calm pieces, a minute and a half to two each: the Descent (the theme on
  the cello in D over the felt piano and a singing bowl, the choir's counter-line), the Broken Stair (A, in 3/4 at
  56, the piano over the harp) and After the Bells (the theme on the choir in G at 54), each closing on the world's
  leitmotif.

Loudness at the full Music volume, measured: the boss scores' first phases -18 to -18.5 dBFS, their later phases
rising to -16, peaks -4 to -8 dBFS under a soft ceiling at -3; the families' fights -17.5 to -18 dBFS, peaks about
-5 dBFS under a soft ceiling at -3, their peak layers half a decibel over the fight; the sea's fights -20 to -22
dBFS, peaks -2 to -6; a tension 4 to 6 dB under its fight; Saltmere's theme -21.7 dBFS, 3.7 dB under a fight; the
story's songs -20 to -22.8 dBFS, the deep -24.3 under the sea, the ram -18.4 as it swells.

## Limits

- Every score is built as the game starts, all its takes at once: some 240 ms in Node, not yet measured in a
  browser; the Drowned Vale's (some 47,000 notes, about a tenth of a second more) as its plan loads.
- One fight score, and one set of four calm pieces, serves every climate of its family: the coast and the highland
  share green's.
- The calm pieces out of danger play while it is at sea, whether it is under way or hove to.
- A boss's score is chosen by the name over its bar.
- At its peak a family's fight renders 12 to 15 times faster than it plays in headless Chromium: under a tenth of one
  audio core.
- The takes are written, not made up as the game plays: the arranger only recombines them. A test plays every fight
  song for ten minutes on six seeded dice and finds no sixteen bars heard twice in its first four minutes, in the
  tension's layers, the fight's or the peak's, and every take heard, no two alike in the tension's layers. A family's
  fight hears no pairing of takes again for ten minutes (green's from 10, dry's from 12, wet's and cold's not in
  twenty), a boss's phase from 10 to 16, the sea's fights from 12; past that a long fight hears its pairings again.
- The new pieces, takes and endings are checked by their notes (their lengths, metres, ranges, the ceiling, the
  leitmotif), not yet heard by the owner.
- The arranger's memory lasts while the game runs; a new session's first fight may open as the last session's did.
- **The Drowned Vale's music is not yet heard on its instruments.** None of its 21 `music.*` cues is picked, so it
  plays on the FM bank; no pick has a `root` yet. Its levels against the FM songs, the sampled voices' gains and the
  loudness of every Vale song are not measured, and no take has been heard by the owner.
- The loudness above is not yet measured across every take: a breakdown, or a take in another feel, may sit some
  decibels under it. No take has been heard by the owner on the sound sheet.
