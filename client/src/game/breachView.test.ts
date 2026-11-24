import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { moduleNumber } from '../city/modules.ts';
import { type BreachSeen, STONE } from '../network/breachMessages.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import type { SeenPlayer } from '../network/messages.ts';
import type { NodeLayout } from '../layout/layouts.ts';
import { FIGHTER_FLOATS, fighterView } from '../rules/fighters.ts';
import { BREACH_EVENT, RIFT } from '../network/breachMessages.ts';
import { EVENT } from '../combat/cues.ts';
import { MARK_FLOATS } from '../combat/marks.ts';
import type { FightEvent } from '../network/messages.ts';
import { breachPlanOf, runPlace, sealOpen, socketAt, spaceSocket } from './breachPlan.ts';
import { type BreachOn, BreachView, bearing, breachFall, gateOf, withBreach } from './breachView.ts';
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
  ...{ marked: [], chests: 0, encounter: 1, stage: 0, stageTicks: 0, counts: [0, 0, 0], bells: [] },
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

/** The gate as the zone's layout stands it, for a view at the gate. */
const GATE_AT = [100, 200, 3] as const;
const GATE_LAYOUT = JSON.stringify([
  {
    solids: [{ shape: 'module', module: moduleNumber('breach-gate'), group: 0, at: GATE_AT, turn: 0 }],
    areas: [{ kind: 'breach', name: 'The Sunken Gate' }],
  },
]);

/** The view of a run (or of its gate, `gate`), what it asked of the room and what it told the player, how often it
 *  asked for the seal's mesh, and the room's tick its words are said at (`at`). */
function inRun(gate = false) {
  const [asked, told, sealed] = [[] as GearAsk[], [] as string[], [0]];
  const view = new BreachView({
    zone: gate ? zone : runPlace(into),
    run: gate ? null : into,
    context: { land: { layoutsNamed: async () => GATE_LAYOUT }, trips: { tell: (words) => void told.push(words) } },
    module,
    seal: () => (sealed[0] = (sealed[0] ?? 0) + 1),
  });
  const others = new Map<number, SeenPlayer>();
  let own: BreachOn['fight']['own'] = { action: { kind: 'idle' } };
  let tick = 0;
  const foes = new Map([[40, { view: { x: 1, y: -150, z: 50, facing: 0, health: 1 }, type: 39 }]]);
  const word = (more: Partial<BreachSeen> = {}): BreachOn => ({
    seen: { ...SEEN, ...(gate ? { gate: true, phases: [] } : {}), ...more },
    fight: { player: 7, own, roomTick: tick, others, foes, askGear: (ask) => void asked.push(ask) },
    others: { plateOf: (id) => ({ player: id, name: id === 9 ? 'Ada' : 'Ben', level: 26, menu: false, tag: '' }) },
  });
  const fell = (down: boolean) => void (own = down ? { action: { kind: 'dead' } } : { action: { kind: 'idle' } });
  const atTick = (ticks: number) => void (tick = ticks);
  return { view, asked, told, others, foes, word, fell, atTick, sealed };
}

/** A moment the room tells every one of `players`, each its own event with that player its defender. */
const toldAll = (kind: number, amount: number, players: readonly number[]): FightEvent[] =>
  players.map((defender) => ({ tick: 0n, kind, how: 0, striker: 0, defender, amount, stroke: 0 }));
const settled = () => new Promise((done) => setTimeout(done, 0));

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

test('while the Lodestone lies counting down to the unwriting, E takes it up before reviving the fallen beside it', () => {
  const { view, word } = inRun();
  const lying = { stone: STONE.lying, lyingTicks: 4 * 60 };
  view.frame(word(lying), [], [0, -60, 50], () => null, 0, []);
  assert.equal(view.urgent([0, -60, 50], () => undefined)?.words, 'Take up the Lodestone');
  view.frame(word({ ...lying, lyingTicks: 0 }), [], [0, -60, 50], () => null, 0, []);
  assert.equal(
    view.urgent([0, -60, 50], () => undefined),
    null,
    'lying but not needed: a revive first',
  );
  assert.equal(view.use([0, -60, 50], () => undefined)?.words, 'Take up the Lodestone', 'then E takes it up');
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
  // The zone's own event's sting plays under its banner: the Breach's moment of that frame goes with neither.
  const told = { ...theirs, breach: { run: false, song: null, boss: null, piece: 2, moment: 0 } };
  assert.equal(withBreach(own, { ...frame, shown: told, sting: 'victory' })?.breach?.moment, undefined);
});

