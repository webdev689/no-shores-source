import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FakeElement, findAll, onFakePage } from '../../combat/page.test.ts';
import { keeperSays, speechBand } from './npcSpeech.ts';

/** The stand-in page with what the band writes beyond it: a text node, and frames run by hand. */
function onPage(run: (frames: FrameRequestCallback[]) => void): void {
  onFakePage(() => {
    const holder = globalThis as unknown as Record<string, unknown> & {
      document: { createElement: (tag: string) => FakeElement; createTextNode?: (data: string) => unknown };
    };
    const made = holder.document.createElement;
    holder.document.createTextNode = (data) => Object.assign(made('#text'), { data, isConnected: true });
    const frames: FrameRequestCallback[] = [];
    const wasFrame = holder['requestAnimationFrame'];
    holder['requestAnimationFrame'] = (callback: FrameRequestCallback) => frames.push(callback);
    try {
      run(frames);
    } finally {
      holder['requestAnimationFrame'] = wasFrame;
    }
  });
}

test('the keeper’s line reaches a polite live copy only once it is typed whole', () => {
  onPage((frames) => {
    const band = speechBand('armorsmith');
    keeperSays('armorsmith', 'Hello');
    const [heard] = findAll(band, 'npc-speech-heard');
    assert.equal(heard?.attributes['aria-live'], 'polite');
    assert.equal(heard?.textContent, '', 'nothing is heard while it types');
    for (let nth = 1; frames.length > 0 && nth < 1_000; nth++) frames.shift()?.(performance.now() + nth * 100);
    assert.ok((heard?.textContent ?? '').length > 0, 'the whole line is heard');
  });
});
