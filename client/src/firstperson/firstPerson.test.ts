import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Strip } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap, type Rgb } from '../forge/dyes.ts';
import { FirstPerson, type FirstPersonState, type QuadDrawer } from './firstPerson.ts';
import type { ScreenQuad } from './firstPersonView.ts';
import { FramePainter, type FramesTable } from './fpFrames.ts';
import { swingFrameSeconds } from './weaponMachine.ts';

const band: Rgb[] = Array.from({ length: 16 }, (_unused, step) => [step * 16, step * 16, step * 16]);
const dyes: DyeTable = { palette: band, clothing: {}, armour: { Steel: band, Iron: band } };
const tiny: Strip = { width: 2, height: 1, data: new Uint8Array([90, 90, 90, 255, 0, 0, 0, 0]) };

/** A first person whose forge has every picture named in `drawn`, each two texels wide at (10, 20), and a view that
 *  keeps the quads it is last asked to draw. */
function firstPerson(drawn: (path: string) => boolean) {
  const asked: string[] = [];
  const frames = new Proxy({}, { get: () => ({ at: [10, 20] }) }) as FramesTable;
  const source = {
    frames,
    dyes,
    painter: new FramePainter(dyes, new PaletteSnap(dyes.palette)),
    strip: (path: string) => {
      asked.push(path);
      return Promise.resolve(drawn(path) ? tiny : null);
    },
  };
  let quads: readonly ScreenQuad[] = [];
  const view: QuadDrawer = {
    texture: () => ({}) as GPUTexture,
    forget: () => undefined,
    draw: (_encoder, _colour, _width, _height, drawnQuads) => {
      quads = drawnQuads;
    },
  };
  const person = new FirstPerson(view, source, () => 0);
  const frame = async (seconds: number, state: FirstPersonState, input = still) => {
    const events = person.update(seconds, input, state);
    await new Promise((resolve) => setImmediate(resolve));
    person.draw({} as GPUCommandEncoder, {} as GPUTextureView, 640, 400);
    return { events, quads: quads.map(({ x, y, width, height, flip }) => ({ x, y, width, height, flip })) };
  };
  return { frame, asked };
}

const still = { attackHeld: false, attackPressed: false, attackReleased: false };
const standing: FirstPersonState = {
  right: 'sword_iron',
  left: null,
  armour: {},
  drawn: true,
  moving: false,
  running: false,
  stride: 0,
  casting: false,
  climbing: 0,
};
const wholeFrames = (path: string) =>
  /WEAPON\d\d\.CIF_\d+-\d+(_[A-Za-z]+)?\.png$/.test(path) || path.startsWith('@art');

test('a drawn sword rests at its own place; sheathed, nothing shows', async () => {
  const { frame, asked } = firstPerson(wholeFrames);
  const shown = await frame(0.016, standing);
  assert.deepEqual(shown.quads, [{ x: 10, y: 20, width: 2, height: 1, flip: false }]);
  assert.ok(asked.includes('forge/WEAPON04/WEAPON04.CIF_0-0_Iron.png'));
  assert.deepEqual((await frame(0.016, { ...standing, drawn: false })).quads, []);
});

test('a weapon in the left hand alone is mirrored about the middle, from its left-hand twin', async () => {
  const { frame, asked } = firstPerson(wholeFrames);
  const shown = await frame(0.016, { ...standing, right: null, left: 'sword_iron_l' });
  assert.deepEqual(shown.quads, [{ x: 320 - 10 - 2, y: 20, width: 2, height: 1, flip: true }]);
  const whole = asked.filter((path) => path.includes('CIF_0-0') && !path.includes('/layers/'));
  assert.equal(whole[0], 'forge/WEAPON04/WEAPON04.CIF_0-0_IronLeft.png');
});

test('a click swings and lands its blow two frames in', async () => {
  const { frame } = firstPerson(wholeFrames);
  const press = { attackHeld: true, attackPressed: true, attackReleased: false };
  await frame(0.016, standing, press);
  const tick = swingFrameSeconds('sword');
  assert.equal((await frame(tick, standing)).events.blow, null);
  assert.deepEqual((await frame(tick, standing)).events.blow, { direction: 'down', hand: 'right' });
});

test('running with empty hands or a sheathed weapon pumps both arms, the left one mirrored', async () => {
  const { frame } = firstPerson(wholeFrames);
  const shown = await frame(0.016, { ...standing, drawn: false, running: true, moving: true });
  assert.deepEqual(
    shown.quads.map((quad) => quad.flip),
    [false, true],
  );
});

