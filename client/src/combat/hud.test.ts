import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLATES } from '../plus/barLayout.ts';
import { COMPASS, SHIP_MARK_COLOURS, UNDER_COMPASS } from '../plus/compass.ts';
import { compassNode } from './compassNode.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import type { Node } from '../ui/node.ts';
import { viewProjection } from '../editor/orbit.ts';
import type { MarkedFoe } from './foeBars.ts';
import { EVENT } from './cues.ts';
import { blockedBy, clearOf, Hud, type HudFrame, type HudKeys, veilOf } from './hud.ts';
import { vitalsDepth } from './hudLayout.ts';
import type { GearState } from '../network/gearMessages.ts';
import { KINDS, WORN } from '../player/gear.ts';
import { cameraOf } from './plateSight.ts';
import { allOf, coloursDrawn, fakeInterface, laidOf, wordsIn } from './nodes.test.ts';

const standing: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'players',
  arms: 0,
  health: 100,
  healthMax: 100,
  stamina: 100,
  poise: 0,
  poiseMax: 35,
  target: null,
  action: { kind: 'idle' },
};
const dead: FighterView = { ...standing, health: 0, action: { kind: 'dead', elapsed: 60 } };

/** A frame of the display with nothing in it but `more`. */
const bare = (more: Partial<HudFrame> = {}): HudFrame => ({
  own: standing,
  foes: [],
  where: () => [0, 0, 0],
  matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  width: 1280,
  height: 720,
  events: [],
  player: 1,
  firstPerson: false,
  pressed: false,
  lost: null,
  groundAt: null,
  ...more,
});
/** The display's nodes as `hud` last kept them, drawn by an interface over a 1280 by 720 view. */
const drawn = (hud: Hud, width = 1280, height = 720): Node => hud.node(fakeInterface(width, height));

test('the veil is blood for a death, plain for a link joining again or lost, and none otherwise', () => {
  assert.equal(veilOf({ own: standing, lost: null }), null);
  assert.deepEqual(veilOf({ own: dead, lost: null }), { words: 'You fell. Standing again in 3 s', link: false });
  assert.deepEqual(veilOf({ own: dead, lost: null, rejoining: true }), { words: 'Reconnecting…', link: true });
  assert.deepEqual(veilOf({ own: standing, lost: 'the room closed' }), {
    words: 'The link to the room was lost: the room closed.',
    link: true,
  });
  const veil = (frame: HudFrame) => {
    const hud = new Hud();
    hud.update(frame, 1 / 60);
    return allOf(drawn(hud)).find((node) => node.fill && node.width === 'grow')?.fill;
  };
  assert.equal(veil(bare({ own: dead })), 'rgba(51,0,0,0.667)', 'blood');
  assert.equal(veil(bare({ lost: 'the room closed' })), 'rgba(5,7,10,0.72)', 'a lost link is no wound');
  assert.equal(veil(bare()), undefined);
});

test('an arrow that would fall on the Arts and weapons stands above them, and on the vitals below them', () => {
  const arms = { left: 24, top: 490, right: 430, bottom: 578 };
  const onIt = { x: 28, y: 520, angle: Math.PI };
  assert.deepEqual(clearOf(onIt, arms, 22), { x: 28, y: 468, angle: Math.PI });
  const below = { x: 150, y: 572, angle: Math.PI / 2 };
  assert.equal(clearOf(below, arms, 22).y, 468, 'one at the foot, toward a foe behind, too');
  const above = { x: 28, y: 300, angle: Math.PI };
  assert.equal(clearOf(above, arms, 22), above);
  const right = { x: 932, y: 520, angle: 0 };
  assert.equal(clearOf(right, arms, 22), right);
  const vitals = { left: 28, top: 14, right: 204, bottom: 88 };
  assert.deepEqual(clearOf({ x: 28, y: 40, angle: Math.PI }, vitals, 22, true), { x: 28, y: 110, angle: Math.PI });
});

