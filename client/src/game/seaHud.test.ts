import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightCaptain, ShipState } from '../rules/fightRules.ts';
import { stripOf } from './hints.ts';
import type { Hud } from './hud.ts';
import type { Sea } from './sea.ts';
import type { SeaFrame } from './seaFrame.ts';
import { hideSeaHud, seaPlace, type SeaHudState, seaShipMarks, showSeaHud } from './seaHud.ts';

/** The roads as a sea display with no quest walked reads them. */
const ROADS = {
  quests: { guide: () => ({ at: null, notes: [] }), tracked: null },
  chart: { nodes: [], layouts: [] },
  past: true,
};
import { seaFightQuest } from './seaPanel.ts';

const captain = (x: number, y: number, state: ShipState, hostile: boolean): FightCaptain =>
  ({ ship: [x, y, 0], pose: [0, 0, 0], state, hostile, run_out: [] }) as unknown as FightCaptain;

test('out of a fight the compass marks every other player’s ship in bone and every hostile one in red', () => {
  const others = [{ player: 4, x: 10, y: -20, heading: 0, pace: 1, hull: 0, dress: [], name: [], emblem: 0 }];
  const hostiles = [
    { id: 7, x: -300, y: 40, heading: 1, faction: 1, rank: 3 },
    { id: 8, x: 9_000, y: 0, heading: 1, faction: 1, rank: 2, sight: 25_920 },
  ];
  assert.deepEqual(seaShipMarks(null, { others, hostiles }), [
    { x: 10, y: -20, kind: 'ship' },
    { x: -300, y: 40, kind: 'hostile', rangeM: 5_000 },
    { x: 9_000, y: 0, kind: 'hostile', rangeM: 25_920 },
  ]);
  assert.deepEqual(seaShipMarks(null, null), [], 'out of a room, none');
});

test('in a fight it marks its captains: red while it would take the player, grey once its colours are down, none going down', () => {
  const captains = [
    captain(100, 0, 'afloat', true),
    captain(0, 100, 'afloat', false),
    captain(50, 50, 'struck', true),
    captain(70, 70, 'sinking', true),
    captain(80, 80, 'sunk', true),
  ];
  const hostiles = [{ id: 7, x: -300, y: 40, heading: 1, faction: 1, rank: 3 }];
  assert.deepEqual(seaShipMarks(captains, { others: [], hostiles }), [
    { x: 100, y: 0, kind: 'hostile' },
    { x: 0, y: 100, kind: 'ship' },
    { x: 50, y: 50, kind: 'struck' },
  ]);
});

test('in a fight a captain with a battery run out at the player’s ship is lit on the compass, as its warning names it', () => {
  const running = (x: number, side: 'port' | 'starboard') =>
    ({ ...captain(x, 0, 'afloat', true), run_out: [side] }) as FightCaptain;
  const marks = seaShipMarks(
    [running(200, 'port'), running(-200, 'port'), captain(0, 100, 'afloat', true)],
    null,
    [0, 0, 0],
  );
  assert.deepEqual(
    marks.map((mark) => mark.kind),
    ['firing', 'hostile', 'hostile'],
    'its port side bears on the player from the east, not from the west',
  );
  assert.equal(seaShipMarks([running(200, 'port')], null)[0]?.kind, 'hostile', 'with no ship of the player’s, none');
});

test('in a fight the sea bar goes: its map, pace, Manage and Leave do nothing there', () => {
  const bars: unknown[] = [];
  const hud = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'tasks'
          ? { show: () => undefined }
          : key === 'seaBar'
            ? (bar: unknown) => bars.push(bar)
            : () => undefined,
    },
  );
  const sea = (fight: unknown) =>
    ({
      view: { helmView: false },
      aboard: { walking: false, managing: false, active: false, atWheel: false, where: {} },
      boarding: { words: null },
      waterWords: null,
      fight,
      sighted: null,
    }) as unknown as Sea;
  const shown = { shot: { eye: [0, 0, 10], yaw: 0, pitch: 0.3, fov: 1 }, marks: [], bars: [], focus: [0, 0], note: '' };
  const state = { ...ROADS, landing: false, onSea: true, region: 'The sea', clock: 0, friendly: [], notices: [] };
  const show = (fight: unknown) =>
    showSeaHud(hud as unknown as Hud, sea(fight), shown as unknown as SeaFrame, state as unknown as SeaHudState);
  show(null);
  const fight = {
    messages: () => [],
    readout: () => ({ left: 1, men: 0 }),
    captains: [],
    vessel: { ship: [0, 0, 0] },
    aimingNow: false,
    view: { lay: null, captain: { name: 'Tithe Brig' } },
    display: () => null,
  };
  show(fight);
  assert.notEqual(bars[0], null, 'out of a fight the bar stands');
  assert.equal(bars[1], null, 'in one it is hidden');
});

