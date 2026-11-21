import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { EVENT } from '../../combat/cues.ts';
import { Fighting } from '../../combat/fighting.ts';
import { ASKS, type GearState } from '../../network/gearMessages.ts';
import { LocalRoom } from '../../network/localRoom.ts';
import { slotOf, WORN } from '../../player/gear.ts';
import { startCombatRules } from '../../rules/combatRules.ts';
import type { MovementRules } from '../../rules/movementRules.ts';
import { Freeze } from './tutorial.ts';
import { courseOf, inArea, readWreck, topAt } from './wreckLayout.ts';
import { IN_THE_SEA_M } from './wreckProgress.ts';
import { armsAt, armsOf, ARMS_ALONG_M, BOARDER, boarderAt, LyingArms } from './wreckTeaching.ts';

const layout = readWreck();
const course = courseOf(layout);
const [wakeX, wakeY] = layout.wake.at;
const quiet = layout.zones[0]?.area ?? [0, 0, 0, 0];

test("the player's sword and shield lie on the quiet deck a few steps ahead of where they wake", () => {
  const [x, y, z] = armsAt(layout);
  assert.ok(inArea(quiet, x, y), 'on the quiet deck');
  assert.ok(z > IN_THE_SEA_M && z === topAt(course, x, y), 'on its planks, not in the sea');
  const away = Math.hypot(x - wakeX, y - wakeY);
  assert.ok(away > 2 && away <= ARMS_ALONG_M, `${away.toFixed(2)} m from where they wake`);
  const { facing } = layout.wake;
  const ahead = (x - wakeX) * Math.sin(facing) - (y - wakeY) * Math.cos(facing);
  assert.ok(ahead / away > Math.cos(Math.PI / 4), 'ahead of them as they stand, so seen as their eyes open');
  const arms = new LyingArms(layout);
  assert.ok(arms.reached([x + 1, y, z]) && !arms.reached([x + 2, y, z]), 'taken up by walking over them');
  assert.ok(arms.marks(0, [wakeX, wakeY, z + 1.6]).length > 0, 'drawn as a dropped piece of gear');
});

test('the boarder comes on the quiet deck, from its far end or back by the wake, the farther from the player', () => {
  for (const [x, y] of [
    [wakeX, wakeY],
    [-17, -8.2],
    [-24, -9],
  ] as const) {
    const { at, facing } = boarderAt(layout, x, y);
    assert.ok(inArea(quiet, ...at), `${at.join(', ')} on the quiet deck`);
    assert.ok(topAt(course, ...at) > IN_THE_SEA_M, 'on its planks');
    assert.ok(Math.hypot(at[0] - x, at[1] - y) > 6, `well off from a player at ${x}, ${y}`);
    const toward = Math.atan2(x - at[0], -(y - at[1]));
    assert.ok(Math.abs(Math.atan2(Math.sin(facing - toward), Math.cos(facing - toward))) < 1e-9, 'facing them');
  }
});

const MODULE = new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);

test('on the wreck the room has the player wake without their arms, and puts them in the pack once', async () => {
  const compiled = new WebAssembly.Module(await readFile(MODULE));
  let gear: GearState | null = null;
  const room = LocalRoom.openOverSea(
    compiled,
    { x: wakeX, y: wakeY },
    course,
    () => undefined,
    (sent) => (gear = sent),
  );
  room.storyWreck();
  room.pump(0.1);
  assert.equal(armsOf(gear), 'lying');
  assert.ok(room.storyTakeArms());
  // The room's word on the gear comes within the second.
  room.pump(1);
  assert.equal(armsOf(gear), 'carried');
  assert.ok(!room.storyTakeArms(), 'taken once');
  const sent = gear as GearState | null;
  assert.ok(sent);
  assert.equal(armsOf({ ...sent, items: sent.items.map((item) => ({ ...item, at: WORN })) }), 'worn');
});

test("frozen on the boarder's blow, a guard pressed parries it; frozen on the next, a dodge dodges it", async () => {
  const compiled = new WebAssembly.Module(await readFile(MODULE));
  const TICK = 1 / 60;
  let fight: Fighting | null = null;
  let gear: GearState | null = null;
  const room = LocalRoom.openOverSea(
    compiled,
    { x: wakeX, y: wakeY },
    course,
    (snapshot) => fight?.receive(snapshot),
    (sent) => (gear = sent),
  );
  room.storyWreck();
  const rules = startCombatRules(compiled);
  rules.setRim(course);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  fighting.arms = rules.armsCode('sword_steel', 'shield_kite_steel', true);
  const steps = fighting.steps({ tickSeconds: TICK } as unknown as MovementRules);
  const tick = (buttons: { guard?: boolean; guardPressed?: boolean; dodge?: boolean } = {}, yaw = 0) => {
    fighting.press({ swing: false, shoot: false, guard: false, dodge: false, pitch: 0, ...buttons });
    const controls = { forward: 0, sideways: buttons.dodge ? 1 : 0, yaw, run: false, jump: false, crouch: false };
    steps.step({} as never, { ...controls, mounted: false });
    room.pump(TICK);
  };
  tick();
  assert.ok(room.storyTakeArms());
  for (let nth = 0; nth < 30; nth++) tick();
  const arms = (gear as GearState | null)?.items.find((item) => item.kind === 12);
  assert.ok(arms, 'taken up');
  fighting.askGear({ kind: ASKS.wear, item: arms.id, slot: slotOf(arms.kind) });
  for (let nth = 0; nth < 30; nth++) tick();
  assert.equal(armsOf(gear), 'worn');
  // Where they took their arms up, down the step from where they woke.
  const [armsX, armsY] = armsAt(layout);
  room.putPlayer(armsX, armsY);
  for (let nth = 0; nth < 10; nth++) tick();
  const { at, facing } = boarderAt(layout, armsX, armsY);
  const id = room.standFoe(BOARDER.type, BOARDER.rank, ...at, facing, 1);
  assert.ok(room.storyHunt(id), 'sent at the player, as the run sends it');
  const freeze = new Freeze();
  const lessons: ('parry' | 'dodge')[] = ['parry', 'dodge'];
  const told: string[] = [];
  let guarding = 0;
  for (let nth = 0; nth < 60 * 90 && lessons.length > 0; nth++) {
    const foe = fighting.foes.get(id)?.view ?? null;
    const lesson = lessons[0] ?? null;
    // Frozen, the room stands still until the press; the player answers at once, and holds the guard a moment.
    const answered = freeze.holds(foe, fighting.player, lesson, fighting.parryOpen);
    if (answered) freeze.answer();
    if (answered && lesson === 'parry') guarding = 14;
    const own = fighting.own;
    const yaw = own && foe ? Math.atan2(foe.x - own.x, own.y - foe.y) : 0;
    tick(
      { guard: guarding > 0, guardPressed: answered && lesson === 'parry', dodge: answered && lesson === 'dodge' },
      yaw,
    );
    guarding = Math.max(0, guarding - 1);
    for (const event of fighting.takeEvents()) {
      if (event.defender !== fighting.player) continue;
      told.push(String(event.kind));
      const met = lesson === 'parry' ? [EVENT.parried] : [EVENT.dodged, EVENT.perfect];
      if ((met as readonly number[]).includes(event.kind)) lessons.shift();
    }
  }
  assert.deepEqual(lessons, [], `the events on the player: ${told.join(', ')}`);
});
