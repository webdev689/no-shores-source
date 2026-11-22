// The ship's bar in a sea fight, built as the Arts' bar: an icon in a ring over its keycap for each ability.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ShipAbility } from '../plus/seaFight.ts';
import type { Child, Node } from '../ui/node.ts';
import { allOf, wordsIn } from './nodes.test.ts';
import { USED_SECONDS } from './ringSlot.ts';
import { ShipAbilityBar, shipBarSize, shipSlotShown, usedBetween } from './shipAbilityBar.ts';
import { SHIP_MAPS } from './shipIcons.ts';

/** A ready port broadside, unless `more` says otherwise. */
const ability = (more: Partial<ShipAbility> = {}): ShipAbility => ({
  id: 'port',
  icon: 'port',
  name: 'Port broadside',
  key: 'Right button',
  state: 'ready',
  unable: false,
  charge: 1,
  left: 0,
  running: 0,
  laid: false,
  said: 'ready',
  ...more,
});
/** The bar as a fight begins it: the port side loading, the rest ready. */
const BAR: readonly ShipAbility[] = [
  ability({ state: 'charging', charge: 0.6, left: 3.2, said: '4 s to reload' }),
  ability({ id: 'starboard', icon: 'starboard', name: 'Starboard broadside' }),
  ability({ id: 'burst', icon: 'burst', name: 'Burst', key: 'Shift' }),
  ability({ id: 'brace', icon: 'brace', name: 'Brace', key: 'C' }),
  ability({ id: 'load', icon: 'round', name: 'Round shot', key: 'Wheel', said: 'loaded' }),
];
/** `BAR` with the ability `id` changed as `more` says. */
const barWith = (id: string, more: Partial<ShipAbility>): ShipAbility[] =>
  BAR.map((each) => (each.id === id ? { ...each, ...more } : each));
/** The pictures a slot draws, by their keys. */
const keysOf = (slot: Child) => allOf(slot).flatMap((node) => node.picture?.key ?? []);

test('a side reloading is swept dark as far as it has still to load, its last seconds counted; loaded, it glows', () => {
  const port = shipSlotShown(ability({ state: 'charging', charge: 0.6, left: 3.2 }));
  assert.deepEqual(port.sweep, { sweep: 144, seconds: '4', ready: false });
  assert.equal(port.glow, null);
  const starboard = shipSlotShown(ability());
  assert.deepEqual([starboard.sweep, starboard.glow?.colour], [null, '#f3cf86'], 'ready: no wedge, lit in brass');
  const laid = shipSlotShown(ability({ laid: true }));
  assert.equal(laid.glow?.colour, '#ffc940', 'laid: gold');
  assert.ok((laid.glow?.width ?? 0) > (starboard.glow?.width ?? 0), 'and wider');
  assert.equal(shipSlotShown(ability({ unable: true })).glow, null, 'one that cannot fire does not glow');
});

test('the burst drains its ring as it runs and sweeps its wedge as it recharges, counting its last seconds', () => {
  const running = shipSlotShown(ability({ id: 'burst', state: 'active', charge: 0, running: 0.5, left: 2 }));
  assert.deepEqual([running.drain, running.sweep], [30, null]);
  const charging = shipSlotShown(ability({ id: 'burst', state: 'charging', charge: 0.5, left: 6 }));
  assert.deepEqual([charging.drain, charging.sweep], [0, { sweep: 180, seconds: '6', ready: false }]);
  const early = shipSlotShown(ability({ id: 'burst', state: 'charging', charge: 0.1, left: 10.8 }));
  assert.equal(early.sweep?.seconds, '', '10.8 s: too long to count');
  const braced = shipSlotShown(ability({ id: 'brace', state: 'active', running: 1 }));
  assert.equal(braced.drain, 60, 'the brace held: lit whole');
});

