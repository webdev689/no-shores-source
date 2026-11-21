import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node, Span } from '../../ui/node.ts';
import { hush, keeperSays, speechBand } from './npcSpeech.ts';

/** The band's line: what shows, and what keeps its room unseen. */
function lineOf(band: Node): { shown: string; unseen: string } {
  const words = (band.children?.[1] as Node | undefined)?.text?.words as readonly Span[] | undefined;
  return { shown: words?.[0]?.words ?? '', unseen: words?.[1]?.words ?? '' };
}

test('the keeper’s line types into the band, keeping its room, and is heard once whole; closing hushes it', () => {
  const holder = globalThis as unknown as Record<string, unknown>;
  const [wasFrame, wasDocument] = [holder['requestAnimationFrame'], holder['document']];
  const frames: FrameRequestCallback[] = [];
  const heard: string[] = [];
  holder['requestAnimationFrame'] = (callback: FrameRequestCallback) => frames.push(callback);
  holder['document'] = { ariaNotify: (said: string) => heard.push(said) };
  try {
    keeperSays('armorsmith', 'Hello');
    const first = lineOf(speechBand('armorsmith', '#c08a3e', 1, 400));
    assert.equal(first.shown, '', 'nothing typed yet');
    assert.ok(first.unseen.length > 0, 'the whole line keeps its room');
    assert.deepEqual(heard, [], 'nothing is heard while it types');
    for (let nth = 1; frames.length > 0 && nth < 1_000; nth++) frames.shift()?.(performance.now() + nth * 100);
    const whole = lineOf(speechBand('armorsmith', '#c08a3e', 1, 400));
    assert.equal(whole.unseen, '');
    assert.deepEqual(heard, [whole.shown], 'the whole line is heard, once');
    hush();
    assert.equal(lineOf(speechBand('armorsmith', '#c08a3e', 1, 400)).shown, '', 'hushed as the screen closes');
  } finally {
    [holder['requestAnimationFrame'], holder['document']] = [wasFrame, wasDocument];
  }
});
