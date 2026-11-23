import assert from 'node:assert/strict';
import { test } from 'node:test';
import { viewProjection } from '../editor/orbit.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import type { Node } from '../ui/node.ts';
import type { Box } from '../ui/quads.ts';
import { EVENT } from './cues.ts';
import { callTop } from './callout.ts';
import { Hud, type HudFrame } from './hud.ts';
import { project, spanOf } from './hudPlace.ts';
import { cameraOf } from './plateSight.ts';
import { allOf, fakeInterface, laidOf, wordsIn } from './nodes.test.ts';
import type { PublicShown } from './publicBanner.ts';

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
/** The Court's banner as the warded Boss's slam is shown, its Fury begun: its fullest. */
const court: PublicShown = {
  banner: {
    tone: 'running',
    kicker: 'Seals broken 3 of 3',
    title: 'The Court',
    place: '',
    clock: '',
    urgent: false,
    objective: 'Get clear of the Boss',
    bar: { share: 1 / 3, label: '1 of 3' },
    heroic: null,
    bonus: { text: 'Fury ×1.2', state: 'warns' },
  },
  beat: null,
  places: [],
  stores: [],
  call: 'Get clear!',
};

/** A Court at `width` by `height`: the Boss 6 m ahead winding up an iron blow (so "Dodge!" is said over its head,
 *  under the banner), a Crossbowman locked on a ledge whose plate would stand in the banner, and the slam's call. */
function courtFrame(width: number, height: number): HudFrame {
  const matrix = viewProjection(
    { targetX: 0, targetY: 0, targetZ: 1.7, yaw: 0, pitch: 0, distance: 0.5 },
    width / height,
  );
  const camera = cameraOf(matrix);
  assert.ok(camera);
  const { eye, forward } = camera;
  const ahead = (metres: number) => ({ x: eye[0] + forward[0] * metres, y: eye[1] + forward[1] * metres });
  const own = { ...standing, ...ahead(0), target: 3 };
  const boss = {
    id: 2,
    name: 'Sister-Assessor Aldith',
    view: { ...standing, ...ahead(6), side: 'foes' as const, action: iron, target: 1 },
    rank: 5,
    faction: 'The Grey Tithe',
    phase: 1,
    alert: 2,
  };
  const archer = {
    id: 3,
    name: 'Crossbowman',
    view: { ...standing, ...ahead(16), z: 5.5, side: 'foes' as const },
    rank: 2,
    faction: '',
    phase: 0,
    alert: 2,
  };
  return {
    own,
    foes: [boss, archer],
    where: (id) => (id === 2 ? [boss.view.x, boss.view.y, 0] : null),
    matrix,
    width,
    height,
    events: [],
    player: 1,
    firstPerson: false,
    pressed: false,
    lost: null,
    groundAt: null,
    public: court,
  };
}

/** `box` grown 11 px each way: a plate this near the top's pieces reads as one of them. */
const grown = (box: Box): Box => ({ x: box.x - 11, y: box.y - 11, width: box.width + 22, height: box.height + 22 });
const meets = (one: Box, two: Box) =>
  one.x < two.x + two.width && two.x < one.x + one.width && one.y < two.y + two.height && two.y < one.y + one.height;

for (const [width, height] of [
  [1600, 900],
  [1280, 720],
  [1024, 600],
  [844, 390],
  [390, 844],
] as const) {
  test(`at ${width} by ${height} the Court's banner, the Boss's bar, the target's plate, "Dodge!" and the call stand clear of each other`, () => {
    const hud = new Hud();
    const ui = fakeInterface(width, height);
    const frame = courtFrame(width, height);
    // The player's blow on the Crossbowman shows its plate as the target's, under the Boss's bar.
    const struck = {
      ...frame,
      events: [{ tick: 0n, kind: EVENT.hit, how: 0, striker: 1, defender: 3, amount: 5, stroke: 0 }],
    };
    // Words and plates keep clear of where the display was last laid, so a few frames settle it.
    for (let step = 0; step < 6; step++) {
      hud.update(step === 0 ? struck : frame, 1 / 60);
      ui.draw(hud.node(ui));
    }
    const laid = laidOf(hud.node(ui), width, height);
    const byId = (id: string) => laid.find((each) => each.node.id === id)?.box;
    const banner = byId('fight-banner');
    console.log(
      'BOX',
      width,
      height,
      JSON.stringify(laid.filter((each) => each.node.id?.startsWith('fight')).map((each) => [each.node.id, each.box])),
    );
    const bar = byId('fight-boss');
    const call = byId('fight-call');
    const dodge = laid.find((each) => wordsIn(each.node)[0] === 'Dodge!' && each.node.float)?.box;
    const target = byId('fight-target');
    // A short view (under 480 px) stands the call in the banner's place while it shows.
    const short = height < 480;
    assert.ok((short ? !banner : banner) && bar && call && dodge && target, 'all are laid');
    const named = { ...(banner ? { banner } : {}), bar, call, dodge, target };
    const names = Object.keys(named) as (keyof typeof named)[];
    for (const one of names) {
      const box = named[one]!;
      assert.ok(
        box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
        `${one} on the display`,
      );
      for (const two of names)
        if (one < two) assert.ok(!meets(box, named[two]!), `${one} ${JSON.stringify(box)} meets ${two}`);
    }
    // As the short banner does, its foot 8 px over the crosshair at the least.
    const crosshair = { x: width / 2 - 24, y: height / 2 - 8, width: 48, height: 16 };
    assert.ok(!meets(call, crosshair), `the call ${JSON.stringify(call)} keeps clear of the crosshair`);
    // No plate over a figure shows through the banner or the Boss's bar, or stands so near either it reads as theirs.
    const top = banner ?? call;
    for (const each of laid.filter((one) => one.node.float?.anchor?.[1] === 1 && one.node.direction === 'row'))
      if (meets(grown(each.box), top) || meets(grown(each.box), bar))
        assert.equal(each.node.opacity, 0, `${wordsIn(each.node).join(' ')} hidden under the banner`);
  });
}

