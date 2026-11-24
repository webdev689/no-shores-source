import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenDeck, SeenFlotsam } from '../network/seaHarbour.ts';
import { BINDS, IDLE, type InputFrame } from '../player/input.ts';
import type { FightCaptain, FightVessel, FightView } from '../rules/fightRules.ts';
import { deckToWorld } from '../ships/deck.ts';
import { deckCameraBlocks } from '../ships/spars.ts';
import { Boarding } from './deckBoarding.ts';
import type { DeckSea } from './deckFight.ts';
import type { Foot, FootContext, FootFrame } from './foot.ts';
import type { StandOnDeck } from './deckFight.ts';
import { type BindId, DEFAULTS } from '../player/binds.ts';
import { deckKey, fightAsk } from './seaWord.ts';

/** A ship of the fight lying at (x, y), still on the water. */
const vessel = (x: number, state: FightVessel['state']): FightVessel =>
  ({ ship: [x, 0, 0.5, 0, 0, 0, 0, 0], pose: [0.2, 0.01, -0.03], state }) as unknown as FightVessel;

/** The fight with it alongside, its colours struck or not. */
const fight = (state: FightVessel['state']): FightView =>
  ({
    player: vessel(0, 'afloat'),
    captain: { ...vessel(20, state), name: 'Tithe Sloop' } as FightCaptain,
    others: [],
  }) as unknown as FightView;

/** The sea room as the boarding sees it, the asks the page made of it, and the deck room's snapshots heard. */
function seaRoom() {
  const asked: string[] = [];
  const sea: DeckSea & { deck: SeenDeck | null; flotsam: SeenFlotsam[]; mayBoard: boolean; ask(ask: string): void } = {
    deck: null,
    mayBoard: false,
    own: 1,
    rejoining: false,
    lost: null,
    gear: {},
    flotsam: [],
    hearDeck: null,
    sendDeck: () => undefined,
    ask: (ask) => void asked.push(ask),
  };
  return { sea, asked };
}

/** The frame on foot the fight on its deck shows: the eye behind the boarder, a figure of its crew, the keys. */
const FRAME = {
  shot: { eye: [0, 3, 2], yaw: 0, pitch: 0.2, fov: 1, near: 0.1, far: 900 },
  figures: [{ card: {}, x: 0, y: -2, z: 0.9, flip: false }],
  standing: { kind: 'inside' },
  marks: new Float32Array(),
  lit: [],
  swings: new Float32Array(),
  fight: {},
  hints: {
    title: 'On foot',
    hints: [
      ['Mouse', 'Swing'],
      ['leave', 'Hold to leave'],
    ],
  },
  dark: 0.5,
} as unknown as FootFrame;

/** The fight on foot stood on its deck, as the land's is, its frames counted, its arrivals and its leaving. */
function standOnFoot() {
  const kept = {
    frames: 0,
    arrived: 0,
    left: 0,
    grid: 0,
    camera: 0,
    hands: false,
    stand: null as unknown as StandOnDeck,
  };
  kept.stand = (context, _node, grid, open) => {
    kept.grid = grid.length;
    kept.camera = context.cameraBlocks?.length ?? 0;
    open(() => undefined);
    const foot = {
      frame: (_controls: unknown, _seconds: number, _time: number, how: { hands: boolean }) => (
        (kept.frames += 1),
        (kept.hands = how.hands),
        FRAME
      ),
      arrive: () => void (kept.arrived += 1),
      leave: () => void (kept.left += 1),
    };
    return Promise.resolve(foot as unknown as Foot);
  };
  return kept;
}

const INPUT = {
  controls: { locked: true } as InputFrame,
  seconds: 1 / 60,
  time: 0,
  paused: false,
  viewport: { width: 1280, height: 720 },
};
const CONTEXT = { walker: { inFirstPerson: false }, movement: { tickSeconds: 1 / 60 } } as unknown as FootContext;
const settle = () => new Promise((done) => setTimeout(done, 0));

