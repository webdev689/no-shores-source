import assert from 'node:assert/strict';
import { test } from 'node:test';
import cast from '../../../content/story/cast.json' with { type: 'json' };
import { TONES } from '../plus/tones.ts';
import { Stack } from '../ui/stack.ts';
import { byId, fakeInterface, laidOf, nodesOf, wordsOf } from '../ui/uiForTests.ts';
import type { Node } from '../ui/node.ts';
import { castOf } from './cast.ts';
import { DialogueBox, continueDialogue, dialogueNode, dialogueWaits, speaking, typedSpans } from './dialogue.ts';

const read = castOf(cast);
const named = Object.entries(read.speakers).find(([, speaker]) => speaker.name !== '');
const nameless = Object.entries(read.speakers).find(([, speaker]) => speaker.name === '');

/** What the page's announcement was told, in turn. */
function heard(): string[] {
  const said: string[] = [];
  Object.assign(globalThis, { document: { ariaNotify: (words: string) => said.push(words) } });
  return said;
}

test('a screen reader hears each line whole and under its speaker’s name, never as it types', () => {
  const said = heard();
  const box = new DialogueBox(new Stack(), () => null);
  const [who, speaker] = named ?? ['', { name: '' }];
  void box.play([{ who, say: 'There you are.' }], read, { auto: false });
  box.frame(0.05);
  assert.deepEqual(said, [], 'nothing while it types');
  for (let step = 0; step < 200; step++) box.frame(0.05);
  assert.deepEqual(said, [`${speaker.name}: There you are.`], 'once, whole');
  box.remove();
  Object.assign(globalThis, { document: undefined });
});

test('the box is drawn on the stack while a named speaker talks, and the HUD hears that someone speaks', () => {
  const stack = new Stack();
  const { ui } = fakeInterface();
  const box = new DialogueBox(stack, () => null);
  assert.equal(speaking(), false);
  const [who, speaker] = named ?? ['', { name: '' }];
  void box.play([{ who, say: 'Up. Now.' }], read);
  assert.equal(speaking(), true);
  assert.ok(wordsOf(laidOf(stack.node(ui))).includes(speaker.name), 'the name over the words');
  box.skip();
  assert.equal(speaking(), false, 'gone between plays');
  assert.deepEqual(wordsOf(laidOf(stack.node(ui))), []);
  box.remove();
});

test('a voice from nowhere is its words alone, mid-screen, and holds no box the HUD gives way to', () => {
  const stack = new Stack();
  const { ui } = fakeInterface();
  const box = new DialogueBox(stack, () => null);
  void box.play([{ who: nameless?.[0] ?? '', say: 'Below.' }], read);
  box.frame(5);
  assert.equal(speaking(), false);
  const laid = laidOf(stack.node(ui));
  const words = laid.find((each) => each.node.text);
  assert.ok(words);
  assert.ok(Math.abs(words.box.y + words.box.height / 2 - 360) <= 1, 'in the middle');
  assert.ok(!laid.some((each) => each.node.role === 'window'));
  box.remove();
});

test('the words still to type are laid unseen, so the typed never reflow', () => {
  const half = laidOf(dialogueNode('Kael', typedSpans('Hold fast', ' to the rail'), 1280));
  const whole = laidOf(dialogueNode('Kael', typedSpans('Hold fast to the rail', ''), 1280));
  const box = (laid: ReturnType<typeof laidOf>) => laid.find((each) => each.node.role === 'window')?.box;
  assert.deepEqual(box(half), box(whole));
});

test('the box keeps to the middle over the sea bar, clear of the vitals, and never narrower than 330 px', () => {
  for (const [width, wide] of [
    [1920, 660],
    [1280, 520],
    [800, 330],
  ] as const) {
    const laid = laidOf(
      { width: 'grow', height: 'grow', children: [dialogueNode('Kael', typedSpans('Up.', ''), width)] },
      width,
      720,
    );
    const box = laid.find((each) => each.node.role === 'window')?.box;
    assert.ok(box);
    assert.equal(box.width, wide, `${width} px`);
    assert.equal(box.x + box.width / 2, width / 2);
    assert.equal(box.y + box.height, 720 - 104);
  }
});

