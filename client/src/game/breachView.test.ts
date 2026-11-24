import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { moduleNumber } from '../city/modules.ts';
import { type BreachSeen, STONE } from '../network/breachMessages.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import type { SeenPlayer } from '../network/messages.ts';
import type { NodeLayout } from '../layout/layouts.ts';
import { FIGHTER_FLOATS, fighterView } from '../rules/fighters.ts';
import { breachPlanOf, runPlace, sealOpen, spaceSocket } from './breachPlan.ts';
import { type BreachOn, BreachView, gateOf, withBreach } from './breachView.ts';
import type { NodeInfo } from './worldData.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const module = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const plan = breachPlanOf(module);
const zone = { id: 'gullwing-vale', kind: 'patrol', name: 'Gullwing Vale', continent: 'continent-1' } as NodeInfo;
const into = { run: 'node-gullwing-vale--breach-hard--run-k3j4h5g6', tier: 1, plan, zone };
const SEEN: BreachSeen = {
  ...{ gate: false, tier: 1, phases: [2, 1, 0, 0, 0, 0], reached: 1, seals: 0b1, revives: 5 },
  ...{ stone: STONE.plinth, bearer: 0, stoneAt: [0, -60, 50], charge: 1, held: 0, lyingTicks: 0 },
  ...{ marked: [], raising: [], chests: 0, encounter: 1, stage: 0, stageTicks: 0, counts: [0, 0, 0], bells: [] },
  ...{ bellFoes: [40], broken: 0, ringTicks: 0, fontTicks: 0, boss: 0, warded: false, desk: 0, markedDesk: -1 },
  ...{ deskTicks: 0, writeTicks: 0, seen: false, wipeTicks: 0, rifts: [], riftHeld: [], kept: 0, takings: 0 },
  ...{ takingTicks: 0, awayShore: -1, away: [], wayBack: false, bareTicks: 0, heldBy: false, fill: 0 },
  ...{ woken: false, claims: 0, openTo: [], holders: [], inside: [] },
};

/** Another player's word at (x, y, z), fallen or standing: their fighter's numbers, its action dead where fallen. */
function player(id: number, where: readonly [number, number, number], down: boolean): SeenPlayer {
  const fighter = new Float64Array(FIGHTER_FLOATS);
  return {
    ...{ player: id, acknowledged: 0, anim: 'idle', frame: 0, facing: 0, standing: { kind: 'inside' } },
    body: { x: where[0], y: where[1], z: where[2] } as SeenPlayer['body'],
    fighter: down ? deadFighter(fighter) : fighter,
  };
}

/** A fighter whose action is death (its kind 12, `fighters.ts`), at whichever of its numbers the action's kind is. */
function deadFighter(fighter: Float64Array): Float64Array {
  for (let index = 0; index < fighter.length; index++) {
    fighter.fill(0);
    fighter[index] = 12;
    if (fighterView(fighter).action.kind === 'dead') return fighter;
  }
  throw new Error('no number reads as death');
}

/** The view of a run, and what it asked of the room. */
function inRun() {
  const asked: GearAsk[] = [];
  const view = new BreachView({
    zone: runPlace(into),
    run: into,
    context: { land: { layoutsNamed: async () => '[]' }, trips: {} },
    module,
  });
  const others = new Map<number, SeenPlayer>();
  const word = (more: Partial<BreachSeen> = {}, using = false): BreachOn => ({
    seen: { ...SEEN, ...more },
    using,
    fight: {
      player: 7,
      roomTick: 0,
      others,
      foes: new Map([[40, { view: { x: 1, y: -150, z: 50 } }]]),
      askGear: (ask) => void asked.push(ask),
    },
    others: { plateOf: (id) => ({ player: id, name: id === 9 ? 'Ada' : 'Ben', level: 26, menu: false }) },
  });
  return { view, asked, others, word };
}

