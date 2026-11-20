import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardingScore } from './boardingScore.ts';
import { coldScore } from './coldScore.ts';
import { MOOD_ROLES } from './directorLaw.ts';
import { dryScore } from './dryScore.ts';
import { PERCUSSION_CHANNEL } from './fmBank.ts';
import { greenScore } from './greenScore.ts';
import { reckoningScore } from './reckoningScore.ts';
import { saltmereScore } from './saltmereScore.ts';
import { ROLES, type Song, TICKS_PER_BEAT, lay, makeSong, midiNote, songSeconds, tune } from './score.ts';
import { seaSongs } from './seaScore.ts';
import { wetScore } from './wetScore.ts';
import { wrathScore } from './wrathScore.ts';

const sea = seaSongs();
const wrath = wrathScore();
const reckoning = reckoningScore();
const boarding = boardingScore();
const families = { green: greenScore(), dry: dryScore(), wet: wetScore(), cold: coldScore() };
const familySongs = Object.values(families).map((score) => score.song);
const stings = Object.values(families).flatMap(({ cadence, victory, defeat }) => [cadence, victory, defeat]);
const saltmere = saltmereScore();
const looped: readonly Song[] = [
  ...Object.values(sea),
  ...wrath.phases,
  ...reckoning.phases,
  reckoning.last,
  ...boarding.phases,
  boarding.last,
  ...familySongs,
  saltmere,
];
const once: readonly Song[] = [wrath.fallen, reckoning.fallen, boarding.wake, boarding.fallen, boarding.end, ...stings];
/** The songs the director plays as danger nears and in a fight: each must grow from its tension to its peak. */
const fights: readonly Song[] = [
  sea.storm,
  sea.fight,
  ...wrath.phases,
  ...reckoning.phases,
  ...boarding.phases,
  ...familySongs,
];

test('a note is read by name, middle C 60, and a tune by its bars', () => {
  assert.equal(midiNote('C4'), 60);
  assert.equal(midiNote('A4'), 69);
  assert.equal(midiNote('Bb1'), 34);
  assert.equal(midiNote('F#5'), 78);
  assert.throws(() => midiNote('H2'));
  assert.deepEqual(tune('A4:1.5 r:.5 | D5:2'), [
    [
      [69, 1.5],
      [null, 0.5],
    ],
    [[74, 2]],
  ]);
  assert.throws(() => tune('A4'));
});

test('a song writes one note a key a moment, its loudest and longest, and a key struck again ends the one before', () => {
  const song = makeSong(
    {
      name: 'test',
      bpm: 120,
      bars: 2,
      tracks: { lead: { program: 73, volume: 100, pan: 64, role: 'lead' } },
      kit: { volume: 100, role: 'combat', keys: { kick: 36 } },
    },
    (w) => {
      w.note('lead', 0, 0, 2, 'C4', 80);
      w.note('lead', 0, 0, 3, 'C4', 100);
      w.note('lead', 0, 1, 1, 'C4', 90);
      w.hit('kick', 0, 0, 120);
      lay(w, 'lead', 1, tune('E4:1 r:1 G4:2'), 70, { late: 4.5 });
    },
  );
  const lead = song.notes.filter((note) => note.channel === 0);
  // The two C4s on the one are one note, its loudest; struck again a beat in, it ends there. The tune laid four and a
  // half beats late from bar 1 runs round the loop's seam to its start, its first note accented.
  assert.deepEqual(
    lead.map(({ tick, note, velocity, duration }) => [tick, note, velocity, duration]),
    [
      [0, 60, 100, TICKS_PER_BEAT],
      [30, midiNote('E4'), 78, 55],
      [TICKS_PER_BEAT, 60, 90, TICKS_PER_BEAT],
      [150, midiNote('G4'), 70, 110],
    ],
  );
  const kick = song.notes.find((note) => note.channel === PERCUSSION_CHANNEL);
  assert.deepEqual(kick && [kick.tick, kick.note, kick.role], [0, 36, 'combat']);
  assert.equal(song.durationTicks, 2 * 4 * TICKS_PER_BEAT);
});