test('a struck captain alongside is boarded with E: the boarder stands on its deck, which rides its ship', async () => {
  const foot = standOnFoot();
  const { sea, asked } = seaRoom();
  const boarding = new Boarding(CONTEXT, foot.stand);
  const atSea = { boarding, sighted: sea };
  assert.equal(fightAsk(atSea), null, 'its colours still fly');
  const struck = fight('struck');
  // The sea says it may be boarded.
  sea.mayBoard = true;
  assert.equal(fightAsk(atSea), 'board');
  assert.deepEqual(asked, ['board']);
  assert.equal(boarding.frame(sea, struck, INPUT), null, 'the sea has not said it is boarded yet');
  sea.deck = { aboard: [[1, 4]], hull: 0, snapshot: new Uint8Array(), holdLeft: null };
  boarding.frame(sea, struck, INPUT);
  await settle();
  assert.ok(foot.grid > 5 && sea.hearDeck, 'its deck’s grid stood on, its deck room heard');
  assert.equal(foot.camera, deckCameraBlocks(0).length, 'the camera kept clear of its masts and spars, and inboard');
  const shown = boarding.frame(sea, struck, INPUT);
  assert.ok(shown && boarding.onDeck);
  const lying = { x: 20, y: 0, heading: 0.5, scale: 1, heave: 0.2, pitch: 0.01, roll: -0.03 };
  assert.deepEqual(shown.shot.eye, deckToWorld(lying, 0, 3, 2), 'the eye rides the ship');
  assert.deepEqual([shown.figures[0]?.x, shown.figures[0]?.y], deckToWorld(lying, 0, -2, 0.9).slice(0, 2));
  assert.deepEqual(
    [boarding.words?.place, boarding.words?.line],
    ['Tithe Sloop', 'Aboard: its crew stands to meet you'],
  );
  assert.equal(fightAsk(atSea), null, 'E asks nothing while its crew fights');
  boarding.frame(sea, struck, INPUT);
  assert.equal(foot.arrived, 1, 'the boarder arrives on its deck once, as spawning into a place');
  assert.equal(shown.dark, 0.5, 'their view blinks open as their frame on foot says');
});

test('its deck won holds the boarder a minute, its time left and its hold’s take shown; Use or the minute’s end brings them back aboard their own ship', async () => {
  const foot = standOnFoot();
  const { sea, asked } = seaRoom();
  const boarding = new Boarding(CONTEXT, foot.stand);
  const view = fight('struck');
  sea.flotsam = [{ player: 1, id: 1, at: [0, 0], kind: 'barrel' }];
  sea.deck = { aboard: [[1, 4]], hull: 0, snapshot: new Uint8Array(), holdLeft: null };
  boarding.frame(sea, view, INPUT);
  await settle();
  boarding.frame(sea, view, INPUT);
  assert.equal(boarding.won, false);
  // Its crew falls: the room lays its hold for the boarder and holds them 60 s.
  sea.deck = { ...sea.deck, holdLeft: 3_541 };
  sea.flotsam.push(
    { player: 1, id: 2, at: [20, 0], kind: 'crate' },
    { player: 1, id: 3, at: [20, 0], kind: 'crate' },
    { player: 1, id: 4, at: [20, 0], kind: 'chest' },
  );
  boarding.frame(sea, view, INPUT);
  assert.equal(boarding.won, true);
  assert.equal(boarding.words?.place, 'Its deck is yours');
  assert.equal(boarding.words?.line, 'Its hold: 2 crates, a chest');
  assert.deepEqual(boarding.words?.hints.hints[0], ['use', 'Back aboard your ship · 60 s left']);
  assert.ok(!boarding.words?.hints.hints.some(([names]) => names === 'leave'), 'nothing to leave at sea');
  assert.equal(fightAsk({ boarding, sighted: sea }), 'leave-deck');
  assert.deepEqual(asked, ['leave-deck']);
  // The room has the boarder back aboard their own ship: the view is the sea's fight's again, at their helm.
  sea.deck = null;
  assert.equal(boarding.frame(sea, view, INPUT), null);
  assert.deepEqual([boarding.onDeck, foot.left, sea.hearDeck], [false, 1, null]);
});

test('beaten aboard it, the boarder is let go of its deck as they wash up, and nothing is asked of it again', async () => {
  const foot = standOnFoot();
  const { sea } = seaRoom();
  const boarding = new Boarding(CONTEXT, foot.stand);
  const view = fight('struck');
  sea.deck = { aboard: [[1, 4]], hull: 0, snapshot: new Uint8Array(), holdLeft: null };
  boarding.frame(sea, view, INPUT);
  await settle();
  assert.ok(boarding.frame(sea, view, INPUT));
  // All boarders down: the room washes them up and it is scuttled; their fight is over for them.
  sea.deck = null;
  assert.equal(boarding.frame(sea, null, INPUT), null);
  assert.equal(foot.left, 1);
  assert.equal(fightAsk({ boarding, sighted: sea }), null);
});

