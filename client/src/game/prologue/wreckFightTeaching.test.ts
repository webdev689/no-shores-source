import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT } from '../../combat/cues.ts';
import type { GearState } from '../../network/gearMessages.ts';
import type { FightEvent } from '../../network/messages.ts';
import { WORN } from '../../player/gear.ts';
import type { Dress } from '../../player/dressing.ts';
import type { InputFrame } from '../../player/input.ts';
import type { FighterView } from '../../rules/fighters.ts';
import { setGearScreenOpen } from '../gearScreen.ts';
import type { Shot } from '../camera.ts';
import { armouredDress, FIRST_LOOK } from './look.ts';
import type { Nameplate } from './nameplate.ts';
import { reminder } from './tutorial.ts';
import type { WreckRun } from './wreckRun.ts';
import { WreckFight } from './wreckFight.ts';
import { FOOT_VIEW, layout, recorded, scenery, tick } from './wreckForTests.ts';
import { ARMS_ITEM } from './wreckTeaching.ts';

/** A run the teaching can be walked through: its arms, the boarder, the player's action and the frame's events as
 *  `state` holds them; each frame's options, each boarder stood and each word on the waves written down. */
function taughtRun(state: {
  arms: string;
  boarder: string;
  view: FighterView | null;
  action: string;
  events: FightEvent[];
  fell?: readonly number[];
}): {
  run: WreckRun;
  frames: { frozen?: boolean; paused: boolean }[];
  stood: number[];
  waves: boolean[];
  dropped: (readonly number[])[];
  hunts: number[];
} {
  const [frames, stood, waves] = [[] as { frozen?: boolean; paused: boolean }[], [] as number[], [] as boolean[]];
  const hunts: number[] = [];
  const dropped: (readonly number[])[] = [];
  /** A forge that draws the iron sword and shield and no armour, as gear dresses a figure. */
  const sets = { helm: [], pauldrons: [], cuirass: [], gauntlets: [], greaves: [], boots: [] };
  const wardrobe = { sets, garments: [], right: ['sword_iron'], left: ['shield_kite_iron'], hairStyles: [] };
  const shot = { eye: [0, 0, 5], yaw: 0, pitch: 0, fov: 1, near: 0.1, far: 500 } as unknown as Shot;
  const run = {
    frame: (controls: unknown, seconds: number, clock: number, options: { frozen?: boolean; paused: boolean }) => {
      frames.push(options);
      const events = state.events;
      state.events = [];
      const own = { action: { kind: state.action }, health: 50, x: 0, y: 0 };
      return {
        fight: { own, player: 1, events, foes: [] },
        shot,
        hints: { title: '', hints: [] },
        standing: { kind: 'inside' },
        figures: [],
      };
    },
    arena: false,
    boss: null,
    outcome: null,
    heads: () => new Map(),
    beginBoss: () => undefined,
    fight: {
      player: 1,
      parryOpen: true,
      own: { action: { kind: 'idle' }, mode: 'ground', health: 50, stamina: 50, x: 0, y: 0, facing: 0, aim: 0 },
    },
    get gear() {
      const where = state.arms === 'worn' ? WORN : 0;
      return { items: state.arms === 'lying' ? [] : [{ ...ARMS_ITEM, at: where }] } as unknown as GearState;
    },
    forge: { wardrobe: () => wardrobe },
    storyArms: {
      get arms() {
        return state.arms;
      },
      bow: 'none',
      dropBow(fell: readonly number[]) {
        dropped.push(fell);
        this.bow = 'lying';
      },
    },
    get boarderPlace() {
      return state.boarder === 'fallen' ? (state.fell ?? [1, 2, 3]) : null;
    },
    get boarder() {
      return state.boarder;
    },
    get boarderView() {
      return state.view;
    },
    standBoarder: () => {
      stood.push(1);
      state.boarder = 'standing';
    },
    holdWaves: (held: boolean) => waves.push(held),
    boarderId: 7,
    openRoom: { story: (ask: { ask: string; foe?: number }) => Promise.resolve(ask.foe && hunts.push(ask.foe)) },
  } as unknown as WreckRun;
  return { run, frames, stood, waves, dropped, hunts };
}

