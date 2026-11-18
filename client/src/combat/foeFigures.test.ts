import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Card, Cards } from '../player/cards.ts';
import { GLANCE_FLOATS, glanceView } from '../rules/fighters.ts';
import { rosterOf } from '../rules/roster.ts';
import type { Fighting, KeptFoe } from './fighting.ts';
import { Flashes } from './flashes.ts';
import { FoeFigures } from './foeFigures.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const roster = rosterOf(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);
const COLLECTOR = 2;

/** A Collector the room saw at (east, south), at room tick `tick`. */
function fightWith(east: number, south: number, tick: number) {
  const glance = Object.assign(new Float64Array(GLANCE_FLOATS), { 0: east, 1: south });
  const kept: KeptFoe = {
    id: 7,
    kind: 2,
    type: COLLECTOR,
    rank: 2,
    faction: 1,
    phase: 1,
    alert: 2,
    view: glanceView(glance),
    before: null,
    ticks: 1,
  };
  return { foes: new Map([[7, kept]]), roomTick: tick } as unknown as Fighting;
}

const card: Card = { texture: {} as GPUTexture, width: 62, height: 124, root: [31, 124] };
const forge = {
  frames: () => 4,
  draws: () => true,
  warm: () => undefined,
  card: () => card,
} as unknown as Cards;

test('a foe stands in its type’s dress where the room saw it, flashing once struck, marked by its roster name', () => {
  const figures = new FoeFigures(roster);
  const flashes = new Flashes();
  flashes.update([{ tick: 10n, kind: 1, how: 0, striker: 1, defender: 7, amount: 9, stroke: 1 }], 0);
  const cards = figures.cards(fightWith(3, -4, 10), forge, { x: 0, y: 0 }, 0, 1, 1 / 60, flashes);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.flash?.share, 1, 'struck, it flashes');
  const placed = figures.placed.get(7);
  assert.deepEqual([placed?.x, placed?.y, placed?.dress.outfit.right], [3, -4, 'sword_iron']);
  const [marked] = figures.marked(fightWith(3, -4, 10));
  assert.deepEqual([marked?.name, marked?.faction, marked?.view.x], ['Collector', 'The Grey Tithe', 3]);
});

test('a foe the room no longer holds is let go', () => {
  const figures = new FoeFigures(roster);
  figures.cards(fightWith(3, -4, 10), forge, { x: 0, y: 0 }, 0, 1, 1 / 60, new Flashes());
  const gone = { foes: new Map(), roomTick: 11 } as unknown as Fighting;
  assert.deepEqual(figures.cards(gone, forge, { x: 0, y: 0 }, 0, 1, 1 / 60, new Flashes()), []);
  assert.equal(figures.placed.size, 0);
});
