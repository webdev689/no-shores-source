import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IsleShown } from '../../islands/islePlan.ts';
import type { Flow } from '../flow.ts';
import { Foot } from '../foot.ts';
import type { FootContext } from '../footPlace.ts';
import { weekOf } from '../guild/guildLaw.ts';
import type { NodeInfo } from '../worldData.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import type { PassageSeenState } from '../../network/passageMessages.ts';
import type { PassagePlan, PassageWeb, PassageZone } from '../../rules/passageRules.ts';
import { NO_WAY_HERE, passageRoomName } from '../rooms.ts';
import { PassageGame, type PassageHost } from './passageGame.ts';
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
const planOf = (number: number) =>
  ({ zone: { number, onward: [], name: `Zone ${number}` }, pieces: [] }) as unknown as PassagePlan;

/** The parts of the game this test reaches past its face: the room module's door, the mouth whose card is open and
 *  where its door stands, the zone stood in, the card, and the card's choice and the lamp's Home as E would make them. */
interface Inside {
  door: unknown;
  mouth: number | null;
  zone: unknown;
  begin(route: 'public' | 'company', lamp: number | null): void;
  goOn(mouth: number, ask: (asked: GearAsk) => void): void;
  home(ask: (asked: GearAsk) => void): void;
  cardAt: unknown;
  card: { open: boolean; show(choice: unknown): void };
}

/** `passages` reached past its face, through the card's and the zone's parts it splits into. */
function insideOf(passages: PassageGame): Inside {
  const inner = passages as unknown as Pick<Inside, 'door' | 'begin' | 'goOn' | 'home'>;
  const card = passages.card as unknown as { mouth: number | null; cardAt: unknown };
  const stood = passages.stood as unknown as { zone: unknown };
  return {
    get door() {
      return inner.door;
    },
    set door(door) {
      inner.door = door;
    },
    get mouth() {
      return card.mouth;
    },
    set mouth(mouth) {
      card.mouth = mouth;
    },
    get zone() {
      return stood.zone;
    },
    set zone(zone) {
      stood.zone = zone;
    },
    get cardAt() {
      return card.cardAt;
    },
    set cardAt(opened) {
      card.cardAt = opened;
    },
    begin: (route, lamp) => inner.begin(route, lamp),
    goOn: (mouth, ask) => inner.goOn(mouth, ask),
    home: (ask) => inner.home(ask),
    card: passages.card.view as unknown as Inside['card'],
  };
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
function game(foot: unknown, now = () => Date.now(), more: Partial<PassageHost> = {}) {
  const held = { foot, flow: { mode: 'foot', node: patrol.id } as Flow, told: [] as string[], kit: true };
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
    tell: (words) => void held.told.push(words),
    isles: { warm: async () => undefined },
    modelled: () => held.kit,
    fallback: () => () => undefined,
    now,
    ...more,
  });
  const played: WayPlayed[] = [];
  passages.ways.play = (way) => void played.push(way);
  return { held, passages, played, inside: insideOf(passages) };
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

test('a begin at a lamp the room refuses for its lamp says the player has not lit it this week', () => {
  const foot = footIn(patrol.id, { online: true, dive: null });
  const { held, inside, passages } = game(foot);
  // The second lamp's zone laid, so the begin is asked of the room.
  const lamped = { ...web, zones: [...web.zones, { ...zoneAt(5, [1_800, 2_800]), lamp: 2 }] };
  inside.door = { web: () => lamped, plan: (island: string, week: number, zone: number) => planOf(zone) };
  inside.mouth = 0;
  inside.begin('public', 2);
  foot.held.gear = { ...foot.held.gear!, answered: 1, answer: 177 };
  passages.frame(false);
  assert.deepEqual(held.told, ['You have not lit that lamp this week.']);
});

test('Home in a dive already turned homeward goes home at once, with no ask left waiting on the room', async () => {
  const dive = { island: 'continent-1', week: 2_900, zone: 7, mouth: 0, homeward: true };
  const asks: GearAsk[] = [];
  const { inside, played } = game(footIn('passage-g', { online: true, dive }, asks));
  inside.zone = zoneIn('passage-g', 7, [3]);
  inside.home((asked) => void asks.push(asked));
  assert.deepEqual(asks, [], 'nothing for the room to change');
  assert.equal(played[0]?.to, patrol.centre);
});