test('every song keeps its notes in time order, inside the song, on its tracks, and loops on a bar line', () => {
  for (const song of [...looped, ...once]) {
    assert.equal(song.durationTicks % song.ticksPerBar, 0, `${song.name} is whole bars`);
    const channels = new Set(song.tracks.map((track) => track.channel));
    song.notes.forEach((note, index) => {
      assert.ok(index === 0 || (song.notes[index - 1]?.tick ?? 0) <= note.tick, `${song.name} in order`);
      assert.ok(note.tick >= 0 && note.tick < song.durationTicks, `${song.name} note at ${note.tick} inside`);
      assert.ok(note.duration >= 1 && note.velocity >= 1 && note.velocity <= 127, `${song.name} note sound`);
      assert.ok(note.channel === PERCUSSION_CHANNEL || channels.has(note.channel), `${song.name} on a track`);
    });
  }
});

test('no note lies outside what its instrument plays well: pitched notes C1 to C7, basses under C4, the drums mapped', () => {
  for (const song of [...looped, ...once]) {
    const programs = new Map(song.tracks.map((track) => [track.channel, track.program]));
    for (const note of song.notes) {
      if (note.channel === PERCUSSION_CHANNEL) {
        assert.ok(note.note >= 35 && note.note <= 87, `${song.name}: drum key ${note.note}`);
        continue;
      }
      const program = programs.get(note.channel) ?? 0;
      assert.ok(note.note >= 24 && note.note <= 96, `${song.name}: note ${note.note} on program ${program}`);
      if (program >= 32 && program < 40) assert.ok(note.note < 60, `${song.name}: bass note ${note.note}`);
    }
  }
});

test('every layer a score names plays somewhere in it, and each fight song grows from its tension to its peak', () => {
  for (const score of [
    Object.values(sea),
    [...wrath.phases, wrath.fallen],
    [...reckoning.phases, reckoning.last, reckoning.fallen],
    [...boarding.phases, boarding.last, boarding.wake, boarding.fallen, boarding.end],
    ...Object.values(families).map(({ song, cadence, victory, defeat }) => [song, cadence, victory, defeat]),
    [saltmere],
  ]) {
    const named = new Set(score.flatMap((song) => song.tracks.map((track) => track.role)));
    for (const role of named)
      assert.ok(
        score.some((song) => song.notes.some((note) => note.role === role)),
        `${score[0]?.name}: the ${role} layer is named but plays nothing`,
      );
  }
  const heard = (song: Song, mood: keyof typeof MOOD_ROLES) =>
    song.notes.filter((note) => MOOD_ROLES[mood].has(note.role)).length;
  for (const song of fights) {
    assert.ok(heard(song, 'tension') > 0, `${song.name} has a tension layer`);
    assert.ok(heard(song, 'combat') > heard(song, 'tension'), `${song.name}: the fight adds to the tension`);
    assert.ok(heard(song, 'peak') > heard(song, 'combat'), `${song.name}: the peak adds to the fight`);
    assert.equal(heard(song, 'boss'), song.notes.length, `${song.name}: a boss plays every layer`);
  }
  for (const role of ROLES)
    assert.ok(
      fights.some((song) => song.notes.some((note) => note.role === role)),
      `the ${role} layer is written somewhere`,
    );
});

test('the scores keep their tempos and lengths: phases drive harder, the sea in its own meters', () => {
  const bpm = (songs: readonly Song[]) => songs.map((song) => song.beatsPerMinute);
  assert.deepEqual(bpm(wrath.phases), [132, 138, 150]);
  assert.deepEqual(bpm(reckoning.phases), [136, 142, 152]);
  assert.deepEqual(bpm(boarding.phases), [138, 144, 152]);
  assert.equal(sea.calm.ticksPerBar, 3 * TICKS_PER_BEAT);
  assert.equal(sea.fight.ticksPerBar, 4 * TICKS_PER_BEAT);
  // The wake is two bars: the first phase begins as it ends.
  assert.equal(boarding.wake.durationTicks, 2 * boarding.wake.ticksPerBar);
});

