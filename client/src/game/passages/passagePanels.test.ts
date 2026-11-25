import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakePage } from '../pageForTests.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { UiEvent } from '../../ui/ui.ts';
import { fakeInterface } from '../../ui/uiForTests.ts';
import { haulNode, lampNode, MouthsCardView, signNode } from './passagePanels.ts';
import { haulView, lampPrompt, type MouthsChoice, onwardSign } from './passageWords.ts';

const choice: MouthsChoice = {
  run: 'The Chalk Adit',
  beyond: onwardSign(
    {
      number: 0,
      depth: 1,
      lane: 0,
      at: [0, 0],
      ground: { kind: 'under', style: 'chalk' },
      size: 'small',
      deal: 'reliquary',
      currents: [],
      name: 'A chalk cut',
      onward: [1],
      lamp: null,
    },
    true,
  ),
  modifiers: [],
  routes: [
    { route: 'public', words: 'The public passage' },
    { route: 'alone', words: 'Your own route, alone' },
  ],
  starts: [
    { lamp: null, words: 'Go in' },
    { lamp: 2, words: 'Begin at the second lamp' },
  ],
};

/** Every word a tree says, in order. */
function said(node: Child): string[] {
  if (!node || typeof node !== 'object') return [];
  const own = (node as Node).text?.words;
  const spoken = typeof own === 'string' ? [own] : (own ?? []).map((span) => span.words);
  return [...spoken, ...((node as Node).children ?? []).flatMap(said)];
}

function card() {
  fakePage();
  const went: string[] = [];
  const view = new MouthsCardView({
    go: (route, lamp) => void went.push(`${route}:${lamp ?? 'mouth'}`),
    close: () => void went.push('close'),
  });
  view.show(choice);
  const { ui, step } = fakeInterface(1280, 720);
  let built: Child = null;
  const frame = (events: UiEvent[] = []) =>
    step(() => ({ width: 'grow', height: 'grow', children: [(built = view.layer(ui))] }), events);
  frame();
  frame();
  return { ui, went, view, frame, built: () => built };
}

test('the mouths’ card shows the zone beyond, the routes and where to begin', () => {
  const { built } = card();
  const words = said(built());
  for (const line of ['THE CHALK ADIT', 'A chalk cut', 'The public passage', 'Your own route, alone', 'Go in'])
    assert.ok(words.includes(line), line);
  assert.ok(words.includes('Begin at the second lamp'));
});

test('a route chosen is the one a start goes by; the pad’s B closes it', () => {
  const { ui, went, view, frame } = card();
  const press = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, id);
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    frame([
      { kind: 'pointer', x, y },
      { kind: 'down', x, y, button: 0 },
    ]);
    frame([{ kind: 'up', x, y, button: 0 }]);
  };
  press('passage-route-alone');
  assert.equal(view.chosen, 'alone');
  press('passage-start-2');
  assert.deepEqual(went, ['alone:2']);
  frame([{ kind: 'pad', button: 'back' }]);
  assert.deepEqual(went, ['alone:2', 'close']);
});

test('the sign, the haul and the lamp’s prompt each say their view model’s words', () => {
  const view = { width: 1280, height: 720 };
  assert.ok(said(signNode(choice.beyond, view)).includes('A chalk cut'));
  assert.equal(haulNode(haulView({ items: [], vestiges: 0, materials: [], lantern: false }), view), null);
  const haul = haulNode(haulView({ items: [], vestiges: 1, materials: [], lantern: false }), view);
  assert.ok(said(haul).includes('A Vestige'));
  assert.ok(said(lampNode(lampPrompt(false, false), 0.5)).includes('Light the lamp'));
});
