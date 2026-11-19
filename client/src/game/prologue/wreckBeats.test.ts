import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InputFrame } from '../../player/input.ts';
import { deckToWorld } from '../../ships/deck.ts';
import { shipSails } from '../../ships/shipMesh.ts';
import type { Shot } from '../camera.ts';
import { Deep } from './deep.ts';
import { YOU_ID } from './helm.ts';
import type { Nameplate } from './nameplate.ts';
import { Overboard } from './overboard.ts';
import type { Story } from './story.ts';
import { Wake } from './wake.ts';
import { readWreck } from './wreckLayout.ts';
import type { WreckRun } from './wreckRun.ts';
import { WreckFight } from './wreckFight.ts';
import type { WreckScenery } from './wreckScenery.ts';

const layout = readWreck();
const SIZE = { width: 960, height: 540 };

/** A story whose every part takes any call and writes it down, by its path and what it was handed. */
function recorded(): { story: Story; calls: string[] } {
  const calls: string[] = [];
  const part = (path: string): unknown =>
    new Proxy(() => undefined, {
      get: (target, key) => (key === 'then' ? undefined : part(`${path}.${String(key)}`)),
      set: () => true,
      apply: (target, self, args: unknown[]) => {
        calls.push(`${path}(${args.filter((arg) => typeof arg !== 'object').join(', ')})`);
        return undefined;
      },
    });
  const story = new Proxy({ dress: { body: 'female' } } as object, {
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
  assert.ok(calls.includes('stage.parts.objective.clear()') && calls.includes('stage.parts.screen.bars(false)'));
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

test("the wake's flight down the wreck keeps its eye clear of the frigate's masts", () => {
  const { story } = recorded();
  const beat = new Wake(story, layout, scenery, new Promise<WreckRun>(() => undefined));
  const frigate = layout.ships.find((shown) => shown.ship === 'frigate');
  assert.ok(frigate);
  // Each mast stands where her square sails' heads hang from it: heads within a metre along her are one mast's.
  const heads = shipSails('frigate').flatMap((sail) => (sail.kind === 'square' ? [sail.head_port[0]] : []));
  const along: number[][] = [];
  for (const head of heads.sort((first, second) => first - second)) {
    const last = along.at(-1);
    if (last && head - (last.at(-1) ?? 0) < 1) last.push(head);
    else along.push([head]);
  }
  const masts = along.map((mast) => {
    const forward = mast.reduce((sum, head) => sum + head, 0) / mast.length;
    return deckToWorld(frigate.lying, 0, -forward, 0);
  });
  assert.equal(masts.length, 3, 'her fore, main and mizzen');
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
