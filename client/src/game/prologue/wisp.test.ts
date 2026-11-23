import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Laid } from '../../combat/spellPixels.ts';
import { FLASH_IN_S, layEngulf, layWisp, WISP_LENGTH_S, WISP_S, wispLight } from './wisp.ts';
import { wispAt, wispCourse } from './wispCourse.ts';
import { courseOf, readWreck, topAt } from './wreckLayout.ts';

const layout = readWreck();
const [wakeX, wakeY] = layout.wake.at;
const feet = [wakeX, wakeY, topAt(courseOf(layout), wakeX, wakeY)] as const;
const course = wispCourse(feet, layout.wake.facing, layout);
const apart = (place: readonly number[]) => Math.hypot((place[0] ?? 0) - feet[0], (place[1] ?? 0) - feet[1]);

test('the wisp comes in from over the water, wanders the deck for 6 to 8 s, then circles the player ever closer', () => {
  const start = wispAt(course, 0);
  assert.equal(start.part, 'drift');
  assert.ok(apart(start.at) > 20 && start.at[2] > feet[2] + 6, 'far out and high over the water');
  const about = WISP_S.drift + WISP_S.wander;
  assert.ok(about >= 6 && about <= 8, `${about} s about the deck before it circles`);
  assert.equal(wispAt(course, WISP_S.drift + 1).part, 'wander');
  for (let seconds = WISP_S.drift; seconds < about; seconds += 0.25) {
    const { at } = wispAt(course, seconds);
    assert.ok(apart(at) < 16 && at[2] > feet[2] + 1.5, `over the deck at ${seconds} s`);
  }
  const rings = [0.8, 1.6, 2.4, 3.2].map((into) => wispAt(course, about + into));
  assert.ok(rings.every((ring) => ring.part === 'circle'));
  const radii = rings.map((ring) => apart(ring.at));
  // Tightening, though a solid near the player closes a ring in early.
  assert.ok(
    (radii.at(-1) ?? 9) < 0.6 && (radii.at(-1) ?? 9) < Math.max(...radii.slice(0, -1)),
    `tightening: ${radii.map((radius) => radius.toFixed(2)).join(', ')}`,
  );
  const glows = rings.map((ring) => ring.glow);
  assert.ok(
    glows.every((glow, index) => index === 0 || glow > (glows[index - 1] ?? 0)),
    'and brighter',
  );
});

test('it is drawn as a core, a halo, a trail of motes and arcs, never a plain dot; the engulfing wraps and rings', () => {
  const eye = [0, 8, 4] as const;
  const now = wispAt(course, WISP_S.drift + 1);
  const bare = new Laid();
  layWisp(bare, now, [], eye, 1);
  const trailed = new Laid();
  const trail = Array.from({ length: 20 }, (unused, index) => ({
    at: [now.at[0] + index * 0.05, now.at[1], now.at[2]] as const,
    age: index / 30,
  }));
  layWisp(trailed, now, trail, eye, 1);
  const quads = (laid: Laid) => laid.length / 7 / 6;
  assert.ok(quads(bare) > 40, `${quads(bare)} pieces: a core in steps, a halo and arcs`);
  assert.ok(quads(trailed) > quads(bare) + 10, 'its trail of motes');
  const halo = bare.values.filter((value, index) => index % 7 === 6 && value < 0).length;
  assert.ok(halo > 0, 'its halo laid as light added');
  const gone = new Laid();
  layWisp(gone, wispAt(course, WISP_LENGTH_S), trail, eye, 1);
  assert.equal(gone.length, 0, 'nothing once it has engulfed them');
  const wraps = new Laid();
  layEngulf(wraps, feet, eye, FLASH_IN_S / 2);
  const ringed = new Laid();
  layEngulf(ringed, feet, eye, FLASH_IN_S + 0.3);
  assert.ok(wraps.length > 0 && ringed.length > wraps.length * 0.5, 'arcs, then the ring as well');
});

test('up close its halo falls off smoothly, band on band of light, its heart as bright as from afar', () => {
  const opacities = (eye: readonly [number, number, number]) => {
    const laid = new Laid();
    layWisp(laid, { at: [0, 0, 3], part: 'wander', glow: 0.7 }, [], eye, 0);
    const found = new Set<number>();
    for (let index = 6; index < laid.length; index += 7) {
      const opacity = laid.values[index] ?? 0;
      if (opacity < 0) found.add(Math.round(opacity * 1e6) / 1e6);
    }
    return [...found];
  };
  const [near, far] = [opacities([0, 1.2, 3]), opacities([0, 8, 3])];
  assert.ok(near.length >= 5, `near: ${near.length} bands of light`);
  assert.equal(far.length, 1, 'far: one dithered halo');
  const sum = near.reduce((total, opacity) => total + opacity, 0);
  assert.ok(Math.abs(sum - (far[0] ?? 0)) < 1e-4, `the heart's light near ${sum} as far ${far[0]}`);
});

test('it lights what is near it in Volt’s blue, brighter as its rings tighten, and its flash lights the deck white', () => {
  const place = [1, 2, 3] as const;
  const wandering = wispLight({ at: place, part: 'wander', glow: 0.6 }, 0);
  const closing = wispLight({ at: place, part: 'circle', glow: 0.95 }, 0);
  const flashing = wispLight({ at: place, part: 'engulf', glow: 1 }, 1);
  assert.ok(wandering && closing && flashing);
  assert.deepEqual(wandering.at, place, 'from its place');
  assert.ok(wandering.reachM >= 2 && wandering.reachM <= 6, `a few metres: ${wandering.reachM}`);
  const strength = (light: { light: readonly number[] }) => light.light.reduce((sum, part) => sum + part, 0);
  assert.ok(strength(closing) > strength(wandering), 'brighter as the rings tighten');
  const [red, green, blue] = wandering.light;
  assert.ok(blue > green && green > red, `Volt's blue: ${wandering.light.join(', ')}`);
  assert.ok(
    strength(flashing) > 2 * strength(closing) && flashing.reachM > closing.reachM,
    'the flash brighter, wider',
  );
  const [flashRed = 0, , flashBlue = 0] = flashing.light;
  assert.ok(flashRed / flashBlue > red / blue, 'and whiter');
  assert.equal(
    wispLight({ at: place, part: 'gone', glow: 0 }, 0),
    null,
    'none once it is gone and the flash has faded',
  );
  assert.ok(wispLight({ at: place, part: 'gone', glow: 0 }, 0.5), 'the flash still lighting as it fades');
});
