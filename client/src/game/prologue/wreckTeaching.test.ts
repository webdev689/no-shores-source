import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { EVENT } from '../../combat/cues.ts';
import { Fighting } from '../../combat/fighting.ts';
import { ALL_EARNED, earnedOf } from '../../network/artMessages.ts';
import { ASKS, type GearState } from '../../network/gearMessages.ts';
import { LocalRoom } from '../../network/localRoom.ts';
import { storyOn } from '../../network/roomServe.ts';
import type { Cards } from '../../player/cards.ts';
import { slotOf, WORN } from '../../player/gear.ts';
import type { Picture } from '../../player/picture.ts';
import { startCombatRules } from '../../rules/combatRules.ts';
import type { MovementRules } from '../../rules/movementRules.ts';
import { armouredDress, FIRST_LOOK } from './look.ts';
import { DodgeWatch, Freeze, ticksToLand } from './tutorial.ts';
import { courseOf, inArea, readWreck, topAt } from './wreckLayout.ts';
import { IN_THE_SEA_M } from './wreckProgress.ts';
import {
  ARMS_ITEM,
  armsAt,
  armsOf,
  ARMS_ALONG_M,
  BOARDER,
  boarderAt,
  BOW,
  BOW_ITEM,
  LyingArms,
  STORM,
  SWORD_AND_SHIELD,
} from './wreckTeaching.ts';

const layout = readWreck();
const course = courseOf(layout);
const [wakeX, wakeY] = layout.wake.at;
const quiet = layout.zones[0]?.area ?? [0, 0, 0, 0];

/** A forge that draws each weapon's large picture a plain block, its swords and kite shields in iron and steel, and
 *  writes down each picture it made a card of. */
function forged(): { forge: Cards; carded: Picture[] } {
  const carded: Picture[] = [];
  const art = (width: number): Picture => ({ width, height: 12, pixels: new Uint8ClampedArray(width * 48).fill(255) });
  const forge = {
    wardrobe: () => ({
      right: ['sword_iron', 'sword_steel', 'bow_short_iron'],
      left: ['shield_kite_iron', 'shield_kite_steel'],
      garments: [],
      hairStyles: [],
    }),
    draws: () => true,
    picture: () => Promise.resolve(null),
    weaponArt: (dress: unknown, layer: string, share = 1) => Promise.resolve(art(Math.round(64 * share))),
    cardOf: (picture: Picture) => {
      carded.push(picture);
      // Its root where the forge's cards keep one with none of their own: the middle of its foot.
      const root = [picture.width / 2, picture.height];
      return { texture: { destroy: () => undefined }, width: picture.width, height: picture.height, root };
    },
  } as unknown as Cards;
  return { forge, carded };
}

test("the player's sword and shield lie out on the quiet deck, well ahead of where they wake", () => {
  const [x, y, z] = armsAt(layout);
  assert.ok(inArea(quiet, x, y), 'on the quiet deck');
  assert.ok(z > IN_THE_SEA_M && z === topAt(course, x, y), 'on its planks, not in the sea');
  const away = Math.hypot(x - wakeX, y - wakeY);
  assert.ok(away > 6 && away <= ARMS_ALONG_M, `${away.toFixed(2)} m from where they wake`);
  const { facing } = layout.wake;
  const ahead = (x - wakeX) * Math.sin(facing) - (y - wakeY) * Math.cos(facing);
  assert.ok(ahead / away > Math.cos(Math.PI / 4), 'ahead of them as they stand, as play begins');
  const arms = new LyingArms(ARMS_ITEM, armsAt(layout), forged().forge);
  assert.ok(arms.reached([x + 1, y, z]) && !arms.reached([x + 2, y, z]), 'taken up by walking over them');
});

