import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { EVENT } from './cues.ts';
import { HOLDS, WORD_SCATTER_PX, WORD_SECONDS, Words, wordsOf } from './hitWords.ts';
import { findAll, onFakePage } from './page.test.ts';

const PLAYER = 1;
const event = (kind: number, striker: number, defender: number, amount = 0): FightEvent => ({
  tick: 0n,
  kind,
  how: 1,
  striker,
  defender,
  amount,
  stroke: 1,
});
const still = () => false;

test('what the player’s blow did besides rides on its number: a stagger, a death', () => {
  const said = wordsOf([event(EVENT.hit, PLAYER, 7, 12), event(EVENT.staggered, PLAYER, 7)], PLAYER, still);
  assert.deepEqual(said, [{ text: '12', tone: 'dealt', defender: 7, tags: ['Staggered'] }]);
  const slain = wordsOf([event(EVENT.killed, PLAYER, 7), event(EVENT.hit, PLAYER, 7, 30)], PLAYER, still);
  assert.deepEqual(slain, [{ text: '30', tone: 'dealt', defender: 7, tags: ['Slain'] }], 'whichever came first');
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

test('a word with no number to ride on rises alone; a foe’s blow on the player carries its stagger the same way', () => {
  const said = wordsOf([event(EVENT.parried, 7, PLAYER), event(EVENT.dodged, 7, PLAYER)], PLAYER, still);
  assert.deepEqual(
    said.map(({ text, tags }) => [text, tags]),
    [
      ['Parry!', []],
      ['Dodged', []],
    ],
  );
  const taken = wordsOf([event(EVENT.hit, 7, PLAYER, 9), event(EVENT.staggered, 7, PLAYER)], PLAYER, still);
  assert.deepEqual(taken, [{ text: '9', tone: 'taken', defender: PLAYER, tags: ['Staggered'] }]);
});

test('a flurry fans out either side of where it happened, and each word goes once its time is up', () =>
  onFakePage((root) => {
    assert.equal(WORD_SCATTER_PX, 36);
    const words = new Words(root);
    const said = { text: '12', tone: 'dealt' as const, tags: ['Staggered'] };
    words.say(said, [0, 0, 0], 0);
    words.say(said, [0, 0, 0], 1);
    const project = () => ({ x: 100, y: 50 });
    words.update(project, 800, 600, 0.1);
    const shown = findAll(root, 'word');
    assert.deepEqual(
      shown.map((word) => word.style['transform']),
      ['translate(64.0px, 50.0px)', 'translate(136.0px, 50.0px)'],
    );
    assert.deepEqual(
      findAll(root, 'tag').map((tag) => tag.textContent),
      ['Staggered', 'Staggered'],
    );
    words.update(project, 800, 600, WORD_SECONDS);
    assert.equal(findAll(root, 'word').length, 0);
  }));
