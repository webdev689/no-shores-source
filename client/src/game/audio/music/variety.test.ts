import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coldScore } from './coldScore.ts';
import { dryScore } from './dryScore.ts';
import { greenScore } from './greenScore.ts';
import { islandPieces } from './islandPieces.ts';
import { type Song, TICKS_PER_BEAT } from './score.ts';
import { seaPieces } from './seaPieces.ts';
import { socialPieces } from './socialPieces.ts';
import { wetScore } from './wetScore.ts';

/** The calm pieces out of danger: the islands', the social space's and the sea's. (The Breach's three tell one theme
 *  by design.) */
const CALM: readonly Song[] = [
  ...Object.values(islandPieces()).flat(),
  ...socialPieces(),
  ...Object.values(seaPieces()),
];
/** A piece's tracks in order: the pad, the bass, the ostinato, the lead (its last note its key's home), the
 *  counter-line. */
const PAD_CHANNEL = 0;
const BASS_CHANNEL = 1;
const LEAD_CHANNEL = 3;
const COUNTER_CHANNEL = 4;
/** As many bars as the older pieces, each its own, share at most: Dust Road and the Tithe share three bars of the
 *  same degrees at the same places in the bar; Moorlight and Mistwrack four of the same degrees in any rhythm. */
const MOST_SAME_BARS = 3;
const MOST_SAME_DEGREES = 4;

/** A piece's shape in its key: each bar of its tune (degrees, and degrees at their places in the bar), the first eight
 *  bars' chord roots under the tune (its verse), and its opening (its first two bars' degrees). The closing four bars
 *  are left out: every piece closes on the world's leitmotif by law. */
function shapeOf(song: Song) {
  const lead = song.notes.filter((note) => note.channel === LEAD_CHANNEL);
  const bass = song.notes.filter((note) => note.channel === BASS_CHANNEL);
  const home = (lead[lead.length - 1]?.note ?? 0) % 12;
  const degree = (note: number) => (note - home + 120) % 12;
  const bars = Math.round(song.durationTicks / song.ticksPerBar);
  const tune: { degrees: string; placed: string; notes: number }[] = [];
  const roots: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const [from, to] = [bar * song.ticksPerBar, (bar + 1) * song.ticksPerBar];
    const notes = lead.filter((note) => note.tick >= from && note.tick < to);
    if (notes.length === 0) continue;
    tune.push({
      degrees: notes.map((note) => degree(note.note)).join('.'),
      placed: notes.map((note) => `${degree(note.note)}@${(note.tick - from) / song.ticksPerBar}`).join(' '),
      notes: notes.length,
    });
    const root = bass.find((note) => note.tick <= from && note.tick + note.duration > from);
    roots.push(root ? degree(root.note) : -1);
  }
  // A held note alone says little: a bar is the tune's own from two notes on.
  const body = tune.slice(0, -4).filter((each) => each.notes >= 2);
  return {
    name: song.name,
    verse: roots.slice(0, 8).join(','),
    opening: tune
      .slice(0, 2)
      .map((each) => each.degrees)
      .join('|'),
    degrees: new Set(body.map((each) => each.degrees)),
    placed: new Set(body.map((each) => each.placed)),
  };
}

test('no two calm pieces share their verse, their opening, or more bars of tune than the older pieces share', () => {
  const shapes = CALM.map(shapeOf);
  shapes.forEach((one, index) =>
    shapes.slice(index + 1).forEach((other) => {
      const pair = `${one.name} and ${other.name}`;
      assert.notEqual(one.verse, other.verse, `${pair} share their verse's chords: ${one.verse}`);
      assert.notEqual(one.opening, other.opening, `${pair} open alike: ${one.opening}`);
      const placed = [...one.placed].filter((bar) => other.placed.has(bar)).length;
      const degrees = [...one.degrees].filter((bar) => other.degrees.has(bar)).length;
      assert.ok(placed <= MOST_SAME_BARS, `${pair} share ${placed} bars of tune`);
      assert.ok(degrees <= MOST_SAME_DEGREES, `${pair} share ${degrees} bars of the same degrees`);
    }),
  );
});

/** An ending's lead as a figure: when each note falls after the last. A figure moved to another key, or bent a note
 *  or two, keeps its rhythm; a figure of its own has a rhythm of its own. */
function figureOf(song: Song): string {
  const lead = song.notes.filter((note) => note.role === 'lead').sort((one, other) => one.tick - other.tick);
  return lead
    .slice(1)
    .map((note, index) => note.tick - (lead[index]?.tick ?? 0))
    .join(' ');
}

test("a family's second cadence and second victory are figures of their own, not the first's in a new key", () => {
  for (const score of [greenScore(), dryScore(), wetScore(), coldScore()]) {
    assert.notEqual(figureOf(score.secondVictory), figureOf(score.victory), `${score.secondVictory.name}`);
    assert.notEqual(figureOf(score.secondCadence), figureOf(score.cadence), `${score.secondCadence.name}`);
  }
});

/** The older pieces written with a half step against their pad as their colour: a major seventh or an added ninth in
 *  the chord's voicing, Sunscorch's flat second over its root, the Tithe's E against F. */
const WRITTEN_RUBS = new Set([
  'moorlight',
  'cairn',
  'sunscorch',
  'mistwrack',
  'rime',
  'saltmere',
  'lamplight',
  'tithe',
  'sea-night',
]);
/** A line's note held near a beat or more: a beat laid legato sounds a little under it. */
const HELD = TICKS_PER_BEAT * 0.9;

test("no calm piece's tune or counter-line holds a note a half step from the pad under it", () => {
  for (const song of CALM) {
    if (WRITTEN_RUBS.has(song.name)) continue;
    const pad = song.notes.filter((note) => note.channel === PAD_CHANNEL);
    const lines = song.notes.filter(
      (note) => (note.channel === LEAD_CHANNEL || note.channel === COUNTER_CHANNEL) && note.duration >= HELD,
    );
    for (const line of lines)
      for (const under of pad.filter((note) => note.tick <= line.tick && note.tick + note.duration > line.tick))
        assert.ok(
          ![1, 11].includes(Math.abs(line.note - under.note) % 12),
          `${song.name}, bar ${Math.floor(line.tick / song.ticksPerBar)}: ${line.note} on ${under.note}`,
        );
  }
});
