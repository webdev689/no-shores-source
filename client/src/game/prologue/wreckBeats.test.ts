import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { rosterOf } from '../../rules/roster.ts';
import { figureOf } from '../../player/dressing.ts';
import type { Actor } from './actors.ts';
import { armouredDress, FIRST_LOOK, plainDressOf, unarmed } from './look.ts';
import { onScreen, type Shot } from '../camera.ts';
import type { Beat } from './beat.ts';
import { Deep } from './deep.ts';
import { YOU_ID } from './helm.ts';
import type { Nameplate } from './nameplate.ts';
import { Overboard } from './overboard.ts';
import { headOnView } from './stage.ts';
import { Wake } from './wake.ts';
import { courseOf, topAt } from './wreckLayout.ts';
import type { WreckRun } from './wreckRun.ts';
import { WreckFight } from './wreckFight.ts';
import type { WreckScenery } from './wreckScenery.ts';
import { FOOT_VIEW, layout, recorded, scenery, SIZE, tick } from './wreckForTests.ts';

test('a wreck whose run fails to open throws from its next frame, so the story goes on past it', async () => {
  const { story } = recorded();
  const failed = Promise.reject(new Error('the room did not open'));
  const fight = new WreckFight(story, layout, scenery, failed, {} as Nameplate);
  await failed.catch(() => undefined);
  assert.throws(() => fight.frame(tick(0.016)), /the room did not open/);
});

test("leaving the wreck hands the HUD back clean: no death, hints, prompt or fight's display, the bars down", () => {
  const { story, calls } = recorded();
  const fight = new WreckFight(story, layout, scenery, new Promise(() => undefined), {
    hide: () => undefined,
  } as unknown as Nameplate);
  calls.length = 0;
  fight.leave();
  for (const done of ['stage.parts.hud.reach', 'stage.parts.hud.strip', 'stage.parts.footView.hide()'])
    assert.ok(
      calls.some((call) => call.startsWith(done)),
      done,
    );
  assert.ok(calls.includes('stage.parts.hud.tasks.show()') && calls.includes('stage.parts.screen.bars(false)'));
});

test('a wreck run that opens after its beat was left is let go at once, its edges and heights not left set', async () => {
  const { story } = recorded();
  let opened: (run: WreckRun) => void = () => undefined;
  const fight = new WreckFight(story, layout, scenery, new Promise((resolve) => (opened = resolve)), {
    hide: () => undefined,
  } as unknown as Nameplate);
  fight.leave();
  let left = 0;
  opened({ leave: () => left++ } as unknown as WreckRun);
  await Promise.resolve();
  assert.equal(left, 1);
  assert.equal(fight.playing, false);
});

test('the throw overboard begins black, as the fight faded out, and leaves its fading in to the director', () => {
  const { story, calls } = recorded();
  const beat = new Overboard(story, layout, scenery);
  assert.ok(beat.fromBlack);
  assert.ok(calls.includes('stage.parts.screen.fade(1, 0)'));
  const shown = beat.frame(tick(0.4));
  assert.ok(!calls.some((call) => call.startsWith('stage.parts.screen.fade(0')), 'no fade in of its own');
  assert.ok(shown.drawers?.includes(scenery.drawer), 'the wreck is drawn');
});

test('the throw overboard cut short leaves the screen black at once, so the deep fades in from black', () => {
  const { story, calls } = recorded();
  const beat = new Overboard(story, layout, scenery);
  beat.frame(tick(2));
  beat.skip();
  const fades = calls.filter((call) => call.startsWith('stage.parts.screen.fade'));
  assert.equal(fades.at(-1), 'stage.parts.screen.fade(1, 0)', fades.join(' '));
});

test('Thule and his crew crow turned toward the camera from the rail: none shows it his back', async () => {
  const compiled = new WebAssembly.Module(
    await readFile(new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)),
  );
  const { story } = recorded(FOOT_VIEW, { 'stage.parts.roster': rosterOf(compiled) }, armouredDress(FIRST_LOOK));
  const beat = new Overboard(story, layout, scenery);
  for (const second of [0.5, 3, 6]) {
    const shown = beat.frame(tick(second));
    const crowing = (shown.actors ?? []).filter((actor) => actor.id !== YOU_ID);
    assert.ok(crowing.length > 0);
    for (const actor of crowing) {
      const toEye = Math.atan2(shown.shot.eye[0] - actor.x, -(shown.shot.eye[1] - actor.y));
      assert.ok(
        Math.cos(actor.facing - toEye) > 0.3,
        `${actor.id} faces ${actor.facing.toFixed(2)}, the eye ${toEye.toFixed(2)}`,
      );
    }
  }
});

