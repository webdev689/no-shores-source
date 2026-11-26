import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node } from '../ui/node.ts';
import { byId, nodesOf } from '../ui/uiForTests.ts';
import { SHEEN_STEPS, drawSheen } from './playlistCrest.ts';
import { type CrestLook, type CrestMotion, TILE, crestOf, dialOf, sweepOf } from './playlistParts.ts';
import { SAMPLE_SCREEN } from './playlistShots.ts';
import type { PlaylistEntry } from './playlistWords.ts';

// The sample's Elite Playlist (its daily taken, its weekly waiting), Abyss Playlist (its daily waiting) and the week's
// Elite Dungeon, shut.
const [ELITE, ABYSS, SHUT] = SAMPLE_SCREEN.entries as [PlaylistEntry, PlaylistEntry, PlaylistEntry];
const MOVING: CrestMotion = { opened: 5, swept: 5, still: false };

const crest = (entry: PlaylistEntry, look: CrestLook, motion: Partial<CrestMotion> = {}, place = 0): Node =>
  crestOf(entry, place, look, 1, 100, 220, null, { ...MOVING, ...motion });
/** The alpha of a picture's tint. */
const alphaOf = (node: Node | undefined): number => Number(/([\d.]+)\)$/.exec(node?.picture?.tint ?? '')?.[1] ?? NaN);
const withKey = (node: Node, key: string): Node | undefined =>
  nodesOf(node).find((each) => each.picture?.key.startsWith(key));

test('the crests rise into place one after another as the screen opens, and stand there under reduced motion', () => {
  const [first, fourth] = [crest(ELITE, 'rest', { opened: 0.1 }, 0), crest(ELITE, 'rest', { opened: 0.1 }, 3)];
  assert.ok((first.opacity ?? 1) < 1 && (first.offset?.[1] ?? 0) > 0, 'rising');
  assert.ok((fourth.opacity ?? 1) < (first.opacity ?? 1), 'the later one behind it');
  const risen = crest(ELITE, 'rest', { opened: 1 }, 3);
  assert.deepEqual([risen.opacity, risen.offset], [undefined, undefined], 'in place');
  const still = crest(ELITE, 'rest', { opened: 0, still: true }, 3);
  assert.deepEqual([still.opacity, still.offset], [undefined, undefined], 'in place at once');
});

test('a chosen crest’s glow breathes, brighter than a lit one’s, brighter than one at rest’s; a shut one has none', () => {
  const glow = (look: CrestLook, motion: Partial<CrestMotion> = {}) =>
    alphaOf(withKey(crest(ELITE, look, motion), 'playlist glow'));
  assert.ok(glow('rest') < glow('lit') && glow('lit') < glow('chosen', { opened: 1.5 }));
  assert.notEqual(glow('chosen', { opened: 0 }), glow('chosen', { opened: 1.5 }), 'it breathes');
  assert.equal(glow('chosen', { opened: 1.5, still: true }), 1, 'held full under reduced motion');
  assert.equal(withKey(crest(SHUT, 'chosen'), 'playlist glow'), undefined);
});

test('the light sweeps a crest once as it is lit or chosen, never at rest, shut or under reduced motion', () => {
  const sweep = (entry: PlaylistEntry, look: CrestLook, motion: Partial<CrestMotion> = {}) =>
    byId(crest(entry, look, motion), sweepOf(0, look));
  assert.match(sweep(ELITE, 'lit', { swept: 0.1 })?.picture?.key ?? '', /^playlist sheen/);
  assert.match(sweep(ELITE, 'chosen', { swept: 0.1 })?.picture?.key ?? '', /^playlist sheen/);
  assert.notEqual(sweep(ELITE, 'lit', { swept: 0.1 })?.picture?.key, sweep(ELITE, 'lit', { swept: 0.3 })?.picture?.key);
  assert.ok(sweep(ELITE, 'lit', { swept: 1 }), 'its node still stands, so its age keeps counting');
  assert.equal(sweep(ELITE, 'lit', { swept: 1 })?.picture, undefined, 'swept once');
  assert.equal(sweep(ELITE, 'rest'), undefined);
  assert.equal(sweep(SHUT, 'lit', { swept: 0.1 })?.picture, undefined);
  assert.equal(sweep(ELITE, 'lit', { swept: 0.1, still: true })?.picture, undefined);
});