test('the fallen stand again as the room stands them: 6 s outside an encounter, 10 s in one at Normal, never at Hard', () => {
  const feet = [10, 0, 0] as const;
  assert.deepEqual(breachFall({ ...SEEN, encounter: 0 }, 7, feet, null), { ticks: 360, revives: 5 });
  assert.deepEqual(breachFall({ ...SEEN, tier: 0, revives: -1 }, 7, feet, null), { ticks: 600, revives: -1 });
  assert.deepEqual(breachFall(SEEN, 7, feet, null), { ticks: null, revives: 5 }, 'revived, or not at all');
  const gate = { ...SEEN, gate: true, phases: [], encounter: 0, heldBy: true, holders: [7, 9], revives: 4 };
  assert.deepEqual(breachFall(gate, 7, feet, [0, 0, 0]), { ticks: null, revives: 4 }, 'the Hard Waking');
  assert.deepEqual(breachFall({ ...gate, tier: 0, revives: -1 }, 7, feet, [0, 0, 0]), { ticks: 600, revives: -1 });
  assert.equal(breachFall(gate, 7, [60, 0, 0], [0, 0, 0]), null, "out of its hollow, the zone's own rules");
  assert.equal(breachFall(gate, 8, feet, [0, 0, 0]), null, 'not of the company holding it');
  assert.equal(breachFall({ ...gate, woken: true }, 7, feet, [0, 0, 0]), null, 'the Waking won');
});

test('the Lodestone is borne by the player with its grounding charged or charging, and by no one else', () => {
  const borne = { ...SEEN, stone: STONE.borne, bearer: 7 };
  assert.deepEqual([bearing(borne, 7), bearing({ ...borne, charge: 0.5 }, 7)], [{ charged: true }, { charged: false }]);
  assert.equal(bearing(borne, 9), null);
  assert.equal(bearing(SEEN, 7), null, 'on its plinth');
});

test('a moment told to every player is heard once where its number places it; one of a player at them, in words', () => {
  const { view, word, told } = inRun();
  const events = toldAll(BREACH_EVENT.bellBroken, 2, [7, 9, 11]);
  const where = (id: number) => (id === 11 ? ([5, 5, 60] as const) : null);
  const shown = view.frame(word({ encounter: 2 }), events, [0, 0, 60], where, 0, []);
  assert.deepEqual(shown?.sounds, [{ cue: 'shield.break', at: spaceSocket(plan, 'choir', 'bell-3') }]);
  view.frame(word(), toldAll(BREACH_EVENT.wiped, 1, [7, 9, 11]), [0, 0, 60], () => null, 0, []);
  assert.deepEqual(told, ['Your company fell.'], 'an attempt lost, said once');
});

test("the Waking's moments at the gate are its company's and theirs in its hollow; a claim is heard at its mooring", async () => {
  const { view, word } = inRun(true);
  await settled();
  const begun = toldAll(BREACH_EVENT.begun, 0, [7, 9]);
  const [far, near] = [[GATE_AT[0] + 200, GATE_AT[1], 3] as const, [GATE_AT[0] + 10, GATE_AT[1], 3] as const];
  const held = { heldBy: true, holders: [9], tier: 0, revives: -1 };
  assert.equal(view.frame(word(held), begun, far, () => null, 0, [])?.sting, null, 'a bystander far off');
  assert.equal(view.frame(word(held), begun, near, () => null, 0, [])?.sting, 'cadence', 'in its hollow');
  assert.equal(view.frame(word({ ...held, holders: [7, 9] }), begun, far, () => null, 0, [])?.sting, 'cadence');
  const claimed = view.frame(word(held), toldAll(BREACH_EVENT.claimed, 1, [7, 9]), far, () => null, 0, []);
  assert.deepEqual(claimed?.sounds, [{ cue: 'foe.alert', at: socketAt('breach-gate', 'mooring-south', GATE_AT, 0) }]);
});

