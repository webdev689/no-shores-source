import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LocalRoom } from '../network/localRoom.ts';
import { courseBytes, helmBytes, walkBytes } from '../network/messages.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { type Body, type Controls, floatsOf, floatsOfControls, startMovementRules } from '../rules/movementRules.ts';
import { deckFloats, SLOOP_DECK } from '../ships/deck.ts';

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
  const room = LocalRoom.openSea(roomModule, layoutText, (snapshot) => (last = snapshot));
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

test('the helm is taken again only at her wheel, and then the room has no one on deck', () => {
  const { room, last } = atSea();
  room.send(helmBytes(true));
  let sequence = 1;
  const walk = (ticks: number, yaw: number) => {
    const controls: Controls = { forward: 1, sideways: 0, yaw, run: false, jump: false, crouch: false, mounted: false };
    for (let tick = 0; tick < ticks; tick++) {
      room.send(walkBytes(sequence++, floatsOfControls(controls)));
      room.pump(rules.tickSeconds);
    }
  };
  const onDeck = () => last()?.players.find((player) => player.player === room.player);
  // To port, then forward along her port side, past her wheel, which stands just forward of the helm's spot.
  walk(20, -Math.PI / 2);
  walk(30, 0);
  assert.ok((onDeck()?.body.y ?? 9) < 1.5, `well forward of her wheel: ${onDeck()?.body.y}`);
  room.send(helmBytes(false));
  room.pump(rules.tickSeconds);
  assert.ok(onDeck(), 'away from her wheel, still on deck');
  walk(30, Math.PI);
  walk(20, Math.PI / 2);
  room.send(helmBytes(false));
  room.pump(rules.tickSeconds);
  assert.equal(onDeck(), undefined, 'back at the helm');
});
