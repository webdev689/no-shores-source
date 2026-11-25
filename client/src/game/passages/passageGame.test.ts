import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Flow } from '../flow.ts';
import type { Foot } from '../foot.ts';
import type { FootContext } from '../footPlace.ts';
import { weekOf } from '../guild/guildLaw.ts';
import type { NodeInfo } from '../worldData.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import type { PassageSeenState } from '../../network/passageMessages.ts';
import type { PassagePlan, PassageWeb, PassageZone } from '../../rules/passageRules.ts';
import { PassageGame } from './passageGame.ts';
import type { WayPlayed } from './wayBetween.ts';

Object.assign(globalThis, {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: () => undefined,
  document: { exitPointerLock: () => undefined },
});

const patrol = {
  id: 'saltgrass-downs',
  name: 'The Saltgrass Downs',
  continent: 'continent-1',
  kind: 'patrol',
  centre: [1_000, 2_000],
  spawns: [],
} as unknown as NodeInfo;

const zoneAt = (number: number, place: readonly [number, number]) =>
  ({
    number,
    at: place,
    onward: [],
    name: `Zone ${number}`,
    deal: 'skirmish',
    lamp: null,
    currents: [],
  }) as unknown as PassageZone;
const web = {
  island: 'continent-1',
  patrol: patrol.id,
  week: 2_900,
  mouths: [{ run: 'The Halls', zone: 3 }],
  modifiers: [],
  zones: [zoneAt(3, [1_500, 2_500]), zoneAt(7, [2_000, 3_000])],
} as unknown as PassageWeb;
const planOf = (number: number) => ({ zone: { number, onward: [], name: `Zone ${number}` } }) as unknown as PassagePlan;

/** The parts of the game this test reaches past its face: the room module's door, the mouth whose card is open, the
 *  zone stood in, and the card's choice and the lamp's Home as E would make them. */
interface Inside {
  door: unknown;
  mouth: number | null;
  zone: unknown;
  begin(route: 'public' | 'company', lamp: number | null): void;
  goOn(mouth: number, ask: (asked: GearAsk) => void): void;
  home(ask: (asked: GearAsk) => void): void;
}

/** A foot in the room `room`, its gear as the room last said it, online or alone, its asks written down. */
function footIn(room: string, gear: { online: boolean; dive: unknown; answered?: number }, asks: GearAsk[] = []) {
  const said = { answered: gear.answered ?? 0, answer: 0, dive: gear.dive, islandLamps: [] };
  return {
    node: { ...patrol, id: room },
    held: {
      gear: gear.online ? said : null,
      alone: gear.online ? null : said,
      passage: null as PassageSeenState | null,
    },
    fight: { askGear: (asked: GearAsk) => void asks.push(asked), own: null },
    fallen: false,
    // A room alone gives no gear this way (footGear.ts `gearInRoom`): the passages must not read it so.
    gear: gear.online ? { gear: said, ask: (asked: GearAsk) => void asks.push(asked) } : null,
  };
}

/** A game of the passages over a stand-in host: what it told, what ways it played and the foot it stands on, its
 *  clock the rooms' as `now` keeps it. */
function game(foot: unknown, now = () => Date.now()) {
  const held = { foot, flow: { mode: 'foot', node: patrol.id } as Flow, told: [] as string[] };
  const passages = new PassageGame({
    module: new Promise<WebAssembly.Module>(() => undefined),
    context: { walker: { player: { body: { x: 4, y: 5, z: 0 }, facing: 0 } } } as unknown as FootContext,
    foot: () => held.foot as Foot | null,
    flow: () => held.flow,
    setFlow: (flow) => (held.flow = flow),
    setReady: () => undefined,
    land: () => ({ layouts: [], nodes: [patrol] }),
    goInto: async () => undefined,
    showDungeon: async () => undefined,
    companyPlaces: async () => [],
    climate: () => 'woodland',
    tell: (words) => void held.told.push(words),
    isles: { warm: async () => undefined, hasKit: () => true },
    fallback: () => () => undefined,
    now,
  });
  const played: WayPlayed[] = [];
  passages.ways.play = (way) => void played.push(way);
  return { held, passages, played, inside: passages as unknown as Inside };
}