test("the gate's moorings are held by the living of the company holding it, which its banner names, revives and all", async () => {
  const { view, word, others, fell } = inRun(true);
  await settled();
  const mooring = (name: string) => socketAt('breach-gate', name, GATE_AT, 0);
  others.set(9, player(9, mooring('mooring-south'), false));
  others.set(11, player(11, mooring('mooring-east'), false));
  fell(true);
  const waking = { heldBy: true, holders: [9, 7], tier: 1, revives: 3 };
  const banner = view.frame(word(waking), [], mooring('mooring-west'), () => null, 0, [])?.shown?.banner;
  assert.equal(banner?.objective, 'The Waking · Your company · Hard · Moorings held 1 of 3 · 3 revives left');
  const theirs = view.frame(word({ ...waking, holders: [9, 11] }), [], mooring('mooring-west'), () => null, 0, []);
  assert.equal(theirs?.shown?.banner?.objective, 'The Waking · Ada · Hard · Moorings held 2 of 3 · 3 revives left');
});

test("a revive stands the fallen where the room would: none with none left; the Waking's company only by its own", async () => {
  const { view, word } = inRun();
  view.frame(word(), [], [0, 0, 60], () => null, 0, []);
  assert.equal(view.mayRevive(9), true);
  view.frame(word({ revives: 0 }), [], [0, 0, 60], () => null, 0, []);
  assert.equal(view.mayRevive(9), false, 'none left');
  const gate = inRun(true);
  await settled();
  const feet = [GATE_AT[0] + 20, GATE_AT[1], 3] as const;
  const may = (more: Partial<BreachSeen>) => {
    gate.view.frame(gate.word({ heldBy: true, revives: -1, ...more }), [], feet, () => null, 0, []);
    return gate.view.mayRevive(9);
  };
  assert.equal(may({ holders: [9] }), false, 'of the company, by one outside it');
  assert.equal(may({ holders: [7, 9] }), true, 'by one of the company');
  assert.equal(may({ holders: [7, 9], revives: 0 }), false, 'none left');
  assert.equal(may({ holders: [7] }), true, 'not of the company, as anywhere in the zone');
  assert.equal(may({ holders: [9], woken: true }), true, 'the Waking won');
});

test("the run's compass marks the stage reached, the way on, the way out and the Lodestone; a great foe is the peak", () => {
  const { view, word } = inRun();
  const between = word({ encounter: 0, phases: [2, 2, 0, 0, 0, 0], reached: 2 });
  const places = view.frame(between, [], [0, 0, 60], () => null, 0, [])?.shown?.places ?? [];
  const flat = (space: string, socket: string) => spaceSocket(plan, space, socket)?.slice(0, 2);
  assert.deepEqual(
    places.map((place) => [place.kind, [place.x, place.y]]),
    [
      ['chest', flat('choir', 'checkpoint')],
      ['event', flat('choir', 'entry')],
      ['breach', flat('descent', 'entry')],
      ['heroic', SEEN.stoneAt.slice(0, 2)],
    ],
  );
  const cleared = word({ encounter: 0, phases: [2, 2, 2, 2, 2, 2], stone: STONE.away });
  const out = view.frame(cleared, [], [0, 0, 60], () => null, 0, [])?.shown?.places.at(-1);
  assert.deepEqual([out?.x, out?.y], flat('court', 'portal'), "the court's portal once cleared");
  const woke = toldAll(31, 0, [7, 9]);
  const great = view.frame(word({ encounter: 2, stage: 2, boss: 5 }), woke, [0, 0, 60], () => null, 0, []);
  assert.deepEqual([great?.sting, great?.shown?.mood], ['cadence', 'peak']);
});

