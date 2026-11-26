import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Controlled, contextOf, listenForControls, withoutTaken } from './gameKeys.ts';
import { OPEN_AT, setGearScreenOpen } from './gearScreen.ts';
import { FakeEvent, fakeWindow } from './pageForTests.ts';
import { PLACING_STRIP, placingNow, startPlacing } from './guild/decorPlacing.ts';
import { keysOf } from './hints.ts';
import { padName } from './controls.ts';
import { BINDS, type InputFrame } from '../player/input.ts';

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
  assert.equal(contextOf(game({ mode: 'foot' }, null, alive)), 'foot');
  assert.equal(contextOf(game({ mode: 'foot' }, null, dead)), 'dead');
  assert.equal(contextOf(game({ mode: 'sea' }, afloat())), 'helm');
  assert.equal(contextOf(game({ mode: 'landing' }, afloat())), 'helm');
  assert.equal(contextOf(game({ mode: 'sea' }, afloat({ fight: {} }))), 'fight');
  assert.equal(contextOf(game({ mode: 'sea' }, afloat({ aboard: { walking: true } }))), 'foot', 'walking its deck');
  const boarded = (foot: object) => afloat({ fight: {}, boarding: { onDeck: true, foot } });
  assert.equal(contextOf(game({ mode: 'sea' }, boarded(alive))), 'foot', "on a struck ship's deck");
  assert.equal(contextOf(game({ mode: 'sea' }, boarded(dead))), 'dead');
  // Fallen in a fight, the section's standing inside: Respawn's key, the pad's A and Follow act there too.
  const fell = { standing: { kind: 'inside' }, fell: { offered: true, canRespawn: false, line: '' } };
  assert.equal(contextOf(game({ mode: 'foot' }, null, fell)), 'dead', 'fallen on foot, as the Follow key is read');
  assert.equal(contextOf(game({ mode: 'sea' }, boarded(fell))), 'dead', 'fallen on a boarded deck');
});

test('the repair key repairs at the helm and walking its own deck, never in a fight', () => {
  const { window } = fakeWindow();
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
    landings: { asking: null },
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
  const { window } = fakeWindow();
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
    landings: { asking: null },
    change: nothing,
  } as unknown as Controlled);
  pad(new Set(['character']), new Set(['Start']));
  assert.deepEqual(opened, [{ view: 'character', toggle: true }]);
});

test('while the stranger speaks her welcome Escape opens Settings; no other game key acts but Space', () => {
  const { window } = fakeWindow();
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
    landings: { asking: null },
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
  pads[0]?.(new Set(['leave']), new Set());
  pads[0]?.(new Set(['character']), new Set());
  pads[0]?.(new Set(['controls']), new Set());
  assert.deepEqual(changes, ['sheet'], 'the sheet; the leave is held, and heard each frame');
  assert.deepEqual(
    opened,
    [{ view: 'settings' }, { view: 'character', toggle: true }],
    'Settings, and the character page, which refuses where it must',
  );
  key(' ', 'Space');
  pads[0]?.(new Set(['jump']), new Set());
  assert.equal(pressed, 2, 'her words move on');
});

test('Escape opens Settings with nothing else over the game, and steps back from a landing instead', () => {
  const { window } = fakeWindow();
  const [changes, opened]: [unknown[], unknown[]] = [[], []];
  let backed = 0;
  const playing = {
    flow: { mode: 'foot' } as object,
    sea: { ...afloat(), view: { backToSea: () => void (backed += 1) } },
    foot: { standing: { kind: 'inside' } },
    helmMap: { key: (key: string) => key === 'escape' && playing.mapUp, busy: false },
    mapUp: false,
    through: null,
    after: { holding: false },
  };
  listenForControls({
    playing,
    input: { onPad: () => undefined },
    ui: { typing: false },
    hud: { controls: { rebinding: {}, open: false } },
    story: null,
    retry: () => null,
    landings: { asking: null },
    change: (asked: unknown) => changes.push(asked),
  } as unknown as Controlled);
  window.addEventListener(OPEN_AT, (event) => opened.push((event as unknown as CustomEvent).detail));
  const escape = () => window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape', code: 'Escape' }));
  escape();
  assert.deepEqual(opened, [{ view: 'settings' }], 'on foot');
  playing.mapUp = true;
  escape();
  assert.equal(opened.length, 1, 'the held map takes it first');
  playing.mapUp = false;
  playing.flow = { mode: 'landing', chosen: null };
  escape();
  assert.deepEqual([opened.length, backed, changes], [1, 1, [{ kind: 'back' }]], 'back to the sea from a landing');
  playing.flow = { mode: 'sea' };
  escape();
  assert.deepEqual(opened, [{ view: 'settings' }, { view: 'settings' }], 'at sea');
  playing.helmMap.busy = true;
  escape();
  playing.helmMap.busy = false;
  playing.flow = { mode: 'loading', words: 'Returning to your ship', then: { mode: 'sea' } };
  escape();
  playing.flow = { mode: 'foot' };
  setGearScreenOpen(true);
  escape();
  setGearScreenOpen(false);
  assert.equal(opened.length, 2, 'not on the way to the helm’s map, behind the veil, nor over a window');
});

