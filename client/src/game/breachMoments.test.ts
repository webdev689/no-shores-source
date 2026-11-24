import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import listed from '../../../content/audio/freesound.json' with { type: 'json' };
import { EVENT } from '../combat/cues.ts';
import { BREACH_EVENT, type BreachSeen, STONE } from '../network/breachMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import { GATE_SCAPE } from './audio/ambience/breachScapes.ts';
import {
  MOMENT_CUES,
  MomentWords,
  STATE_CUES,
  heardOf,
  momentSounds,
  momentsHad,
  mooringSounds,
  slabSounds,
  stingOf,
} from './breachMoments.ts';
import { breachPlanOf, slabStands, spaceSocket } from './breachPlan.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const module = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const plan = breachPlanOf(module);
const SEEN = { gate: false, tier: 1, encounter: 2, awayShore: -1 } as BreachSeen;
const event = (kind: number, amount = 0, defender = 7, striker = 0): FightEvent => ({
  ...{ tick: 0n, kind, how: 0, striker, defender, amount, stroke: 0 },
});
const places = {
  own: 7,
  feet: [0, 0, 60] as const,
  where: () => null,
  gate: null,
  mooring: () => null,
  chest: (nth: number) => (nth === 1 ? ([1, 2, 3] as const) : null),
};
const [none, all] = [() => false, () => true];

test('every moment of the room but the Breach cleared and the gate shutting one out has its own recording', () => {
  const silent = new Set<number>([BREACH_EVENT.cleared, BREACH_EVENT.shutOut]);
  for (const [name, kind] of Object.entries(BREACH_EVENT)) {
    if (silent.has(kind)) continue;
    assert.match(MOMENT_CUES[kind]?.cue ?? '', /^breach\./, `${name} has a breach.* cue`);
  }
});

test('every breach.* cue on the list is played by some moment, some state, or the gate', () => {
  const played = new Set([
    ...Object.values(MOMENT_CUES).map((sound) => sound.cue),
    ...Object.values(STATE_CUES),
    ...GATE_SCAPE.beds.map((layer) => layer.recorded),
  ]);
  const listedCues = listed.cues.map((cue) => cue.id).filter((id) => id.startsWith('breach.'));
  assert.ok(listedCues.length > 30);
  for (const id of listedCues) assert.ok(played.has(id), `${id} is played`);
  for (const id of played) if (id.startsWith('breach.')) assert.ok(listedCues.includes(id), `${id} is on the list`);
});

test("a moment whose own recording is not picked plays the world's it played before; once picked, its own", () => {
  const broken = [event(BREACH_EVENT.bellBroken, 2)];
  const bell = spaceSocket(plan, 'choir', 'bell-3');
  assert.deepEqual(momentSounds(plan, SEEN, broken, places, none), [{ cue: 'shield.break', at: bell, whole: true }]);
  assert.deepEqual(momentSounds(plan, SEEN, broken, places, all), [
    { cue: 'breach.bell.break', at: bell, whole: true },
  ]);
  const woke = momentSounds(plan, SEEN, [event(BREACH_EVENT.bellWoke, 4)], places, all)[0];
  assert.equal(woke?.cue, 'breach.bell.wake');
  assert.ok(Math.abs((woke?.rate ?? 0) - 2 ** (7 / 12)) < 1e-9, 'each bell at its own note');
  assert.deepEqual(heardOf({ cue: 'breach.seen', until: 'foe.alert' }, [0, 0, 0], all), {
    cue: 'breach.seen',
    at: [0, 0, 0],
  });
  assert.equal(heardOf({ cue: 'breach.slab', until: null }, [0, 0, 0], none), null, 'silent until picked');
  const wipe = momentSounds(plan, SEEN, [event(BREACH_EVENT.wiped, 1)], places, none)[0];
  assert.deepEqual([wipe?.cue, wipe?.whole], ['story.thud', true], 'a wipe is heard, whole');
});

