import assert from 'node:assert/strict';
import { test } from 'node:test';
import cast from '../../../content/story/cast.json' with { type: 'json' };
import { TONES } from '../plus/tones.ts';
import { Stack } from '../ui/stack.ts';
import { fakeInterface, laidOf, nodesOf, wordsOf } from '../ui/uiForTests.ts';
import { castOf } from './cast.ts';
import { DialogueBox, dialogueNode, speaking, typedSpans } from './dialogue.ts';

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