test('words over the world carry a hard outline all round, and the display stands under the game’s own windows', () => {
  const hud = new Hud();
  hud.update(
    bare({
      own: { ...standing, action: { kind: 'overreach', left: 20 } },
      ammo: 4,
      crosshair: { reticle: 'pistolet', charge: null, reach: null },
    }),
    1 / 60,
  );
  const root = drawn(hud);
  const words = allOf(root).filter((node) => node.text);
  assert.ok(words.length >= 2, 'the poise’s word and the shots');
  assert.ok(
    words.every((node) => node.text?.edge === 'halo'),
    'each outlined',
  );
  assert.equal(root.through, true, 'a click on it is the world’s');
  assert.ok(
    allOf(root).every((node) => !node.float || node.float.z === 1),
    'nothing of it is lifted over a layer laid after it',
  );
});

test('with reduced motion asked for, neither the low health nor the empty stamina blinks: each holds its warning', () => {
  // The vitals' own clock: a warning shown with motion reduced stands every frame (see vitals.ts' barNode).
  const hud = new Hud();
  hud.update(bare({ own: { ...standing, health: 10, stamina: 0 }, pressed: true }), 1 / 60);
  assert.ok(coloursDrawn(drawn(hud)).size > 0);
});

test('the plates on foot are the sizes the sea draws its own at, a Minor’s bar short and thin, an Elite’s long', () => {
  const { overhead, boss } = PLATES;
  const { matrix, foeAt } = levelView();
  const plateOf = (rank: number) => {
    const hud = new Hud();
    hud.update(bare({ matrix, foes: [{ ...foeAt(2, 'Ahead', 6, 0), rank }] }), 1 / 60);
    const plate = allOf(drawn(hud)).find((node) => node.float?.anchor?.[1] === 1 && node.direction === 'row');
    const bar = allOf(plate).find((node) => node.role === 'track');
    return [plate?.width, bar?.height, bar?.width];
  };
  assert.deepEqual(plateOf(2), [overhead.width, overhead.bar, '100%'], 'a Major’s, a ship’s size');
  assert.deepEqual(
    plateOf(1),
    [overhead.width, 6, '60%'],
    'a Minor’s as wide, for its name; six pixels, three fifths long',
  );
  const [eliteWidth, eliteBar] = plateOf(3);
  assert.ok((eliteWidth as number) > overhead.width && (eliteBar as number) > overhead.bar, 'an Elite’s long');
  // In a narrow view (the Test Ground's between its panels) the boss bar keeps to its share of it.
  const bossed = new Hud();
  const thule = { ...foeAt(4, 'Thule', 30, 0), rank: 5, alert: 2 };
  bossed.update(bare({ matrix, width: 600, foes: [thule] }), 1 / 60);
  const bossBar = allOf(drawn(bossed, 600)).find(
    (node) => node.direction === 'row' && node.gap === 5 && wordsIn(node).includes('Thule'),
  );
  assert.equal(bossBar?.width, Math.round(boss.share * 600), 'its share of a narrow view');
});

test('the boss bar and the target’s plate stand in the compass’s column, and a Boss ship’s plate where the boss bar does', () => {
  const { matrix, foeAt } = levelView();
  const hud = new Hud();
  const thule = { ...foeAt(4, 'Thule', 30, 0), rank: 5, alert: 2 };
  hud.update(bare({ matrix, foes: [thule] }), 1 / 60);
  const column = allOf(drawn(hud)).find((node) => node.direction === 'column' && node.alignX === 'center');
  assert.deepEqual(column?.float, { to: 'screen', y: COMPASS.top, z: 1 });
  assert.ok(wordsIn(column).includes('Thule'), 'the boss bar under the compass');
  assert.equal(PLATES.boss.top, UNDER_COMPASS, 'at sea a Boss ship’s plate stands where the boss bar stands on foot');
});