const zoneIn = (room: string, number: number, passed: readonly number[] = []) => ({
  web,
  entry: { plan: planOf(number), room, patrol },
  isle: null,
  passed,
});
const tick = () => new Promise((done) => setTimeout(done));

test('playing alone, a mouth’s choice asks the room alone to begin the dive', () => {
  const asks: GearAsk[] = [];
  const { inside } = game(footIn(patrol.id, { online: false, dive: null }, asks));
  inside.door = { web: () => web, plan: (island: string, week: number, zone: number) => planOf(zone) };
  inside.mouth = 0;
  inside.begin('public', null);
  assert.deepEqual(asks, [{ kind: ASKS.beginDive, column: 0, slot: 0, node: 0 }]);
});

test('a Home asked in a room that is then left is dropped, never played in the room come to', async () => {
  const dive = { island: 'continent-1', week: 2_900, zone: 3, mouth: 0, homeward: false };
  const { held, inside, passages, played } = game(footIn('passage-a', { online: true, dive }));
  inside.zone = zoneIn('passage-a', 3);
  inside.home(() => undefined);
  // The zone's room shuts before it answers; on foot elsewhere, the gear there has no dive.
  held.foot = footIn(patrol.id, { online: true, dive: null, answered: 1 });
  passages.frame(false);
  await tick();
  assert.deepEqual(played, []);
});

test('the way home is drawn from the patrol zone through every zone passed this dive', async () => {
  const dive = { island: 'continent-1', week: 2_900, zone: 7, mouth: 0, homeward: false };
  const asks: GearAsk[] = [];
  const foot = footIn('passage-b', { online: true, dive }, asks);
  const { inside, passages, played } = game(foot);
  inside.zone = zoneIn('passage-b', 7, [3]);
  inside.home(() => undefined);
  foot.held.gear = { ...foot.held.gear!, dive: { ...dive, homeward: true } };
  passages.frame(false);
  await tick();
  assert.deepEqual(played[0]?.come, [patrol.centre, [1_500, 2_500], [2_000, 3_000]]);
  assert.deepEqual(played[0]?.to, patrol.centre);
  assert.ok(
    played[0]?.framed.some((place) => place[0] === patrol.centre[0] && place[1] === patrol.centre[1]),
    'the patrol zone among the places drawn over the island',
  );
});

test('a respawn’s loss is said only of the zone it was carried in', () => {
  const haul = { items: [], vestiges: [], stocks: [2], resources: [], lantern: '' };
  const dive = { island: 'continent-1', week: 2_900, zone: 3, mouth: 0, homeward: false, haul };
  const first = footIn('passage-c', { online: true, dive });
  const { held, inside, passages } = game(first);
  inside.zone = zoneIn('passage-c', 3);
  passages.frame(false);
  first.fallen = true;
  passages.frame(false);
  // Down, the player is sent elsewhere on foot, and later stands in another zone carrying nothing.
  held.foot = footIn(patrol.id, { online: true, dive: null });
  passages.frame(false);
  held.foot = footIn('passage-d', { online: true, dive: { ...dive, haul: { ...haul, stocks: [] } } });
  inside.zone = zoneIn('passage-d', 7);
  passages.frame(false);
  assert.deepEqual(held.told, []);
});

test('the mouths’ week is the rooms’ week, not a page clock that is wrong', () => {
  const weeks: number[] = [];
  // The rooms say it is a week later than the page thinks.
  const rooms = () => Date.now() + 7 * 86_400_000;
  const { inside, passages } = game(footIn(patrol.id, { online: true, dive: null }), rooms);
  inside.door = { web: (island: string, week: number) => (weeks.push(week), null) };
  passages.uses();
  assert.notEqual(weekOf(rooms()), weekOf(Date.now()), 'the two clocks disagree');
  assert.deepEqual(weeks, [weekOf(rooms())]);
});