test('the place line names the water the ship is in as the helm does, managing it too', () => {
  const waterWords = 'The Lantern Sea, Overlook’s home waters';
  const here = (helmView: boolean, managing: boolean) =>
    ({ boarding: { words: null }, view: { helmView }, aboard: { walking: false, managing }, waterWords }) as never;
  const state = { landing: false, island: 'Saltmere', region: 'The Pale Expanse' };
  const shown = { landfall: null } as never;
  assert.deepEqual(seaPlace(here(true, false), shown, state), ['At the helm', waterWords]);
  assert.deepEqual(seaPlace(here(false, true), shown, state), ['Managing the Sloop', waterWords]);
  const nowhere = {
    boarding: { words: null },
    view: { helmView: false },
    aboard: { walking: false, managing: true },
  } as never;
  assert.deepEqual(seaPlace(nowhere, shown, state), ['Managing the Sloop', 'The Pale Expanse']);
});

test("in a fight the readout stands over the sea: the ship's plate, rose, card and tally; on a struck ship's deck it goes", () => {
  const readouts: unknown[] = [];
  const hud = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'tasks'
          ? { show: () => undefined }
          : key === 'seaFight'
            ? (model: unknown) => readouts.push(model)
            : () => undefined,
    },
  );
  const model = { ship: null, card: null, tally: null, warn: null };
  const fight = {
    messages: () => [],
    readout: () => ({ left: 1, men: 0 }),
    captains: [],
    vessel: { ship: [0, 0, 0] },
    aimingNow: false,
    view: { lay: null, captain: { name: 'Tithe Brig' } },
    display: () => model,
  };
  const sea = (deck: unknown) =>
    ({
      view: { helmView: false },
      aboard: { walking: false, managing: false, active: false, atWheel: false, where: {} },
      boarding: { words: deck },
      waterWords: null,
      fight,
      sighted: null,
    }) as unknown as Sea;
  const shown = { shot: { eye: [0, 0, 10], yaw: 0, pitch: 0.3, fov: 1 }, marks: [], bars: [], focus: [0, 0], note: '' };
  const state = { ...ROADS, landing: false, onSea: true, region: 'The sea', clock: 0, friendly: [], notices: [] };
  const show = (deck: unknown) =>
    showSeaHud(hud as unknown as Hud, sea(deck), shown as unknown as SeaFrame, state as unknown as SeaHudState);
  show(null);
  show({ place: 'Its deck', line: 'Fighting', hints: { title: '', hints: [] } });
  assert.deepEqual(readouts, [model, null]);
});

test("in a fight the hints are the fight's keys alone, as on foot, and the sea's word and the fight's messages are notices", () => {
  const said: Record<string, unknown[]> = { strip: [], notices: [] };
  const tasks: unknown[] = [];
  const hud = new Proxy(
    {},
    {
      get: (_target, key: string) => {
        if (key === 'tasks') return { show: (quest: unknown) => tasks.push(quest) };
        return key in said ? (value: unknown) => said[key]?.push(value) : () => undefined;
      },
    },
  );
  const view = { lay: null, captain: { name: 'Tithe Brig' }, others: [] };
  const messages = () => ['The Tithe Brig surrenders!'];
  const readout = () => ({ left: 2, men: 9 });
  const fight = {
    messages,
    readout,
    captains: [],
    vessel: { ship: [0, 0, 0] },
    aimingNow: false,
    view,
    display: () => null,
  };
  const sea = {
    view: { helmView: false },
    aboard: { walking: false, managing: false, active: false, atWheel: false, where: {} },
    boarding: { words: null },
    waterWords: null,
    fight,
    sighted: null,
  } as unknown as Sea;
  const shown = { shot: { eye: [0, 0, 10], yaw: 0, pitch: 0.3, fov: 1 }, marks: [], bars: [], focus: [0, 0], note: '' };
  const notices = ['The Tithe Schooner joined the fight.'];
  const state = { ...ROADS, landing: false, onSea: true, region: 'The sea', clock: 0, friendly: [], notices };
  showSeaHud(hud as unknown as Hud, sea, shown as unknown as SeaFrame, state as unknown as SeaHudState);
  assert.deepEqual(said['strip'], [stripOf('fight')]);
  assert.deepEqual(said['notices'], [['The Tithe Schooner joined the fight.', 'The Tithe Brig surrenders!']]);
  // The tracker holds the fight's task: the ships left and their men.
  assert.deepEqual(tasks, [seaFightQuest('Sea fight', 2, 9)]);
});

