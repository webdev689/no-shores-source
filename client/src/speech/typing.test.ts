import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHARACTERS_PER_SECOND, STOP_HOLD_S, Typing } from './typing.ts';

const FRAME_S = 1 / 120;

/** Runs a line to its end a frame at a time, noting the time of each syllable and the character it fell on. */
function voiced(text: string, syllableS: number): { at: number; character: string }[] {
  const typing = new Typing(text, syllableS);
  const heard: { at: number; character: string }[] = [];
  for (let clock = 0; !typing.done; clock += FRAME_S) {
    if (typing.step(FRAME_S)) heard.push({ at: clock, character: text.charAt(typing.cursor) });
  }
  return heard;
}

test('the words are typed at 28 characters a second', () => {
  const typing = new Typing('Brace now', 0.1);
  typing.step(0.25);
  assert.equal(typing.visible.length, Math.floor(0.25 * CHARACTERS_PER_SECOND));
  assert.equal(typing.hidden, 'Brace now'.slice(typing.visible.length));
});

test('the first letter is heard as it appears', () => {
  const typing = new Typing('Wake.', 0.2);
  assert.equal(typing.step(0.001), true);
});

test('a line that opens on a mark waits for its first letter before it is heard', () => {
  const typing = new Typing('"Ha', 0.2);
  assert.equal(typing.step(0.001), false);
});

test('a syllable sounds every syllable length while letters are typed', () => {
  const heard = voiced('Hold on to something', 0.1);
  const typedS = 'Hold on to something'.length / CHARACTERS_PER_SECOND;
  assert.ok(heard.length >= Math.floor(typedS / 0.1) - 2 && heard.length <= Math.ceil(typedS / 0.1) + 1);
  for (const [order, syllable] of heard.entries()) {
    if (order > 0) assert.ok(syllable.at - heard[order - 1].at >= 0.1 - FRAME_S, 'never two inside one syllable');
  }
});

test('no syllable falls on a space or a mark', () => {
  for (const syllable of voiced('Running dark in this weather. They mean to take us.', 0.085)) {
    assert.match(syllable.character, /[A-Za-z0-9']/);
  }
});

test('a full stop inside a line holds the typing a little, a last one does not', () => {
  const text = 'Not yet. Wake';
  const typing = new Typing(text, 0.2);
  const stopAt = text.indexOf('.') + 1;
  typing.step(stopAt / CHARACTERS_PER_SECOND + 0.01);
  assert.equal(typing.visible.length, stopAt, 'stops on the full stop');
  typing.step(STOP_HOLD_S - 0.05);
  assert.equal(typing.visible.length, stopAt, 'still held');
  typing.step(0.1);
  assert.ok(typing.visible.length > stopAt, 'moves on once held');
  const plain = new Typing('Wake.', 0.2);
  plain.step('Wake.'.length / CHARACTERS_PER_SECOND + 0.001);
  assert.equal(plain.done, true);
});

test('a question or a cry holds as a full stop does', () => {
  const typing = new Typing('Ha! Into', 0.2);
  typing.step(3 / CHARACTERS_PER_SECOND + STOP_HOLD_S / 2);
  assert.equal(typing.visible, 'Ha!');
});

test('a long silent stretch never banks syllables to fire at once', () => {
  const heard = voiced('Ab          cdefghijkl', 0.05);
  const afterGap = heard.findIndex((syllable) => syllable.character === 'c');
  assert.ok(afterGap > 0, 'the first letter after the gap is heard');
  assert.ok(heard[afterGap + 1].at - heard[afterGap].at >= 0.05 - FRAME_S);
});

test('finishing shows the whole line and sounds nothing more', () => {
  const typing = new Typing('Three of them!', 0.1);
  typing.finish();
  assert.equal(typing.done, true);
  assert.equal(typing.visible, 'Three of them!');
  assert.equal(typing.step(1), false);
});