test('the teaching on the wreck: bare hands until the arms are worn, a boarder once ready, its blows frozen to teach', async () => {
  const body = { x: 0, y: 0, z: 2, vx: 0, vy: 0, vz: 0, mode: 'ground' };
  const armed = armouredDress(FIRST_LOOK);
  const walker = {
    you: { dress: armed as Dress | null },
    player: { body, yaw: 0, loadout: 0 },
    inFirstPerson: false,
    ridesIn: () => undefined,
  };
  const { story, calls } = recorded(FOOT_VIEW, { walker }, armed);
  const state = {
    arms: 'lying',
    boarder: 'none',
    view: null as FighterView | null,
    action: 'idle',
    events: [] as FightEvent[],
  };
  const { run, frames, stood, waves, dropped, hunts } = taughtRun(state);
  const fight = new WreckFight(story, layout, scenery, Promise.resolve(run), {} as Nameplate);
  await Promise.resolve();
  const step = (seconds = 0.1, controls: Partial<InputFrame> = {}) =>
    fight.frame({ ...tick(seconds), controls: { ...tick(0).controls, pressed: () => false, ...controls } });
  const onFor = (seconds: number) => {
    for (let held = 0; held < seconds; held += 0.5) step(0.5);
  };
  step();
  assert.equal(walker.you.dress?.outfit.right, null, 'woken bare-handed');
  state.arms = 'carried';
  onFor(2);
  setGearScreenOpen(true);
  state.arms = 'worn';
  step();
  assert.equal(frames.at(-1)?.paused, true, "over the menu the player's presses rest");
  setGearScreenOpen(false);
  assert.equal(walker.you.dress?.outfit.right, 'sword_iron', 'once worn, the sword their gear has in hand');
  assert.equal(story.dress.outfit.right, 'sword_iron', 'and in the story after the wreck');
  onFor(2);
  Object.assign(body, { x: 3, vx: 7, mode: 'air', vz: 1 });
  walker.player.yaw = 1.2;
  onFor(2);
  Object.assign(body, { vx: 0, mode: 'ground', vz: 0 });
  for (const action of ['attack', 'guard']) {
    state.action = action;
    step();
  }
  state.action = 'idle';
  state.events = [{ kind: EVENT.healed, striker: 1, defender: 1 } as FightEvent];
  onFor(2);
  assert.ok(waves.every(Boolean), 'the waves wait');
  assert.deepEqual(stood, [1], 'a boarder stands once the player is ready');
  // Its first blow, 6 ticks from landing: frozen, the prompt up, the world drained.
  const blow = (left: number) =>
    ({ target: 1, x: 0, y: -2, action: { kind: 'attack', elapsed: 20 - left, strike: 20 } }) as unknown as FighterView;
  state.view = blow(6);
  const frozen = step();
  assert.equal(frames.at(-1)?.frozen, true, 'the fight frozen');
  assert.ok(fight.still, 'its world held still with it');
  assert.ok(calls.includes('stage.parts.screen.showPrompt(Press F to parry)'));
  assert.ok((frozen?.drain ?? 0) > 0, 'the world drains toward grey');
  step(0.1, { locked: true, pressed: (key) => key === 'dodge' });
  assert.equal(frames.at(-1)?.frozen, true, 'a dodge does not answer it');
  step(0.1, { locked: true, pressed: (key) => key === 'guard' });
  assert.equal(frames.at(-1)?.frozen, false, 'F answers it, and the blow plays on');
  assert.ok(!fight.still);
  state.view = null;
  state.events = [{ kind: EVENT.parried, striker: 2, defender: 1 } as FightEvent];
  step();
  state.view = blow(9);
  step();
  assert.ok(calls.includes('stage.parts.screen.showPrompt(Press V to dodge)'), 'the next blow frozen for the dodge');
  step(0.1, { locked: true, pressed: (key) => key === 'dodge' });
  state.view = null;
  state.events = [{ kind: EVENT.perfect, striker: 2, defender: 1 } as FightEvent];
  step();
  step();
  assert.ok(calls.includes(`stage.parts.hud.toast(${reminder()})`), 'then the reminder');
  assert.deepEqual(hunts, [], 'a boarder fighting the player is left to it');
  state.view = { ...blow(30), target: null } as FighterView;
  step();
  assert.deepEqual(hunts, [], 'nor one that turned away from a player who never fell');
  state.action = 'dead';
  step();
  assert.deepEqual(hunts, [], 'nor at a player lying dead');
  state.action = 'idle';
  for (let nth = 0; nth < 12; nth++) step();
  assert.deepEqual(hunts, [7, 7], 'one that has stopped, as the player rose, is sent at them again, once a second');
  state.view = blow(30);
  for (let nth = 0; nth < 12; nth++) step();
  assert.deepEqual(hunts, [7, 7], 'once it fights the player again it is sent no more');
  state.view = { ...blow(30), target: null } as FighterView;
  for (let nth = 0; nth < 12; nth++) step();
  assert.deepEqual(hunts, [7, 7], 'nor when it turns away again from a player who has not fallen since');
  state.view = null;
  state.boarder = 'fallen';
  onFor(2);
  assert.deepEqual(dropped, [[1, 2, 3]], 'the boarder down, its bow drops where it fell, once');
  Object.assign(state, { boarder: 'standing', fell: [4, 5, 6] });
  step();
  state.boarder = 'fallen';
  onFor(1);
  assert.deepEqual(dropped, [[1, 2, 3]], 'a boarder brought down after it drops none');
  // Past the duel a player who falls and rises is no one a boarder is sent at.
  Object.assign(state, { boarder: 'standing', view: { ...blow(30), target: null }, action: 'dead' });
  step();
  state.action = 'idle';
  for (let nth = 0; nth < 12; nth++) step();
  assert.deepEqual(hunts, [7, 7], 'sent again only in the duel');
  Object.assign(state, { boarder: 'fallen', view: null });
  onFor(1);
  assert.equal(waves.at(-1), true, 'the waves wait for the bow and the Storm');
  assert.deepEqual(stood, [1], 'no other boarder');
});