test('a plate’s line is blocked by a block between the eye and the head, never by one beside it or at the head', () => {
  const wall = { minX: -2, minY: 4.8, maxX: 2, maxY: 5.2, top: 4, bottom: 0 };
  assert.equal(blockedBy([wall], [0, 0, 1.7], [0, 10, 1.8]), true);
  assert.equal(blockedBy([wall], [0, 0, 1.7], [6, 10, 1.8]), false, 'a foe beside the wall keeps its plate');
  const lintel = { minX: -2, minY: 9.85, maxX: 2, maxY: 10.5, top: 4, bottom: 0 };
  assert.equal(blockedBy([lintel], [0, 0, 1.7], [0, 10, 1.8]), false, 'a block at the head blinds nothing');
  assert.equal(blockedBy([], [0, 0, 1.7], [0, 10, 1.8]), false);
});

/** A level view from 1.7 m up, as the game's camera makes it: its matrix, where a point `ahead` metres along it and
 *  `aside` across it stands on the ground, a Major foe standing there, and how far down the screen a point is drawn. */
function levelView() {
  const matrix = viewProjection({ targetX: 0, targetY: 0, targetZ: 1.7, yaw: 0, pitch: 0, distance: 0.5 }, 16 / 9);
  const camera = cameraOf(matrix);
  assert.ok(camera);
  const { eye, forward } = camera;
  const placeAt = (ahead: number, aside: number) => ({
    x: eye[0] + forward[0] * ahead - forward[1] * aside,
    y: eye[1] + forward[1] * ahead + forward[0] * aside,
  });
  const foeAt = (id: number, name: string, ahead: number, aside: number) => ({
    id,
    name,
    view: { ...standing, ...placeAt(ahead, aside), side: 'foes' as const },
    rank: 2,
    faction: '',
    phase: 0,
    alert: 0,
  });
  const downAt = (point: readonly [number, number, number]) => {
    const row = (index: number) =>
      (matrix[index] ?? 0) * point[0] +
      (matrix[index + 4] ?? 0) * point[1] +
      (matrix[index + 8] ?? 0) * point[2] +
      (matrix[index + 12] ?? 0);
    return ((1 - row(1) / row(3)) / 2) * 720;
  };
  return { matrix, eye, forward, placeAt, foeAt, downAt };
}

test('the display holds the soft lock’s foe’s plate wherever it stands, and the land hides a plate as a block does', () => {
  const { matrix, eye, forward, placeAt, foeAt } = levelView();
  // A foe 30 degrees aside, out of the cone, and one straight ahead; a ridge 5 m high across the line to the second.
  const foes = [foeAt(2, 'Aside', 10, 10 * Math.tan(Math.PI / 6)), foeAt(3, 'Ahead', 20, 0)];
  const ridge = (x: number, y: number) => {
    const [east, south] = [x - eye[0], y - eye[1]];
    const ahead = east * forward[0] + south * forward[1];
    const aside = Math.abs(south * forward[0] - east * forward[1]);
    return Math.abs(ahead - 10) < 1.5 && aside < 2 ? 5 : 0;
  };
  const platesFor = (lock: number | null, groundAt?: (x: number, y: number) => number | null) => {
    const hud = new Hud();
    const frame: HudFrame = {
      own: { ...standing, ...placeAt(0, 0), target: lock },
      foes,
      where: () => [0, 0, 0],
      matrix,
      width: 1280,
      height: 720,
      events: [],
      player: 1,
      firstPerson: false,
      pressed: false,
      lost: null,
      groundAt: groundAt ?? null,
    };
    // Past 6 s, as the lock first took it: only the lock holds the locked foe's plate.
    for (let step = 0; step < 420; step++) hud.update(frame, 1 / 60);
    return overheadNames(drawn(hud));
  };
  assert.deepEqual(platesFor(null), ['Ahead'], 'only the foe at the crosshair');
  assert.deepEqual(platesFor(2).sort(), ['Ahead', 'Aside'], 'the locked foe too, long after the lock took it');
  assert.deepEqual(platesFor(2, ridge), ['Aside'], 'the ridge hides the foe behind it');
});