test('the arms on the deck are the item itself, drawn once, moving as a drop: popped up, settled, hovering', async () => {
  const { forge, carded } = forged();
  const arms = new LyingArms(ARMS_ITEM, armsAt(layout), forge);
  const body = armouredDress(FIRST_LOOK);
  const [x, y, deck] = armsAt(layout);
  assert.equal(arms.figure(body, 0), null, 'nothing until the forge has drawn it');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const first = arms.figure(body, 10);
  assert.ok(first, 'then the item');
  assert.ok(Math.abs(first.z - deck) < 0.01, `popped from the planks: its foot ${(first.z - deck).toFixed(2)} m up`);
  assert.ok(!first.facesEye && first.hovers, 'upright, turned to the eye, and hovering with no shade under it');
  assert.equal(first.scale, 1 / 4, "the forge draws a weapon four times a figure's pixels a metre");
  const eye = [x, y - 6, deck + 1.6] as const;
  const unlit: number[] = [];
  arms.mark(unlit, 10, eye);
  assert.equal(unlit.length, 0, 'no line while it pops');
  const popped = arms.figure(body, 10.3);
  assert.ok(popped && popped.z > first.z + 0.3, 'popped up from where it lay');
  const resting = [12, 12.4, 12.8].map((clock) => arms.figure(body, clock)?.z ?? 0);
  assert.ok(
    resting.every((z) => z > deck && z < deck + 0.5),
    'hovering over the deck',
  );
  assert.ok(Math.max(...resting) - Math.min(...resting) > 0.01, 'bobbing');
  const lit: number[] = [];
  arms.mark(lit, 12.8, eye);
  assert.ok(lit.length > 0, "a drop's line of light over it once it rests");
  assert.equal(carded.length, 1, 'one card, made once');
  assert.ok((carded[0]?.width ?? 0) > 64, "the sword with the shield behind it, as a loadout's picture");
});