test('the mouths’ card closes once its place is left: walked away, or another room', () => {
  const foot = footIn(patrol.id, { online: true, dive: null });
  const { held, inside, passages } = game(foot);
  const open = () => {
    inside.card.show({ run: 'The Halls', beyond: {}, modifiers: [], routes: [], starts: [] });
    [inside.mouth, inside.cardAt] = [0, { foot, door: [4, 5] }];
  };
  open();
  passages.frame(false);
  assert.equal(inside.card.open, true, 'at its door it stays');
  inside.cardAt = { foot, door: [40, 5] };
  passages.frame(false);
  assert.equal(inside.card.open, false, 'walked 36 m away');
  open();
  held.foot = footIn('passage-h', { online: true, dive: null });
  passages.frame(false);
  assert.equal(inside.card.open, false, 'in another room');
});

test('a piece stands as boxes until its pack holds its module, under ground and above', () => {
  const foot = footIn('passage-e', { online: true, dive: null });
  const { held, inside, passages } = game(foot);
  foot.held.passage = { lampLit: false, open: false, lit: 0, broken: 0, done: false } as unknown as PassageSeenState;
  const lamp = { module: 'passage.lamp', kind: 'lamp', number: 0, at: [0, 0, 0], facing: 0 };
  const plan = { ...planOf(3), pieces: [lamp] } as unknown as PassagePlan;
  inside.zone = { ...zoneIn('passage-e', 3), entry: { plan, room: 'passage-e', patrol } };
  held.kit = false;
  assert.equal(passages.pieces()?.boxes.length, 1, 'under ground, the pack not come');
  held.kit = true;
  assert.equal(passages.pieces()?.boxes.length, 0, 'under ground, the pack come');
  inside.zone = { ...zoneIn('passage-e', 3), entry: { plan, room: 'passage-e', patrol }, isle: {} as IsleShown };
  held.kit = false;
  const waiting = passages.pieces();
  assert.equal(waiting?.boxes.length, 1, 'above ground, the pack not come');
  held.kit = true;
  assert.equal(passages.pieces()?.boxes.length, 0, 'the pack come');
  assert.notEqual(passages.pieces()?.key, waiting?.key, 'laid again');
});

test('Home goes to the patrol zone at the seas the dive began at, before the mouth it began at', async () => {
  const dive = { island: 'continent-1', week: 2_900, zone: 7, mouth: 0, homeward: true, seas: 1 };
  const goInto = async (entering: () => Promise<Foot>) => void (await entering());
  const { inside, passages } = game(footIn('passage-i', { online: true, dive }), undefined, { goInto });
  const works: (() => Promise<void>)[] = [];
  passages.ways.play = (way, work) => void works.push(work);
  const entered: unknown[] = [];
  const enter = Foot.enter;
  Foot.enter = async (...args: Parameters<typeof Foot.enter>) => (entered.push([args[1].id, args[3]]), {} as Foot);
  try {
    inside.zone = zoneIn('passage-i', 7, [3]);
    inside.home(() => undefined);
    await works[0]?.();
  } finally {
    Foot.enter = enter;
  }
  assert.deepEqual(entered, [[patrol.id, 'elite']], 'the Elite seas it began at');
});

test('back into a passage zone only where its room names one the web lays, its patrol zone open', async () => {
  const module = Promise.resolve({} as WebAssembly.Module);
  const { inside, passages } = game(footIn('node-saltgrass-downs', { online: true, dive: null }), undefined, {
    module,
  });
  // The door the module would give, set once the game has tried to make its own of the stand-in module.
  await tick();
  inside.door = {
    web: () => web,
    plan: (island: string, week: number, zone: number) => (zone === 3 ? null : planOf(zone)),
  };
  assert.equal(await passages.resumeIn('node-saltgrass-downs'), false, 'no passage zone’s room');
  assert.equal(await passages.resumeIn(passageRoomName('continent-1', 2_900, 3)), false, 'a zone the door lays not');
  // A web is asked once a week: another week's the door has none of.
  inside.door = { web: () => null, plan: () => planOf(7) };
  assert.equal(await passages.resumeIn(passageRoomName('continent-1', 2_901, 7)), false, 'a week with no web');
  inside.door = null;
  assert.equal(await passages.resumeIn(passageRoomName('continent-1', 2_900, 7)), false, 'no door: no passages');
});