/** The plates over figures in a display's nodes, by the names on them. */
const overheadNames = (root: Node) =>
  allOf(root)
    .filter((node) => node.float?.to === 'screen' && node.float.anchor?.[1] === 1 && node.direction === 'row')
    .map((plate) => wordsIn(plate).find((words) => !/^\d+$/.test(words) && words !== '!' && words !== '?'));

test('the words of blows keep clear of the plates drawn, never of a foe with none', () => {
  const { matrix, placeAt, foeAt, downAt } = levelView();
  const iron: Action = {
    kind: 'telegraph',
    shape: 'sweep',
    elapsed: 0,
    windup: 40,
    origin: [0, 0, 0],
    bearing: 0,
    ahead: 2,
    iron: true,
    feintAt: null,
  };
  // Two foes 8 m off winding up an iron blow at the player, each told "Dodge!": one at the crosshair, whose plate
  // shows, and one 30 degrees aside, the target plate's, which holds none over its head.
  const winding = (foe: ReturnType<typeof foeAt>) => ({ ...foe, view: { ...foe.view, action: iron, target: 1 } });
  const aside = winding(foeAt(3, 'Aside', 8, 8 * Math.tan(Math.PI / 6)));
  const foes = [winding(foeAt(2, 'Ahead', 8, 0)), aside];
  const hud = new Hud();
  // Past its pop, a word stands at its own size.
  for (let frame = 0; frame < 5; frame++)
    hud.update(bare({ own: { ...standing, ...placeAt(0, 0) }, foes, matrix }), 1 / 60);
  const root = drawn(hud);
  assert.deepEqual(overheadNames(root), ['Ahead']);
  const laid = laidOf(root);
  const plate = laid.find((each) => each.node.direction === 'row' && each.node.float?.anchor?.[1] === 1);
  const said = laid.filter((each) => wordsIn(each.node)[0] === 'Dodge!' && each.node.float);
  const [overAhead, overAside] = said.sort((one, two) => one.box.x - two.box.x);
  assert.ok(plate && overAhead && overAside);
  assert.ok(overAhead.box.y + 4 >= plate.box.y + plate.box.height + 24, 'pushed under the plate drawn');
  const asideFoot = downAt([aside.view.x, aside.view.y, aside.view.z + 1.9]);
  assert.ok(overAside.box.y < asideFoot, 'over the foe with none, where it was said');
});

test('the compass turns its points with the view, its marks at each ship’s bearing in its kind’s colour', () => {
  const points = (heading: number) =>
    allOf(compassNode(520, heading)).flatMap((node) =>
      node.text ? [[node.text.words, node.float?.at?.[0]?.toFixed(2), node.text.size]] : [],
    );
  assert.deepEqual(points(0.02), [
    ['N', '0.42', 2],
    ['NE', '0.92', 1],
  ]);
  assert.deepEqual(
    points(0.5).map(([words]) => words),
    ['SE', 'S', 'SW'],
  );
  const marks = allOf(
    compassNode(
      520,
      0,
      1,
      [0, 0],
      [
        { x: 0, y: -300, kind: 'hostile' },
        { x: 300, y: 0, kind: 'ship' },
      ],
    ),
  ).filter((node) => node.picture);
  assert.deepEqual(
    marks.map((mark) => [mark.float?.at?.[0], mark.picture?.key]),
    [
      [0.5, 'compass ship hostile'],
      [1, 'compass ship ship'],
    ],
  );
  assert.ok(marks.every((mark) => 'svg' in (mark.picture?.source ?? {})));
  assert.match(String((marks[0]?.picture?.source as { svg: string }).svg), new RegExp(SHIP_MARK_COLOURS.hostile));
});

