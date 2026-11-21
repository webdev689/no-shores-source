import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEEL, type Feel } from '../combat/attackFeel.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import { item, state as gearState, standing } from '../network/gearForTests.ts';
import { AIM, type AimPlace } from '../player/playerCamera.ts';
import { AimPanel } from './aimPanel.ts';
import { artsNodes, levelAsk } from './artsPanel.ts';
import { FeelPanel } from './feelPanel.ts';
import { GearPanel } from './gearPanel.ts';
import { Panel, type PanelHandlers, roomLine } from './panel.ts';
import { panels, sides } from './panelKit.ts';
import { SAMPLE_HAIR, SAMPLE_LOOKS, SAMPLE_ROSTER, sampleFigures } from './panelShots.ts';
import { Driven } from './panelsForTests.ts';
import { statusAsk, statusNodes } from './statusPanel.ts';

test('the panels stand either side of the view: 22% and 24% of it, within their bounds', () => {
  assert.deepEqual(sides(1280), { left: 282, right: 307 });
  assert.deepEqual(sides(800), { left: 220, right: 240 });
  assert.deepEqual(sides(2560), { left: 320, right: 360 });
  const driven = new Driven((ui) => [{ width: 1280, height: 600, children: [panels(ui, [], [])] }]);
  assert.equal(driven.ui.boxOf('tg:left')?.width, 281, 'its line beside it');
  assert.equal(driven.ui.boxOf('tg:right')?.x, 1280 - 307 + 1);
  driven.frame([]);
  assert.ok(driven.ui.takes(10, 10) && driven.ui.takes(1270, 10), 'the panels take the pointer');
  assert.ok(!driven.ui.takes(640, 300), 'the view between them is the world’s');
});

test('a status is given on every foe for the seconds typed', () => {
  const asked: GearAsk[] = [];
  const driven = new Driven((ui) => statusNodes(ui, (ask) => asked.push(ask)));
  driven.type('tg:status:seconds', '2.5');
  driven.press('tg:status:foes:expose');
  assert.deepEqual(asked, [statusAsk(1, true, 2.5)]);
});

const handlers = (heard: string[]): PanelHandlers => ({
  add: () => heard.push('add'),
  remove: () => heard.push('remove'),
  choose: (id) => heard.push(`choose ${id}`),
  change: () => heard.push('change'),
  fps: (value) => heard.push(`fps ${value}`),
  act: (anim) => heard.push(`act ${anim}`),
  wear: (kind) => heard.push(`wear ${kind}`),
  carry: (light) => heard.push(`carry ${light}`),
  fight: (foe, level) => heard.push(`fight ${JSON.stringify(foe)} ${level}`),
});

test('the foes panel stands the faction, type and rank picked, at the level typed, each list following the last', () => {
  const heard: string[] = [];
  const panel = new Panel(SAMPLE_ROSTER, handlers(heard));
  const figures = sampleFigures();
  const state = {
    looks: SAMPLE_LOOKS,
    hair: SAMPLE_HAIR,
    figures,
    remote: new Set<never>(),
    chosen: figures[1] ?? null,
    fps: 6,
    playerId: 1,
    worn: null,
    light: null,
    playing: false,
    status: '',
  };
  const driven = new Driven((ui) => panel.node(ui, state));
  driven.pick('tg:foe:faction', '2');
  assert.ok(driven.has('tg:foe:type') && !driven.has('tg:foe:type:1'), 'the list closed');
  driven.pick('tg:foe:rank', '2');
  driven.type('tg:foe:level', '45');
  driven.pick('tg:foe:shield', '1');
  driven.press('tg:foe:spawn');
  assert.deepEqual(
    heard,
    ['fight {"type":3,"rank":2,"shield":1} 30'],
    'the Grey Tithe’s only type, its level held to 30',
  );
  driven.press('tg:fig:1');
  driven.pick('tg:fig:move', 'attack');
  assert.deepEqual(heard.slice(1), ['choose 1', 'change']);
  assert.equal(figures[1]?.anim, 'attack');
  driven.press('tg:dress:garment:shirt_linen');
  assert.equal(figures[1]?.dress.outfit.garments.at(-1), 'shirt_linen', 'a garment ticked is worn last');
});

