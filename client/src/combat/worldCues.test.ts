import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../content/audio/freesound.json' with { type: 'json' };
import { SPELLS } from '../network/artMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { Action } from '../rules/fighters.ts';
import { EVENT, HOW } from './cues.ts';
import {
  actionCue,
  airCue,
  eventCues,
  orbBurst,
  reloadCue,
  shotCue,
  spellCues,
  statusCues,
  stepCue,
  stepsBetween,
  struckCue,
  swingCue,
} from './worldCues.ts';

/** Arms codes as the combat crate packs them: the melee class, the shooting weapon a byte up, the left hand two. */
const arms = (melee: number, ranged = 0, offHand = 0) => melee | (ranged << 8) | (offHand << 16);
const [FISTS, DAGGER, SWORD, MACE, FLAIL, AXE, WARHAMMER, STAFF, GREATSWORD] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const [BOW, CROSSBOW, PISTOLET, THUNDERLOCK, PAIR] = [1, 2, 3, 4, 5];
const SHIELD = 1;

const event = (over: Partial<FightEvent>): FightEvent => ({
  tick: 1n,
  kind: EVENT.hit,
  how: 1,
  striker: 1,
  defender: 2,
  amount: 10,
  stroke: 1,
  ...over,
});
const cuesOf = (over: Partial<FightEvent>, striker = arms(SWORD), defender = 0, look = 0) =>
  eventCues(event(over), { striker, defender, look }).map(({ cue }) => cue);

test('a swing is light, heavy or a staff by the weapon swung', () => {
  for (const melee of [FISTS, DAGGER, SWORD, MACE]) assert.equal(swingCue(arms(melee)), 'swing.light');
  for (const melee of [FLAIL, AXE, WARHAMMER, GREATSWORD]) assert.equal(swingCue(arms(melee)), 'swing.heavy');
  assert.equal(swingCue(arms(STAFF)), 'swing.staff');
  assert.equal(swingCue(arms(SWORD, 0, SHIELD)), 'swing.light', 'the left hand does not change the swing');
});

test('a blow lands as what struck it: a blade cuts, the rest are blunt, a shot by its weapon, a spell as its cast', () => {
  for (const melee of [DAGGER, SWORD, AXE, GREATSWORD]) assert.deepEqual(cuesOf({}, arms(melee)), ['hit.blade']);
  for (const melee of [FISTS, MACE, FLAIL, WARHAMMER, STAFF]) assert.deepEqual(cuesOf({}, arms(melee)), ['hit.blunt']);
  assert.deepEqual(cuesOf({ how: HOW.riposte }), ['hit.blade'], 'a riposte is the blade too');
  assert.deepEqual(cuesOf({ how: HOW.shot }, arms(FISTS, BOW)), ['arrow.hit']);
  assert.deepEqual(cuesOf({ how: HOW.shot }, arms(FISTS, CROSSBOW)), ['arrow.hit']);
  assert.deepEqual(cuesOf({ how: HOW.shot }, arms(FISTS, THUNDERLOCK)), ['hit.blunt'], 'a ball strikes blunt');
  assert.deepEqual(cuesOf({ how: HOW.spell }), []);
});

test("a crit and an element's burst sound over the blow, never over a spell's", () => {
  assert.deepEqual(cuesOf({ crit: true }), ['hit.blade', 'crit']);
  assert.deepEqual(cuesOf({}, arms(SWORD), 0, 2), ['hit.blade', 'element.volt']);
  assert.deepEqual(cuesOf({ how: HOW.spell, crit: true }, arms(SWORD), 0, 1), ['crit']);
});

test('a guard by what holds it, a parry, a guard broken, a kill and its finisher, and a foe shield', () => {
  assert.deepEqual(cuesOf({ kind: EVENT.blocked }, arms(SWORD), arms(SWORD, 0, SHIELD)), ['block.shield']);
  assert.deepEqual(cuesOf({ kind: EVENT.blocked }, arms(SWORD), arms(AXE)), ['block.blade']);
  assert.deepEqual(cuesOf({ kind: EVENT.parried }), ['parry']);
  assert.deepEqual(cuesOf({ kind: EVENT.guardBroken }), ['guard.break']);
  assert.deepEqual(cuesOf({ kind: EVENT.killed }), ['kill']);
  assert.deepEqual(cuesOf({ kind: EVENT.killed }, arms(SWORD), 0, 3), ['kill', 'finish.cosmic']);
  assert.deepEqual(cuesOf({ kind: EVENT.shielded }), ['shield.hit']);
  assert.deepEqual(cuesOf({ kind: EVENT.shieldBroken }), ['shield.break']);
  assert.deepEqual(cuesOf({ kind: EVENT.dodged }), [], 'a dodge is heard as its roll');
  assert.ok(eventCues(event({ kind: EVENT.parried }), { striker: 0, defender: 0, look: 0 })[0]?.at === 'defender');
});