/** Where each program the family scores and Saltmere's theme play is at home, its lowest and highest key. */
const RANGES: Readonly<Record<number, readonly [number, number]>> = {
  12: [41, 96], // marimba
  21: [41, 93], // accordion
  24: [40, 83], // nylon guitar: the lute and the oud
  32: [28, 60], // acoustic bass
  35: [28, 60], // fretless bass
  40: [55, 96], // violin: the fiddle
  42: [36, 81], // cello
  43: [28, 60], // contrabass
  44: [36, 96], // tremolo strings
  45: [28, 96], // pizzicato strings
  46: [24, 96], // harp
  47: [36, 57], // timpani
  48: [28, 96], // strings
  49: [28, 96], // slow strings
  52: [40, 84], // choir
  53: [40, 84], // voices
  57: [34, 77], // trombone, the bass trombone's low notes with it
  60: [35, 77], // horn
  61: [40, 84], // brass
  68: [58, 93], // oboe
  70: [34, 76], // bassoon
  71: [50, 94], // clarinet
  73: [60, 96], // flute
  75: [60, 96], // pan flute
  78: [74, 96], // whistle
  89: [36, 96], // warm pad
  108: [60, 96], // kalimba
  119: [24, 96], // reverse cymbal
};

test("every note of the family scores and Saltmere's theme lies where its instrument plays", () => {
  for (const song of [...familySongs, ...stings, saltmere]) {
    const programs = new Map(song.tracks.map((track) => [track.channel, track.program]));
    for (const note of song.notes) {
      if (note.channel === PERCUSSION_CHANNEL) continue;
      const program = programs.get(note.channel) ?? -1;
      const [low, high] = RANGES[program] ?? [Infinity, -Infinity];
      assert.ok(note.note >= low && note.note <= high, `${song.name}: note ${note.note} on program ${program}`);
    }
  }
});

test('each family fight plays all six layers in a metre and tempo of its own', () => {
  for (const song of familySongs)
    for (const role of ROLES)
      assert.ok(
        song.notes.some((note) => note.role === role),
        `${song.name}: the ${role} layer plays`,
      );
  const metres = familySongs.map((song) => `${song.ticksPerBar} ticks at ${song.beatsPerMinute}`);
  assert.equal(new Set(metres).size, familySongs.length, metres.join(', '));
});

test("each family's cadence, victory and defeat is two to eight bars of its fight's metre, played once and done", () => {
  for (const score of Object.values(families))
    for (const sting of [score.cadence, score.victory, score.defeat]) {
      const bars = sting.durationTicks / sting.ticksPerBar;
      assert.ok(bars >= 2 && bars <= 8, `${sting.name} is ${bars} bars`);
      assert.equal(sting.ticksPerBar, score.song.ticksPerBar, `${sting.name} keeps its fight's metre`);
      assert.equal(sting.beatsPerMinute, score.song.beatsPerMinute, `${sting.name} keeps its fight's tempo`);
      assert.ok(
        sting.notes.some((note) => note.tick === 0),
        `${sting.name} speaks on its first beat`,
      );
      for (const note of sting.notes)
        assert.ok(note.tick + note.duration <= sting.durationTicks, `${sting.name}: nothing runs round its end`);
    }
});

test("Saltmere's theme runs three minutes before it comes round, and every instrument has its turn", () => {
  assert.ok(songSeconds(saltmere) >= 180, `${songSeconds(saltmere)} s`);
  for (const track of saltmere.tracks)
    assert.ok(
      saltmere.notes.some((note) => note.channel === track.channel),
      `program ${track.program} plays`,
    );
});
