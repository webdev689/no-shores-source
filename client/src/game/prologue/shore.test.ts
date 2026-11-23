import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';
import { layersOf } from '../../forge/looks.ts';
import { figureOf } from '../../player/dressing.ts';
import { PX_PER_M } from '../../player/figures.ts';
import { onScreen } from '../camera.ts';
import type { Actor } from './actors.ts';
import type { Tick } from './beat.ts';
import { KNEELS_AT_S, Shore, STRANGER_DRESS, STRANGER_HEAD, STRANGER_ID, takeHandPrompt } from './shore.ts';
import { headOnView, type StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

const VIEW = { width: 1600, height: 900 };
const STEP_S = 1 / 30;

/** A story whose land's worker has no ground to give, round a plaza whose first spawn is at (40, 0). */
function shoreStory(landmass: () => unknown = () => plaza) {
  const said: { scene: string; finish: () => void }[] = [];
  const prompts: (string | null)[] = [];
  const parts = {
    ambience: { set: () => undefined },
    screen: { darken: () => undefined, fade: () => undefined, showPrompt: (text: string | null) => prompts.push(text) },
    landmass,
    keepClose: () => undefined,
    birds: { flock: () => undefined },
    scene: { groundAt: () => 1 },
  };
  const stage = {
    parts,
    weatherTowards: () => undefined,
    stepWeather: () => undefined,
    play: (scene: string) => new Promise<void>((finish) => said.push({ scene, finish })),
  };
  const land = { ground: () => Promise.reject(new Error('no ground here')) };
  const story = { stage, land, dress: {} } as unknown as Story;
  return { story, said, prompts };
}

const plaza = {
  heightAt: () => 1,
  outline: [],
  view: { leftM: 0, topM: 0 },
  plan: { centre: [0, 0], harbour: [100, 0] },
  nodes: [{ centre: [0, 0], spawns: [[40, 0]] }],
  cleared: () => false,
};

const tick = { seconds: STEP_S, clock: 0, controls: {}, size: VIEW, viewport: VIEW } as unknown as Tick;
const strangerIn = (frame: StoryFrame) => frame.actors?.find((actor) => actor.id === STRANGER_ID) as Actor;
const settled = () => new Promise((resolve) => setImmediate(resolve));

/** Whether the stranger's head, as the frame names it, is on the view, so her words are shown and heard. */
const heard = (frame: StoryFrame) => {
  const head = frame.heads?.get('stranger');
  return head ? headOnView(onScreen(frame.shot, VIEW, head), VIEW) !== null : false;
};

test('with no ground to search, the player wakes on the plaza by its first spawn', async () => {
  const failed = mock.method(console, 'error', () => undefined);
  const { story } = shoreStory();
  const shore = new Shore(story);
  await settled();
  const frame = shore.frame(tick);
  assert.ok(frame, 'the shore is shown');
  assert.deepEqual(frame.focus, [40, 0]);
  assert.equal(failed.mock.callCount(), 1);
  failed.mock.restore();
});

test('a shore that cannot be laid at all is thrown from its frame, so the story goes on past it', async () => {
  const shore = new Shore(
    shoreStory(() => {
      throw new Error('no landmass');
    }).story,
  );
  await settled();
  assert.throws(() => shore.frame(tick), /no landmass/);
});

test('the stranger walks down to the player, kneels, and speaks only then, heard; she never jumps', async () => {
  const failed = mock.method(console, 'error', () => undefined);
  const { story, said, prompts } = shoreStory();
  const shore = new Shore(story);
  await settled();
  let last: Actor | null = null;
  const step = () => {
    const frame = shore.frame(tick);
    assert.ok(frame);
    const stranger = strangerIn(frame);
    if (last) {
      const moved = Math.hypot(stranger.x - last.x, stranger.y - last.y);
      assert.ok(moved < 0.1, `she moved ${moved.toFixed(2)} m in a frame (${stranger.anim})`);
    }
    last = stranger;
    return frame;
  };
  let frame = step();
  while (said.length === 0) frame = step();
  const stranger = strangerIn(frame);
  assert.equal(said[0]?.scene, 'shore');
  assert.equal(stranger.anim, 'kneel', 'she is down beside the player when she speaks');
  assert.ok(Math.hypot(stranger.x - 40, stranger.y) < 1.4, 'beside the player');
  assert.ok(heard(frame), 'her head is in the view as she speaks');
  // Her two lines said, she holds out her hand: the player does not rise till they take it.
  said[0]?.finish();
  await settled();
  assert.deepEqual(prompts, [takeHandPrompt(false)]);
  const lying = step().shot.eye[2];
  for (let frames = 0; frames < 300; frames++) assert.equal(step().shot.eye[2], lying, 'still lying down');
  assert.equal(said.length, 1);
  assert.equal(shore.key('e', true), true, 'the press is the hand taken');
  assert.deepEqual(prompts, [takeHandPrompt(false), null]);
  while (said.length === 1) frame = step();
  assert.equal(said[1]?.scene, 'standing');
  assert.ok(frame.shot.eye[2] > lying + 1, 'up on their feet');
  assert.ok(heard(frame), 'her head is in the view as she speaks again');
  said[1]?.finish();
  await settled();
  while (!shore.done) step();
  failed.mock.restore();
});

test('a shore left while she speaks asks nothing more', async () => {
  const failed = mock.method(console, 'error', () => undefined);
  const { story, said, prompts } = shoreStory();
  const shore = new Shore(story);
  await settled();
  while (said.length === 0) shore.frame(tick);
  shore.leave();
  said[0]?.finish();
  await settled();
  assert.deepEqual(prompts, [null], 'no prompt over the black');
  failed.mock.restore();
});

test('a key on the way to another window is not her hand taken', async () => {
  const failed = mock.method(console, 'error', () => undefined);
  const { story, said, prompts } = shoreStory();
  const shore = new Shore(story);
  await settled();
  while (said.length === 0) shore.frame(tick);
  said[0]?.finish();
  await settled();
  for (const key of ['alt', 'tab', 'escape']) shore.key(key, true);
  assert.deepEqual(prompts, [takeHandPrompt(false)], 'still asking');
  failed.mock.restore();
});

test('a key before her hand is held out is not the hand taken', async () => {
  const failed = mock.method(console, 'error', () => undefined);
  const { story, said } = shoreStory();
  const shore = new Shore(story);
  await settled();
  for (let since = 0; since < KNEELS_AT_S; since += STEP_S) shore.frame(tick);
  assert.equal(shore.key('e', true), false);
  while (said.length === 0) shore.frame(tick);
  said[0]?.finish();
  await settled();
  const lying = shore.frame(tick)?.shot.eye[2] ?? 0;
  shore.press();
  for (let frames = 0; frames < 30; frames++) shore.frame(tick);
  assert.ok((shore.frame(tick)?.shot.eye[2] ?? 0) > lying, 'a tap takes it');
  failed.mock.restore();
});

/** The forge's own tables for the female body: the layers it drew in each move, and each strip's cell and root. */
const forge = new URL('../../../../tools/forge/tools/sprite-forge/', import.meta.url);
const fitted = JSON.parse(readFileSync(new URL('fitted/female.json', forge), 'utf8')) as Record<
  string,
  Record<string, string[]>
>;
const keys = JSON.parse(readFileSync(new URL('keys/keys-female.json', forge), 'utf8')) as Record<
  string,
  { cell: [[number, number], [number, number]] }
>;
const drawn: Record<string, string[]> = {};
for (const [anim, sets] of Object.entries(fitted))
  for (const layer of Object.values(sets).flat()) if (!drawn[layer]?.includes(anim)) (drawn[layer] ??= []).push(anim);
// The fitted table lists what is worn over the body; the body's own strips are in the keys.
drawn.body = Object.keys(fitted).filter((anim) => keys[`body_${anim}`]);

/** Every move the stranger makes through the whole shore, from her walk down the beach to the walk up the shore. */
async function shoreMoves(): Promise<Set<string>> {
  const failed = mock.method(console, 'error', () => undefined);
  const { story, said } = shoreStory();
  const shore = new Shore(story);
  await settled();
  const moves = new Set<string>();
  const step = () => moves.add(strangerIn(shore.frame(tick) as StoryFrame).anim);
  while (said.length === 0) step();
  said[0]?.finish();
  await settled();
  shore.press();
  while (said.length === 1) step();
  said[1]?.finish();
  await settled();
  while (!shore.done) step();
  failed.mock.restore();
  return moves;
}

test("the stranger is clothed in every move the shore and the epilogue draw her in, by the forge's own table", async () => {
  const moves = await shoreMoves();
  assert.deepEqual([...moves].sort(), ['idle', 'kneel', 'walk']);
  // The epilogue draws her standing and walking (epilogue.ts), moves the shore already holds.
  for (const anim of moves) {
    const figure = figureOf(STRANGER_DRESS, drawn, anim);
    const layers = layersOf(figure, anim, { bodies: { female: { anims: {}, layers: drawn } } });
    for (const worn of ['body', 'hair_braid', ...STRANGER_DRESS.outfit.garments])
      assert.ok(layers.includes(worn), `${worn} is drawn in ${anim}: ${layers.join(', ')}`);
  }
});

test("her head's heights are the forge's: the crown stands where the strip's root puts it", () => {
  for (const [anim, pose] of [
    ['kneel', STRANGER_HEAD.kneeling],
    ['idle', STRANGER_HEAD.standing],
  ] as const) {
    const root = keys[`body_${anim}`]?.cell[1][1] ?? 0;
    assert.ok(Math.abs(pose.crown - root / PX_PER_M) < 0.05, `${anim}: ${pose.crown} m against ${root} px`);
    assert.ok(pose.face < pose.crown);
  }
});

test('she rises with the player: down on her knee as they begin to rise, up before they stand', async () => {
  const failed = mock.method(console, 'error', () => undefined);
  const { story, said } = shoreStory();
  const shore = new Shore(story);
  await settled();
  while (said.length === 0) shore.frame(tick);
  said[0]?.finish();
  await settled();
  const lying = (shore.frame(tick) as StoryFrame).shot.eye[2];
  shore.press();
  const rise: { anim: string; eye: number }[] = [];
  while (said.length === 1) {
    const frame = shore.frame(tick) as StoryFrame;
    rise.push({ anim: strangerIn(frame).anim, eye: frame.shot.eye[2] });
  }
  const standing = rise.at(-1)?.eye ?? 0;
  assert.equal(rise[0]?.anim, 'kneel', 'still down as the hand is taken');
  assert.equal(rise.at(-1)?.anim, 'idle', 'up by the time they stand');
  const up = rise.find((frame) => frame.anim === 'idle');
  const share = ((up?.eye ?? 0) - lying) / (standing - lying);
  assert.ok(share > 0.3 && share < 0.7, `she is drawn up ${share.toFixed(2)} of the way through the rise`);
  failed.mock.restore();
});