test('every hidden chest stands shut at its socket, glowing while open to pay, its lid thrown once the room pays', () => {
  const { view, word, atTick } = inRun();
  const chests = (more: Partial<BreachSeen>, events: FightEvent[] = []) => {
    const props = view.frame(word(more), events, [0, 0, 60], () => null, 0, [])?.props ?? [];
    const bodies = props.filter((prop) => prop.module === 'event-chest');
    assert.deepEqual(
      bodies.map((prop) => prop.at),
      [
        spaceSocket(plan, 'descent', 'chest-descent'),
        spaceSocket(plan, 'choir', 'chest-page'),
        spaceSocket(plan, 'ways', 'heart'),
        spaceSocket(plan, 'stair', 'chest-stair'),
      ],
    );
    const lids = props.filter((prop) => prop.module === 'event-chest-lid').map((prop) => prop.lid > 0);
    return { lids, lit: bodies.map((prop) => prop.glow > 0.5) };
  };
  assert.deepEqual(chests({}), { lids: [false, false, false, false], lit: [true, false, false, true] });
  assert.deepEqual(chests({ chests: 0b110 }).lit, [true, false, true, true], "the page's waits for the Choir won");
  assert.deepEqual(chests({ chests: 0b110, phases: [2, 2, 2, 0, 0, 0] }).lit, [true, true, true, true]);
  const paid = (striker: number, nth: number) => ({
    ...{ tick: 0n, kind: EVENT.chestOpened, how: 0, striker, defender: striker },
    ...{ amount: plan.encounters.length + nth, stroke: 0 },
  });
  atTick(60);
  chests({}, [paid(9, 0), paid(7, 3)]);
  atTick(120);
  assert.deepEqual(chests({}).lids, [false, false, false, true], "the Stair's paid the player; another's, not theirs");
});

test("the gate's doorway stands sealed but to the company it opened to, and its moorings show their reach", async () => {
  const { view, word } = inRun(true);
  await settled();
  const sealed = (more: Partial<BreachSeen>) =>
    view.frame(word(more), [], [GATE_AT[0], GATE_AT[1] - 20, 3], () => null, 0, [])?.props.map((prop) => prop.at);
  const door = socketAt('breach-gate', 'gate', GATE_AT, 0);
  assert.deepEqual(sealed({}), [door]);
  assert.deepEqual(sealed({ woken: true, openTo: [7] }), [], 'open to the player');
  assert.deepEqual(sealed({ woken: true, openTo: [9] }), [door], "open to another's company");
  const marks: number[] = [];
  view.frame(word(), [], [GATE_AT[0], GATE_AT[1], 3], () => null, 0, marks);
  const west = socketAt('breach-gate', 'mooring-west', GATE_AT, 0);
  const apart = (from: number) => Math.hypot((marks[from] ?? 0) - west[0], (marks[from + 1] ?? 0) - west[1]);
  const reach = Math.max(apart(0), apart(7));
  assert.ok(Math.abs(reach - 1.7) < 0.01, `the reach a body holds it within: ${reach}`);
});

test('a mark is heard once a frame at the player it marks, a sighting at the one seen, a Keeper at its shore', () => {
  const { view, word, told } = inRun();
  const where = (id: number) => (id === 9 ? ([3, 3, 60] as const) : id === 11 ? ([5, 5, 60] as const) : null);
  const heard = (events: FightEvent[]) => view.frame(word({ encounter: 4 }), events, [0, 0, 60], where, 0, [])?.sounds;
  // A ring Rewrites three, each told to all three.
  const ring = [9, 11, 7].flatMap((marked) => toldAll(BREACH_EVENT.rewritten, marked, [7, 9, 11]));
  assert.deepEqual(heard(ring), [{ cue: 'element.cosmic', at: [0, 0, 60] }], 'once, at the player among them');
  const others = [9, 11].flatMap((marked) => toldAll(BREACH_EVENT.rewritten, marked, [7, 9, 11]));
  assert.deepEqual(heard(others), [{ cue: 'element.cosmic', at: [3, 3, 60] }]);
  assert.deepEqual(heard(toldAll(BREACH_EVENT.seen, 9, [7, 9])), [{ cue: 'foe.alert', at: [3, 3, 60] }]);
  assert.deepEqual(told, ['A Watcher saw Ada.']);
  const keeper = spaceSocket(plan, plan.shores['shores']?.[1] ?? '', 'keeper');
  assert.deepEqual(heard(toldAll(BREACH_EVENT.keeperFell, 1, [7])), [{ cue: 'kill', at: keeper }]);
});