test('the deep shows the wreck above and the Brig with its own hands, and speaks on its own clock', () => {
  const { story, calls } = recorded();
  const beat = new Deep(story, layout, scenery);
  assert.ok(
    calls.some((call) => call.startsWith('stage.parts.flames.light(')),
    'the fires burn above',
  );
  const shown = beat.frame(tick(1));
  assert.ok(shown.drawers?.includes(scenery.drawer));
  assert.deepEqual(
    shown.actors?.filter((actor) => actor.id !== YOU_ID).map((actor) => actor.dress.body),
    ['male', 'male', 'male', 'male', 'female'],
  );
  beat.frame(tick(16));
  assert.ok(!calls.includes('stage.play(deep, true)'), 'the voice waits for the flash to fade');
  beat.frame(tick(1.2));
  assert.ok(calls.includes('stage.play(deep, true)'));
});

test('the throw overboard and the wake cut short say and sound nothing more', () => {
  const { story, calls } = recorded();
  const overboard = new Overboard(story, layout, scenery);
  overboard.frame(tick(0.2));
  calls.length = 0;
  overboard.skip();
  overboard.frame(tick(0.1));
  assert.ok(!calls.some((call) => call.startsWith('stage.play') || call.includes('splash')), calls.join(' '));
  const wake = new Wake(story, layout, scenery, new Promise(() => undefined));
  calls.length = 0;
  wake.skip();
  assert.ok(!calls.some((call) => call.includes('thud')), calls.join(' '));
});

test('the sea takes what the player wore: in the deep they sink in plain clothes, unarmed', () => {
  const { story } = recorded({}, { look: FIRST_LOOK }, armouredDress(FIRST_LOOK));
  const beat = new Deep(story, layout, scenery);
  const dresses = [];
  for (let since = 0; since < 8; since += 0.5) {
    const you = beat.frame(tick(0.5)).actors?.find((actor) => actor.id === YOU_ID);
    if (you) dresses.push(you.dress);
  }
  assert.ok(dresses.length > 0, 'the player is seen sinking');
  for (const dress of dresses) assert.deepEqual(dress, unarmed(plainDressOf(FIRST_LOOK)));
});

test('the deep cut short says nothing more and flashes no more', () => {
  const { story, calls } = recorded();
  const beat = new Deep(story, layout, scenery);
  beat.frame(tick(17.05));
  calls.length = 0;
  beat.skip();
  beat.frame(tick(0.1));
  assert.ok(beat.done);
  assert.ok(!calls.some((call) => call.startsWith('stage.play') || call.includes('flash')));
});

test('the deep left while its heart beats stops it, however it was left', () => {
  const { story, calls } = recorded();
  const beat = new Deep(story, layout, scenery);
  beat.frame(tick(0.5));
  calls.length = 0;
  beat.leave();
  assert.ok(calls.includes('stage.parts.ambience.heartbeat(false)'), 'the shore hears no heart');
});