test('two boarders of one deck each fight there as themselves: the page’s own number on its deck is the room’s', async () => {
  const foot = standOnFoot();
  const { sea } = seaRoom();
  const boarding = new Boarding(CONTEXT, foot.stand);
  sea.deck = {
    aboard: [
      [2, 3],
      [1, 4],
    ],
    hull: 0,
    snapshot: new Uint8Array(),
    holdLeft: null,
  };
  boarding.frame(sea, fight('struck'), INPUT);
  await settle();
  boarding.frame(sea, fight('struck'), INPUT);
  assert.ok(boarding.onDeck);
  // Boarded again as another number (left and come back), its deck is stood on anew.
  sea.deck = { ...sea.deck, aboard: [[1, 6]] };
  assert.equal(boarding.frame(sea, fight('struck'), INPUT), null);
});

test('on its deck the sea’s own controls wait: Use asks, Respawn respawns, Escape is the game’s, every other the foot’s', async () => {
  const foot = standOnFoot();
  const { sea, asked } = seaRoom();
  const boarding = new Boarding(CONTEXT, foot.stand);
  let respawned = 0;
  const atSea = { fight: { view: fight('struck') }, boarding, sighted: sea };
  /** The controls a key is bound to by default. */
  const keyed = (key: string) => (id: BindId) => DEFAULTS[id].keys.includes(key);
  assert.equal(
    deckKey(keyed(' '), false, atSea, () => undefined),
    false,
    'off its deck the sea has its keys',
  );
  sea.deck = { aboard: [[1, 4]], hull: 0, snapshot: new Uint8Array(), holdLeft: null };
  boarding.frame(sea, fight('struck'), INPUT);
  await settle();
  boarding.frame(sea, fight('struck'), INPUT);
  for (const key of [' ', '[', 'n', 'h', 'l'])
    assert.equal(
      deckKey(keyed(key), false, atSea, () => undefined),
      true,
      key,
    );
  assert.equal(
    deckKey(keyed('enter'), false, atSea, () => (respawned += 1)),
    true,
  );
  assert.equal(respawned, 1);
  assert.equal(
    deckKey(keyed('m'), false, atSea, () => undefined),
    true,
    'nothing to leave at sea: the leave held is ashore alone',
  );
  assert.equal(
    deckKey(
      () => false,
      true,
      atSea,
      () => undefined,
    ),
    false,
    'Escape',
  );
  sea.deck = { ...sea.deck, holdLeft: 600 };
  boarding.frame(sea, fight('struck'), INPUT);
  assert.equal(
    deckKey(keyed('e'), false, atSea, () => undefined),
    true,
  );
  assert.deepEqual(asked, ['leave-deck']);
});

test('a hold won while its deck stands up is still told apart from what floated for the player before', async () => {
  const foot = standOnFoot();
  const { sea } = seaRoom();
  const boarding = new Boarding(CONTEXT, foot.stand);
  sea.flotsam = [{ player: 1, id: 1, at: [0, 0], kind: 'barrel' }];
  sea.deck = { aboard: [[1, 4]], hull: 0, snapshot: new Uint8Array(), holdLeft: null };
  boarding.frame(sea, fight('struck'), INPUT);
  sea.deck = { ...sea.deck, holdLeft: 3_000 };
  sea.flotsam.push({ player: 1, id: 2, at: [20, 0], kind: 'chest' });
  await settle();
  boarding.frame(sea, fight('struck'), INPUT);
  assert.match(boarding.words?.line ?? '', /^Its hold: a chest$/);
});

test('with the pad played last, the boarder fights on its deck with the pointer free, as on land', async () => {
  const foot = standOnFoot();
  const { sea } = seaRoom();
  const boarding = new Boarding(CONTEXT, foot.stand);
  const struck = fight('struck');
  sea.deck = { aboard: [[1, 4]], hull: 0, snapshot: new Uint8Array(), holdLeft: null };
  const free = { ...INPUT, controls: { ...IDLE, locked: false } };
  boarding.frame(sea, struck, free);
  await settle();
  const device = BINDS.device;
  try {
    BINDS.device = 'pad';
    boarding.frame(sea, struck, free);
    assert.equal(foot.hands, true, 'the pad fights with the pointer free');
    BINDS.device = 'keys';
    boarding.frame(sea, struck, free);
    assert.equal(foot.hands, false, 'keys and mouse fight only once the pointer is locked');
  } finally {
    BINDS.device = device;
  }
});
