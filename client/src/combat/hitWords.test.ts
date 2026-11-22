import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { EVENT } from './cues.ts';
import { HOLDS, WORD_FRAMES, WORD_THROW_PX, Words, placeWord, wordPose, wordsOf } from './hitWords.ts';
import { coloursDrawn, written } from './nodes.test.ts';

const PLAYER = 1;
const FRAME = 1 / 60;
const event = (kind: number, striker: number, defender: number, amount = 0, over: Partial<FightEvent> = {}) => ({
  tick: 0n,
  kind,
  how: 1,
  striker,
  defender,
  amount,
  stroke: 1,
  ...over,
});
const still = () => false;
const brief = (said: ReturnType<typeof wordsOf>) =>
  said.map(({ text, tone, tags, killed = false, crit = false }) => ({ text, tone, tags, killed, crit }));

test('what the player’s blow did besides rides on its number: a stagger as a word on it, a death as its stamp', () => {
  const said = wordsOf([event(EVENT.hit, PLAYER, 7, 12), event(EVENT.staggered, PLAYER, 7)], PLAYER, still);
  assert.deepEqual(brief(said), [{ text: '12', tone: 'dealt', tags: ['Staggered'], killed: false, crit: false }]);
  const slain = wordsOf([event(EVENT.killed, PLAYER, 7), event(EVENT.hit, PLAYER, 7, 30)], PLAYER, still);
  assert.deepEqual(brief(slain), [{ text: '30', tone: 'dealt', tags: [], killed: true, crit: false }]);
});

test('a number carries what it numbers, its crit, its element and its stroke from the room', () => {
  const [said] = wordsOf([event(EVENT.hit, PLAYER, 7, 26.4, { crit: true, element: 2, stroke: 3 })], PLAYER, still);
  assert.deepEqual([said?.amount, said?.crit, said?.element, said?.stroke, said?.striker], [26, true, 2, 3, PLAYER]);
  const [riposte] = wordsOf([event(EVENT.hit, PLAYER, 7, 28, { how: 2 })], PLAYER, still);
  assert.deepEqual([riposte?.text, riposte?.before, riposte?.amount], ['Riposte 28', 'Riposte', 28]);
});

test('the player’s blow on a foe winding up that does not break it says it holds; one that breaks it says nothing more', () => {
  const holding = (id: number) => id === 7;
  assert.deepEqual(wordsOf([event(EVENT.hit, PLAYER, 7, 5)], PLAYER, holding)[0]?.tags, [HOLDS]);
  assert.deepEqual(
    wordsOf([event(EVENT.hit, PLAYER, 7, 5), event(EVENT.staggered, PLAYER, 7)], PLAYER, holding)[0]?.tags,
    ['Staggered'],
  );
  assert.deepEqual(wordsOf([event(EVENT.hit, 3, 7, 5)], PLAYER, holding)[0]?.tags, [], 'another’s blow, no word');
});

test('a word with no number to ride on stands alone', () => {
  const said = wordsOf([event(EVENT.parried, 7, PLAYER), event(EVENT.dodged, 7, PLAYER)], PLAYER, still);
  assert.deepEqual(
    said.map(({ text, tags }) => [text, tags]),
    [
      ['Parry!', []],
      ['Dodged', []],
    ],
  );
});

test('a word pops large for two frames and settles, rises 4 px every 4 frames and blinks out over its last 6', () => {
  const life = WORD_FRAMES.plain;
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((frame) => wordPose(frame, life).scale),
    [1.4, 1.4, 1.15, 1.15, 1],
  );
  assert.deepEqual(
    [3, 4, 7, 8, 12].map((frame) => wordPose(frame, life).rise),
    [0, 4, 4, 8, 12],
  );
  const shown = Array.from({ length: 8 }, (unused, back) => wordPose(life - 8 + back, life).shown);
  assert.deepEqual(shown, [true, true, false, false, true, true, false, false]);
  assert.equal(wordPose(life, life).shown, false);
  assert.deepEqual(wordPose(1, life, true), { scale: 1, rise: 0, shown: true }, 'still with motion reduced');
});

test('a word is pushed down clear of any plate above it, and of the words already placed', () => {
  const plate = { left: 0, right: 140, top: -Infinity, bottom: 100 };
  const want = { left: 50, right: 90, top: 80, bottom: 102 };
  assert.deepEqual(placeWord(want, [plate], []), { left: 50, right: 90, top: 124, bottom: 146 });
  assert.deepEqual(placeWord({ ...want, left: 200, right: 240 }, [plate], []).top, 80, 'beside it, left alone');
  const first = placeWord(want, [plate], []);
  assert.equal(placeWord(want, [plate], [first]).top, first.bottom + 2, 'and below the one before');
});