test("the wake eases out of the eyes to over the player's shoulder, their hands empty, and ends on the shot play begins from", async () => {
  const { story } = recorded();
  // Over the shoulder, as the run's own camera takes the player standing where they woke.
  const [x, y] = layout.wake.at;
  const { facing } = layout.wake;
  const eye: Shot['eye'] = [
    x - Math.sin(facing) * 3.6,
    y + Math.cos(facing) * 3.6,
    topAt(courseOf(layout), x, y) + 2.2,
  ];
  const rest: Shot = { eye, yaw: facing, pitch: 0.2, fov: 0.8, near: 0.1, far: 1000 };
  const run = Promise.resolve({ restingShot: () => rest } as unknown as WreckRun);
  const beat = new Wake(story, layout, scenery, run);
  await run;
  const leaving = beat.frame(tick(14));
  assert.ok(leaving.drawers?.includes(scenery.drawer));
  const you = leaving.actors?.find((actor) => actor.id === YOU_ID);
  assert.ok(you, 'the player stands where they woke');
  assert.ok(!you.dress.outfit.right && !you.dress.outfit.left, 'without their sword and shield');
  // Never faster than an easy step back over the shoulder.
  let was = leaving.shot.eye;
  for (let since = 14; since < 15.4; since += 0.05) {
    const eye = beat.frame(tick(0.05)).shot.eye;
    const speed = Math.hypot(...eye.map((value, axis) => value - (was[axis] ?? 0))) / 0.05;
    assert.ok(speed < 6, `${speed.toFixed(1)} m/s at ${since.toFixed(2)} s`);
    was = eye;
  }
  assert.ok(!beat.done, 'still the wake 15.4 s in');
  const handed = beat.frame(tick(0.2));
  assert.ok(beat.done, 'control comes 15.5 s in');
  rest.eye.forEach((value, axis) => assert.ok(Math.abs((handed.shot.eye[axis] ?? 0) - value) < 1e-6));
  assert.ok(Math.abs(handed.shot.yaw - rest.yaw) < 1e-6 && Math.abs(handed.shot.pitch - rest.pitch) < 1e-6);
});

test("the wake takes the run's shot as it leaves the eyes, and draws the player only once a metre out of them", async () => {
  const { story } = recorded();
  const [x, y] = layout.wake.at;
  const deck = topAt(courseOf(layout), x, y);
  // The run's shot before the wreck's mesh has come (in at the head), and after (back over the shoulder).
  let rest: Shot = { eye: [x, y + 0.5, deck + 1.9], yaw: 0, pitch: 0.2, fov: 0.8, near: 0.1, far: 1000 };
  const run = Promise.resolve({ restingShot: () => rest } as unknown as WreckRun);
  const beat = new Wake(story, layout, scenery, run);
  await run;
  beat.frame(tick(12.9));
  rest = { ...rest, eye: [x, y + 3.6, deck + 2.2] };
  const first = beat.frame(tick(0.15));
  assert.ok(!first.actors?.some((actor) => actor.id === YOU_ID), 'not drawn while the camera is still at the eyes');
  let shown = first;
  for (let step = 0; step < 60 && !beat.done; step++) shown = beat.frame(tick(0.05));
  while (!beat.done) shown = beat.frame(tick(0.05));
  rest.eye.forEach((value, axis) => assert.ok(Math.abs((shown.shot.eye[axis] ?? 0) - value) < 1e-6, 'the later shot'));
  const drawn = shown.actors?.some((actor) => actor.id === YOU_ID);
  assert.ok(drawn, 'the player drawn once the camera stands a metre out of the eyes');
});

test('a run that opens once the camera has left the eyes does not swap the shot it eases to part way', async () => {
  const { story } = recorded();
  const [x, y] = layout.wake.at;
  const { facing } = layout.wake;
  const eye: Shot['eye'] = [
    x - Math.sin(facing) * 3.6,
    y + Math.cos(facing) * 3.6,
    topAt(courseOf(layout), x, y) + 2.2,
  ];
  const rest: Shot = { eye, yaw: facing, pitch: 0.2, fov: 0.8, near: 0.1, far: 1000 };
  let open: (run: WreckRun) => void = () => undefined;
  const run = new Promise<WreckRun>((done) => (open = done));
  const beat = new Wake(story, layout, scenery, run);
  beat.frame(tick(14));
  let was = beat.frame(tick(1 / 60)).shot.eye;
  open({ restingShot: () => rest } as unknown as WreckRun);
  await run;
  while (!beat.done) {
    const eye = beat.frame(tick(1 / 60)).shot.eye;
    const speed = Math.hypot(...eye.map((value, axis) => value - (was[axis] ?? 0))) * 60;
    assert.ok(speed < 6, `${speed.toFixed(1)} m/s`);
    was = eye;
  }
  rest.eye.forEach((value, axis) => assert.ok(Math.abs((was[axis] ?? 0) - value) < 1e-6, "ends on the run's shot"));
});