test('each bell wakes at its own note, by its place, so the order is heard as it is seen', () => {
  const { view, word } = inRun();
  const note = (place: number) =>
    view.frame(word({ encounter: 2 }), toldAll(BREACH_EVENT.bellWoke, place, [7]), [0, 0, 60], () => null, 0, [])
      ?.sounds[0]?.rate;
  assert.deepEqual([0, 2, 4].map(note), [1, 2 ** (4 / 12), 2 ** (7 / 12)]);
});

test("an encounter's line stands in its banner as it begins; once won, its won line, then the way on", () => {
  const { view, word, atTick } = inRun();
  const banner = (more: Partial<BreachSeen>, events: FightEvent[] = []) =>
    view.frame(word(more), events, [0, 0, 60], () => null, 0, [])?.shown;
  atTick(100);
  const begun = banner({ encounter: 1 }, toldAll(BREACH_EVENT.begun, 1, [7, 9]));
  assert.deepEqual([begun?.beat, begun?.banner?.objective], ['stage', 'Keep the Husks from the open seams']);
  atTick(100 + 8 * 60);
  assert.match(banner({ encounter: 1 })?.banner?.objective ?? '', /^The north seam open/, 'then what it counts');
  const between = { encounter: 0, phases: [2, 2, 0, 0, 0, 0], reached: 2 };
  const won = banner(between, toldAll(BREACH_EVENT.won, 1, [7, 9]));
  assert.deepEqual(
    [won?.beat, won?.banner?.tone, won?.banner?.title, won?.banner?.objective],
    ['won', 'won', 'The Mending', 'The seams are mended'],
  );
  atTick(100 + 8 * 60 + 6 * 60);
  assert.deepEqual([banner(between)?.banner?.tone, banner(between)?.banner?.title], ['next', 'The Choir']);
});

test('a wipe says why where the page knows: the company unwritten whole, or the Waking left empty', async () => {
  const { view, word, told } = inRun();
  view.frame(word({ stone: STONE.lying, lyingTicks: 2 }), [], [0, 0, 60], () => null, 0, []);
  view.frame(word({ stone: STONE.lying }), toldAll(BREACH_EVENT.unwritten, 2, [7, 9]), [0, 0, 60], () => null, 0, []);
  view.frame(word(), toldAll(BREACH_EVENT.wiped, 1, [7, 9]), [0, 0, 60], () => null, 0, []);
  view.frame(word(), toldAll(BREACH_EVENT.wiped, 1, [7, 9]), [0, 0, 60], () => null, 0, []);
  assert.deepEqual(told, [
    'The company is unwritten.',
    'Your company fell: the Lodestone lay too long.',
    'Your company fell.',
  ]);
  const gate = inRun(true);
  await settled();
  const held = { heldBy: true, holders: [7, 9], tier: 0, revives: -1 };
  gate.view.frame(gate.word(held), [], [GATE_AT[0], GATE_AT[1], 3], () => null, 0, []);
  gate.view.frame(gate.word(), toldAll(BREACH_EVENT.wiped, 0, [7, 9]), [GATE_AT[0], GATE_AT[1], 3], () => null, 0, []);
  assert.deepEqual(gate.told, ['Your company fell: the Spire stood empty a whole minute.']);
});

test('the gate shutting the player out of its company says why, though they are none of it', async () => {
  const { view, word, told, sealed } = inRun(true);
  await settled();
  const shut = { tick: 0n, kind: BREACH_EVENT.shutOut, how: 0, striker: 7, defender: 7, amount: 3, stroke: 0 };
  view.frame(word({ heldBy: true, holders: [9] }), [shut], [GATE_AT[0] + 200, GATE_AT[1], 3], () => null, 0, []);
  assert.deepEqual(told, ['The gate shut you out: Hard opens once the Drowned Vale is won at Normal.']);
  assert.deepEqual([sealed[0], inRun().sealed[0]], [1, 0], "the seal's mesh asked for in its gate's zone alone");
});