test('a held ask the room refuses is said in the room’s words, and one it takes says nothing', () => {
  const asks: GearAsk[] = [];
  const foot = footIn('passage-k', { online: true, dive: null }, asks);
  const { held, inside, passages } = game(foot);
  const kindled = {
    ...planOf(3),
    pieces: [{ module: 'kindle', kind: 'kindle', number: 0, at: [4, 5, 0], facing: 0 }],
  } as unknown as PassagePlan;
  inside.zone = { ...zoneIn('passage-k', 3), entry: { plan: kindled, room: 'passage-k', patrol } };
  inside.door = { web: () => web, plan: () => null };
  const ask = (asked: GearAsk) => void asks.push(asked);
  passages.uses()?.(4, 5, ask)?.run();
  assert.deepEqual(asks, [{ kind: ASKS.kindle, column: 0 }]);
  foot.held.gear = { ...foot.held.gear!, answered: 1, answer: 185 };
  passages.frame(false);
  assert.deepEqual(held.told, ['Not while foes are near.']);
  passages.uses()?.(4, 5, ask)?.run();
  foot.held.gear = { ...foot.held.gear!, answered: 2, answer: 0 };
  passages.frame(false);
  passages.frame(false);
  assert.deepEqual(held.told, ['Not while foes are near.'], 'a hold begun is no refusal');
});

test('at the lamp, the use carries the prompt’s second line', () => {
  const foot = footIn('passage-l', { online: true, dive: null });
  const { inside, passages } = game(foot);
  const lamped = {
    ...planOf(3),
    zone: { ...planOf(3).zone, lamp: 1 },
    pieces: [{ module: 'lamp', kind: 'lamp', number: 0, at: [4, 5, 0], facing: 0 }],
  } as unknown as PassagePlan;
  inside.zone = { ...zoneIn('passage-l', 3), entry: { plan: lamped, room: 'passage-l', patrol } };
  foot.held.passage = { lampLit: false, open: true, done: true, holding: null } as unknown as PassageSeenState;
  inside.door = { web: () => web, plan: () => null };
  const use = passages.uses()?.(4, 5, () => undefined);
  assert.equal(use?.words, 'Light the lamp');
  assert.equal(use?.under, 'What you carry is kept once it burns');
});

test('a begin at a lamp lays the lamp’s zone the room begins it at: the mouth’s place among the mouths', () => {
  const foot = footIn(patrol.id, { online: true, dive: null });
  const { inside } = game(foot);
  const laid: number[] = [];
  const lamped = {
    ...web,
    mouths: [...web.mouths, { run: 'The Stair', zone: 7 }],
    zones: [...web.zones, { ...zoneAt(5, [1_800, 2_800]), lamp: 2 }, { ...zoneAt(6, [1_900, 2_900]), lamp: 2 }],
  };
  inside.door = {
    web: () => lamped,
    plan: (island: string, week: number, zone: number) => (laid.push(zone), planOf(zone)),
  };
  inside.mouth = 1;
  inside.begin('public', 2);
  assert.deepEqual(laid, [6]);
});

test('a way on the zone gone to refuses as come by no way there, back in the zone left, says why', async () => {
  const dive = { island: 'continent-1', week: 2_900, zone: 3, mouth: 0, homeward: false };
  const foot = footIn('passage-m', { online: true, dive });
  let joins = 0;
  const { held, inside, passages } = game(foot);
  // Each zone stood in is joined: the first, the zone gone to, refuses.
  const standing = passages as unknown as { standIn: () => Promise<void> };
  standing.standIn = () => (joins++ ? Promise.resolve() : Promise.reject(new Error(NO_WAY_HERE)));
  let work: (() => Promise<void>) | null = null;
  passages.ways.play = (way, working) => void (work = working);
  inside.zone = { ...zoneIn('passage-m', 3), entry: { plan: onwardPlan(3), room: 'passage-m', patrol, ...dive } };
  inside.door = { web: () => web, plan: (island: string, week: number, zone: number) => onwardPlan(zone) };
  inside.goOn(0, () => undefined);
  foot.held.gear = { ...foot.held.gear!, answered: 1, dive: { ...dive, zone: 7 } };
  passages.frame(false);
  await tick();
  await (work as unknown as () => Promise<void>)();
  assert.equal(joins, 2, 'the zone gone to, then the zone left');
  assert.deepEqual(held.told, [NO_WAY_HERE]);
});

test('a dead lamp lit already gives way to the open mouth beside it', () => {
  const foot = footIn('passage-n', { online: true, dive: null });
  const { inside, passages } = game(foot);
  const beside = {
    ...onwardPlan(3),
    sites: { onward: [{ at: [7, 5], facing: 0 }] },
    pieces: [{ module: 'kindle', kind: 'kindle', number: 0, at: [4, 7, 0], facing: 0 }],
  } as unknown as PassagePlan;
  inside.zone = { ...zoneIn('passage-n', 3), entry: { plan: beside, room: 'passage-n', patrol } };
  inside.door = { web: () => web, plan: () => null };
  foot.held.passage = { lit: 1, open: true, done: true, holding: null } as unknown as PassageSeenState;
  assert.equal(passages.uses()?.(4, 5, () => undefined)?.words, 'On to Zone 7');
});