test("until the wreck is drawn the fight holds the picture; drawn, the wake works out the run's camera at once", async () => {
  const { story } = recorded(FOOT_VIEW);
  const drawing = { drawer: scenery.drawer, coming: true };
  let worked = 0;
  const run = Object.assign(stillRun({ dead: false }, false), {
    restingShot: (): Shot => {
      worked++;
      return { eye: [0, 0, 5], yaw: 0, pitch: 0.2, fov: 0.8, near: 0.1, far: 1000 };
    },
  });
  const opened = Promise.resolve(run);
  const wake = new Wake(story, layout, drawing as unknown as WreckScenery, opened);
  const fight = new WreckFight(story, layout, drawing as unknown as WreckScenery, opened, {} as Nameplate);
  await opened;
  wake.frame(tick(2));
  assert.equal(fight.frame(tick(0.016)), null, 'the fight holds the picture');
  assert.equal(worked, 0, "the run's camera is not worked out before the wreck is drawn");
  drawing.coming = false;
  wake.frame(tick(0.05));
  assert.equal(worked, 1, 'worked out at once, long before the camera leaves the eyes');
  assert.ok(fight.frame(tick(0.016))?.drawers?.includes(scenery.drawer), 'the fight plays once it is drawn');
});

test('the wake cut short leaves the eyes open, though the director frames it once more', () => {
  const { story, calls } = recorded();
  const beat = new Wake(story, layout, scenery, new Promise(() => undefined));
  beat.frame(tick(2));
  beat.skip();
  beat.frame(tick(0.016));
  const dark = calls.filter((call) => call.startsWith('stage.parts.screen.darken')).at(-1);
  assert.match(dark ?? '', /^stage\.parts\.screen\.darken\(0\)/, `${dark}`);
});

test('the wake cut short or left at any moment leaves the view sharp, though the director frames it once more', () => {
  const lastBlur = (calls: string[]) => calls.filter((call) => call.startsWith('stage.parts.screen.blur(')).at(-1);
  for (const into of [0, 0.4, 2, 6, 12]) {
    const skipped = recorded();
    const beat = new Wake(skipped.story, layout, scenery, new Promise(() => undefined));
    if (into > 0) beat.frame(tick(into));
    beat.skip();
    beat.frame(tick(0.016));
    assert.equal(lastBlur(skipped.calls), 'stage.parts.screen.blur(0)', `skipped ${into} s in`);
    const left = recorded();
    const leaving = new Wake(left.story, layout, scenery, new Promise(() => undefined));
    if (into > 0) leaving.frame(tick(into));
    leaving.leave();
    assert.equal(lastBlur(left.calls), 'stage.parts.screen.blur(0)', `left ${into} s in`);
  }
});

test('the beats from black wait for the wreck, and the wake and the shore fade in by their own darkening', () => {
  const coming = { ...scenery, coming: true } as unknown as WreckScenery;
  const { story } = recorded();
  const wake = new Wake(story, layout, coming, new Promise(() => undefined));
  const overboard = new Overboard(story, layout, coming);
  const deep = new Deep(story, layout, coming);
  for (const beat of [wake, overboard, deep]) {
    assert.ok(beat.fromBlack, beat.name);
    assert.equal(beat.ready, false, `${beat.name} waits while the wreck comes`);
  }
  assert.ok(new Wake(story, layout, scenery, new Promise(() => undefined)).ready, 'ready once it is drawn');
  assert.equal(wake.fadeInS, 0, 'the wake darkens itself awake');
  assert.equal((overboard as Beat).fadeInS, undefined, 'the throw is faded in as every scene is');
});

test('the heart begins with the wake’s first frame, so its sound and the pulse keep time; the deep lays no fade in', () => {
  const { story, calls } = recorded();
  const wake = new Wake(story, layout, scenery, new Promise(() => undefined));
  assert.ok(!calls.includes('stage.parts.ambience.heartbeat(true)'), 'not while the director holds the black');
  wake.frame(tick(0.016));
  assert.ok(calls.includes('stage.parts.ambience.heartbeat(true)'));
  const deep = recorded();
  const beat = new Deep(deep.story, layout, scenery);
  assert.ok(!deep.calls.includes('stage.parts.ambience.heartbeat(true)'));
  beat.frame(tick(0.5));
  assert.ok(deep.calls.includes('stage.parts.ambience.heartbeat(true)'));
  assert.ok(!deep.calls.some((call) => call.startsWith('stage.parts.screen.fade(0')), 'the director fades it in');
});

/** A run of the wreck that plays nothing: the player alive or dead as `own` says (their health as it holds), in the
 *  arena or not, Thule's health and head as `boss` holds them. */