test('the bow lies where the boarder fell, drawn as the bow itself and taken up by walking over it', async () => {
  const { forge, carded } = forged();
  const fell = [-20, -8.5, topAt(course, -20, -8.5)] as const;
  const bow = new LyingArms(BOW_ITEM, fell, forge);
  assert.ok(bow.reached([fell[0] + 0.5, fell[1], fell[2]]) && !bow.reached([fell[0] + 2, fell[1], fell[2]]));
  bow.figure(armouredDress(FIRST_LOOK), 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const shown = bow.figure(armouredDress(FIRST_LOOK), 1);
  assert.ok(shown && Math.hypot(shown.x - fell[0], shown.y - fell[1]) < 0.01, 'where it fell');
  assert.equal(carded.length, 1, 'its picture made once');
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
  assert.ok(room.storyTake(SWORD_AND_SHIELD));
  // The room's word on the gear comes within the second.
  room.pump(1);
  assert.equal(armsOf(gear), 'carried');
  const given = (gear as GearState | null)?.items.find((item) => item.kind === SWORD_AND_SHIELD);
  assert.deepEqual(
    given && [given.kind, given.rarity, given.level, given.bucket],
    [ARMS_ITEM.kind, ARMS_ITEM.rarity, ARMS_ITEM.level, ARMS_ITEM.bucket],
    'the item the deck shows is the item the room gives',
  );
  assert.ok(!room.storyTake(SWORD_AND_SHIELD), 'taken once');
  const sent = gear as GearState | null;
  assert.ok(sent);
  assert.equal(armsOf({ ...sent, items: sent.items.map((item) => ({ ...item, at: WORN })) }), 'worn');
});

test('on the wreck the room dresses the player in the story’s steel, gives its bow once and then the Storm', async () => {
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
  const held = () => (gear as GearState | null)?.items ?? [];
  const armour = held().filter((item) => item.at >= WORN && item.bucket >= 3 && item.bucket <= 5);
  assert.deepEqual(
    armour.map((item) => [item.bucket, item.rarity, item.level, item.story]),
    [3, 4, 5].map((slot) => [slot, 0, 1, true]),
    'torso, arms and legs worn, the story’s own',
  );
  assert.equal(armsOf(gear, BOW), 'lying');
  assert.equal((gear as GearState | null)?.arts?.art ?? 0, 0, 'no Art yet');
  assert.ok(room.storyTake(BOW));
  assert.ok(!room.storyTake(BOW), 'taken once');
  room.pump(1);
  const bow = held().find((item) => item.kind === BOW);
  assert.deepEqual(
    bow && [bow.kind, bow.rarity, bow.level, bow.bucket, bow.story],
    [BOW_ITEM.kind, BOW_ITEM.rarity, BOW_ITEM.level, BOW_ITEM.bucket, true],
    'the bow the deck shows is the bow the room gives',
  );
  assert.ok(room.storyStorm());
  room.pump(1);
  const arts = (gear as GearState | null)?.arts;
  assert.equal(arts?.art, STORM, 'the Storm worn');
  assert.deepEqual([arts?.anima, ...(arts?.tenets ?? [])], [1, 1, 1], 'charged full');
  assert.equal(earnedOf(arts, STORM), ALL_EARNED, 'its Anima and both Tenets earned');
});

const TICK = 1 / 60;

/** The quiet deck's duel as the run plays it: the player armed where they took their arms up, the boarder stood at the
 *  far end and sent at them. Each tick presses the buttons given, a dodge going to the right, or with `back` straight
 *  back from where they face. */
async function duel() {
  const compiled = new WebAssembly.Module(await readFile(MODULE));
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
  type Buttons = { guard?: boolean; guardPressed?: boolean; dodge?: boolean; back?: boolean };
  const tick = ({ back, ...buttons }: Buttons = {}, yaw = 0) => {
    fighting.press({ swing: false, shoot: false, guard: false, dodge: false, pitch: 0, ...buttons });
    const [forward, sideways] = buttons.dodge ? (back ? [-1, 0] : [0, 1]) : [0, 0];
    const controls = { forward, sideways, yaw, run: false, jump: false, crouch: false };
    steps.step({} as never, { ...controls, mounted: false });
    room.pump(TICK);
  };
  tick();
  assert.ok(room.storyTake(SWORD_AND_SHIELD));
  for (let nth = 0; nth < 30; nth++) tick();
  const arms = (gear as GearState | null)?.items.find((item) => item.kind === SWORD_AND_SHIELD);
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
  return { room, fighting, tick, id };
}

test("frozen on the boarder's blow, a guard pressed parries it; frozen on the next, a dodge dodges it", async () => {
  const { fighting, tick, id } = await duel();
  const freeze = new Freeze();
  const lessons: ('parry' | 'dodge')[] = ['parry', 'dodge'];
  // Each freeze the player answered, by its lesson: one each, the first answer meeting it.
  const answers: string[] = [];
  const told: string[] = [];
  let guarding = 0;
  for (let nth = 0; nth < 60 * 90 && lessons.length > 0; nth++) {
    const foe = fighting.foes.get(id)?.view ?? null;
    const lesson = lessons[0] ?? null;
    // Frozen, the room stands still until the press; the player answers at once, and holds the guard a moment.
    const teaching = { player: fighting.player, own: fighting.own, lesson, parryOpen: fighting.parryOpen };
    const frozen = freeze.holds(foe, teaching);
    const answer = { locked: true, guard: lesson === 'parry', dodge: lesson === 'dodge' };
    const answered = frozen && !freeze.frame(foe, teaching, () => answer);
    if (answered && lesson) answers.push(lesson);
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
  assert.deepEqual(answers, ['parry', 'dodge'], 'each met at its first freeze');
});

test('a dodge that carries the player clear of the blow, out of its reach, is a dodge the lesson counts', async () => {
  const { fighting, tick, id } = await duel();
  const freeze = new Freeze();
  const watch = new DodgeWatch();
  const answers: number[] = [];
  const told: string[] = [];
  let met: number | null = null;
  for (let nth = 0; nth < 60 * 60 && met === null; nth++) {
    const foe = fighting.foes.get(id)?.view ?? null;
    const teaching = { player: fighting.player, own: fighting.own, lesson: 'dodge' as const, parryOpen: false };
    const frozen = freeze.holds(foe, teaching);
    const answered = frozen && !freeze.frame(foe, teaching, () => ({ locked: true, guard: false, dodge: true }));
    if (answered) answers.push(nth);
    const own = fighting.own;
    const yaw = own && foe ? Math.atan2(foe.x - own.x, own.y - foe.y) : 0;
    tick({ dodge: answered, back: true }, yaw);
    const events = fighting.takeEvents();
    told.push(...events.filter((event) => event.defender === fighting.player).map((event) => String(event.kind)));
    if (watch.frame(fighting.foes.get(id)?.view ?? null, fighting.own, fighting.player, events, TICK)) met = nth;
  }
  assert.notEqual(met, null, `the events on the player: ${told.join(', ')}`);
  assert.equal(answers.length, 1, 'met at its first freeze');
});

test('the bow lying shows its line of light as the sword and shield do, and is drawn larger to be seen', async () => {
  const { forge } = forged();
  const place = armsAt(layout);
  const [sword, bow] = [new LyingArms(ARMS_ITEM, place, forge), new LyingArms(BOW_ITEM, place, forge)];
  const body = armouredDress(FIRST_LOOK);
  for (const lying of [sword, bow]) lying.figure(body, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const [swordCard, bowCard] = [sword.figure(body, 10), bow.figure(body, 10)];
  for (const lying of [sword, bow]) lying.figure(body, 13);
  const eye = [place[0], place[1] - 6, place[2] + 1.6] as const;
  const [swordLine, bowLine]: number[][] = [[], []];
  sword.mark(swordLine, 13, eye);
  bow.mark(bowLine, 13, eye);
  assert.ok(bowLine.length > 0, 'the bow has its line of light');
  assert.equal(bowLine.length, swordLine.length, 'as the sword and shield have');
  assert.equal(bowCard?.scale, (swordCard?.scale ?? 0) * 1.5, 'the thin bow half again its size, to read far off');
});

test('a boarder that stopped as the player fell comes for them again once sent, as the run sends it', async () => {
  const { room, fighting, tick, id } = await duel();
  // Blows landing at the player, before they fall and after they rise; the run's ask made once a second.
  const blows = { before: 0, after: 0 };
  let [left, rose, asked]: [number | null, number | null, number] = [null, null, -Infinity];
  for (let nth = 0; nth < 60 * 60 && blows.after < 2; nth++) {
    const foe = fighting.foes.get(id)?.view ?? null;
    const now = foe ? ticksToLand(foe, fighting.player) : null;
    if (left !== null && left > 0 && (now === null || now <= 0)) blows[rose === null ? 'before' : 'after'] += 1;
    left = now;
    const own = fighting.own;
    if (rose === null && blows.before > 0 && own?.action.kind === 'dead') rose = -1;
    if (rose === -1 && own && own.action.kind !== 'dead') {
      rose = nth;
      // Risen at the checkpoint up on the quarterdeck, which no foe climbs to, they come back down to it.
      const [armsX, armsY] = armsAt(layout);
      room.putPlayer(armsX, armsY);
    }
    const stopped = rose !== null && rose >= 0 && own && own.health > 0 && foe && foe.target !== fighting.player;
    if (stopped && rose !== null && nth - asked >= 60) {
      if (nth - rose < 120) assert.equal(foe.target, null, 'with no one to fight once the player rose');
      asked = nth;
      assert.equal(storyOn(room, { ask: 'hunt', foe: id }), 1, 'sent at them');
    }
    const yaw = own && foe ? Math.atan2(foe.x - own.x, own.y - foe.y) : 0;
    tick({}, yaw);
    fighting.takeEvents();
  }
  assert.ok(rose !== null && rose >= 0, `the player fell to its blows and rose (${blows.before} landed)`);
  assert.equal(blows.after, 2, 'its blows come again');
});
