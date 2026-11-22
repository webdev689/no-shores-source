import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Controlled, contextOf, listenForControls } from './gameKeys.ts';
import { OPEN_AT } from './gearScreen.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';

type Playing = Parameters<typeof contextOf>[0];
const dead = { standing: { kind: 'dead' } };
const alive = { standing: { kind: 'inside' } };
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
  const playing = { flow: { mode: 'sea' }, sea, foot: null, helmMap: { key: () => false }, through: null };
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

test("in the story the pad's Start asks for the Character page, which opens wherever the story keeps gear", () => {
  const { window } = fakePage();
  globalThis.CustomEvent ??= class extends Event {
    readonly detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      super(type);
      this.detail = init?.detail;
    }
  } as unknown as typeof CustomEvent;
  const opened: unknown[] = [];
  window.addEventListener(OPEN_AT, (event) => opened.push((event as unknown as { detail: unknown }).detail));
  let pad: ((pressed: Set<string>, buttons: Set<string>) => void) | null = null;
  const nothing = () => undefined;
  listenForControls({
    playing: { flow: { mode: 'story' }, sea: null, foot: null, helmMap: { busy: false } },
    input: { onPad: (listener: typeof pad) => (pad = listener) },
    ui: { typing: false },
    hud: { controls: { open: false, rebinding: { slot: null } } },
    story: { press: nothing },
    retry: () => null,
    change: nothing,
  } as unknown as Controlled);
  assert.ok(pad);
  (pad as (pressed: Set<string>, buttons: Set<string>) => void)(new Set(['character']), new Set(['Start']));
  assert.deepEqual(opened, [{ view: 'character', toggle: true }]);
});