test('Escape or B while a piece of decoration is placed lets it go first and opens nothing', () => {
  const { window } = fakeWindow();
  const opened: unknown[] = [];
  window.addEventListener(OPEN_AT, (event) => opened.push((event as unknown as CustomEvent).detail));
  const used: string[] = [];
  const pads: ((pressed: Set<string>, buttons: Set<string>) => void)[] = [];
  listenForControls({
    playing: {
      flow: { mode: 'foot' },
      sea: null,
      foot: { standing: { kind: 'inside' }, use: () => used.push('use') },
      helmMap: { key: () => false, busy: false },
      through: null,
      after: {},
    },
    input: { onPad: (heard: (pressed: Set<string>, buttons: Set<string>) => void) => pads.push(heard) },
    ui: { typing: false },
    hud: { controls: { rebinding: {}, open: false } },
    story: null,
    retry: () => null,
    landings: { asking: null },
    change: () => undefined,
  } as unknown as Controlled);
  startPlacing('gull-cove-outpost', 'bench');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape', code: 'Escape' }));
  assert.equal(placingNow(), null, 'let go');
  assert.deepEqual(opened, [], 'and Settings not opened');
  startPlacing('gull-cove-outpost', 'bench');
  pads[0]?.(new Set(['dodge']), new Set(['B']));
  assert.equal(placingNow(), null, 'B lets go on the pad');
  const frame = { pressed: (action: string) => action === 'dodge' || action === 'heal' } as unknown as InputFrame;
  const fought = withoutTaken(frame);
  assert.deepEqual([fought.pressed('dodge'), fought.pressed('heal')], [false, true], 'and the fight does not dodge');
  assert.equal(withoutTaken(frame).pressed('dodge'), true, 'that frame alone');
  assert.deepEqual([opened, used], [[], []]);
  assert.deepEqual(
    keysOf(PLACING_STRIP.hints.at(-1)?.[0] ?? '', 'pad', BINDS.now),
    [padName('B')],
    'named for the pad',
  );
  assert.deepEqual(
    keysOf(PLACING_STRIP.hints[0]?.[0] ?? '', 'keys', BINDS.now),
    ['[', ']'],
    'the turn as its two keys',
  );
});

test('at sea a landing’s confirmation takes Enter as yes and Escape as no; V switches the view; over an island Enter lands', () => {
  const { window } = fakeWindow();
  const done: string[] = [];
  const sea = { ...afloat(), switchLevel: () => done.push('switch') };
  const playing = {
    ...{ flow: { mode: 'sea' } as { mode: string; chosen?: string | null }, sea, foot: null },
    ...{ helmMap: { key: () => false, busy: false }, through: null, after: {} },
  };
  const landings = { asking: null as object | null, answer: (yes: boolean) => done.push(`answer ${yes}`) };
  listenForControls({
    playing,
    input: { onPad: () => undefined },
    ui: { typing: false },
    hud: {},
    story: null,
    retry: () => null,
    landings,
    change: () => undefined,
    landAt: (id: string | null) => done.push(`land ${id}`),
  } as unknown as Controlled);
  const key = (name: string) => window.dispatchEvent(new FakeEvent('keydown', { key: name }));
  landings.asking = {};
  key('Enter');
  key('Escape');
  landings.asking = null;
  key('v');
  playing.flow = { mode: 'landing', chosen: null };
  key('Enter');
  assert.deepEqual(done, ['answer true', 'answer false', 'switch', 'land null']);
});

test('on the pad at sea A asks after the landing the sea offers, and answers yes; B answers no', () => {
  fakeWindow();
  const done: string[] = [];
  const playing = {
    ...{ flow: { mode: 'sea' }, sea: afloat({ chaseChosen: () => false }), foot: null },
    ...{ helmMap: { key: () => false, busy: false }, through: null, after: {} },
  };
  const landings = {
    asking: null as object | null,
    askHere: () => done.push('ask'),
    answer: (yes: boolean) => done.push(`answer ${yes}`),
  };
  const pads: ((pressed: Set<string>, buttons: Set<string>) => void)[] = [];
  listenForControls({
    playing,
    input: { onPad: (heard: (pressed: Set<string>, buttons: Set<string>) => void) => pads.push(heard) },
    ui: { typing: false },
    hud: { controls: { rebinding: { slot: null }, open: false } },
    story: null,
    retry: () => null,
    landings,
    change: () => undefined,
  } as unknown as Controlled);
  pads[0]?.(new Set(['confirm']), new Set(['A']));
  landings.asking = {};
  pads[0]?.(new Set(['confirm']), new Set(['A']));
  pads[0]?.(new Set(['manage']), new Set(['B']));
  assert.deepEqual(done, ['ask', 'answer true', 'answer false']);
});
