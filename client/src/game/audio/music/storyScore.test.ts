import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOOD_ROLES } from './directorLaw.ts';
import { saltmereScore } from './saltmereScore.ts';
import { type Song, songSeconds } from './score.ts';
import { storyScores } from './storyScore.ts';

const story = storyScores();
/** A track's notes in time order, by its General MIDI program. */
const played = (song: Song, program: number) => {
  const channel = song.tracks.find((track) => track.program === program)?.channel;
  return song.notes.filter((note) => note.channel === channel);
};
const classes = (song: Song, program: number, count = 4) =>
  played(song, program)
    .slice(0, count)
    .map((note) => note.note % 12);
const [HORN, FLUTE, VOICES, CONTRABASS, BRASS] = [60, 73, 53, 43, 61];
/** D, A, B flat, A: the theme's rise of a fifth and its sigh from the minor sixth; raised, B natural. */
const SIGH = [2, 9, 10, 9];
const RAISED = [2, 9, 11, 9];

test('one theme runs through the story: on the horn under the title and in the storm, the flute in the calm, the voices in the deep', () => {
  assert.deepEqual(classes(story.theme, HORN), SIGH);
  assert.deepEqual(classes(story.storm, HORN), SIGH);
  assert.deepEqual(classes(story.calm, FLUTE), SIGH);
  assert.deepEqual(classes(story.deep, VOICES), SIGH);
});

test("on the shore the theme's sixth is raised, and the song ends on D, which leads into Saltmere's G", () => {
  assert.deepEqual(classes(story.shore, FLUTE), RAISED);
  const bass = played(story.shore, CONTRABASS);
  assert.equal((bass[bass.length - 1]?.note ?? 0) % 12, 2);
  assert.equal((played(saltmereScore(), 32)[0]?.note ?? 0) % 12, 7, "Saltmere's bass opens on G");
});

test("the ram holds the Boarding's half step, E against F, swelling bar by bar, and plays once", () => {
  const brass = played(story.ram, BRASS);
  const bars = [0, 1, 2, 3].map((bar) => brass.filter((note) => note.tick === bar * story.ram.ticksPerBar));
  for (const struck of bars) assert.deepEqual(new Set(struck.map((note) => note.note % 12)), new Set([4, 5, 11]));
  const loudest = bars.map((struck) => Math.max(...struck.map((note) => note.velocity)));
  assert.deepEqual(
    loudest,
    [...loudest].sort((one, other) => one - other),
  );
  assert.ok((loudest[3] ?? 0) > (loudest[0] ?? 0) + 30, 'it swells');
  for (const note of story.ram.notes) assert.ok(note.tick + note.duration <= story.ram.durationTicks, 'never round');
});

test("the title's theme comes in as the intro goes down through the cloud, and the song never comes round under the title", () => {
  const horn = played(story.theme, HORN)[0];
  assert.ok(horn);
  const comesIn = (horn.tick / story.theme.durationTicks) * songSeconds(story.theme);
  assert.ok(Math.abs(comesIn - 6) < 0.5, `the horn comes in at ${comesIn} s, as the intro's 6 s of first light end`);
  const seconds = songSeconds(story.theme);
  assert.ok(seconds > 45 && seconds < 80, `${seconds} s, past the intro's 25 s and a while waiting on the title`);
});

test('the storm and the shore grow a layer at a time, as their beats bring them in', () => {
  const heard = (song: Song, mood: keyof typeof MOOD_ROLES) =>
    song.notes.filter((note) => MOOD_ROLES[mood].has(note.role)).length;
  for (const song of [story.storm, story.shore]) {
    assert.ok(heard(song, 'tension') > 0, `${song.name} has a tension layer`);
    assert.ok(heard(song, 'combat') > heard(song, 'tension'), `${song.name}: its middle adds to its tension`);
    assert.ok(heard(song, 'peak') > heard(song, 'combat'), `${song.name}: its peak adds to its middle`);
  }
});