test("a run's frame stands its spaces, its seals still shut, its bells and the Lodestone as props", () => {
  const { view, word } = inRun();
  const shown = view.frame(word(), [], [0, 0, 60], () => null, 0, []);
  assert.ok(shown);
  const modules = shown.props.map((prop) => prop.module);
  for (const space of plan.spaces) assert.ok(modules.includes(space.module as never), space.key);
  const shut = plan.seals.filter((_seal, number) => !sealOpen(SEEN.seals, number)).length;
  assert.equal(modules.filter((name) => name === 'breach-seal').length, shut, 'the first seal open, the rest shut');
  assert.deepEqual(
    shown.props.find((prop) => prop.module === 'breach-bell')?.at,
    [1, -150, 50],
    'a bell where its foe stands',
  );
  assert.deepEqual(shown.props.find((prop) => prop.module === 'breach-lodestone')?.at, SEEN.stoneAt);
  assert.equal(shown.first, true);
  assert.equal(shown.shown?.banner?.title, 'The Mending');
});

test('E raises a fallen member in reach while held, and lets go as it is released', () => {
  const { view, asked, others, word } = inRun();
  others.set(9, player(9, [1, 0, 60], true));
  view.frame(word(), [], [0, 0, 60], () => null, 0, []);
  const use = view.use([0, 0, 60], (ask) => void asked.push(ask));
  assert.equal(use?.words, 'Hold to raise Ada');
  use?.run();
  assert.deepEqual(asked.at(-1), { kind: ASKS.raise, item: 9 });
  view.frame(word({}, true), [], [0, 0, 60], () => null, 0, []);
  assert.equal(asked.length, 1, 'held: nothing more asked');
  view.frame(word({}, false), [], [0, 0, 60], () => null, 0, []);
  assert.deepEqual(asked.at(-1), { kind: ASKS.stopRaise }, 'let go');
});

test('E takes up the Lodestone in reach, sets it down while borne, and leaves by the way in', () => {
  const { view, asked, word } = inRun();
  view.frame(word(), [], [0, -60, 50], () => null, 0, []);
  assert.equal(view.use([0, -60, 50], (ask) => void asked.push(ask))?.words, 'Take up the Lodestone');
  view.frame(word({ stone: STONE.borne, bearer: 7 }), [], [0, -60, 50], () => null, 0, []);
  const drop = view.use([0, -60, 50], (ask) => void asked.push(ask));
  drop?.run();
  assert.deepEqual([drop?.words, asked.at(-1)], ['Set down the Lodestone', { kind: ASKS.dropLodestone }]);
  const entry = spaceSocket(plan, 'descent', 'entry');
  assert.ok(entry);
  view.frame(word({ stone: STONE.away }), [], entry, () => null, 0, []);
  assert.equal(view.use(entry, () => undefined)?.words, 'Leave the Drowned Vale');
});

test("a layout's gate is found by its module, turned whole quarters, its area naming it", () => {
  const solid = { shape: 'module', module: moduleNumber('breach-gate'), group: 0, at: [10, 20, 3], turn: Math.PI };
  const layout = { solids: [solid], areas: [{ kind: 'breach', name: 'The Sunken Gate' }] } as unknown as NodeLayout;
  assert.deepEqual(gateOf(layout), { at: [10, 20, 3], turn: 2, place: 'The Sunken Gate' });
  assert.equal(gateOf({ ...layout, solids: [] }), null);
});

test("a gate's banner stands first near it, and elsewhere its line goes under the zone's own", () => {
  const theirs = { banner: null, beat: null, places: [{ x: 1, y: 2, kind: 'breach' as const }], stores: [] };
  const own = {
    banner: { tone: 'next', kicker: '', title: '', place: '', clock: '', objective: '', bar: null, heroic: null },
    beat: null,
    places: [],
    stores: [],
  } as never;
  const frame = { shown: theirs, line: 'The Drowned Vale: the gate open', first: false, props: [], sounds: [] };
  const merged = withBreach(own, { ...frame, sting: null });
  assert.equal(merged?.banner?.elsewhere, 'The Drowned Vale: the gate open');
  assert.deepEqual(merged?.places, theirs.places, 'the gate marked on the compass all the same');
  assert.equal(withBreach(own, { ...frame, first: true, sting: null })?.banner, null, "the gate's own stands first");
  assert.equal(withBreach(own, null), own);
});
