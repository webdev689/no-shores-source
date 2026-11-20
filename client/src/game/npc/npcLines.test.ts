import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEEPERS } from '../keepers.ts';
import { KEEPER_LINES, LineTurns, answeredWith } from './npcLines.ts';

const scenes = {
  mageHello2: [{ who: 'mage', say: 'Two.' }],
  mageHello1: [{ who: 'mage', say: 'One.' }],
  mageThanks1: [{ who: 'mage', say: 'Thanks.' }],
  tailorHello1: [{ who: 'tailor', say: 'Hello.' }],
};

test('a keeper’s greetings are said in turn, each keeper’s turns its own', () => {
  const turns = new LineTurns(scenes);
  const said = (speaker: string) => turns.next(speaker, 'Hello')?.say;
  assert.deepEqual([said('mage'), said('mage'), said('mage')], ['One.', 'Two.', 'One.']);
  assert.equal(said('tailor'), 'Hello.');
  assert.equal(turns.next('mage', 'Thanks')?.say, 'Thanks.');
  assert.equal(turns.next('mage', 'Short'), null, 'a keeper with no such line says nothing');
});

test('every keeper but the vault’s greets, thanks and is heard in a voice of the cast; all but the Mage turn the short away', () => {
  const turns = new LineTurns(KEEPER_LINES);
  for (const [kind, keeper] of Object.entries(KEEPERS)) {
    if (kind === 'vault') continue;
    const hello = new Set([0, 1, 2].map(() => turns.next(keeper.speaker, 'Hello')?.say));
    assert.equal(hello.size, 3, `${kind} has three greetings`);
    assert.ok(turns.next(keeper.speaker, 'Thanks'), `${kind} thanks`);
    if (kind !== 'mage') assert.ok(turns.next(keeper.speaker, 'Short'), `${kind} turns the short away`);
  }
});

test('the keeper answers once the room has answered every ask made: thanks, the short line, or nothing', () => {
  assert.equal(answeredWith({ from: 4, asked: 1 }, 4, 0), undefined, 'not answered yet');
  assert.equal(answeredWith({ from: 4, asked: 1 }, 5, 0), 'Thanks');
  assert.equal(answeredWith({ from: 4, asked: 1 }, 5, 15), 'Short');
  assert.equal(answeredWith({ from: 4, asked: 1 }, 5, 8), null, 'another refusal has no line');
  assert.equal(answeredWith({ from: 4, asked: 2 }, 5, 0), undefined, 'the first of two asks answered');
  assert.equal(answeredWith({ from: 4, asked: 2 }, 6, 15), 'Short');
});