function stillRun(
  own: { dead: boolean; health?: number },
  arena: boolean,
  boss: { health: number; head: readonly [number, number, number] } | null = null,
): WreckRun {
  const shot = { eye: [0, 0, 5], yaw: 0, pitch: 0, fov: 1, near: 0.1, far: 500 } as unknown as Shot;
  return {
    frame: () => ({
      fight: {
        own: { action: { kind: own.dead ? 'dead' : 'idle' }, health: own.dead ? 0 : (own.health ?? 100), x: 0, y: 0 },
        player: 1,
        events: [],
        foes: [],
      },
      shot,
      hints: { title: '', hints: [] },
      standing: { kind: 'inside' },
      figures: [],
    }),
    arena,
    get boss() {
      return boss && { health: boss.health, healthMax: 1000 };
    },
    outcome: null,
    heads: () => new Map(boss ? [['thule', boss.head]] : []),
    beginBoss: () => undefined,
    fight: { player: 1, parryOpen: true },
    gear: null,
    storyArms: { arms: 'worn', bow: 'none', dropBow: () => undefined },
    boarder: 'none',
    boarderView: null,
    boarderPlace: null,
    standBoarder: () => undefined,
    holdWaves: () => undefined,
  } as unknown as WreckRun;
}

test('a death on the way through the wreck says the player will rise at the last checkpoint', async () => {
  const { story, calls } = recorded(FOOT_VIEW);
  const own = { dead: false };
  const fight = new WreckFight(story, layout, scenery, Promise.resolve(stillRun(own, false)), {} as Nameplate);
  await Promise.resolve();
  fight.frame(tick(0.016));
  own.dead = true;
  fight.frame(tick(0.016));
  assert.ok(calls.includes('stage.parts.hud.toast(You will rise at the last checkpoint.)'), 'said while they lie dead');
});

test('the player felled by Thule is never told they will rise: the boss fight ends there', async () => {
  const { story, calls } = recorded(FOOT_VIEW);
  const own = { dead: false };
  const plate = { show: () => undefined, hide: () => undefined } as unknown as Nameplate;
  const fight = new WreckFight(story, layout, scenery, Promise.resolve(stillRun(own, true)), plate);
  await Promise.resolve();
  // The push in to Thule plays out, then the boss fight is fought.
  for (let since = 0; since < 7; since += 0.05) fight.frame(tick(0.05));
  own.dead = true;
  fight.frame(tick(0.016));
  assert.ok(!calls.some((call) => call.includes('Fallen')), 'no death words over the fade');
});

test("Thule's coming is watched from its own eye: the figures are placed for it, not the player's", async () => {
  const { story } = recorded(FOOT_VIEW);
  const run = stillRun({ dead: false }, true);
  const asked: { eye: readonly number[] }[] = [];
  const played = run.frame.bind(run);
  run.frame = (controls, elapsed, clock, ask) => {
    if (ask.cutscene) asked.push(ask.cutscene);
    return played(controls, elapsed, clock, ask);
  };
  const fight = new WreckFight(story, layout, scenery, Promise.resolve(run), {
    show: () => undefined,
    hide: () => undefined,
  } as unknown as Nameplate);
  await Promise.resolve();
  for (let since = 0; since < 1; since += 0.05) fight.frame(tick(0.05));
  assert.ok(asked.length > 0, 'the push in holds the camera');
  assert.notDeepEqual(asked.at(-1)?.eye, [0, 0, 5], 'from its eye, pushed in toward him');
});

test('the push in to Thule goes 2.6 m in at most, so on the long quarterdeck it never passes the player', async () => {
  const { story } = recorded(FOOT_VIEW);
  const plate = { show: () => undefined, hide: () => undefined } as unknown as Nameplate;
  const fight = new WreckFight(story, layout, scenery, Promise.resolve(stillRun({ dead: false }, true)), plate);
  await Promise.resolve();
  const [x, y] = layout.arena.thule;
  const head = [x, y, topAt(courseOf(layout), x, y) + 1.9];
  const away = (eye: readonly number[]) => Math.hypot(...head.map((part, axis) => part - (eye[axis] ?? 0)));
  const eyeAt = (seconds: number) => fight.frame(tick(seconds))?.shot.eye ?? [Infinity, Infinity, Infinity];
  const start = away(eyeAt(0.016));
  let nearest = start;
  for (let since = 0; since < 2; since += 0.05) nearest = Math.min(nearest, away(eyeAt(0.05)));
  assert.ok(nearest < start - 2, `it pushed in: from ${start} m to ${nearest} m`);
  assert.ok(nearest > start - 2.6 - 0.05, `no farther than 2.6 m: from ${start} m to ${nearest} m`);
});

