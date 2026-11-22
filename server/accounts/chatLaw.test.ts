import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LINE_MOST, cleanLine, fromHallOf, readTyped, refusedWords, saidOf } from './chatLaw.ts';

test('a line is cleaned of hidden marks and runs of space, and cut at its most', () => {
  assert.equal(cleanLine('  hello\t\tthere\n '), 'hello there');
  assert.equal(cleanLine('evil‮txt.exe'), 'eviltxt.exe', 'a mark that turns the direction is taken out');
  assert.equal(cleanLine('\u0000\u0007'), '');
  assert.equal(cleanLine('x'.repeat(300)).length, LINE_MOST);
  assert.equal(cleanLine(`${'x'.repeat(LINE_MOST - 1)}😀`).length, LINE_MOST - 1, 'never through a pair');
});

test("a typed line is said on the field's channel, or where its command says", () => {
  assert.deepEqual(readTyped('hello', 'local'), { kind: 'say', channel: 'local', words: 'hello' });
  assert.deepEqual(readTyped('/g all aboard', 'local'), { kind: 'say', channel: 'world', words: 'all aboard' });
  assert.deepEqual(readTyped('/l hi', 'world'), { kind: 'say', channel: 'local', words: 'hi' });
  assert.deepEqual(readTyped('/w Ada psst there', 'local'), {
    kind: 'say',
    channel: 'whisper',
    words: 'psst there',
    to: 'Ada',
  });
  assert.deepEqual(readTyped('hi', 'whisper', 'Ada'), { kind: 'say', channel: 'whisper', words: 'hi', to: 'Ada' });
  assert.deepEqual(readTyped('/r thanks', 'local'), { kind: 'reply', words: 'thanks' });
  assert.deepEqual(readTyped('//shrug', 'local'), { kind: 'say', channel: 'local', words: '/shrug' });
});

test("a channel's command alone sets the field to it, and one that is none is refused", () => {
  assert.deepEqual(readTyped('/world', 'local'), { kind: 'switch', channel: 'world' });
  assert.deepEqual(readTyped('/w Ada', 'local'), { kind: 'switch', channel: 'whisper', to: 'Ada' });
  assert.deepEqual(readTyped('/help', 'local'), { kind: 'help' });
  const unknown = readTyped('/dance', 'local');
  assert.deepEqual(unknown, { kind: 'unknown', name: 'dance' });
  if (unknown.kind === 'unknown') assert.equal(refusedWords(unknown), 'There is no /dance command. /help lists them.');
  assert.deepEqual(readTyped('/r', 'local'), { kind: 'empty', name: 'r' });
});

test('what crosses between the page and the hall reads back, and what does not is none', () => {
  assert.deepEqual(saidOf(JSON.stringify({ say: 'hi', channel: 'world' })), { say: 'hi', channel: 'world' });
  assert.deepEqual(saidOf(JSON.stringify({ say: 'hi', channel: 'whisper', to: 'Ada' })), {
    say: 'hi',
    channel: 'whisper',
    to: 'Ada',
  });
  assert.equal(saidOf(JSON.stringify({ say: 'hi', channel: 'whisper' })), null, 'a Whisper names its player');
  assert.equal(saidOf(JSON.stringify({ say: 'hi', channel: 'lobby' })), null);
  assert.equal(saidOf('not json'), null);
  const line = { channel: 'local', from: 'Ada', text: 'hi' };
  assert.deepEqual(fromHallOf(JSON.stringify({ line })), { line });
  assert.deepEqual(fromHallOf(JSON.stringify({ told: 'Ben is not online.' })), { told: 'Ben is not online.' });
  assert.deepEqual(fromHallOf(JSON.stringify({ welcome: { name: null } })), { welcome: { name: null } });
  assert.equal(fromHallOf(JSON.stringify({ line: { channel: 'lobby', from: 'Ada', text: 'hi' } })), null);
});
