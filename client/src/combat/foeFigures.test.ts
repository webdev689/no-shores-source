import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { FLASH } from '../player/cardLooks.ts';
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
    level: 0,
    shield: null,
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
  assert.equal(cards[0]?.flash?.stage, FLASH.whole, 'struck, it flashes whole');
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

/** The Collector of `fightWith`, dead `elapsed` ticks. */
function deadFight(elapsed: number) {
  const fight = fightWith(3, -4, 10);
  const kept = fight.foes.get(7);
  if (!kept) throw new Error('no foe');
  const view = { ...kept.view, action: { kind: 'dead', elapsed } as const };
  return { ...fight, foes: new Map([[7, { ...kept, view }]]) } as unknown as Fighting;
}

test('a foe slain dissolves once its fall is over, or at once in the element its death was given, and then is not drawn', () => {
  const plain = new FoeFigures(roster);
  const flashes = new Flashes();
  const cardAt = (figures: FoeFigures, clock: number) =>
    figures.cards(deadFight(1), forge, { x: 0, y: 0 }, clock, 1, 1 / 60, flashes);
  assert.equal(cardAt(plain, 0)[0]?.dissolve, undefined, 'falling, whole');
  assert.equal(cardAt(plain, 0.5)[0]?.dissolve, undefined);
  const crumbling = cardAt(plain, 1.3)[0]?.dissolve;
  assert.ok(crumbling && crumbling.share > 0 && crumbling.share < 1 && crumbling.look === 0, 'plain, it crumbles');
  assert.equal(cardAt(plain, 3).length, 0, 'gone');
  const burnt = new FoeFigures(roster);
  burnt.dissolveFoe(7, 1, 0);
  const burning = cardAt(burnt, 0.2)[0]?.dissolve;
  assert.ok(burning && burning.look === 1 && burning.share > 0, 'Blaze burns it at once');
  // Standing again, it is whole.
  assert.equal(burnt.cards(fightWith(3, -4, 10), forge, { x: 0, y: 0 }, 5, 1, 1 / 60, flashes)[0]?.dissolve, undefined);
});

test('a struck foe is drawn slid along the blow and back, its feet where the room has it', () => {
  const figures = new FoeFigures(roster);
  const flashes = new Flashes();
  const where = (id: number) => (id === 1 ? ([3, -6, 0] as const) : ([3, -4, 0] as const));
  const hit = { tick: 10n, kind: 1, how: 0, striker: 1, defender: 7, amount: 9, stroke: 1 };
  flashes.update([hit], 0, { player: 1, look: 0, where });
  const drawnY = () => {
    const cards = figures.cards(fightWith(3, -4, 10), forge, { x: 0, y: 10 }, 0, 1, 1 / 60, flashes);
    return figures.placed.get(7)?.y === -4 ? (cards[0]?.y ?? 0) : Number.NaN;
  };
  const still = drawnY();
  flashes.update([], 4 / 60);
  assert.ok(drawnY() > still + 0.05, 'pushed south, away from its striker');
  flashes.update([], 20 / 60);
  assert.ok(Math.abs(drawnY() - still) < 1e-9, 'and back');
});