test('the crew celebrating the throw overboard stand clear of what stands on its deck', () => {
  const { story } = recorded();
  const course = courseOf(layout);
  const heads = new Overboard(story, layout, scenery).frame(tick(0.05)).heads ?? new Map();
  assert.equal(heads.size, 4, 'Thule and three of his crew');
  for (const [name, [x, y]] of heads) {
    const top = topAt(course, x, y);
    for (let bearing = 0; bearing < 2 * Math.PI; bearing += Math.PI / 16)
      assert.ok(topAt(course, x + Math.sin(bearing) * 0.34, y - Math.cos(bearing) * 0.34) <= top + 0.5, name);
  }
});

test('the throw overboard holds every crier on the view as they cry, on a wide screen and a tall one', () => {
  const speakers = ['thule', 'celebrant-1'];
  for (const size of [SIZE, { width: 540, height: 960 }]) {
    const { story } = recorded();
    const beat = new Overboard(story, layout, scenery);
    for (let since = 0; since < 4; since += 0.05) {
      const frame = beat.frame({ ...tick(0.05), size, viewport: size });
      for (const name of speakers) {
        const head = frame.heads?.get(name);
        assert.ok(head, `${name} has a head`);
        assert.ok(
          headOnView(onScreen(frame.shot, size, head), size),
          `${name} off a ${size.width} by ${size.height} view`,
        );
      }
    }
  }
});

/** Where Thule's head is before the eye of `stillRun`'s shot, and behind it. */
const BEFORE: readonly [number, number, number] = [0, -10, 5];
const BEHIND: readonly [number, number, number] = [0, 10, 5];

test('Thule tells a player who stands still to kneel once, and again only once they have struck him', async () => {
  const { story, calls } = recorded(FOOT_VIEW);
  const own = { dead: false, health: 1000 };
  const boss = { health: 1000, head: BEFORE };
  const fight = new WreckFight(story, layout, scenery, Promise.resolve(stillRun(own, false, boss)), {} as Nameplate);
  await Promise.resolve();
  const kneels = () => calls.filter((call) => call === 'stage.play(bossStrikes, true)').length;
  for (let second = 0; second < 40; second++) {
    own.health -= 5;
    fight.frame(tick(1));
  }
  assert.equal(kneels(), 1, 'his blows land for 40 s, and he says it once');
  boss.health -= 50;
  fight.frame(tick(1));
  assert.ok(calls.includes('stage.play(bossStruck, true)'), 'struck, he answers it');
  own.health -= 5;
  fight.frame(tick(1));
  assert.equal(kneels(), 2, 'and once struck, he says it again');
});

test("Thule's cry with his head off the view is not counted: he cries once it is on it", async () => {
  const { story, calls } = recorded(FOOT_VIEW);
  const own = { dead: false, health: 1000 };
  const boss = { health: 1000, head: BEHIND };
  const fight = new WreckFight(story, layout, scenery, Promise.resolve(stillRun(own, false, boss)), {} as Nameplate);
  await Promise.resolve();
  for (let frame = 0; frame < 3; frame++) {
    own.health -= 5;
    fight.frame(tick(1));
  }
  assert.ok(!calls.includes('stage.play(bossStrikes, true)'), 'unheard behind the eye');
  boss.head = BEFORE;
  own.health -= 5;
  fight.frame(tick(1));
  assert.ok(calls.includes('stage.play(bossStrikes, true)'), 'heard at once, no gap spent');
});

