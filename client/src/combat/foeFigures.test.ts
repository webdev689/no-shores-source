import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { FLASH } from '../player/cardLooks.ts';
import { plainDress } from '../player/dressing.ts';
import type { Card, Cards } from '../player/cards.ts';
import { GLANCE_FLOATS, glanceView } from '../rules/fighters.ts';
import { rosterOf } from '../rules/roster.ts';
import type { Fighting, KeptFoe } from './fighting.ts';
import { Flashes } from './flashes.ts';
import { FoeFigures } from './foeFigures.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const roster = rosterOf(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);
const COLLECTOR = 2;

/** A Collector the room saw at (east, south), at room tick `tick`. */
function fightWith(east: number, south: number, tick: number) {
  const glance = Object.assign(new Float64Array(GLANCE_FLOATS), { 0: east, 1: south });
  const kept: KeptFoe = {
    id: 7,
    kind: 2,
    level: 0,
    shield: null,
    type: COLLECTOR,
    rank: 2,
    faction: 1,
    phase: 1,
    alert: 2,
    view: glanceView(glance),
    before: null,
    ticks: 1,
  };
  return { foes: new Map([[7, kept]]), roomTick: tick } as unknown as Fighting;
}

const card: Card = { texture: {} as GPUTexture, width: 62, height: 124, root: [31, 124] };
const forge = {
  frames: () => 4,
  draws: () => true,
  warm: () => undefined,
  walking: () => null,
  card: () => card,
} as unknown as Cards;

test('a foe stands in its type’s dress where the room saw it, flashing once struck, marked by its roster name', () => {
  const figures = new FoeFigures(roster);
  const flashes = new Flashes();
  flashes.update([{ tick: 10n, kind: 1, how: 0, striker: 1, defender: 7, amount: 9, stroke: 1 }], 0);
  const cards = figures.cards(fightWith(3, -4, 10), forge, { x: 0, y: 0 }, 0, 1, 1 / 60, flashes);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.flash?.stage, FLASH.whole, 'struck, it flashes whole');
  const placed = figures.placed.get(7);
  assert.deepEqual([placed?.x, placed?.y, placed?.dress.outfit.right], [3, -4, 'sword_iron']);
  const [marked] = figures.marked(fightWith(3, -4, 10));
  assert.deepEqual([marked?.name, marked?.faction, marked?.view.x], ['Collector', 'The Grey Tithe', 3]);
});

test('a foe the room names (a Warden, Marrow, the growth) is marked by its own name', () => {
  const fight = fightWith(3, -4, 10);
  const kept = fight.foes.get(7);
  if (kept) fight.foes.set(7, { ...kept, name: 'Reeve Ancel Marrow, the Tithe’s Hand' });
  const [marked] = new FoeFigures(roster).marked(fight);
  assert.deepEqual([marked?.name, marked?.faction], ['Reeve Ancel Marrow, the Tithe’s Hand', 'The Grey Tithe']);
});

test('the Fissure’s growth, a foe the room strikes, stands as its crystal alone: no figure is drawn for it', () => {
  const fight = Object.assign(fightWith(3, -4, 10), {
    public: { marks: [{ kind: 2, id: 7, at: [3, -4, 0], health: 1, state: 2 }] },
  }) as unknown as Fighting;
  assert.deepEqual(new FoeFigures(roster).cards(fight, forge, { x: 0, y: 0 }, 0, 1, 1 / 60, new Flashes()), []);
});

test('a foe the room no longer holds is let go', () => {
  const figures = new FoeFigures(roster);
  figures.cards(fightWith(3, -4, 10), forge, { x: 0, y: 0 }, 0, 1, 1 / 60, new Flashes());
  const gone = { foes: new Map(), roomTick: 11 } as unknown as Fighting;
  assert.deepEqual(figures.cards(gone, forge, { x: 0, y: 0 }, 0, 1, 1 / 60, new Flashes()), []);
  assert.equal(figures.placed.size, 0);
});

/** A Collector seen tick after tick, from `tick` on, at the places and in the modes `seen` gives, each kept with the
 *  glance before; the frames each move was drawn at. */
function watched(seen: (tick: number) => readonly [number, number, number, number], ticks: number) {
  const figures = new FoeFigures(roster);
  const drawn: (readonly [string, number])[] = [];
  const watching = {
    ...forge,
    card: (...[, , anim, , frame]: Parameters<Cards['card']>) => (drawn.push([anim, frame]), card),
  } as unknown as Cards;
  let before: KeptFoe['before'] = null;
  for (let tick = 0; tick <= ticks; tick++) {
    const [east, south, up, mode] = seen(tick);
    const view = glanceView(Object.assign(new Float64Array(GLANCE_FLOATS), { 0: east, 1: south, 2: up, 4: mode }));
    const fight = fightWith(east, south, 100 + tick);
    const kept = fight.foes.get(7);
    if (kept) fight.foes.set(7, { ...kept, view, before });
    figures.cards(fight, watching, { x: 0, y: 9 }, tick / 60, 1, 1 / 60, new Flashes());
    before = view;
  }
  return drawn;
}