test('a long or far moment is heard whole; a short one near is not', () => {
  const whole = (kind: number) => momentSounds(plan, SEEN, [event(kind, 0)], places, all)[0]?.whole ?? false;
  for (const kind of [BREACH_EVENT.tolled, BREACH_EVENT.bellRang, BREACH_EVENT.begun, BREACH_EVENT.won])
    assert.equal(whole(kind), true, `${kind}`);
  for (const kind of [BREACH_EVENT.seen, BREACH_EVENT.fused, BREACH_EVENT.deskMarked]) assert.equal(whole(kind), false);
});

test('a hidden chest the room pays the player opens where it stands; another player paid is not heard', () => {
  const paid = (striker: number) => event(EVENT.chestOpened, plan.encounters.length + 1, striker, striker);
  assert.deepEqual(momentSounds(plan, SEEN, [paid(7)], places, all), [{ cue: 'breach.chest', at: [1, 2, 3] }]);
  assert.deepEqual(momentSounds(plan, SEEN, [paid(9)], places, all), []);
});

test("the Broken Stair's slabs are heard rising and sinking where they stand, and none on the first tick", () => {
  const slab = plan.slabs.find((each) => each.at);
  assert.ok(slab?.at);
  let tick = 0;
  while (slabStands(plan, slab.phase, tick) === slabStands(plan, slab.phase, tick + 1)) tick++;
  const heard = slabSounds(plan, tick, tick + 1, all);
  assert.ok(heard.some((one) => one.cue === 'breach.slab' && one.at === slab.at));
  assert.ok(
    heard.every((one) => one.whole === undefined),
    "heard only within the world's sounds' reach",
  );
  assert.deepEqual(slabSounds(plan, null, tick + 1, all), []);
  assert.deepEqual(slabSounds(plan, tick - 600, tick + 1, all), [], 'a hidden page coming back');
});

test('a mooring is heard as it is newly held, not as it stays held or is claimed', () => {
  const socket = (nth: number) => [nth, 0, 0] as const;
  assert.deepEqual(mooringSounds(['free', 'held', 'free'], ['held', 'held', 'claimed'], socket, all), [
    { cue: 'breach.mooring', at: [0, 0, 0] },
  ]);
  assert.deepEqual(mooringSounds(null, ['held', 'free', 'free'], socket, all), [], 'none the first frame');
});

test('the gate shutting one out is told to them alone, without naming a tier it was not told', () => {
  const shut = { ...event(BREACH_EVENT.shutOut, 2, 9), striker: 9 };
  assert.deepEqual(momentsHad([shut], 7, true), [], 'another player refused');
  assert.deepEqual(momentsHad([shut], 9, true), [shut]);
  const words = new MomentWords().words(
    plan,
    { seen: { ...SEEN, gate: true, tier: 0 }, before: null, had: [shut] },
    { ours: false, nameOf: () => 'you', lost: null },
  );
  assert.deepEqual(words, ['The gate shut you out.']);
});

test('the Breach cleared, told at the gate, plays no victory there; an encounter won does', () => {
  assert.equal(stingOf([event(BREACH_EVENT.cleared, 6)]), null);
  assert.equal(stingOf([event(BREACH_EVENT.won, 1)]), 'victory');
  assert.equal(stingOf([event(BREACH_EVENT.begun, 1), event(BREACH_EVENT.wiped, 1)]), 'defeat');
});

test('only the Lodestone running out while it lies is blamed on it', () => {
  const words = (before: Partial<BreachSeen>, seen: Partial<BreachSeen>) =>
    new MomentWords().words(
      plan,
      {
        seen: { ...SEEN, counts: [0], ...seen } as BreachSeen,
        before: { ...SEEN, counts: [0], ...before } as BreachSeen,
        had: [event(BREACH_EVENT.unwritten, 3)],
      },
      { ours: true, nameOf: () => 'you', lost: null },
    );
  const lying = { stone: STONE.lying };
  assert.deepEqual(words({ ...lying, lyingTicks: 2 }, { ...lying, lyingTicks: 0 }), ['The company is unwritten.']);
  assert.deepEqual(words({ ...lying, lyingTicks: 900 }, { ...lying, lyingTicks: 898 }), [], 'a writing while it lies');
});
