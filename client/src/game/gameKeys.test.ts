import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Controlled, contextOf, listenForControls } from './gameKeys.ts';
import { OPEN_AT } from './gearScreen.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';

type Playing = Parameters<typeof contextOf>[0];
const dead = { standing: { kind: 'dead' }, fallen: true };
const alive = { standing: { kind: 'inside' }, fallen: false };
/** The game as `contextOf` reads it: its flow, and the sea and the foot as far as it looks at them. */
const game = (flow: object, sea: object | null = null, foot: object | null = null) =>
  ({ flow, sea, foot }) as unknown as Playing;
const afloat = (more: object = {}) => ({
  aboard: { walking: false },
  boarding: { onDeck: false },
  fight: null,
  ...more,
});

test('the controls act where the player is: a window, dead, on foot, at the helm or in a fight at sea', () => {
  assert.equal(contextOf(game({ mode: 'foot', menu: true }, null, alive)), 'menu');
  assert.equal(contextOf(game({ mode: 'foot' }, null, alive)), 'foot');
  assert.equal(contextOf(game({ mode: 'foot' }, null, dead)), 'dead');
  const felled = { standing: { kind: 'inside' }, fallen: true };
  assert.equal(contextOf(game({ mode: 'foot' }, null, felled)), 'dead', 'felled in a fight, as the Follow key is read');
  assert.equal(contextOf(game({ mode: 'sea' }, afloat())), 'helm');
  assert.equal(contextOf(game({ mode: 'landing' }, afloat())), 'helm');
  assert.equal(contextOf(game({ mode: 'sea' }, afloat({ fight: {} }))), 'fight');
  assert.equal(contextOf(game({ mode: 'sea' }, afloat({ aboard: { walking: true } }))), 'foot', 'walking its deck');
  const boarded = (foot: object) => afloat({ fight: {}, boarding: { onDeck: true, foot } });
  assert.equal(contextOf(game({ mode: 'sea' }, boarded(alive))), 'foot', "on a struck ship's deck");
  assert.equal(contextOf(game({ mode: 'sea' }, boarded(dead))), 'dead');
});

test('the repair key repairs at the helm and walking its own deck, never in a fight', () => {
  const { window } = fakePage();
  const asked: string[] = [];
  const sea = {
    ...afloat(),
    aboard: { active: true, walking: false },
    fight: null as object | null,
    sighted: { ask: (what: string) => asked.push(what) },
  };
  const playing = { flow: { mode: 'sea' }, sea, foot: null, helmMap: { key: () => false }, through: null, after: {} };
  const nothing = () => undefined;
  listenForControls({
    playing,
    input: { onPad: nothing },
    ui: { typing: false },
    hud: {},
    story: null,
    retry: () => null,
    change: nothing,
  } as unknown as Controlled);
  const repair = () => window.dispatchEvent(new FakeEvent('keydown', { key: 'r', code: 'KeyR' }));
  repair();
  sea.aboard.walking = true;
  repair();
  sea.aboard.walking = false;
  sea.fight = {};
  repair();
  assert.deepEqual(asked, ['repair', 'repair']);
});

test("the pad's Start opens the Character page in the story as the key does, for the teaching that asks for it", () => {
  const { window } = fakePage();
  const opened: unknown[] = [];
  window.addEventListener(OPEN_AT, (event) => opened.push(event.detail));
  let pad: (pressed: Set<string>, buttons: Set<string>) => void = () => undefined;
  const nothing = () => undefined;
  listenForControls({
    playing: {
      flow: { mode: 'story' },
      sea: null,
      foot: null,
      helmMap: { key: () => false },
      through: null,
      after: {},
    },
    input: { onPad: (heard: typeof pad) => (pad = heard) },
    ui: { typing: false },
    hud: { controls: { open: false, rebinding: { slot: null } } },
    story: { press: nothing },
    retry: () => null,
    change: nothing,
  } as unknown as Controlled);
  pad(new Set(['character']), new Set(['Start']));
  assert.deepEqual(opened, [{ view: 'character', toggle: true }]);
});

test('while the stranger speaks her welcome the menu opens as in the story; no other game key acts but Space', () => {
  const { window } = fakePage();
  const changes: unknown[] = [];
  const opened: unknown[] = [];
  let pressed = 0;
  const after = { holding: true, press: () => void (pressed += 1) };
  const playing = {
    flow: { mode: 'foot' },
    sea: null,
    foot: { standing: { kind: 'inside' }, use: () => changes.push('used') },
    helmMap: { key: () => false },
    through: null,
    after,
  };
  const pads: ((pressed: Set<string>, buttons: Set<string>) => void)[] = [];
  listenForControls({
    playing,
    input: { onPad: (heard: (pressed: Set<string>, buttons: Set<string>) => void) => pads.push(heard) },
    ui: { typing: false },
    hud: { controls: { rebinding: {}, open: false, toggle: () => changes.push('sheet') }, keysOffered: true },
    story: null,
    retry: () => null,
    change: (asked: unknown) => changes.push(asked),
    openMap: () => changes.push('map'),
    respawn: () => changes.push('respawn'),
  } as unknown as Controlled);
  window.addEventListener(OPEN_AT, (event) => opened.push((event as unknown as CustomEvent).detail));
  const key = (name: string, code: string) => window.dispatchEvent(new FakeEvent('keydown', { key: name, code }));
  for (const [name, code] of [
    ['e', 'KeyE'],
    ['n', 'KeyN'],
    ['Enter', 'Enter'],
  ])
    key(name, code);
  pads[0]?.(new Set(['use', 'map']), new Set());
  assert.deepEqual([changes, opened], [[], []], 'no map, chat, use or respawn');
  key('Escape', 'Escape');
  key('m', 'KeyM');
  pads[0]?.(new Set(['menu']), new Set());
  pads[0]?.(new Set(['character']), new Set());
  pads[0]?.(new Set(['controls']), new Set());
  assert.deepEqual(changes, [{ kind: 'back' }, { kind: 'menu' }, { kind: 'menu' }, 'sheet'], 'the menu and the sheet');
  assert.deepEqual(opened, [{ view: 'character', toggle: true }], 'the character page, which refuses where it must');
  key(' ', 'Space');
  pads[0]?.(new Set(['jump']), new Set());
  assert.equal(pressed, 2, 'her words move on');
});