test('the gear panel opens an item’s nodes, feeds a Fruit of Dagon only once held, and says the room’s answer', () => {
  const asked: GearAsk[] = [];
  const panel = new GearPanel((ask) => asked.push(ask));
  const column = { kind: 0, traits: ['a', 'b'], xp: 100, aurem: 0, fragments: 0, essence: 0, resource: 0 };
  const sword = item({ id: 7, at: 2, columns: [column] });
  let view = { gear: gearState({ items: [sword] }), atStall: false, nodesInReach: [] };
  const driven = new Driven((ui) => panel.node(ui, view, 1 / 60));
  assert.ok(!driven.has('tg:gear:7:grid'));
  driven.press('tg:gear:7:nodes');
  assert.ok(driven.has('tg:gear:7:grid'), 'its nodes open');
  driven.hold('tg:gear:7:feed', 0.5);
  driven.hold('tg:gear:7:feed', 0.5);
  assert.deepEqual(asked, [], 'not yet: letting go starts the hold again');
  driven.hold('tg:gear:7:feed', 1.5);
  assert.deepEqual(asked, [{ kind: ASKS.feed, item: 7 }], 'fed once, however long held');
  view = { ...view, gear: gearState({ items: [sword], answer: 1 }) };
  driven.frame([]);
  assert.equal(driven.said.length, 1, 'the answer said once');
});

test('the gear panel waits for the room, then hands out what is asked at the level typed', () => {
  const asked: GearAsk[] = [];
  const panel = new GearPanel((ask) => asked.push(ask));
  let view = { gear: null as ReturnType<typeof gearState> | null, atStall: false, nodesInReach: [] };
  const driven = new Driven((ui) => panel.node(ui, view, 1 / 60));
  assert.ok(!driven.has('tg:grant:item'));
  view = { ...view, gear: gearState({}) };
  driven.frame([]);
  driven.type('tg:grant:level', '12');
  driven.pick('tg:grant:kind', '3');
  driven.press('tg:grant:item');
  assert.deepEqual(asked, [{ kind: ASKS.grantItem, itemKind: 3, rarity: 0, level: 12 }]);
});

test('the attack feel switches an effect off, dims its sliders and keeps them still, and goes back to as made', () => {
  const heard: Feel[] = [];
  const panel = new FeelPanel((feel) => heard.push(feel));
  const driven = new Driven((ui) => panel.node(ui));
  driven.press('tg:feel:arc');
  assert.equal(heard.at(-1)?.arc, !FEEL.arc);
  driven.keys('tg:feel:arcBrightness', 'ArrowRight');
  assert.equal(heard.at(-1)?.arcBrightness, FEEL.arcBrightness, 'an effect switched off keeps its sliders still');
  driven.keys('tg:feel:kickStrength', 'ArrowRight');
  assert.equal(heard.at(-1)?.kickStrength, FEEL.kickStrength + 0.05);
  driven.press('tg:feel:reset');
  assert.deepEqual(heard.at(-1), FEEL);
});

test('the aim panel holds the view while ticked, steps its numbers, and goes back to the game’s', () => {
  const heard: [AimPlace, boolean][] = [];
  const panel = new AimPanel((place, held) => heard.push([place, held]));
  const driven = new Driven((ui) => panel.node(ui));
  driven.press('tg:aim:held');
  assert.equal(heard.at(-1)?.[1], true);
  driven.keys('tg:aim:up', 'ArrowLeft', 'ArrowLeft');
  assert.equal(heard.at(-1)?.[0].up, Number((AIM.up - 0.1).toFixed(2)));
  driven.press('tg:aim:reset');
  assert.equal(heard.at(-1)?.[0].up, AIM.up);
});

test('the Arts panel asks for a level pressed, and leaves a Core slot as the room holds it when "—" is picked', () => {
  const asked: GearAsk[] = [];
  const arts = { art: 1, cores: [[0, null, null]], anima: 0, tenets: [0, 0] as [number, number] };
  const driven = new Driven((ui) => artsNodes(ui, (ask) => asked.push(ask), arts, standing({ artLevels: [5, 5, 5] })));
  driven.press('tg:arts:1:3');
  driven.pick('tg:arts:core0', '');
  assert.deepEqual(asked, [levelAsk(1, 3)]);
});

test('the room’s readout says its name, the player, and the link’s lag and loss', () => {
  assert.equal(
    roomLine('playtest', 3, { lagMs: 41.6, strayMs: 7.2, lost: 0.014 }),
    'Room playtest, player 3: lag 42 ms (±7), 1% lost.',
  );
});

test('the numbers to copy go to the clipboard when pressed', () => {
  const copied: string[] = [];
  const clipboard = { writeText: async (words: string) => void copied.push(words) };
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: clipboard, configurable: true });
  const panel = new AimPanel(() => undefined);
  const driven = new Driven((ui) => panel.node(ui));
  driven.press('tg:aim:line');
  assert.equal(copied.length, 1);
  assert.match(copied[0] ?? '', /^shoulder: .*thirdZoom: /);
});