test('a foe mantling shows the mantle’s frames go by as it goes over, not its first held', () => {
  // The climb run's mantle: 1.8 m up onto a ledge, (0.25 + 0.22 × 1.8) × 1.05 s, rising over its first 1 / 1.6.
  const seconds = (0.25 + 0.22 * 1.8) * 1.05;
  const MANTLE = 4;
  const drawn = watched((tick) => {
    const progress = Math.min(1, tick / 60 / seconds);
    return [0, -0.65 * progress, 0.5 + 1.8 * Math.min(1, 1.6 * progress), MANTLE];
  }, 40);
  const frames = drawn.filter(([anim]) => anim === 'mantle').map(([, frame]) => frame);
  assert.equal(frames.length, 41);
  assert.deepEqual([...new Set(frames)], [0, 1, 2, 3], 'each of its four frames in turn');
  assert.equal(frames.indexOf(2), 21, 'half way through at 0.34 s');
});

test('a foe strolling steps as slowly as it walks, not at a full walk’s pace', () => {
  // A patrol's stroll at 1.53 m/s for two seconds: its steps go by 2.8 frames, where a full walk's would go by 8.
  const drawn = watched((tick) => [(1.53 * tick) / 60, 0, 0, 0], 120);
  const walked = drawn.slice(1).map(([, frame]) => frame);
  const changes = walked.filter((frame, index) => index > 0 && frame !== walked[index - 1]).length;
  assert.equal(changes, 2);
});

test('a foe the rules hold still a tick between steps walks on through them, and stands once it stops', () => {
  // A waiting foe circling after its place on its ring: four ticks at 1.77 m/s, then one still; then it stops.
  let east = 0;
  const circling = watched((tick) => {
    if (tick <= 60 && tick % 5 !== 0) east += 1.77 / 60;
    return [east, 0, 0, 0];
  }, 90);
  const walk = circling[10]?.[0];
  assert.deepEqual([...new Set(circling.slice(10, 61).map(([anim]) => anim))], [walk], 'the walk, through its pauses');
  assert.notEqual(circling.at(-1)?.[0], walk, 'stopped, it stands');
  // A turn's holder on the heels of a target walking away: a tick at a run, a tick still.
  const heels = watched((tick) => [(7.59 * Math.ceil(tick / 2)) / 60, 0, 0, 0], 60);
  assert.equal(new Set(heels.slice(10).map(([anim]) => anim)).size, 1, 'one move, at the pace it keeps');
});

/** The Collector of `fightWith`, dead `elapsed` ticks. */
function deadFight(elapsed: number) {
  const fight = fightWith(3, -4, 10);
  const kept = fight.foes.get(7);
  if (!kept) throw new Error('no foe');
  const view = { ...kept.view, action: { kind: 'dead', elapsed } as const };
  return { ...fight, foes: new Map([[7, { ...kept, view }]]) } as unknown as Fighting;
}

test('a foe slain dissolves once its fall is over, or at once in the element its death was given, and then is not drawn', () => {
  const plain = new FoeFigures(roster);
  const flashes = new Flashes();
  const cardAt = (figures: FoeFigures, clock: number) =>
    figures.cards(deadFight(1), forge, { x: 0, y: 0 }, clock, 1, 1 / 60, flashes);
  assert.equal(cardAt(plain, 0)[0]?.dissolve, undefined, 'falling, whole');
  assert.equal(cardAt(plain, 0.5)[0]?.dissolve, undefined);
  const crumbling = cardAt(plain, 1.3)[0]?.dissolve;
  assert.ok(crumbling && crumbling.share > 0 && crumbling.share < 1 && crumbling.look === 0, 'plain, it crumbles');
  assert.equal(cardAt(plain, 3).length, 0, 'gone');
  const burnt = new FoeFigures(roster);
  burnt.dissolveFoe(7, 1, 0);
  const burning = cardAt(burnt, 0.2)[0]?.dissolve;
  assert.ok(burning && burning.look === 1 && burning.share > 0, 'Blaze burns it at once');
  // Standing again, it is whole.
  assert.equal(burnt.cards(fightWith(3, -4, 10), forge, { x: 0, y: 0 }, 5, 1, 1 / 60, flashes)[0]?.dissolve, undefined);
});

