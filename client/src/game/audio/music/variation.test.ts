import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlookScores } from './director.ts';
import { MOOD_ROLES } from './directorLaw.ts';
import { Arranger } from './form.ts';
import type { Song } from './score.ts';

/** A die from a seed, the same rolls every run. */
function die(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const scores = overlookScores();
const { boarding, reckoning, wrath, scrivener, steward } = scores.bosses;
/** Every song a fight plays: the families', the sea's two, the Breach's, and each boss's phases and last stand. */
const FIGHTS: readonly Song[] = [
  ...Object.values(scores.families).flatMap((family) => (family ? [family.song] : [])),
  scores.sea.fight,
  scores.sea.storm,
  ...boarding.phases,
  ...reckoning.phases,
  ...wrath.phases,
  ...[boarding.last, reckoning.last].filter((song): song is Song => !!song),
  ...Object.values(scores.breach).map((fight) => fight.song),
  ...[scrivener, steward].flatMap((boss) => [...boss.phases, ...(boss.last ? [boss.last] : [])]),
];
/** The layers heard as danger nears (the wreck's walk is this, for minutes), in a fight, and at its height. */
const MOODS = ['tension', 'combat', 'peak'] as const;
const SEEDS = [1, 2, 3, 4, 5, 6];
const WINDOW_BARS = 16;

const barSeconds = (song: Song) => song.ticksPerBar * song.secondsPerTick;

/** The takes of `song` a player plays over `seconds`, in order, as the arranger strings them together. */
function takesPlayed(song: Song, arranger: Arranger, seconds: number): number[] {
  const takes = song.form?.takes ?? [];
  const played: number[] = [];
  let length = 0;
  let take = arranger.opening(song);
  while (take !== null && length * barSeconds(song) < seconds) {
    played.push(take);
    length += takes[take]?.bars ?? 0;
    take = arranger.after(song, take);
  }
  return played;
}

/** The bars of `song` a player plays over `seconds`, in order. */
const performed = (song: Song, arranger: Arranger, seconds: number): number[] =>
  takesPlayed(song, arranger, seconds).flatMap((take) => {
    const { first = 0, bars: count = 0 } = song.form?.takes[take] ?? {};
    return Array.from({ length: count }, (unused, i) => first + i);
  });

/** Each bar of `song` as it sounds in `mood`'s layers, one number a different bar: what is struck in it, where, how
 *  loud and how long. */
function bars(song: Song, mood: keyof typeof MOOD_ROLES): number[] {
  const count = song.durationTicks / song.ticksPerBar;
  const struck: string[][] = Array.from({ length: count }, () => []);
  for (const note of song.notes)
    if (MOOD_ROLES[mood].has(note.role))
      struck[Math.floor(note.tick / song.ticksPerBar)]?.push(
        `${note.tick % song.ticksPerBar}:${note.channel}:${note.note}:${note.duration}`,
      );
  const named = new Map<string, number>();
  return struck.map((notes) => {
    const text = notes.sort().join(' ');
    if (!named.has(text)) named.set(text, named.size);
    return named.get(text) ?? 0;
  });
}

test('every fight song is written as takes that open in more than one way', () => {
  for (const song of FIGHTS) {
    const takes = song.form?.takes ?? [];
    assert.ok(takes.length >= 6, `${song.name}: ${takes.length} takes`);
    assert.ok(takes.filter((take) => take.opens).length >= 2, `${song.name} opens more than one way`);
  }
});

test('no fight plays the same sixteen bars twice in its first four minutes, in any of its moods', () => {
  for (const song of FIGHTS) {
    const prints = Object.fromEntries(MOODS.map((mood) => [mood, bars(song, mood)]));
    const inFour = Math.floor(240 / barSeconds(song));
    for (const seed of SEEDS) {
      const heard = performed(song, new Arranger(die(seed)), 600);
      for (const mood of MOODS) {
        const seen = new Map<string, number>();
        for (let start = 0; start + WINDOW_BARS <= inFour; start++) {
          const window = heard
            .slice(start, start + WINDOW_BARS)
            .map((bar) => prints[mood]?.[bar])
            .join(',');
          const before = seen.get(window);
          assert.equal(before, undefined, `${song.name}, ${mood}, seed ${seed}: bars ${start} again from ${before}`);
          seen.set(window, start);
        }
      }
    }
  }
});

test("no two takes of a fight song are the same in their danger's layers", () => {
  for (const song of FIGHTS) {
    const prints = bars(song, 'tension');
    const dangers = (song.form?.takes ?? []).map(({ first, bars: count }) =>
      prints.slice(first, first + count).join(','),
    );
    dangers.forEach((danger, take) =>
      assert.equal(dangers.indexOf(danger), take, `${song.name}: take ${take} as take ${dangers.indexOf(danger)}`),
    );
  }
});

test('over ten minutes a fight hears every take it has, and never one take twice running', () => {
  for (const song of FIGHTS)
    for (const seed of SEEDS) {
      const played = takesPlayed(song, new Arranger(die(seed)), 600);
      const count = song.form?.takes.length ?? 0;
      assert.equal(
        new Set(played).size,
        count,
        `${song.name}, seed ${seed}: heard ${new Set(played).size} of ${count}`,
      );
      played.forEach((take, index) => assert.notEqual(played[index + 1], take, `${song.name}: a take twice running`));
    }
});

test('two fights begun in a row open differently, in their danger and in their fight', () => {
  for (const song of FIGHTS)
    for (const seed of SEEDS) {
      const arranger = new Arranger(die(seed));
      const first = performed(song, arranger, 1);
      const second = performed(song, arranger, 1);
      for (const mood of ['tension', 'combat'] as const) {
        const prints = bars(song, mood);
        assert.notDeepEqual(
          second.map((bar) => prints[bar]),
          first.map((bar) => prints[bar]),
          `${song.name}, ${mood}, seed ${seed}: the same opening twice`,
        );
      }
    }
});