test("the compass marks where the roads' next goal stands, at its bearing or held at the end nearer it", () => {
  const questMark = (node: Node) => allOf(node).find((each) => each.picture?.key === 'compass quest');
  assert.equal(questMark(compassNode(520, 0, 1, [0, 0], [], [0, -300]))?.float?.at?.[0], 0.5, 'dead ahead, north');
  assert.equal(questMark(compassNode(520, 0, 1, [0, 0], [], [300, 0]))?.float?.at?.[0], 1, 'east, off the strip');
  assert.equal(questMark(compassNode(520, 0)), undefined, 'none to mark');
  const hud = new Hud();
  const frame: HudFrame = {
    own: standing,
    foes: [],
    where: () => [0, 0, 0],
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    width: 1280,
    height: 720,
    events: [],
    player: 1,
    firstPerson: false,
    pressed: false,
    lost: null,
    groundAt: null,
  };
  const matrix = viewProjection({ targetX: 0, targetY: 0, targetZ: 1.7, yaw: 0, pitch: 0, distance: 4 }, 16 / 9);
  hud.update({ ...frame, matrix, questAt: [standing.x, standing.y - 300] }, 1 / 60);
  assert.ok(questMark(drawn(hud)), 'on the fight’s compass');
  hud.update({ ...frame, matrix }, 1 / 60);
  assert.equal(questMark(drawn(hud)), undefined);
});

test('an arrow to a threat off the screen stands clear of what the page keeps beside the display, as the game’s hints', () => {
  // The game's hints stand over the left edge's middle, where an arrow to a foe off the left would point.
  const box = { left: 28, top: 300, right: 428, bottom: 420 };
  const hud = new Hud(null, null, () => [box]);
  const foe: FighterView = { ...standing, x: -5, side: 'foes', target: 1, action: { kind: 'draw', elapsed: 3 } };
  hud.update(
    {
      own: standing,
      foes: [{ id: 2, name: 'Runner', view: foe, rank: 0, faction: '', phase: 0, alert: 0 }],
      where: () => [0, 0, 0],
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      width: 1280,
      height: 720,
      events: [],
      player: 1,
      firstPerson: false,
      pressed: false,
      lost: null,
      groundAt: null,
    },
    1 / 60,
  );
  const arrow = allOf(drawn(hud)).find((node) => node.picture?.key === 'threat arrow');
  const [x = NaN, y = NaN] = [arrow?.float?.x, arrow?.float?.y];
  assert.ok(x < box.right, `the arrow at the left edge (${x})`);
  assert.ok(y <= box.top - 22, `standing above the hints (${y})`);
});

test('the page’s pieces beside the display are read only while an arrow would keep clear of them', () => {
  let read = 0;
  const hud = new Hud(null, null, () => {
    read += 1;
    return [];
  });
  const foe: FighterView = { ...standing, x: 5, side: 'foes', target: 1, action: { kind: 'draw', elapsed: 3 } };
  const runner = { id: 2, name: 'Runner', view: foe, rank: 0, faction: '', phase: 0, alert: 0 };
  hud.update(bare(), 1 / 60);
  drawn(hud);
  assert.equal(read, 0, 'no threat, nothing read');
  hud.update(bare({ foes: [runner] }), 1 / 60);
  assert.equal(allOf(drawn(hud)).filter((node) => node.picture?.key === 'threat arrow').length, 1, 'the arrow shows');
  assert.equal(read, 1);
});

test('the screen’s red edge comes for a blow the player takes, never for their drink’s heal', () => {
  const hud = new Hud();
  const frame: HudFrame = {
    own: { ...standing, health: 60 },
    foes: [],
    where: () => [0, 0, 0],
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    width: 1280,
    height: 720,
    events: [],
    player: 1,
    firstPerson: false,
    pressed: false,
    lost: null,
    groundAt: null,
  };
  const told = (kind: number) => ({ tick: 0n, kind, how: 0, striker: 1, defender: 1, amount: 40, stroke: 0 });
  // The red edge is the one node drawn over the whole screen at the edge's own fade.
  const edge = () => allOf(drawn(hud)).some((node) => node.width === 'grow' && node.draw && (node.opacity ?? 0) > 0);
  hud.update({ ...frame, events: [told(EVENT.healed)] }, 1 / 60);
  assert.equal(edge(), false, 'healed: no red');
  hud.update({ ...frame, events: [{ ...told(EVENT.hit), striker: 2 }] }, 1 / 60);
  assert.equal(edge(), true, 'struck: red');
});