test('a plate over a figure under the banner is hidden, and shows again once it stands clear', () => {
  const [width, height] = [1280, 720];
  const hud = new Hud();
  const ui = fakeInterface(width, height);
  const frame = courtFrame(width, height);
  const plate = (root: Node) =>
    allOf(root).find((node) => node.float?.anchor?.[1] === 1 && wordsIn(node).includes('Crossbowman'));
  for (let step = 0; step < 6; step++) {
    hud.update(frame, 1 / 60);
    ui.draw(hud.node(ui));
  }
  assert.equal(plate(hud.node(ui))?.opacity, 0, 'under the banner');
  const low = {
    ...frame,
    foes: frame.foes.map((foe) => (foe.id === 3 ? { ...foe, view: { ...foe.view, x: foe.view.x + 8, z: 0 } } : foe)),
  };
  for (let step = 0; step < 6; step++) {
    hud.update(low, 1 / 60);
    ui.draw(hud.node(ui));
  }
  assert.notEqual(plate(hud.node(ui))?.opacity, 0, 'on the floor, aside and below it');
});

test('the call stands large in the middle for a moment, then goes; a new call shows afresh', () => {
  const hud = new Hud();
  const frame = courtFrame(1280, 720);
  const callOf = () => allOf(hud.node(fakeInterface())).find((node) => node.id === 'fight-call');
  hud.update(frame, 1 / 60);
  const shown = callOf();
  assert.ok(shown, 'shown as the slam is');
  assert.ok(wordsIn(shown).includes('Get clear!'));
  for (let step = 0; step < 180; step++) hud.update(frame, 1 / 60);
  assert.equal(callOf(), undefined, 'gone after its moment though the slam still shows');
  const light = { ...frame, public: { ...court, call: 'Into the light!' } };
  hud.update(light, 1 / 60);
  assert.ok(wordsIn(callOf()).includes('Into the light!'), 'the Reckoning calls afresh');
  hud.update({ ...frame, public: { ...court, call: null } }, 1 / 60);
  for (let step = 0; step < 180; step++) hud.update(light, 1 / 60);
  assert.equal(callOf(), undefined);
  hud.update({ ...frame, public: { ...court, call: 'Get clear!' } }, 1 / 60);
  for (let step = 0; step < 6; step++) hud.update({ ...frame, public: { ...court, call: null } }, 1 / 60);
  const ending = callOf()?.opacity ?? 0;
  assert.ok(ending > 0 && ending < 1, `its mechanic over, it fades (${ending})`);
  for (let step = 0; step < 24; step++) hud.update({ ...frame, public: { ...court, call: null } }, 1 / 60);
  assert.equal(callOf(), undefined, 'and is gone well before its moment would end');
});

test('the view’s edge is tinted sick green while the foul water harms the player, and fades once they leave it', () => {
  const hud = new Hud();
  const frame = { ...courtFrame(1280, 720), foes: [] };
  const tint = () => allOf(hud.node(fakeInterface())).find((node) => node.id === 'fight-foul')?.opacity ?? 0;
  const wet = (harmed = false) => ({
    ...frame,
    public: { ...court, foul: harmed ? ('harmed' as const) : ('wet' as const) },
  });
  hud.update(wet(), 1 / 60);
  assert.equal(tint(), 0, 'standing in it before it harms: none');
  hud.update(wet(true), 1 / 60);
  for (let step = 0; step < 30; step++) hud.update(wet(), 1 / 60);
  assert.ok(tint() > 0.9, `harmed and still in it: shown (${tint()})`);
  for (let step = 0; step < 50; step++) hud.update(wet(step === 30), 1 / 60);
  assert.ok(tint() > 0.9, 'held between one harm and the next');
  hud.update({ ...frame, public: { ...court, foul: null } }, 1 / 60);
  const leaving = tint();
  assert.ok(leaving > 0 && leaving < 1, `fading as the body leaves it (${leaving})`);
  for (let step = 0; step < 60; step++) hud.update({ ...frame, public: { ...court, foul: null } }, 1 / 60);
  assert.equal(tint(), 0, 'gone');
  hud.update(wet(), 1 / 60);
  for (let step = 0; step < 90; step++) hud.update(wet(), 1 / 60);
  assert.equal(tint(), 0, 'back in it, none until it harms again');
});

