import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Stack } from '../ui/stack.ts';
import { fakeInterface } from '../ui/uiForTests.ts';
import { HeldMap } from './heldMap.ts';

/** A map up over the view with a place chosen, its GPU drawing left out: what its layer shows and hears alone. */
function mapUp() {
  const map = Object.create(HeldMap.prototype) as HeldMap;
  const place = { id: 'salt', name: 'Saltmere Reach', kind: 'node', at: [100, 100], sail: [90, 90] } as const;
  Object.assign(map, {
    phase: { kind: 'open' },
    ink: { x: 200, y: 150, width: 800, height: 450 },
    mapView: { left: 0, top: 0, scale: 1 },
    shownAt: { lift: 1, drop: 0 },
    shipAt: { x: 300, y: 300, heading: 0 },
    placed: [{ place, x: 400, y: 200 }],
    choice: { at: place.sail, name: place.name, course: { ok: true, points: [] }, place: place.id },
    difficulty: 'calm',
    picked: 'calm',
    lowered: () => undefined,
  });
  const stack = new Stack();
  stack.add((ui) => map.node(ui));
  const { ui, step } = fakeInterface();
  const frame = (events: Parameters<typeof step>[1] = []) => step(() => stack.node(ui), events);
  const press = (id: string) => {
    frame();
    const box = ui.boxOf(id);
    assert.ok(box, id);
    const [x, y] = [box.x + 2, box.y + 2];
    frame([
      { kind: 'down', x, y, button: 0 },
      { kind: 'up', x, y, button: 0 },
    ]);
  };
  return { map, ui, frame, press };
}

test("the card's seas and Set sail take the pointer, and set sail at the seas chosen", () => {
  const { map, press } = mapUp();
  press('held-seas:storm');
  press('held-sail');
  assert.equal(map.difficulty, 'storm');
  assert.equal(map.shown, true, 'lowering');
});

test("the map's names, its ship and the card's ground let a click through to the map", () => {
  const { ui, frame } = mapUp();
  frame();
  const card = ui.boxOf('held-card');
  assert.ok(card);
  assert.equal(ui.takes(card.x + 3, card.y + 3), false, "the card's edge");
  assert.equal(ui.takes(200 + 400 + 12, 150 + 200 - 2), false, 'a name');
  assert.equal(ui.takes(200 + 300, 150 + 300), false, 'the ship');
});