test('every word the display stands still on the screen is a whole step of the face’s 11 px grid, so it draws sharp', () => {
  const hud = new Hud();
  const { matrix, foeAt } = levelView();
  const statuses = { crit: 0, expose: 0, charge: 0, haste: 600, linked: 0, veiled: 300, chargeImmune: 0 };
  hud.update(
    bare({
      matrix,
      own: { ...standing, statuses, action: { kind: 'overreach', left: 20 } },
      foes: [foeAt(2, 'Ahead', 6, 0), { ...foeAt(4, 'Thule', 30, 2), rank: 5, alert: 2 }],
      ammo: 4,
      crosshair: { reticle: 'bow', charge: 0.5, reach: null },
    }),
    1 / 60,
  );
  const sizes = allOf(drawn(hud)).flatMap((node) => (node.text ? [node.text.size ?? 1] : []));
  assert.ok(sizes.length > 6, 'the display’s words were read');
  assert.deepEqual(
    sizes.filter((size) => !Number.isInteger(size)),
    [],
  );
});

test('a resize across the display’s steps lays its corners again each way, and the narrow view stacks them', () => {
  const hud = new Hud();
  const statuses = { crit: 0, expose: 0, charge: 0, haste: 600, linked: 0, veiled: 0, chargeImmune: 0 };
  const frame = (width: number, height: number): HudFrame => ({
    own: standing,
    foes: [],
    where: () => null,
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    width,
    height,
    events: [],
    player: 1,
    firstPerson: false,
    pressed: false,
    lost: null,
    groundAt: null,
  });
  const laid = (width: number, height: number) => {
    hud.update({ ...frame(width, height), own: { ...standing, statuses } }, 1 / 60);
    const root = drawn(hud, width, height);
    const vitals = allOf(root).find((node) => node.id === 'fight-vitals');
    const column = allOf(root).find((node) => node.direction === 'column' && node.alignX === 'center');
    return [vitals?.children?.[0] && (vitals.children[0] as Node).width, column?.float?.y];
  };
  assert.deepEqual(laid(1280, 720), [333, COMPASS.top]);
  assert.deepEqual(laid(1920, 1080), [499, COMPASS.top]);
  assert.deepEqual(laid(2560, 1440), [666, COMPASS.top * 2], 'doubled past 1440p, the compass’s column too');
  assert.deepEqual(
    laid(692, 720),
    [346, vitalsDepth(false)],
    'the Test Ground’s view between its panels: the column under them',
  );
  assert.deepEqual(laid(1280, 720), [333, COMPASS.top], 'and back');
});

test('the crosshair is drawn at the view’s middle, red while it rests on a foe’s body, and gone with none', () => {
  const { matrix, foeAt, placeAt } = levelView();
  const pistolet = { reticle: 'pistolet', charge: null, reach: null } as const;
  const reticleKey = (foes: readonly MarkedFoe[], crosshair: HudFrame['crosshair']) => {
    const hud = new Hud();
    hud.update(bare({ own: { ...standing, ...placeAt(0, 0) }, foes, matrix, crosshair }), 1 / 60);
    return allOf(drawn(hud)).find((node) => node.picture?.key.startsWith('reticle'))?.picture?.key ?? null;
  };
  assert.match(reticleKey([foeAt(2, 'Ahead', 8, 0)], pistolet) ?? '', /^reticle pistolet foe/);
  assert.match(reticleKey([foeAt(2, 'Aside', 8, 4)], pistolet) ?? '', /^reticle pistolet plain/);
  assert.equal(reticleKey([], null), null);
});