test('blows on one foe in quick succession add into one number, popped again; a crit stamps it and lives longer', () => {
  const words = new Words();
  const project = () => ({ x: 100, y: 300 });
  const blow = { text: '12', tone: 'dealt' as const, tags: [], defender: 7, striker: PLAYER, amount: 12 };
  words.say(blow, [0, 0, 0], 1, 0.5);
  words.update(project, 800, 600, 10 * FRAME);
  words.say({ ...blow, amount: 9, crit: true }, [0, 0, 0], -1, 0.5);
  words.update(project, 800, 600, FRAME);
  const [shown] = words.standing;
  assert.equal(words.standing.length, 1, 'one number');
  assert.deepEqual([shown?.text, shown?.stamps], ['21', ['Crit']]);
  const across = shown?.x ?? 0;
  assert.ok(across > 100 + 2 * WORD_THROW_PX, `thrown right, its near edge clear of the blow: ${across}`);
  words.update(project, 800, 600, (WORD_FRAMES.plain + 2) * FRAME);
  assert.equal(words.standing.length, 1, 'a crit’s word stands longer');
  words.update(project, 800, 600, (WORD_FRAMES.loud - WORD_FRAMES.plain) * FRAME);
  assert.equal(words.standing.length, 0);
  words.say(blow, [0, 0, 0], 1, 0.5);
  words.update(project, 800, 600, 40 * FRAME);
  words.say(blow, [0, 0, 0], 1, 0.5);
  assert.equal(words.standing.length, 2, 'too late to add');
});

test('a word pushed down clear of a plate stays down as the plate goes, rather than jumping back up', () => {
  const words = new Words();
  words.say({ text: '23', tone: 'dealt' as const, tags: [] }, [0, 0, 0], 0, 0.5);
  const project = () => ({ x: 100, y: 50 });
  const plate = { left: 60, right: 140, top: -Infinity, bottom: 60 };
  words.update(project, 800, 600, FRAME, [plate]);
  const placedAt = () => [words.standing[0]?.x, words.standing[0]?.y];
  const under = placedAt();
  words.update(project, 800, 600, FRAME, []);
  assert.deepEqual(placedAt(), under, 'the plate gone, the word where it stood');
});

test('words said together never cover one another: a later one stands below one it would cover, and stays there', () => {
  const words = new Words();
  const said = { text: '23', tone: 'dealt' as const, tags: [] };
  const places = { near: [0, 0, 0], beside: [1, 0, 0], far: [9, 0, 0] } as const;
  const project = (point: readonly [number, number, number]) => ({ x: 100 + point[0] * 30, y: 50 });
  for (const place of [places.near, places.beside, places.far]) words.say(said, place, 0, 0.5);
  words.update(project, 800, 600, 4 * FRAME);
  const shown = () => words.standing.map(({ x, y }) => [x, y]);
  assert.deepEqual(shown(), [
    [100, 35],
    [130, 59],
    [370, 35],
  ]);
  words.say(said, places.near, 0, 0.5);
  words.update(project, 800, 600, 4 * FRAME);
  assert.deepEqual(shown().slice(0, 3), [
    [100, 31],
    [130, 55],
    [370, 31],
  ]);
  assert.deepEqual(shown()[3], [100, 79], 'a word said later stands clear of those before it');
});

test('the words are the face at whole steps of its grid, outlined hard, an element’s number in its light', () => {
  const words = new Words();
  const project = () => ({ x: 100, y: 300 });
  words.say(
    { text: '12', tone: 'dealt', tags: ['Holds'], defender: 7, striker: PLAYER, amount: 12, element: 2 },
    [0, 0, 0],
    0,
    0.5,
  );
  words.say(
    { text: '30', tone: 'taken', tags: [], defender: PLAYER, striker: 7, amount: 30, crit: true },
    [5, 0, 0],
    0,
    0.5,
  );
  words.update(project, 800, 600, 10 * FRAME);
  const [dealt, taken] = words.nodes();
  const texts = (node: typeof dealt) => (node?.children ?? []).map((child) => (child ? child.text : undefined));
  assert.deepEqual(
    texts(dealt).map((text) => [text?.words, text?.size, text?.edgeWidth]),
    [
      ['12', 2, 2],
      ['HOLDS', 1, 2],
    ],
    'a number at two steps, its small word at one, each outlined 2 px',
  );
  assert.equal(texts(dealt)[0]?.colour, 'rgb(159, 227, 255)', 'in Volt’s light');
  assert.deepEqual(
    texts(taken).map((text) => [text?.words, text?.size, text?.edgeWidth, text?.colour]),
    [
      ['30', 3, 3, '#ff7468'],
      ['CRIT', 2, 2, '#ffd95a'],
    ],
    'a crit at three steps, outlined 3 px, a blow taken still red',
  );
  words.say({ text: 'Dodge!', tone: 'warn', tags: [] }, [0, 0, 0], 0, 0.5);
  words.update(project, 800, 600, 10 * FRAME);
  const warn = words.nodes()[2];
  assert.ok(
    warn && coloursDrawn({ width: 'grow', height: 'grow', children: [warn] }).has(written('#a0140c')),
    'a warning on red',
  );
});