test("each speaker's name is shown in their own colour, turn by turn, and a name with none in the kit's brass", () => {
  const box = new DialogueBox(new Stack(), () => null);
  const { ui } = fakeInterface(1280, 720);
  const nameColour = (name: string) => nodesOf(box.node(ui)).find((each) => each.text?.words === name)?.text?.colour;
  const stranger = read.speakers.stranger;
  const tack = read.speakers.tack;
  assert.ok(stranger?.colour && tack?.colour && stranger.colour !== tack.colour);
  void box.play(
    [
      { who: 'stranger', say: 'The Tack has horses.' },
      { who: 'tack', say: 'There is always a Bay.' },
    ],
    read,
  );
  assert.equal(nameColour(stranger.name), stranger.colour);
  box.advance();
  box.advance();
  assert.equal(nameColour(tack.name), tack.colour);
  box.remove();
  const plain = nodesOf(dialogueNode('Kael', typedSpans('Up.', ''), 1280));
  assert.equal(plain.find((each) => each.text?.words === 'Kael')?.text?.colour, TONES.brassHi);
});

/** A cap for the prompt, as the game's own keycap stands in for it. */
const CAP = { id: 'cap', text: { words: 'Space' } };
const prompted = (node: Parameters<typeof nodesOf>[0]) => nodesOf(node).some((each) => each.text?.words === 'Continue');

test('a typed line that waits shows the prompt to continue with its key, not while it types, and a press moves it on', async () => {
  const box = new DialogueBox(
    new Stack(),
    () => null,
    () => CAP,
  );
  const { ui } = fakeInterface(1280, 720);
  const [who] = named ?? [''];
  const said = box.play(
    [
      { who, say: 'Hold fast.' },
      { who, say: 'Now pull.' },
    ],
    read,
    { auto: false },
  );
  assert.equal(dialogueWaits(), true, "the press is the line's while it types");
  assert.equal(prompted(box.node(ui)), false, 'no prompt while it types');
  continueDialogue();
  assert.equal(prompted(box.node(ui)), true, 'a press types it whole, and it waits');
  assert.ok(byId(box.node(ui), 'cap'), "the key's cap beside the word");
  for (let step = 0; step < 100; step++) box.frame(0.1);
  assert.ok(wordsOf(laidOf(box.node(ui) as Node)).includes('Hold fast.'), 'it waits however long it stands');
  continueDialogue();
  assert.ok(
    wordsOf(laidOf(box.node(ui) as Node)).some((words) => words.includes('Now')),
    'the next line begins',
  );
  assert.equal(prompted(box.node(ui)), false);
  continueDialogue();
  continueDialogue();
  assert.equal(dialogueWaits(), false, 'said, the press is free again');
  await said;
  box.remove();
});

test('a line that moves on by itself shows no prompt and takes no press', () => {
  const box = new DialogueBox(
    new Stack(),
    () => null,
    () => CAP,
  );
  const { ui } = fakeInterface(1280, 720);
  void box.play([{ who: named?.[0] ?? '', say: 'Brace!' }], read, { auto: true });
  box.frame(0.5);
  assert.equal(dialogueWaits(), false);
  assert.equal(prompted(box.node(ui)), false);
  box.remove();
});

test('a voice from nowhere waits too, its prompt under its words and as faint as they are', () => {
  const box = new DialogueBox(
    new Stack(),
    () => null,
    () => CAP,
  );
  const { ui } = fakeInterface(1280, 720);
  void box.play([{ who: nameless?.[0] ?? '', say: 'Wake.' }], read, { auto: false });
  box.frame(5);
  assert.equal(dialogueWaits(), true);
  const laid = laidOf(box.node(ui) as Node);
  const words = laid.find((each) => each.node.text?.words === 'Continue');
  const line = laid.find((each) => wordsOf([each]).includes('Wake.'));
  assert.ok(words && line);
  assert.ok(words.box.y > line.box.y, 'under its words');
  assert.ok(
    nodesOf(box.node(ui)).some((each) => each.opacity === 0.7 && prompted(each)),
    'faint',
  );
  box.remove();
  assert.equal(dialogueWaits(), false, 'a box taken away holds no press');
});