test("on land the sea's own pieces go: the ships' plates, the sight, the readout, the sea bar, Manage's panel and the wheel", () => {
  const said: Record<string, unknown[]> = {};
  const hud = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'tasks'
          ? { show: (...args: unknown[]) => void (said['tasks'] = args) }
          : (...args: unknown[]) => void (said[String(key)] = args),
    },
  );
  hideSeaHud(hud as unknown as Hud);
  assert.equal(said['tasks'], undefined, "the tracker is left to the land, which shows the roads' quest there");
  assert.deepEqual(said['shipBars']?.[0], [], "no ship's plate stands over the land");
  assert.deepEqual(said['seaPlayers']?.[0], [], "no other player's ship's mark either");
  assert.equal(said['seaFight']?.[0], null);
  assert.equal(said['seaBar']?.[0], null);
  assert.equal(said['shipPanel']?.[0], null);
  assert.equal(said['wheelOffer']?.[0], false);
  assert.equal(said['sight']?.[0], false, 'no sight on land');
});

test('while the ship sails away to other waters the sea bar goes, so nothing on it stops or turns the travel', () => {
  const bars: unknown[] = [];
  const hud = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'tasks'
          ? { show: () => undefined }
          : key === 'seaBar'
            ? (bar: unknown) => bars.push(bar)
            : () => undefined,
    },
  );
  const sea = (travelling: unknown) =>
    ({
      view: { helmView: false },
      aboard: { walking: false, managing: false, active: false, atWheel: false, where: {} },
      boarding: { words: null },
      fight: null,
      sighted: null,
      travelling,
    }) as unknown as Sea;
  const shown = { shot: { eye: [0, 0, 10], yaw: 0, pitch: 0.3, fov: 1 }, marks: [], bars: [], focus: [0, 0], note: '' };
  const state = { ...ROADS, landing: false, onSea: true, region: 'The sea', clock: 0, friendly: [], notices: [] };
  for (const travelling of [null, { away: { veil: null } }])
    showSeaHud(hud as unknown as Hud, sea(travelling), shown as unknown as SeaFrame, state as unknown as SeaHudState);
  assert.notEqual(bars[0], null, 'at sea the bar stands');
  assert.equal(bars[1], null, 'sailing away it is hidden');
});

test('a friendly ship the room keeps at sea keeps its friendly mark on the compass', () => {
  const friendlies = [{ traffic: 2_605, x: 300, y: -40, heading: 0, hull: 1 }];
  assert.deepEqual(seaShipMarks(null, { others: [], hostiles: [], friendlies }), [
    { x: 300, y: -40, kind: 'friendly' },
  ]);
});

test("other players' ships wear their marks out of a fight, and none while the view is down at the helm, where the map covers it", () => {
  const shownPlayers: unknown[] = [];
  const hud = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'tasks'
          ? { show: () => undefined }
          : key === 'seaPlayers'
            ? (players: unknown) => shownPlayers.push(players)
            : () => undefined,
    },
  );
  const sea = (helmView: boolean) =>
    ({
      view: { helmView },
      aboard: { walking: false, managing: false, active: false, atWheel: false, where: {} },
      boarding: { words: null },
      waterWords: null,
      fight: null,
      sighted: null,
    }) as unknown as Sea;
  const players = [{ id: 2 }];
  const shown = { shot: { eye: [0, 0, 10], yaw: 0, pitch: 0.3, fov: 1 }, marks: [], bars: [], players, focus: [0, 0] };
  const state = { ...ROADS, landing: false, onSea: true, region: 'The sea', clock: 0, friendly: [], notices: [] };
  for (const helmView of [false, true])
    showSeaHud(hud as unknown as Hud, sea(helmView), shown as unknown as SeaFrame, state as unknown as SeaHudState);
  assert.deepEqual(shownPlayers, [players, []]);
});