test('a shot by its weapon, the pair firing pistolets; a reload by its weapon, a bow none', () => {
  assert.deepEqual([BOW, CROSSBOW, PISTOLET, THUNDERLOCK, PAIR].map(shotCue), [
    'bow.shot',
    'crossbow.shot',
    'pistol.shot',
    'musket.shot',
    'pistol.shot',
  ]);
  assert.equal(shotCue(0), null);
  assert.deepEqual([BOW, CROSSBOW, PISTOLET, THUNDERLOCK, PAIR].map(reloadCue), [
    null,
    'crossbow.reload',
    'gun.reload',
    'gun.reload',
    'gun.reload',
  ]);
});

test('a stopped shot by what it met: stone rings to a ball, earth takes an arrow, water splashes either', () => {
  assert.equal(struckCue('stone', true), 'ball.hit');
  assert.equal(struckCue('ground', false), 'arrow.stick');
  assert.equal(struckCue('water', true), 'shot.splash');
  assert.equal(struckCue('water', false), 'shot.splash');
  assert.equal(struckCue('body', false), null, "a body's is the fight's word on the hit");
  assert.equal(struckCue('ground', true), null);
});

const idle: Action = { kind: 'idle' };
const swinging = (elapsed: number): Action => ({
  kind: 'attack',
  stroke: 1,
  elapsed,
  strike: 10,
  end: 20,
  swing: 'plain',
  leftHand: false,
});
const windingUp = (elapsed: number, over: Partial<Extract<Action, { kind: 'telegraph' }>> = {}): Action => ({
  kind: 'telegraph',
  shape: 'slam',
  elapsed,
  windup: 40,
  origin: [0, 0, 0],
  bearing: 0,
  ahead: 2,
  iron: false,
  feintAt: null,
  ...over,
});

test("a fighter's action: a swing as it sweeps to its blow, a wound-up blow as it lands, a roll, a draw, a reload", () => {
  assert.equal(actionCue(idle, swinging(1), arms(AXE)), null, 'not as it is raised');
  assert.equal(actionCue(swinging(8), swinging(10), arms(AXE)), 'swing.heavy', 'as its blow lands');
  const rush = () => 3;
  assert.equal(actionCue(swinging(6), swinging(7), arms(AXE), rush), 'swing.heavy', 'its rush ahead of the blow');
  assert.equal(actionCue(swinging(7), swinging(9), arms(AXE), rush), null, 'once a swing');
  assert.equal(
    actionCue(swinging(18), swinging(0), arms(AXE), () => 12),
    'swing.heavy',
    'a rush longer than the raise',
  );
  assert.equal(actionCue(swinging(5), { kind: 'dodge', elapsed: 0, toward: [0, 1] }, 0), 'roll', 'cut short, no swing');
  assert.equal(actionCue(idle, swinging(18), arms(AXE)), null, 'first seen well past its blow');
  assert.equal(actionCue(windingUp(37), idle, arms(MACE)), 'swing.light');
  assert.equal(actionCue(windingUp(10), { kind: 'staggered', left: 9, cause: 'poise' }, 0), null, 'cut short');
  assert.equal(actionCue(windingUp(37, { feintAt: 30 }), idle, 0), null, 'a feint');
  assert.equal(actionCue(windingUp(39, { shape: 'aimed' }), idle, 0), null, 'a shot is heard as its shot');
  assert.equal(actionCue(idle, { kind: 'dodge', elapsed: 0, toward: [0, 1] }, 0), 'roll');
  assert.equal(actionCue(idle, { kind: 'draw', elapsed: 0 }, arms(FISTS, BOW)), 'bow.draw');
  assert.equal(actionCue(idle, { kind: 'draw', elapsed: 0 }, arms(FISTS, PISTOLET)), null);
  assert.equal(actionCue(idle, { kind: 'reload', left: 30 }, arms(FISTS, CROSSBOW)), 'crossbow.reload');
});

test('a jump as the body rises, a landing only after a real fall', () => {
  let air = airCue(null, 'air', 0);
  assert.equal(air.cue, null, 'not yet risen');
  air = airCue(air.air, 'air', 0.3);
  assert.equal(air.cue, 'jump');
  air = airCue(air.air, 'air', 1.1);
  assert.equal(air.cue, null, 'once');
  assert.equal(airCue(air.air, 'ground', 0).cue, 'land');
  const kerb = airCue(airCue(null, 'air', 0.25).air, 'air', 0.1);
  assert.equal(airCue(kerb.air, 'ground', 0).cue, null, 'a step off a kerb');
  assert.equal(airCue(air.air, 'hang', 1).cue, null, 'a ledge caught');
});

test('a footstep each step walked, at its middle', () => {
  assert.equal(stepsBetween(0, 1.2), 0);
  assert.equal(stepsBetween(1.2, 1.3), 1);
  assert.equal(stepsBetween(1.3, 3.7), 0);
  assert.equal(stepsBetween(3.7, 8.7), 2);
  assert.equal(stepsBetween(5, 5), 0);
});