test('a struck foe is drawn slid along the blow and back, its feet where the room has it', () => {
  const figures = new FoeFigures(roster);
  const flashes = new Flashes();
  const where = (id: number) => (id === 1 ? ([3, -6, 0] as const) : ([3, -4, 0] as const));
  const hit = { tick: 10n, kind: 1, how: 0, striker: 1, defender: 7, amount: 9, stroke: 1 };
  flashes.update([hit], 0, { player: 1, look: 0, where });
  const drawnY = () => {
    const cards = figures.cards(fightWith(3, -4, 10), forge, { x: 0, y: 10 }, 0, 1, 1 / 60, flashes);
    return figures.placed.get(7)?.y === -4 ? (cards[0]?.y ?? 0) : Number.NaN;
  };
  const still = drawnY();
  flashes.update([], 4 / 60);
  assert.ok(drawnY() > still + 0.05, 'pushed south, away from its striker');
  flashes.update([], 20 / 60);
  assert.ok(Math.abs(drawnY() - still) < 1e-9, 'and back');
});

test('a foe dodging is drawn facing the way its hop goes, not the fighter it faces', () => {
  const figures = new FoeFigures(roster);
  const fight = fightWith(3, -4, 10);
  const foes = fight.foes as Map<number, KeptFoe>;
  const kept = foes.get(7);
  assert.ok(kept);
  const dodging = { kind: 'dodge', elapsed: 3, toward: [1, 0] } as const;
  foes.set(7, { ...kept, view: { ...kept.view, facing: 0, action: dodging } });
  figures.cards(fight, forge, { x: 0, y: 0 }, 0, 1, 1 / 60, new Flashes());
  assert.equal(figures.placed.get(7)?.facing, Math.PI / 2);
});

test('a foe dressed in its own clothes is drawn in them, with its type’s weapons drawn', () => {
  const figures = new FoeFigures(roster);
  const [kept] = fightWith(0, 0, 1).foes.values();
  assert.ok(kept);
  const typeDress = figures.dressOf(kept);
  const look = { ...plainDress('felid', 0.5), body: 'female' as const };
  const crew = roster.find((type) => type.name === 'Crew');
  assert.ok(crew);
  figures.dressFoe(kept.id, crew.type, look);
  const own = figures.dressOf(kept);
  assert.notDeepEqual(own, typeDress);
  assert.deepEqual([own?.race, own?.body, own?.outfit.garments], ['felid', 'female', look.outfit.garments]);
  assert.deepEqual([own?.outfit.right, own?.outfit.left, own?.outfit.drawn], [crew.right, crew.left, true]);
});

/** A Lattice Husk (type 39) the room saw at the origin, doing `action`, beside the roster's own types. */
function huskFight(action: KeptFoe['view']['action'] = { kind: 'idle' } as KeptFoe['view']['action']) {
  const fight = fightWith(0, 0, 10);
  const kept = fight.foes.get(7);
  if (!kept) throw new Error('no foe');
  const foe = { ...kept, type: 39, faction: 3, view: { ...kept.view, action } };
  return { ...fight, foes: new Map([[7, foe]]) } as unknown as Fighting;
}
const latticeRoster = [
  ...roster,
  {
    type: 39,
    name: 'Husk',
    faction: 3,
    factionName: 'The Lattice',
    domain: 'land',
    role: 1,
    ranks: [1],
    right: null,
    left: null,
  },
];

test('a Lattice foe whose pictures are not published is drawn as a plain figure', () => {
  const figures = new FoeFigures(latticeRoster);
  const asked: string[] = [];
  const unpublished = {
    ...forge,
    draws: (body: string) => body !== 'husk',
    card: (...[, dress]: Parameters<Cards['card']>) => (asked.push(dress.body), card),
  } as unknown as Cards;
  const [drawn] = figures.cards(huskFight(), unpublished, { x: 0, y: 5 }, 0, 1, 1 / 60, new Flashes());
  assert.deepEqual(asked, ['male']);
  assert.ok(drawn, 'drawn, not left out');
});

test('a Lattice foe with its pictures plays its own moves, and dying fades as its wave bursts', () => {
  const figures = new FoeFigures(latticeRoster);
  const asked: string[] = [];
  const published = {
    ...forge,
    card: (...[, dress, anim]: Parameters<Cards['card']>) => (asked.push(`${dress.body} ${anim}`), card),
  } as unknown as Cards;
  figures.cards(huskFight(), published, { x: 0, y: 5 }, 0, 1, 1 / 60, new Flashes());
  assert.deepEqual(asked, ['husk husk_idle']);
  const dead = huskFight({ kind: 'dead', elapsed: 1 } as KeptFoe['view']['action']);
  const fading = figures.cards(dead, published, { x: 0, y: 5 }, 1, 1, 1 / 60, new Flashes())[0]?.dissolve;
  assert.ok(fading && fading.share < 0.1, 'at once, no fall first');
  const later = figures.cards(dead, published, { x: 0, y: 5 }, 1.15, 1, 1 / 60, new Flashes())[0]?.dissolve;
  assert.ok(later && later.share > 0.4 && later.share < 1, 'faded as the wave takes it');
  assert.equal(figures.cards(dead, published, { x: 0, y: 5 }, 2, 1, 1 / 60, new Flashes()).length, 0, 'gone');
});
