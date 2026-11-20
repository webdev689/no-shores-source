import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { InputFrame } from '../../player/input.ts';
import { type FoeType, rosterOf } from '../../rules/roster.ts';
import { figureOf } from '../../player/dressing.ts';
import type { Actor } from './actors.ts';
import { armouredDress, FIRST_LOOK } from './look.ts';
import { onScreen, type Shot } from '../camera.ts';
import { Deep } from './deep.ts';
import { YOU_ID } from './helm.ts';
import type { Nameplate } from './nameplate.ts';
import { Overboard } from './overboard.ts';
import { headOnView } from './stage.ts';
import type { Story } from './story.ts';
import { stagedFights, Wake } from './wake.ts';
import { courseOf, readWreck, topAt } from './wreckLayout.ts';
import type { WreckRun } from './wreckRun.ts';
import { WreckFight } from './wreckFight.ts';
import type { WreckScenery } from './wreckScenery.ts';

const layout = readWreck();
const SIZE = { width: 960, height: 540 };

/** A story whose every part takes any call and writes it down, by its path and what it was handed; a call whose path
 *  `answers` names gives back what it holds there, and a part `values` names is what it holds. Its player wears
 *  `dress`. */
function recorded(
  answers: Readonly<Record<string, unknown>> = {},
  values: Readonly<Record<string, unknown>> = {},
  dress: unknown = { body: 'female' },
): { story: Story; calls: string[] } {
  const calls: string[] = [];
  // The storm's lightning is still unless a test says otherwise.
  const answered: Readonly<Record<string, unknown>> = { 'lightning.step': { flash: 0, bolt: null }, ...answers };
  const part = (path: string): unknown =>
    path in values
      ? values[path]
      : new Proxy(() => undefined, {
          get: (target, key) => (key === 'then' ? undefined : part(`${path}.${String(key)}`)),
          set: () => true,
          apply: (target, self, args: unknown[]) => {
            calls.push(`${path}(${args.filter((arg) => typeof arg !== 'object').join(', ')})`);
            return answered[path];
          },
        });
  const story = new Proxy({ dress } as object, {
    get: (target, key) => (key === 'dress' ? Reflect.get(target, key) : part(String(key))),
  });
  return { story: story as Story, calls };
}

const scenery = { drawer: { drawInto: () => undefined } } as unknown as WreckScenery;
const tick = (seconds: number) => ({
  seconds,
  clock: 0,
  controls: { held: () => false, locked: false } as unknown as InputFrame,
  size: SIZE,
  viewport: SIZE,
});

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
  for (const done of ['stage.parts.hud.reach', 'stage.parts.hud.hints', 'stage.parts.footView.hide()'])
    assert.ok(
      calls.some((call) => call.startsWith(done)),
      done,
    );
  assert.ok(calls.includes('stage.parts.hud.tasks.show()') && calls.includes('stage.parts.screen.bars(false)'));
});

test('the throw overboard begins black, as the fight faded out, and only then fades in', () => {
  const { story, calls } = recorded();
  const beat = new Overboard(story, layout, scenery);
  assert.ok(calls.includes('stage.parts.screen.fade(1, 0)'));
  assert.ok(!calls.includes('stage.parts.screen.fade(0, 0.9)'), 'not yet');
  const shown = beat.frame(tick(0.4));
  assert.ok(calls.includes('stage.parts.screen.fade(0, 0.9)'));
  assert.ok(shown.drawers?.includes(scenery.drawer), 'the wreck is drawn');
});

test('the deep shows the wreck above and the Brig her own hands, and speaks on its own clock', () => {
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

test("the wake's flight draws the wreck and the player, and ends on the shot play begins from", async () => {
  const { story } = recorded();
  const rest: Shot = { eye: [-14, 2, 6], yaw: 1.2, pitch: 0.2, fov: 0.8, near: 0.1, far: 1000 };
  const run = Promise.resolve({ restingShot: () => rest } as unknown as WreckRun);
  const beat = new Wake(story, layout, scenery, run);
  await run;
  const flying = beat.frame(tick(14.5));
  assert.ok(flying.drawers?.includes(scenery.drawer));
  assert.ok(
    flying.actors?.some((actor) => actor.id === YOU_ID),
    'the player stands where they woke',
  );
  const handed = beat.frame(tick(10.5));
  assert.ok(beat.done);
  rest.eye.forEach((value, axis) => assert.ok(Math.abs((handed.shot.eye[axis] ?? 0) - value) < 1e-6));
  assert.ok(Math.abs(handed.shot.yaw - rest.yaw) < 1e-6 && Math.abs(handed.shot.pitch - rest.pitch) < 1e-6);
});

test("the wake's flight down the wreck keeps its eye clear of the masts still standing", () => {
  const { story } = recorded();
  const beat = new Wake(story, layout, scenery, new Promise<WreckRun>(() => undefined));
  const { masts } = layout;
  assert.equal(masts.length, 3, "the Brig's fore, and the Frigate's fore and main");
  beat.frame(tick(15));
  for (let since = 15; since < 23; since += 0.05) {
    const [x, y] = beat.frame(tick(0.05)).shot.eye;
    for (const [mastX = 0, mastY = 0] of masts)
      assert.ok(Math.hypot(x - mastX, y - mastY) > 1, `the eye at ${x.toFixed(1)}, ${y.toFixed(1)} is in a mast`);
  }
});

test('the wake cut short leaves the eyes open, though the director frames it once more', () => {
  const { story, calls } = recorded();
  const beat = new Wake(story, layout, scenery, new Promise(() => undefined));
  beat.frame(tick(2));
  beat.skip();
  beat.frame(tick(0.016));
  assert.equal(calls.filter((call) => call.startsWith('stage.parts.screen.lids')).at(-1), 'stage.parts.screen.lids(0)');
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
      hints: [],
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
  } as unknown as WreckRun;
}

const FOOT_VIEW = { 'stage.parts.footView.frame': { under: {}, over: {} } };

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

test('the crew celebrating the throw overboard stand clear of what stands on her deck', () => {
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

test("the wake's staged fighters stand clear of what stands on the deck, its heaps among them", () => {
  const roster = Array.from({ length: 20 }, (unused, type) => ({ type }) as unknown as FoeType);
  const pairs = stagedFights(layout, roster);
  assert.ok(pairs.length >= 4, `${pairs.length} pairs`);
  const standing = [...courseOf(layout), ...layout.zones.flatMap((zone) => (zone.gate ? [zone.gate] : []))];
  for (const { at, facing } of pairs)
    for (const side of [-1, 1]) {
      const [x, y] = [at[0] + side * Math.sin(facing) * 0.9, at[1] - side * Math.cos(facing) * 0.9];
      const top = topAt(standing, x, y);
      for (let bearing = 0; bearing < 2 * Math.PI; bearing += Math.PI / 16) {
        const beside = topAt(standing, x + Math.sin(bearing) * 0.34, y - Math.cos(bearing) * 0.34);
        assert.ok(beside <= top + 0.5, `a fighter at ${x.toFixed(2)}, ${y.toFixed(2)} against ${beside.toFixed(2)} m`);
      }
    }
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
  const { story } = recorded(FOOT_VIEW, { 'stage.parts.roster': roster }, armouredDress(FIRST_LOOK));
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