test('a footstep on wood, stone, in water or on the ground', () => {
  const crate = { minX: 0, minY: 0, maxX: 2, maxY: 2, top: 1 };
  const wall = { minX: 10, minY: 0, maxX: 12, maxY: 2, top: 3 };
  const ground = { blocks: [crate, wall], wooden: [crate], groundAt: (x: number) => (x < -5 ? -0.3 : 0) };
  assert.equal(stepCue([1, 1, 1], ground), 'step.wood');
  assert.equal(stepCue([11, 1, 3], ground), 'step.stone');
  assert.equal(stepCue([11, 1, 0], ground), 'step.ground', 'beside a block, not on it');
  assert.equal(stepCue([-8, 0, -0.3], ground), 'step.water');
  assert.equal(stepCue([-8, 0, 0], { blocks: [] }), 'step.ground', 'no land is open ground at 0 m');
});

test('a status as it is given, not while it lasts, and Exposed, Charged and Haste with no sound', () => {
  assert.deepEqual(statusCues({}, { linked: 30, haste: 0 }), ['status.linked']);
  assert.deepEqual(statusCues({ linked: 30 }, { linked: 29, veiled: 5, expose: 2, charge: 1, haste: 4 }), [
    'status.veil',
  ]);
});

test("a spell as it appears, an Anima with its Art's release, and an orb that bursts before its time", () => {
  assert.deepEqual(spellCues(SPELLS.tempest), ['spell.tempest', 'anima.storm']);
  assert.deepEqual(spellCues(SPELLS.sunwell), ['spell.sunwell', 'anima.divine']);
  assert.deepEqual(spellCues(SPELLS.duskraven), ['spell.duskraven', 'spell.duskraven.fire', 'anima.shadow']);
  assert.deepEqual(spellCues(SPELLS.bolt), ['spell.ravenbolt']);
  assert.ok(orbBurst(SPELLS.tempest, 30, 240));
  assert.ok(!orbBurst(SPELLS.tempest, 239, 240), 'spent at its time');
  assert.ok(!orbBurst(SPELLS.bolt, 30, 240));
});

test('every cue the world can play is one the Freesound list searches for', () => {
  const searched = new Set(listed.cues.map((cue) => cue.id));
  const possible = new Set<string>([
    'weapon.draw',
    'weapon.sheathe',
    'gun.empty',
    'cast.charge',
    'spell.orb',
    'drop.land',
    'ammo.refill',
    'foe.alert',
    'respawn',
    'jump',
    'land',
  ]);
  const add = (cue: string | null) => cue && possible.add(cue);
  for (let melee = 0; melee <= 8; melee++) add(swingCue(arms(melee)));
  for (let ranged = 1; ranged <= 5; ranged++) [shotCue(ranged), reloadCue(ranged)].forEach(add);
  for (const surface of ['body', 'ground', 'stone', 'water'] as const)
    for (const ball of [false, true]) add(struckCue(surface, ball));
  for (const kind of Object.values(EVENT))
    for (const how of Object.values(HOW))
      for (const look of [0, 1, 2, 3])
        for (const striker of [arms(SWORD), arms(MACE), arms(FISTS, BOW), arms(FISTS, PISTOLET)])
          cuesOf({ kind, how, crit: true }, striker, arms(SWORD, 0, SHIELD), look).forEach(add);
  cuesOf({ kind: EVENT.blocked }).forEach(add);
  for (const kind of Object.values(SPELLS)) spellCues(kind).forEach(add);
  statusCues({}, { crit: 1, expose: 1, charge: 1, haste: 1, linked: 1, veiled: 1 }).forEach(add);
  for (const ground of [
    [1, 1, 1],
    [11, 1, 3],
    [-8, 0, -0.3],
    [40, 40, 0],
  ] as const) {
    const crate = { minX: 0, minY: 0, maxX: 2, maxY: 2, top: 1 };
    const blocks = [crate, { minX: 10, minY: 0, maxX: 12, maxY: 2, top: 3 }];
    add(stepCue(ground, { blocks, wooden: [crate], groundAt: (x) => (x < -5 ? -1 : 0) }));
  }
  add(actionCue(idle, { kind: 'dodge', elapsed: 0, toward: [0, 1] }, 0));
  add(actionCue(idle, { kind: 'draw', elapsed: 0 }, arms(FISTS, BOW)));
  for (const cue of possible) assert.ok(searched.has(cue), `${cue} is searched for`);
  // The interface's, the ambience's, the ships', the story's and the sea fight's cues are each checked where they play.
  const world = listed.cues.map((cue) => cue.id).filter((id) => !/^(ui|hold|gain|ship|amb|story|sea)\./.test(id));
  assert.deepEqual(
    world.filter((id) => !possible.has(id)),
    [],
    'and every one searched for plays somewhere',
  );
});