test('a cast shows both hands, the right mirrored, and hides the weapon until it ends', async () => {
  const { frame, asked } = firstPerson(wholeFrames);
  const shown = await frame(0.016, { ...standing, casting: true });
  assert.equal(shown.quads.length, 2);
  assert.deepEqual(
    shown.quads.map((quad) => quad.flip),
    [false, true],
  );
  assert.ok(asked.includes('@art/cast/magic/cast-0.png'));
  const after = await frame(0.5, { ...standing, casting: true });
  assert.equal(after.quads.length, 1);
});

test('a climb lowers the weapon out of sight and brings both hands up onto the wall, closed', async () => {
  const { frame, asked } = firstPerson(wholeFrames);
  const start = await frame(0.016, standing);
  const lowering = await frame(0.05, { ...standing, climbing: 1 });
  assert.ok((lowering.quads[0]?.y ?? 0) > (start.quads[0]?.y ?? 0));
  const holding = await frame(1, { ...standing, climbing: 1 });
  assert.deepEqual(
    holding.quads.map((quad) => quad.flip),
    [false, true],
  );
  assert.ok(holding.quads.every((quad) => quad.y + quad.height > 200 && quad.y < 200));
  assert.ok(asked.includes('@art/climb/linen/grip-0.png') && asked.includes('@art/climb/gauntlet/grip-0.png'));
  assert.deepEqual((await frame(1, standing)).quads.length, 1);
});

test('a flail at rest wears its chain swing, mirrored in the left hand', async () => {
  const { frame, asked } = firstPerson(wholeFrames);
  await frame(0.016, { ...standing, right: 'flail_iron' });
  assert.ok(asked.includes('forge/WEAPON06/WEAPON06.CIF_7-4_Iron.png'));
  const left = await frame(0.016, { ...standing, right: null, left: 'flail_iron' });
  assert.deepEqual(
    left.quads.map((quad) => quad.flip),
    [true],
  );
});

const everything = (path: string) => wholeFrames(path) || path.startsWith('forge/held/');

test('two one-handed weapons are both drawn, the left mirrored, and their blows take turns', async () => {
  const { frame } = firstPerson(everything);
  const pair = { ...standing, left: 'dagger_iron_l' };
  const rest = await frame(0.016, pair);
  assert.deepEqual(
    rest.quads.map((quad) => quad.flip),
    [false, true],
  );
  const held = { attackHeld: true, attackPressed: true, attackReleased: false };
  const hands: string[] = [];
  for (let step = 0; step < 100 && hands.length < 2; step++) {
    const { events } = await frame(0.05, pair, held);
    if (events.blow) hands.push(events.blow.hand);
  }
  assert.deepEqual(hands, ['right', 'left']);
});

test('a shield is held in the lower left beside the weapon, and raised for a block', async () => {
  const { frame, asked } = firstPerson(everything);
  const shielded = { ...standing, left: 'shield_kite_iron' };
  const rest = await frame(0.016, shielded);
  assert.deepEqual(rest.quads[0], { x: 0, y: 199, width: 2, height: 1, flip: false });
  assert.ok(asked.includes('forge/held/112362_0-1_ShieldIron.png'));
  await frame(0.2, { ...shielded, blocking: true });
  assert.ok(asked.includes('forge/held/112362_0-0_ShieldIron.png'));
});

test("a crossbow's shot is reported through the swing, its bolt leaving on the second frame", async () => {
  const { frame } = firstPerson(everything);
  const armed = { ...standing, right: 'crossbow_iron' };
  await frame(0.016, armed, { attackHeld: true, attackPressed: true, attackReleased: false });
  const { events } = await frame(0.15, armed);
  assert.deepEqual([events.loose, events.hand], [true, 'right']);
  assert.equal((await frame(0.016, armed)).events.loose, false);
});

test('riding shows the horse and a rein in each free hand; a drawn weapon takes the right', async () => {
  const { frame, asked } = firstPerson(everything);
  const riding = await frame(0.016, { ...standing, drawn: false, mounted: true });
  assert.equal(riding.quads.length, 3);
  assert.ok(asked.includes('@art/ride/RIDE_stand-0.png') && asked.includes('@art/ride/REIN_stand-0_L.png'));
  const armed = await frame(0.016, { ...standing, mounted: true });
  assert.deepEqual(
    armed.quads.map((quad) => quad.flip),
    [false, true, false],
  );
});