test('a ring grows from a waiting reward’s dot and fades, again and again; none under reduced motion', () => {
  const ripple = (opened: number, still = false) => withKey(crest(ABYSS, 'rest', { opened, still }), 'playlist ripple');
  const [early, late] = [ripple(0.2), ripple(1.6)];
  assert.ok(early && late);
  assert.ok(Number(late.width) > Number(early.width), 'it grows');
  assert.ok(alphaOf(late) < alphaOf(early), 'and fades');
  assert.deepEqual(ripple(2.2)?.width, ripple(0.2)?.width, 'and starts again');
  for (const ring of [early, late])
    assert.ok((ring.picture?.pixel?.width ?? 0) <= Number(ring.width), 'drawn no finer than shown, so no line is lost');
  const keys = new Set([0.2, 0.25, 0.3].map((opened) => ripple(opened)?.picture?.key));
  assert.ok(keys.size < 3, 'its picture kept across a step of its growth');
  assert.ok(withKey(crest(ABYSS, 'rest', { still: true }), 'playlist waiting'), 'the dot stays');
  assert.equal(ripple(0.2, true), undefined);
});

test('a dial turns while its entry is open and stands while it is shut; the chosen one’s arcs turn against it', () => {
  const dial = (entry: PlaylistEntry, look: CrestLook, opened: number, still = false) =>
    dialOf(entry, 0, look, 200, [0.5, 0.5], { opened, still });
  const [turned] = dial(ELITE, 'rest', 10);
  assert.ok((turned?.picture?.turn ?? 0) > 0, 'turning');
  const [ring, arcs] = dial(ELITE, 'chosen', 10);
  assert.equal(ring?.picture?.turn, turned?.picture?.turn, 'at the same pace, chosen or not');
  assert.ok((arcs?.picture?.turn ?? 0) < 0, 'its arcs the other way');
  assert.equal(dial(ELITE, 'rest', 10).length, 1, 'arcs only on the chosen one');
  const shut = dial(SHUT, 'chosen', 10);
  assert.deepEqual([shut.length, shut[0]?.picture?.turn], [1, 0], 'a shut one stands, with no arcs');
  assert.equal(dial(ELITE, 'chosen', 10, true)[0]?.picture?.turn, 0, 'still under reduced motion');
  const bright = (look: CrestLook) => alphaOf(dial(ELITE, look, 10)[0]);
  assert.ok(bright('rest') < bright('lit') && bright('lit') < bright('chosen'));
});

test('every step of the sweep lights the shield, from its top left corner to its foot', () => {
  // The band's middle runs where east plus south is constant: on the shield that sum runs from 0.26 (its top left
  // corner) to about 1.5 (its foot's curve), in shares of its side.
  const middles = Array.from({ length: SHEEN_STEPS }, (_unused, step) => {
    let middle = NaN;
    const context = new Proxy({} as Record<string, unknown>, {
      get: (_held, name: string) =>
        name === 'createLinearGradient'
          ? (fromX: number, fromY: number, toX: number, toY: number) => {
              middle = (fromX + toX) / 2 / 100 + (fromY + toY) / 2 / 100;
              return { addColorStop: () => undefined };
            }
          : () => undefined,
      set: () => true,
    }) as unknown as OffscreenCanvasRenderingContext2D;
    drawSheen(true, step)(context, 100);
    return middle;
  });
  for (const middle of middles) assert.ok(middle >= 0.26 && middle <= 1.5, `a step at ${middle.toFixed(2)}`);
  assert.ok(
    middles.every((middle, step) => step === 0 || middle > (middles[step - 1] ?? 0)),
    'each further on',
  );
});