test('in a short, narrow view (844 by 390) a running banner stands clear of the crosshair at the middle', () => {
  const [width, height] = [844, 390];
  const banner = {
    tone: 'heroic' as const,
    kicker: 'Heroic public event',
    title: 'The Fissure',
    place: 'Saltgrass Downs',
    clock: '4:12',
    objective: 'Store under attack · Carry shards to the fissure to seal it',
    bar: { share: 0.25, label: '3 / 12 shards' },
    heroic: { text: 'Break the growth', clock: '0:10', met: false },
    bonus: { text: 'Bonus: seal it before 4:00', state: 'holds' as const },
  };
  const matrix = viewProjection(
    { targetX: 0, targetY: 0, targetZ: 1.7, yaw: 0, pitch: 0, distance: 0.5 },
    width / height,
  );
  const hud = new Hud();
  const frame = bare({ width, height, matrix, public: { banner, beat: null, places: [], stores: [] } });
  hud.update(frame, 1);
  hud.update(frame, 1);
  const laid = laidOf(drawn(hud, width, height), width, height);
  const band = laid.find((each) => each.node.picture?.key === 'public banner band')?.box;
  assert.ok(band, 'the banner is laid');
  assert.ok(
    band.y + band.height < height / 2 - 8,
    `its foot at ${band.y + band.height}, the crosshair at ${height / 2}`,
  );
  const said = laid.flatMap((each) => (each.node.text ? [each.node.text.words] : []));
  for (const words of ['The Fissure', '4:12', 'Break the growth 0:10', '3 / 12 shards'])
    assert.ok(said.includes(words), words);
  assert.ok(!said.includes('Bonus: seal it before 4:00'), 'no bonus line in a short view');
  const ended = { ...banner, tone: 'failed' as const, kicker: 'Event failed', heroic: null, bar: null };
  const over = new Hud();
  over.update({ ...frame, public: { banner: ended, beat: null, places: [], stores: [] } }, 1);
  const overSaid = laidOf(drawn(over, width, height), width, height).flatMap((each) =>
    each.node.text ? [each.node.text.words] : [],
  );
  assert.ok(overSaid.includes('EVENT FAILED'), 'the result in words, not by colour alone');
});

test('a parry ring stands round the head of the foe swinging at the player, kept on the screen where the head is not', () => {
  const { matrix, foeAt, downAt, placeAt } = levelView();
  const swing = {
    kind: 'attack',
    stroke: 1,
    elapsed: 6,
    strike: 24,
    end: 60,
    swing: 'plain',
    leftHand: false,
  } as const;
  const swinging = (ahead: number, z = 0) => {
    const foe = foeAt(2, 'Runner', ahead, 0);
    return { ...foe, view: { ...foe.view, z, target: 1, action: swing } };
  };
  const ringOf = (foe: ReturnType<typeof swinging>) => {
    const hud = new Hud();
    hud.update(bare({ matrix, foes: [foe] }), 1 / 60);
    return allOf(drawn(hud)).find((node) => node.picture?.key.startsWith('parry'));
  };
  const seen = ringOf(swinging(6));
  const head = placeAt(6, 0);
  assert.ok(Math.abs((seen?.float?.y ?? NaN) - downAt([head.x, head.y, 1.6])) < 1, 'round its head, 6 m off');
  assert.match(seen?.picture?.key ?? '', /^parry ring 74 57$/, 'three quarters to come; its window, half its wind-up');
  // A foe on a ledge, a metre and a half off: its head far over the top of the view, its ring at the top edge.
  const over = ringOf(swinging(1.5, 1.5));
  assert.equal(over?.float?.y, 51, 'its widest kept inside the top edge');
});

