import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cast, Line } from './cast.ts';
import { AUTO_HOLD_S, Conversation } from './conversation.ts';

const VOICE = { pitchHz: 120, spreadHz: 10, muffleHz: 1400, volume: 0.3, syllableS: 0.1 };
const CAST: Cast = {
  speakers: {
    mate: { name: 'First Mate', voice: 'mate', colour: null },
    bosun: { name: 'Bosun', voice: 'bosun', colour: null },
  },
  voices: { mate: VOICE, bosun: { ...VOICE, syllableS: 0.12 } },
};
const LINES: Line[] = [
  { who: 'mate', say: 'Brace!' },
  { who: 'bosun', say: 'Hold on.' },
];

test('a press finishes the typing first, then moves to the next line', () => {
  const talk = new Conversation(LINES, CAST, false);
  talk.step(0.05);
  assert.equal(talk.index, 0);
  talk.advance();
  assert.equal(talk.typing.done, true);
  assert.equal(talk.index, 0, 'the first press only finishes the line');
  talk.advance();
  assert.equal(talk.index, 1);
  assert.equal(talk.line?.say, 'Hold on.');
});

test('the last press ends the conversation', () => {
  const talk = new Conversation(LINES, CAST, false);
  for (let press = 0; press < 3; press += 1) talk.advance();
  assert.equal(talk.finished, false);
  talk.advance();
  assert.equal(talk.finished, true);
  assert.equal(talk.line, undefined);
});

test('without auto, a typed line waits for a press however long it stands', () => {
  const talk = new Conversation(LINES, CAST, false);
  for (let frame = 0; frame < 600; frame += 1) talk.step(1 / 60);
  assert.equal(talk.index, 0);
});

test('with auto, each line moves on once typed and held', () => {
  const talk = new Conversation(LINES, CAST, true);
  let clock = 0;
  while (talk.index === 0) {
    talk.step(1 / 60);
    clock += 1 / 60;
  }
  const typedS = 'Brace!'.length / 28;
  assert.ok(clock >= typedS + AUTO_HOLD_S - 0.02 && clock <= typedS + AUTO_HOLD_S + 0.05, `moved on at ${clock}`);
  for (let frame = 0; frame < 600 && !talk.finished; frame += 1) talk.step(1 / 60);
  assert.equal(talk.finished, true, 'the last line ends the cutscene by itself');
});

test("a line is voiced in its own speaker's voice, and a bark is leant on", () => {
  const talk = new Conversation([{ who: 'bosun', say: 'We are hit!', kind: 'bark' }], CAST, false);
  assert.equal(talk.voice?.syllableS, 0.12);
  assert.equal(talk.emphasis, true);
  assert.equal(new Conversation(LINES, CAST, false).emphasis, false);
});

test('an empty conversation is finished at once', () => {
  assert.equal(new Conversation([], CAST, false).finished, true);
});