test('a web the door cannot read is asked once, not again each frame', () => {
  let asked = 0;
  const { inside, passages } = game(footIn(patrol.id, { online: true, dive: null }));
  inside.door = {
    web: () => {
      asked++;
      throw new Error('the web does not read');
    },
  };
  assert.equal(passages.uses(), null);
  assert.equal(passages.uses(), null);
  assert.equal(asked, 1);
});

test('the pieces stand as one state until the deal changes, read once a word of the room', () => {
  const foot = footIn('passage-e', { online: true, dive: null });
  const { inside, passages } = game(foot);
  inside.zone = zoneIn('passage-e', 3);
  const seen = { lampLit: false, open: false, lit: 0, broken: 0, done: false, holding: null };
  foot.held.passage = seen as unknown as PassageSeenState;
  const first = passages.pieces();
  assert.ok(first);
  assert.equal(passages.pieces(), first);
  foot.held.passage = { ...seen } as unknown as PassageSeenState;
  assert.equal(passages.pieces(), first, 'a new word of the same state');
  foot.held.passage = { ...seen, lampLit: true } as unknown as PassageSeenState;
  assert.notEqual(passages.pieces(), first);
});

test('held in a zone, the map shows the web, the way come a track and "You" at the zone stood in', () => {
  const { inside, passages } = game(footIn('passage-f', { online: true, dive: null }));
  assert.equal(passages.map(), null, 'out of a zone, the land’s own map');
  inside.zone = zoneIn('passage-f', 7, [3]);
  const sheet = passages.map();
  assert.ok(sheet);
  // The player stands at (4, 5) of the zone's own frame: there is where the web's zone 7 stands on the sheet.
  const you = [4 - sheet.origin[0], 5 - sheet.origin[1]];
  const track = sheet.paths.find((path) => path.track)?.points ?? [];
  assert.deepEqual(track.at(-1), you);
  assert.equal(track.length, 3, 'the patrol zone, the zone passed and the zone stood in');
  assert.ok(sheet.marks.some((mark) => mark.word === patrol.name));
});

/** A zone laid with one way on, to zone 7, its mouth at (30, 40) of its own frame. */
const onwardPlan = (number: number) =>
  ({
    zone: { number, onward: [7], name: `Zone ${number}` },
    ground: { kind: 'under', layout: '' },
    sites: { onward: [{ at: [30, 40], facing: 0 }] },
  }) as unknown as PassagePlan;

test('a way on is asked of the room only once the zone beyond is laid, and played with that zone', async () => {
  const dive = { island: 'continent-1', week: 2_900, zone: 3, mouth: 0, homeward: false };
  const asks: GearAsk[] = [];
  const foot = footIn('passage-g', { online: true, dive }, asks);
  const { held, inside, passages, played } = game(foot);
  inside.zone = { ...zoneIn('passage-g', 3), entry: { plan: onwardPlan(3), room: 'passage-g', patrol, ...dive } };
  // The zone beyond does not lay: nothing is asked, and the player is told why.
  inside.door = { web: () => web, plan: () => null };
  inside.goOn(0, (asked) => void asks.push(asked));
  assert.equal(asks.length, 0);
  assert.deepEqual(held.told, ['The zone beyond could not be laid, so the way on stays shut.']);
  // Laid, the ask goes; once the room says yes the dive has moved, and the way is played with the zone laid before.
  let laid = 0;
  inside.door = {
    web: () => web,
    plan: (island: string, week: number, zone: number) => (laid++ ? null : onwardPlan(zone)),
  };
  inside.goOn(0, (asked) => void asks.push(asked));
  assert.deepEqual(asks, [{ kind: ASKS.goOn, column: 0 }]);
  foot.held.gear = { ...foot.held.gear!, answered: 1, dive: { ...dive, zone: 7 } };
  passages.frame(false);
  await tick();
  assert.equal(played.length, 1, 'the way is played, not "The passage has shifted."');
  assert.deepEqual(played[0]?.mouth, [30, 40], 'the character walks into the mouth taken');
  assert.equal(played[0]?.place, 'Zone 7');
  assert.equal(played[0]?.back, patrol, 'a failed way goes back to the patrol zone');
});
