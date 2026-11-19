import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LocalRoom } from '../network/localRoom.ts';
import { courseBytes, helmBytes, walkBytes } from '../network/messages.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { type Body, type Controls, floatsOf, floatsOfControls, startMovementRules } from '../rules/movementRules.ts';
import type { Cards } from '../player/cards.ts';
import type { Walker } from '../player/walker.ts';
import { IDLE } from '../player/input.ts';
import { deckFloats, SLOOP_DECK } from '../ships/deck.ts';
import { Aboard, type HelmRoom } from './aboard.ts';
import { DeckWalk } from './deckWalk.ts';
import { STANDING_EYE_M } from './seaLaw.ts';

const built = (name: string) =>
  readFile(new URL(`../../../target/wasm32-unknown-unknown/release/${name}`, import.meta.url)).catch(() => {
    throw new Error(`${name} is not built: run \`npm run wasm\` first`);
  });
const rules = await startMovementRules(await built('movement_wasm.wasm'));
const roomModule = await WebAssembly.compile(await built('room_wasm.wasm'));
const layoutText = await readFile(new URL('../../../content/world/layout.json', import.meta.url), 'utf8');

/** The sea in the page, the player's ship at sea well clear of every coast, and the latest snapshot it handed on. */
function atSea(): { room: LocalRoom; last: () => Snapshot | null } {
  let last: Snapshot | null = null;
  const room = LocalRoom.openSea(roomModule, layoutText, (snapshot) => (last = snapshot), 7);
  const layout = JSON.parse(layoutText) as { continents: { outline: [number, number][] }[] };
  const west = Math.min(...layout.continents.flatMap((continent) => continent.outline.map(([x]) => x)));
  room.send(courseBytes([[west - 5000, 1_500_000]], 10));
  room.pump(rules.tickSeconds);
  return { room, last: () => last };
}

const walked = (tick: number): Controls => ({
  forward: tick < 90 ? 1 : 0.4,
  sideways: tick % 50 < 10 ? 0.5 : 0,
  yaw: 0.02 * tick - 0.6,
  run: tick > 30,
  jump: tick === 60,
  crouch: false,
  mounted: false,
});

test("the walk on deck the page predicts is the sea room's, to the bit, step by step", () => {
  const { room, last } = atSea();
  room.send(helmBytes(true));
  rules.setCourse([]);
  assert.ok(rules.setHeights(deckFloats(SLOOP_DECK)), "the Sloop's deck is a grid the door takes");
  let body: Body = rules.standing(...SLOOP_DECK.helm);
  for (let tick = 0; tick < 120; tick++) {
    const controls = walked(tick);
    body = rules.step(body, controls);
    room.send(walkBytes(tick + 1, floatsOfControls(controls)));
    room.pump(rules.tickSeconds);
    const seen = last()?.players.find((player) => player.player === room.player);
    assert.ok(seen, `the room has the player on deck after step ${tick + 1}`);
    assert.equal(seen.acknowledged, tick + 1);
    assert.deepEqual(floatsOf(seen.body), floatsOf(body), `step ${tick + 1}`);
  }
});

test('a player off the helm walks down her steps to her deck, and takes the helm again only at her wheel', () => {
  const { room, last } = atSea();
  room.send(helmBytes(true));
  let sequence = 1;
  const onDeck = () => last()?.players.find((player) => player.player === room.player);
  const heights: number[] = [];
  const walk = (ticks: number, yaw: number) => {
    const controls: Controls = { forward: 1, sideways: 0, yaw, run: false, jump: false, crouch: false, mounted: false };
    for (let tick = 0; tick < ticks; tick++) {
      room.send(walkBytes(sequence++, floatsOfControls(controls)));
      room.pump(rules.tickSeconds);
      heights.push(onDeck()?.body.z ?? NaN);
    }
  };
  // To port along her quarterdeck, then forward through the gap at its corner and down her port steps.
  walk(12, -Math.PI / 2);
  walk(36, 0);
  const below = onDeck()?.body;
  assert.ok(below && below.y < 5 && below.z < 1.85, `down on her deck: ${JSON.stringify(below)}`);
  const treads = new Set(heights.filter((z) => z > 1.9 && z < 2.4).map((z) => z.toFixed(2)));
  assert.ok(treads.size >= 4, `down her steps, not off an edge: ${[...treads].join(' ')}`);
  room.send(helmBytes(false));
  room.pump(rules.tickSeconds);
  assert.ok(onDeck(), 'away from her wheel, still on deck');
  // Back up her steps, and across to the spot behind her wheel.
  walk(36, Math.PI);
  walk(12, Math.PI / 2);
  room.send(helmBytes(false));
  room.pump(rules.tickSeconds);
  assert.equal(onDeck(), undefined, 'back at the helm');
});

