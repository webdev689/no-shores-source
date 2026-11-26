import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FightEffects } from './fightEffects.ts';
import type { Fighting } from './fighting.ts';

const TICK = 1 / 60;

/** A fight holding one foe `side`, `kind`, standing at (0, -6), and the player's own arrow just let go north at it. */
function fightWith(side: 'foes' | 'players', kind: string): Fighting {
  const view = { id: 7, x: 0, y: -6, z: 0, side, action: { kind } };
  return {
    foes: new Map([[7, { id: 7, view }]]),
    others: new Map(),
    own: null,
    player: 1,
    roomTick: 0,
    shots: [],
    aimRing: null,
    castSent: null,
    spells: { spells: new Map(), arts: new Map() },
    fired: [{ ranged: 1, at: [0, 0, 1.4], velocity: [0, -45, 0] }],
    takeShots: () => [],
  } as unknown as Fighting;
}

/** The surfaces the player's arrow struck over a third of a second, the foe drawn where it stands. */
function struckIn(fight: Fighting): string[] {
  const effects = new FightEffects();
  const drawn = { foes: new Map([[7, { x: 0, y: -6, z: 0 }]]), others: new Map() };
  const where = {
    eye: [0, 10, 1.5] as const,
    blocks: [],
    bodies: [[0, -6, 0] as const],
    muzzleOf: () => [0, 0, 1.4] as const,
    drawn,
  };
  const struck: string[] = [];
  for (let tick = 0; tick < 18; tick++) {
    effects.marks(fight, TICK, where);
    struck.push(...effects.shotsHeard.struck.map((one) => one.surface));
  }
  return struck;
}

test("the player's own arrow stops in a living foe, and flies on past a dead one and one of the players' side", () => {
  assert.deepEqual(struckIn(fightWith('foes', 'idle')), ['body']);
  assert.deepEqual(struckIn(fightWith('foes', 'dead')), []);
  assert.deepEqual(struckIn(fightWith('players', 'idle')), []);
});

test("the player's own hit foreseen flashes its foe as it lands, and the room's word on it flashes nothing more", () => {
  const hit = { tick: 1n, kind: 1, how: 1, striker: 1, defender: 7, amount: 10, stroke: 3 };
  const heard: { foreseen: unknown[]; told: unknown[] } = { foreseen: [hit], told: [] };
  const fight = {
    ...fightWith('foes', 'idle'),
    takeEvents: () => heard.told.splice(0),
    takeForeseen: () => heard.foreseen.splice(0),
  } as unknown as Fighting;
  const effects = new FightEffects();
  effects.events(fight, TICK);
  assert.ok(effects.flashes.flashOf(7), 'flashed as the blow landed');
  for (let frame = 0; frame < 20; frame += 1) effects.events(fight, TICK);
  assert.equal(effects.flashes.flashOf(7), undefined, 'its flash over');
  heard.told.push({ ...hit, felt: true });
  effects.events(fight, TICK);
  assert.equal(effects.flashes.flashOf(7), undefined, "no flash again on the room's word");
});