test('the Spire glows for the whole zone as it fills; its company in the hollow is held to the tension', async () => {
  const { view, word } = inRun(true);
  await settled();
  const hollow = [GATE_AT[0] + 10, GATE_AT[1], 3] as const;
  const frame = (more: Partial<BreachSeen>, feet: readonly [number, number, number] = hollow) => {
    const marks: number[] = [];
    const shown = view.frame(word(more), [], feet, () => null, 0, marks, [GATE_AT[0], GATE_AT[1] + 30, 5])?.shown;
    const tops = Array.from({ length: marks.length / MARK_FLOATS }, (unused, nth) => marks[nth * MARK_FLOATS + 2] ?? 0);
    return { top: Math.max(0, ...tops), mood: shown?.mood ?? null };
  };
  const waking = { heldBy: true, holders: [7, 9], fill: 0.5 };
  assert.ok(Math.abs(frame(waking).top - (3 + 1.2 + 8)) < 0.01, 'half full, half its height');
  assert.ok(Math.abs(frame({ ...waking, fill: 1 }).top - (3 + 1.2 + 16)) < 0.01);
  assert.equal(frame(waking).mood, 'tension');
  assert.deepEqual(frame({ ...waking, holders: [9] }, [GATE_AT[0] + 200, GATE_AT[1], 3]), {
    top: 3 + 1.2 + 8,
    mood: null,
  });
  assert.ok(frame({ ...waking, woken: true }).top < 4, 'woken, no glow');
});

test('the page counts what the room does not send: stranded in a shut shore, the company on the Stair, the fury', () => {
  const { view, word, atTick, others } = inRun();
  const inShore = spaceSocket(plan, plan.shores['shores']?.[0] ?? '', 'arrival');
  assert.ok(inShore);
  const shores = { encounter: 4, stage: 1, rifts: [RIFT.open, RIFT.shut], riftHeld: [1, 0] };
  const shown = (more: Partial<BreachSeen>, feet = inShore) =>
    view.frame(word(more), [], feet, () => null, 0, [])?.shown;
  atTick(1000);
  assert.equal(shown(shores)?.call, null, 'its rift open');
  const shut = { ...shores, rifts: [RIFT.shut, RIFT.shut] };
  assert.deepEqual([shown(shut)?.call, shown(shut)?.banner?.clock], ['Stranded!', '0:08']);
  atTick(1120);
  assert.equal(
    shown(shut)?.banner?.elsewhere,
    'Stranded: unwritten in 0:06 · Lodestone on its plinth · 5 revives left',
  );
  const stair = spaceSocket(plan, 'stair', 'start');
  assert.ok(stair);
  others.set(9, player(9, stair, false));
  others.set(11, player(11, [0, 0, 60], false));
  assert.match(shown({ encounter: 3 })?.banner?.objective ?? '', /On the Broken Stair 1 of 3$/);
  shown({ encounter: 2, stage: 1 });
  atTick(2000);
  assert.match(shown({ encounter: 2, stage: 2 })?.banner?.objective ?? '', /Fury in 8:00$/);
  atTick(2060);
  assert.match(shown({ encounter: 2, stage: 2 })?.banner?.objective ?? '', /Fury in 7:59$/);
  const late = inRun();
  late.view.frame(late.word({ encounter: 2, stage: 2 }), [], [0, 0, 60], () => null, 0, []);
  const banner = late.view.frame(late.word({ encounter: 2, stage: 2 }), [], [0, 0, 60], () => null, 0, [])?.shown;
  assert.doesNotMatch(banner?.banner?.objective ?? '', /[Ff]ury/, 'its stage not seen to begin, its fury unknown');
});

test("the foes' and the living's places are read only where an encounter's marks or counts ask for them", () => {
  const { view, word, foes, others } = inRun();
  let [foesRead, othersRead] = [0, 0];
  const values = foes.values.bind(foes);
  foes.values = () => (foesRead++, values());
  const iterate = others[Symbol.iterator].bind(others);
  others[Symbol.iterator] = () => (othersRead++, iterate());
  view.frame(word({ encounter: 1 }), [], [0, 0, 60], () => null, 0, []);
  assert.deepEqual([foesRead, othersRead], [0, 0], 'the Mending asks for neither');
  view.frame(word({ encounter: 3 }), [], [0, 0, 60], () => null, 0, []);
  assert.deepEqual([foesRead, othersRead], [1, 1], 'the Ways: the Watchers, and who stands on the Stair');
});