test('an ability is used as a side fires, the burst begins, the brace is taken or the load changes', () => {
  const ids = (now: readonly ShipAbility[]) =>
    usedBetween(BAR, now).flatMap((used, index) => (used ? [now[index]?.id] : []));
  const fired = barWith('starboard', { state: 'charging', charge: 0, left: 4 });
  assert.deepEqual(ids(fired), ['starboard'], 'fired: reloading');
  assert.deepEqual(ids(barWith('port', { charge: 0.65, left: 3 })), [], 'loading on is no use');
  assert.deepEqual(ids(barWith('burst', { state: 'active', charge: 0, running: 1 })), ['burst']);
  assert.deepEqual(ids(barWith('brace', { state: 'active', running: 1 })), ['brace']);
  assert.deepEqual(ids(barWith('load', { icon: 'grape', name: 'Grape shot' })), ['load']);
  assert.deepEqual(usedBetween(null, BAR), [false, false, false, false, false], 'first shown: none');
  assert.deepEqual(usedBetween(BAR.slice(0, 4), BAR).at(4), false, 'one not there before');
});

test('on the display each ring stands over its keycap, said to a reader, its key drawn where it is no word', () => {
  const faces: string[] = [];
  const bar = new ShipAbilityBar((key, texel) => {
    faces.push(`${key} ${texel}`);
    return key === 'Right button' ? { width: 7 * texel, height: 11 * texel, label: 'mouse' } : null;
  });
  bar.update(BAR, 1 / 60);
  const root = bar.node(false);
  assert.equal(root?.label, 'Your Ship');
  const slots = root?.children ?? [];
  assert.deepEqual(
    slots.map((slot) => slot && slot.label),
    [
      'Port broadside (Right button), 4 s to reload',
      'Starboard broadside (Right button), ready',
      'Burst (Shift), ready',
      'Brace (C), ready',
      'Round shot (Wheel), loaded',
    ],
  );
  assert.deepEqual(wordsIn(slots[0]), ['4'], 'its seconds; its key drawn, not written');
  assert.ok(allOf(slots[0]).some((node) => node.label === 'mouse'));
  assert.deepEqual(wordsIn(slots[2]), ['Shift']);
  assert.ok(faces.includes('Shift 1'), 'asked at the first step, a texel a pixel');
  assert.ok(
    keysOf(slots[0]).some((key) => key.startsWith('ring sweep')),
    'its wedge',
  );
  assert.ok(
    keysOf(slots[4]).some((key) => key.startsWith('ship round ')),
    "the load's own picture",
  );
  bar.node(true, 2);
  assert.ok(faces.includes('Shift 4'), 'larger and doubled');
  const pad = new ShipAbilityBar();
  pad.update(barWith('brace', { key: 'pad:B' }));
  assert.deepEqual(wordsIn(pad.node(false)?.children?.[3] ?? null), ['B'], "a pad's button by its own name");
});

test('a side fired flashes its ring, and one that cannot fire greys under a hatch', () => {
  const bar = new ShipAbilityBar();
  bar.update(BAR, 1 / 60);
  bar.update(barWith('starboard', { state: 'charging', charge: 0, left: 4 }), 1 / 60);
  const flashed = (node: Node | null) => keysOf(node?.children?.[1] ?? null).includes('ship ring 0.45 3');
  assert.ok(flashed(bar.node(false)), 'its frame bright');
  bar.update(barWith('starboard', { state: 'charging', charge: 0.02, left: 3.9 }), USED_SECONDS);
  assert.equal(flashed(bar.node(false)), false, 'its flash over');
  bar.update(barWith('port', { unable: true }), 1 / 60);
  const port = bar.node(false)?.children?.[0] ?? null;
  assert.ok(keysOf(port).includes('unable hatch'));
  bar.update(null);
  assert.equal(bar.node(false), null, 'hidden with no fight');
});

test('the bar reaches as far as its rings and their gaps, and as high as a ring and its keycap', () => {
  assert.deepEqual(shipBarSize(5, false), { width: 5 * 44 + 4 * 8, height: 44 + 11 });
  assert.deepEqual(shipBarSize(5, true), { width: 5 * 66 + 4 * 12, height: 66 + 18 });
  assert.deepEqual(shipBarSize(5, false, 2), { width: (5 * 44 + 4 * 8) * 2, height: (44 + 11) * 2 });
  assert.deepEqual(shipBarSize(6, false).width, 6 * 44 + 5 * 8, 'one more ability, one more ring');
});

test('every picture is 12 cells a side, as a Tenet’s icon is', () => {
  for (const [icon, rows] of Object.entries(SHIP_MAPS)) {
    assert.equal(rows.length, 12, icon);
    assert.ok(
      rows.every((row) => row.length === 12 && /^[a-f.]+$/.test(row)),
      icon,
    );
  }
});
