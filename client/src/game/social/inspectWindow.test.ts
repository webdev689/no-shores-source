import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Details } from '../../network/accounts.ts';
import type { Child, Node } from '../../ui/node.ts';
import { fakeInterface, nodesOf, wordsIn } from '../../ui/uiForTests.ts';
import { INSPECT_BACK, InspectWindow } from './inspectWindow.ts';

const details: Details = {
  name: 'ChiefKabr',
  tag: 'SWK',
  emblem: 'stormborn',
  level: 24,
  place: null,
  playing: true,
  guild: null,
  shown: { level: 24, defense: 60, attack: 310, emblem: 'stormborn', worn: [], prestige: 84 },
};

test("Inspect is headed by the player's emblem banner across the window, their name, tag, level and power over it", () => {
  Object.assign(globalThis, { devicePixelRatio: 1 });
  const { ui, step } = fakeInterface(1280, 800);
  const inspect = new InspectWindow(() => null);
  let built: Child = null;
  let back = 0;
  const frame = (events: Parameters<typeof step>[1] = []) =>
    step(
      () => (built = inspect.node(ui, ui.size, { name: 'ChiefKabr', details, dress: null }, () => (back += 1)) as Node),
      events,
    );
  frame();
  frame();
  const banner = nodesOf(built).find((node) => node.id === 'gear-banner');
  const emblem = nodesOf(banner ?? null).find((node) => node.picture);
  assert.match(emblem?.picture?.key ?? '', /^emblem stormborn banner /, 'their emblem, drawn as a banner');
  const window = ui.boxOf('inspect');
  const across = ui.boxOf('gear-banner');
  assert.ok(window && across && across.width >= window.width - 8, 'the banner runs the window across');
  const words = wordsIn(built);
  assert.ok(words.includes('ChiefKabr [SWK]'));
  assert.ok(words.includes('Level 24 · Prestige 84 · Defense 60'));
  const press = ui.boxOf(INSPECT_BACK);
  assert.ok(press);
  const [x, y] = [press.x + press.width / 2, press.y + press.height / 2];
  frame([
    { kind: 'pointer', x, y },
    { kind: 'down', x, y, button: 0 },
    { kind: 'up', x, y, button: 0 },
  ]);
  assert.equal(back, 1, 'Back goes back');
});
