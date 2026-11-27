import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node, Span } from '../../ui/node.ts';
import { hush, keeperSays, keeperSpeaking, sayInScreen, screenOpened, speechBand } from './npcSpeech.ts';

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

test('the keeper is speaking while their line types and a while once typed, as the dialogue box holds a line', () => {
  const holder = globalThis as unknown as Record<string, unknown>;
  const [wasFrame, wasDocument] = [holder['requestAnimationFrame'], holder['document']];
  const frames: FrameRequestCallback[] = [];
  holder['requestAnimationFrame'] = (callback: FrameRequestCallback) => frames.push(callback);
  holder['document'] = { ariaNotify: () => undefined };
  try {
    screenOpened('armorsmith');
    assert.equal(keeperSpeaking(), false, 'nothing said yet');
    keeperSays('armorsmith', 'Hello');
    assert.equal(keeperSpeaking(), true, 'as the line types');
    let clock = performance.now();
    let typed = 0;
    for (let nth = 1; frames.length > 0 && nth < 1_000; nth++) {
      frames.shift()?.((clock += 100));
      if (typed === 0 && lineOf(speechBand('armorsmith', '#c08a3e', 1, 400)).unseen === '') typed = nth;
    }
    assert.ok(typed > 0, 'the line was typed whole');
    assert.equal(keeperSpeaking(), false, 'its while once typed past: the line stands, no longer spoken');
    assert.notEqual(lineOf(speechBand('armorsmith', '#c08a3e', 1, 400)).shown, '', 'still in the band');
    keeperSays('armorsmith', 'Hello');
    hush();
    assert.equal(keeperSpeaking(), false, 'hushed as the screen closes');
    while (frames.length > 0) frames.shift()?.((clock += 100));
  } finally {
    [holder['requestAnimationFrame'], holder['document']] = [wasFrame, wasDocument];
  }
});

test('a scene its keeper says alone is said in their open screen a line at a time; another waits for the box', async () => {
  const holder = globalThis as unknown as Record<string, unknown>;
  const [wasFrame, wasDocument] = [holder['requestAnimationFrame'], holder['document']];
  const frames: FrameRequestCallback[] = [];
  const heard: string[] = [];
  holder['requestAnimationFrame'] = (callback: FrameRequestCallback) => frames.push(callback);
  holder['document'] = { ariaNotify: (said: string) => heard.push(said) };
  try {
    const lines = [
      { who: 'weaponsmith', say: 'Pick one blade.' },
      { who: 'weaponsmith', say: 'Both are my gift.' },
    ];
    assert.equal(sayInScreen(lines), null, 'no screen open');
    screenOpened('weaponsmith');
    assert.equal(sayInScreen([{ who: 'stranger', say: 'Not hers.' }, ...lines]), null, 'another speaker in it');
    let ended = false;
    const saying = sayInScreen(lines)?.then(() => (ended = true));
    assert.ok(saying, 'hers alone: said here');
    assert.equal(sayInScreen(lines), null, 'one scene at a time');
    keeperSays('weaponsmith', 'Hello');
    let clock = performance.now();
    for (let nth = 1; frames.length > 0 && nth < 2_000; nth++) frames.shift()?.((clock += 100));
    await saying;
    assert.ok(ended);
    assert.deepEqual(
      heard,
      ['Pick one blade.', 'Both are my gift.'],
      'each line heard once, in turn, no greeting over them',
    );
    hush();
  } finally {
    [holder['requestAnimationFrame'], holder['document']] = [wasFrame, wasDocument];
  }
});

test('closing the screen mid-scene ends the scene, so the roads never wait on it', async () => {
  const holder = globalThis as unknown as Record<string, unknown>;
  const wasFrame = holder['requestAnimationFrame'];
  holder['requestAnimationFrame'] = () => 0;
  try {
    screenOpened('mage');
    const saying = sayInScreen([{ who: 'mage', say: 'Bring me what the sea gave up.' }]);
    hush();
    await saying;
    assert.equal(sayInScreen([{ who: 'mage', say: 'Again.' }]), null, 'closed: nothing is said here');
  } finally {
    holder['requestAnimationFrame'] = wasFrame;
  }
});