test('a plate first shown under the banner is hidden on the frame it first shows', () => {
  const [width, height] = [1280, 720];
  const hud = new Hud();
  const ui = fakeInterface(width, height);
  const frame = courtFrame(width, height);
  const alone = { ...frame, foes: frame.foes.filter((foe) => foe.id !== 3) };
  for (let step = 0; step < 6; step++) {
    hud.update(alone, 1 / 60);
    ui.draw(hud.node(ui));
  }
  hud.update(frame, 1 / 60);
  const plate = allOf(hud.node(ui)).find(
    (node) => node.float?.anchor?.[1] === 1 && wordsIn(node).includes('Crossbowman'),
  );
  assert.ok(plate, 'shown');
  assert.equal(plate.opacity, 0, 'and unseen under the banner');
});

test("another player's plate under the banner is hidden as a foe's is", () => {
  const [width, height] = [1280, 720];
  const hud = new Hud();
  const ui = fakeInterface(width, height);
  const frame = courtFrame(width, height);
  const archer = frame.foes.find((foe) => foe.id === 3)!.view;
  const mariner = (z: number) => ({
    id: 5,
    feet: [archer.x, archer.y, z] as const,
    plate: { player: 5, name: 'Mariner', level: 6, menu: false },
    company: false,
  });
  const plate = () => allOf(hud.node(ui)).find((node) => node.id === 'player-plate-5');
  for (let step = 0; step < 6; step++) {
    hud.update({ ...frame, foes: [], players: [mariner(5.5)] }, 1 / 60);
    ui.draw(hud.node(ui));
  }
  assert.equal(plate()?.opacity, 0, 'under the banner');
  for (let step = 0; step < 6; step++) {
    hud.update({ ...frame, foes: [], players: [mariner(0)] }, 1 / 60);
    ui.draw(hud.node(ui));
  }
  assert.ok(plate(), 'shown');
  assert.notEqual(plate()?.opacity, 0, 'on the floor, below it');
});

test("the call stands above the crosshair, and under it where above it would cover the Boss's figure", () => {
  // A 1280 by 720 view, the column's foot at 247: above stands at 263, under at 388.
  assert.equal(callTop(720, 247, 1, null), 263);
  assert.equal(callTop(720, 247, 1, { top: 250, bottom: 370 }), 388, 'the Boss stands where it would');
  assert.equal(callTop(720, 247, 1, { top: 250, bottom: 500 }), 263, 'covering both as much, it keeps above');
  assert.equal(callTop(720, 247, 1, { top: 290, bottom: 400 }), 388, 'covering the head above, the feet below: below');
  assert.equal(callTop(600, 247, 1, null), 328, 'no room above the crosshair: under it');
});

test('foul water’s edge holds through a late harm, 1.4 s after the last', () => {
  const hud = new Hud();
  const frame = { ...courtFrame(1280, 720), foes: [] };
  const tint = () => allOf(hud.node(fakeInterface())).find((node) => node.id === 'fight-foul')?.opacity ?? 0;
  const wet = (harmed: boolean) => ({
    ...frame,
    public: { ...court, foul: harmed ? ('harmed' as const) : ('wet' as const) },
  });
  hud.update(wet(true), 1 / 60);
  for (let step = 0; step < 84; step++) hud.update(wet(false), 1 / 60);
  assert.ok(tint() > 0.9, `a late harm's gap held (${tint()})`);
});

test("the Boss's figure keeps the call from it as far from the view's middle at twice the zoom as twice the pixels", () => {
  const frame = courtFrame(2560, 1440);
  const boss = frame.foes[0]!.view;
  const camera = cameraOf(frame.matrix);
  assert.ok(camera);
  // Step the Boss aside along the view until it stands 300 px off the middle.
  const aside = (metres: number) => ({
    ...boss,
    x: boss.x - camera.forward[1] * metres,
    y: boss.y + camera.forward[0] * metres,
  });
  const off = (metres: number) =>
    Math.abs((project(frame.matrix, [aside(metres).x, aside(metres).y, 0], 2560, 1440)?.x ?? 0) - 1280);
  let metres = 0;
  while (off(metres) < 300) metres += 0.01;
  assert.equal(spanOf(frame, aside(metres), 1), null, '300 px aside at zoom 1: clear of the call');
  assert.ok(spanOf(frame, aside(metres), 2), '300 px aside at zoom 2: in its way');
});