test('from her wheel a walker or a runner straight to port or to starboard is stopped by her rail', () => {
  rules.setCourse([]);
  assert.ok(rules.setHeights(deckFloats(SLOOP_DECK)));
  for (const yaw of [-Math.PI / 2, Math.PI / 2]) {
    for (const run of [false, true]) {
      const controls: Controls = { forward: 1, sideways: 0, yaw, run, jump: false, crouch: false, mounted: false };
      let body = rules.standing(...SLOOP_DECK.helm);
      for (let tick = 0; tick < 120; tick++) body = rules.step(body, controls);
      assert.ok(body.z > 2.3, `yaw ${yaw.toFixed(2)}${run ? ', running' : ''}: ${body.x.toFixed(2)}, z ${body.z}`);
    }
  }
});

test("the helm's eye stands a standing body's eye over her deck, as the movement crate stands one", () => {
  assert.equal(rules.eyeHeight(rules.standing(...SLOOP_DECK.helm)), STANDING_EYE_M);
});

test("the page corrects its walk to the room's word, once, stepping again the steps the room has not taken", () => {
  const sent: number[] = [];
  const room = {
    onDeck: null as { acknowledged: number; body: Body } | null,
    words: 0,
    walk: (sequence: number) => sent.push(sequence),
  };
  const walker = { player: { view: 'third' } } as unknown as Walker;
  const walk = new DeckWalk(rules, walker, SLOOP_DECK, room);
  const asked = (tick: number): Controls => ({ ...walked(tick), run: false, jump: false });
  for (let tick = 0; tick < 10; tick++) {
    const body = walk.rules().step(walker.player.body, asked(tick));
    walker.player = { ...walker.player, body };
  }
  assert.deepEqual(sent, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'each step sent, numbered from 1');
  // The room's word: it has taken four, and has the body a little to starboard of where the page did.
  let body = rules.standing(...SLOOP_DECK.helm);
  for (let tick = 0; tick < 4; tick++) body = rules.step(body, { ...asked(tick), mounted: false });
  const word = { ...body, x: body.x + 0.05 };
  [room.onDeck, room.words] = [{ acknowledged: 4, body: word }, 1];
  walk.correct();
  let replayed: Body = word;
  for (let tick = 4; tick < 10; tick++) replayed = rules.step(replayed, { ...asked(tick), mounted: false });
  assert.deepEqual(floatsOf(walker.player.body), floatsOf(replayed), 'its word, and the six steps since on top');
  walker.player = { ...walker.player, body: rules.standing(...SLOOP_DECK.helm) };
  walk.correct();
  assert.deepEqual(floatsOf(walker.player.body), floatsOf(rules.standing(...SLOOP_DECK.helm)), 'a word is taken once');
});

test("off the helm the page waits on the room's word: with none in 2 s it takes the helm back, and goes up once the room gives it", () => {
  const asked: string[] = [];
  const room: HelmRoom & { onDeck: { acknowledged: number; body: Body } | null } = {
    onDeck: null,
    words: 0,
    walk: () => undefined,
    leaveHelm: () => asked.push('leave'),
    takeHelm: () => asked.push('take'),
  };
  const walker = { player: { view: 'third' }, frame: () => undefined } as unknown as Walker;
  const aboard = new Aboard({ movement: rules, walker, forge: {} as Cards }, SLOOP_DECK);
  const frames = (count: number) => {
    for (let frame = 0; frame < count; frame++) aboard.step(1 / 60, frame / 60, IDLE, false, room);
  };
  aboard.leaveHelm(room);
  frames(125);
  assert.deepEqual(asked, ['leave', 'take'], 'no word in 2 s: the leave is taken back');
  frames(90);
  assert.equal(aboard.active, false, 'and the view has gone back up');
  aboard.leaveHelm(room);
  room.onDeck = { acknowledged: 0, body: walker.player.body };
  frames(10);
  assert.equal(aboard.walking, true, 'its word: the player walks');
  room.onDeck = null;
  frames(90);
  assert.equal(aboard.active, false, 'the room has them at the helm again: the view has gone back up');
  assert.deepEqual(asked, ['leave', 'take', 'leave'], 'and nothing more was asked of it');
});