/** The layers the forge draws in each move, by body, from its keys (`<layer>_<move>`). */
function drawnIn(body: string, moves: ReadonlySet<string>): Record<string, string[]> {
  const keys = JSON.parse(
    readFileSync(new URL(`../../../../tools/forge/tools/sprite-forge/keys/keys-${body}.json`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
  const drawn: Record<string, string[]> = {};
  for (const key of Object.keys(keys))
    for (const move of moves) if (key.endsWith(`_${move}`)) (drawn[key.slice(0, -move.length - 1)] ??= []).push(move);
  return drawn;
}

test('every figure the wake, the throw overboard and the deep stand is drawn clothed in the move it makes', async () => {
  const compiled = new WebAssembly.Module(
    await readFile(new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)),
  );
  const roster = rosterOf(compiled);
  const parts = { 'stage.parts.roster': roster, look: FIRST_LOOK };
  const { story } = recorded(FOOT_VIEW, parts, armouredDress(FIRST_LOOK));
  const actors: Actor[] = [];
  const wake = new Wake(story, layout, scenery, new Promise<WreckRun>(() => undefined));
  for (let since = 0; since < 24; since += 0.5) actors.push(...(wake.frame(tick(0.5)).actors ?? []));
  const overboard = new Overboard(story, layout, scenery);
  for (let since = 0; since < 6; since += 0.25) actors.push(...(overboard.frame(tick(0.25)).actors ?? []));
  const deep = new Deep(story, layout, scenery);
  for (let since = 0; since < 8; since += 0.25) actors.push(...(deep.frame(tick(0.25)).actors ?? []));
  assert.ok(actors.length > 20, `${actors.length} figures`);
  const moves = new Set(actors.map((actor) => actor.anim));
  const drawn: Readonly<Record<string, Record<string, string[]>>> = {
    male: drawnIn('male', moves),
    female: drawnIn('female', moves),
  };
  for (const actor of actors) {
    const layers = drawn[actor.dress.body] ?? {};
    const { gear } = figureOf(actor.dress, layers, actor.anim);
    const { garments, armour } = actor.dress.outfit;
    const clothes = [...garments, ...Object.entries(armour).map(([piece, set]) => `${piece}_${set}`)];
    const worn = gear.filter((layer) => clothes.some((cloth) => layer === cloth || layer.startsWith(`${cloth}_`)));
    assert.ok(worn.length > 0, `figure ${actor.id} wears clothes in "${actor.anim}"`);
    for (const layer of worn)
      assert.ok(layers[layer]?.includes(actor.anim), `figure ${actor.id}'s ${layer} is not drawn in "${actor.anim}"`);
  }
});

test("Thule's cry brings one strike down 400 m beyond him, seen from where the player woke", async () => {
  const { story, calls } = recorded(FOOT_VIEW);
  const nameplate = { show: () => undefined, hide: () => undefined } as unknown as Nameplate;
  const fight = new WreckFight(story, layout, scenery, Promise.resolve(stillRun({ dead: false }, true)), nameplate);
  await Promise.resolve();
  for (let frame = 0; frame < 30; frame++) fight.frame(tick(0.05));
  const struck = calls.filter((call) => call.startsWith('lightning.strike('));
  assert.equal(struck.length, 1, calls.filter((call) => call.startsWith('lightning')).join(' '));
  const [x = 0, y = 0] = (/\(([^)]*)\)/.exec(struck[0] ?? '')?.[1] ?? '').split(', ').map(Number);
  const [thuleX, thuleY] = layout.arena.thule;
  assert.ok(Math.abs(Math.hypot(x - thuleX, y - thuleY) - 400) < 1e-6, `${x}, ${y}`);
});

test("in Thule's coming the fight's display (its bars, compass and keys) is hidden, and shown again after", async () => {
  const { story, calls } = recorded(FOOT_VIEW);
  const nameplate = { show: () => undefined, hide: () => undefined } as unknown as Nameplate;
  const fight = new WreckFight(story, layout, scenery, Promise.resolve(stillRun({ dead: false }, true)), nameplate);
  await Promise.resolve();
  const hidden = () => calls.filter((call) => call === 'stage.parts.footView.hideDisplay()').length;
  fight.frame(tick(0.05));
  fight.frame(tick(0.05));
  assert.ok(hidden() >= 1, 'hidden as he comes');
  assert.ok(calls.includes('stage.parts.hud.strip()'), 'no keys');
  for (let frame = 0; frame < 140; frame++) fight.frame(tick(0.05));
  const after = hidden();
  fight.frame(tick(0.05));
  assert.equal(hidden(), after, 'shown again once the fight is on');
});