test('a parry ring for a head off the screen stands at the edge the way it lies, behind the eye too, never in a corner', () => {
  const { matrix, foeAt, downAt, placeAt } = levelView();
  const swing = {
    kind: 'attack',
    stroke: 1,
    elapsed: 6,
    strike: 24,
    end: 60,
    swing: 'plain',
    leftHand: false,
  } as const;
  const ringAt = (ahead: number, aside: number, firstPerson = false) => {
    const foe = foeAt(2, 'Runner', ahead, aside);
    const hud = new Hud();
    hud.update(
      bare({ matrix, firstPerson, foes: [{ ...foe, view: { ...foe.view, target: 1, action: swing } }] }),
      1 / 60,
    );
    const ring = allOf(drawn(hud)).find((node) => node.picture?.key.startsWith('parry'));
    return [ring?.float?.x ?? NaN, ring?.float?.y ?? NaN] as const;
  };
  const [behindX, behindY] = ringAt(-3, 0);
  assert.ok(
    Math.abs(behindX - 640) < 1 && Math.abs(behindY - 669) < 1,
    `straight behind, at the foot: ${behindX}, ${behindY}`,
  );
  const [besideX, besideY] = ringAt(0.05, 3);
  assert.ok(besideX <= 52 || besideX >= 1228, `nearly beside, at a side edge: ${besideX}`);
  assert.ok(besideY > 200 && besideY < 520, `level with the eye, not in a corner: ${besideY}`);
  // In first person a foe 0.7 m off is drawn 1.5 m off along the same line, and its ring is round the head drawn.
  const near = placeAt(0.7, 0);
  const drawnHead = placeAt(1.5, 0);
  const [, nearY] = ringAt(0.7, 0, true);
  assert.ok(Math.abs(nearY - downAt([drawnHead.x, drawnHead.y, 1.6])) < 1, `round the drawn head: ${nearY}`);
  assert.ok(Math.abs(nearY - downAt([near.x, near.y, 1.6])) > 20, 'not round the body nearer the eye');
});

test('a room left, its foes are forgotten: the next room’s foe of the same number shows no plate of the last', () => {
  const { matrix, foeAt } = levelView();
  const hud = new Hud();
  const hit = { tick: 0n, kind: EVENT.hit, how: 0, striker: 1, defender: 5, amount: 4, stroke: 0 };
  // Far aside, out of the cone: only the target plate would show it.
  const old = foeAt(5, 'Brigand', 10, 10 * Math.tan(Math.PI / 3));
  hud.update(bare({ matrix, foes: [old], events: [hit] }), 1 / 60);
  assert.ok(wordsIn(drawn(hud)).includes('Brigand'), 'struck, it is the target');
  hud.forget();
  hud.update(bare({ matrix, foes: [{ ...old, name: 'Wolf' }] }), 1 / 60);
  assert.ok(!wordsIn(drawn(hud)).includes('Wolf'), 'the new room’s foe 5 is no target');
});

test("the Arts' and the loadouts' keycaps are the keys the game answers each frame, not those it binds at first", () => {
  const pictures = () => ({ anima: '<svg></svg>', animaOutline: '', tenets: ['', ''] as const, diamond: '', ring: '' });
  let keys: HudKeys = { arts: ['R', 'E', 'G'], loadouts: ['1', '2'] };
  const hud = new Hud(pictures, null, () => [], { caps: () => keys, face: () => null });
  const labels = () =>
    allOf(drawn(hud))
      .flatMap((node) => node.label ?? [])
      .join('|');
  hud.update(bare({ abilities: { art: 1, animaShare: 1, tenets: [1, 1] } }), 1 / 60);
  assert.ok(labels().includes('Quicken (E), ready'), labels());
  keys = { arts: ['pad:LB+RB', 'pad:LB', 'pad:RB'], loadouts: ['pad:Left', 'pad:Right'] };
  // A sword in hand, a crossbow in the other loadout, its row naming the key that draws it.
  const worn = (kind: string, slot: number) => ({ kind: KINDS.indexOf(kind as never), at: WORN + slot, rarity: 0 });
  const items = [worn('sword', 0), worn('crossbow', 1)];
  const arms = {
    gear: { items, ammo: 18, ammoMost: 24 } as unknown as GearState,
    loadout: 0,
    drawn: true,
    dress: null,
  };
  hud.update(bare({ abilities: { art: 1, animaShare: 1, tenets: [1, 1] }, arms }), 1 / 60);
  assert.ok(labels().includes('Quicken (LB), ready'), 'the pad played last');
  assert.ok(labels().includes('Press Right to draw'), labels());
});
