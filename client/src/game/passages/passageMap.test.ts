import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PassageWeb, PassageZone } from '../../rules/passageRules.ts';
import { lampWords, passageSheet } from './passageMap.ts';

const zone = (
  number: number,
  depth: number,
  place: [number, number],
  extra: Partial<PassageZone> = {},
): PassageZone => ({
  number,
  depth,
  lane: 0,
  at: place,
  ground: { kind: 'open', form: 'hollow' },
  size: 'small',
  deal: 'skirmish',
  currents: [],
  name: 'A grassy hollow',
  onward: [],
  lamp: null,
  ...extra,
});

const web: PassageWeb = {
  island: 'continent-1',
  patrol: 'saltgrass-downs',
  week: 2_900,
  mouths: [{ run: 'The Chalk Adit', zone: 0 }],
  modifiers: [],
  zones: [
    zone(0, 1, [10_000, 5_000], { onward: [1, 2], deal: 'reliquary', levels: [1, 4] }),
    zone(1, 2, [8_000, 9_000], { deal: 'lamp', lamp: 1, onward: [2], levels: [12, 15] }),
    zone(2, 2, [12_000, 9_000], {
      deal: 'kindle',
      currents: [{ key: 'gloom', name: 'Gloom', words: 'It is dark here.', boon: false }],
    }),
  ],
};
const patrol = { name: 'The Saltgrass Downs', at: [10_000, 1_000] as const };

test('every zone of the week is a mark at its place, a mission by its kind’s glyph, the patrol zone its gate', () => {
  const { sheet } = passageSheet(web, { here: 0, come: [], lit: [] }, 'The passages', patrol);
  assert.deepEqual(
    sheet.marks.map((mark) => [mark.glyph, mark.word]),
    [
      ['vault', 'Reliquary'],
      ['beacon', 'A lamp'],
      ['kindle', 'Kindle'],
      ['gate', 'The Saltgrass Downs'],
    ],
  );
  const [first, , third] = sheet.marks;
  assert.ok(first && third);
  assert.equal(third.at[0] - first.at[0], 2_000, 'each at its place on the island');
});

test('each zone is named beside its mark by its kind and its foes’ levels, too strong ones in the loss’s ink', () => {
  const where = { here: 0, come: [], lit: [1], level: 11 };
  const { sheet } = passageSheet(web, where, 'The passages', patrol);
  assert.deepEqual(
    sheet.places.map((place) => [place.name, place.near, place.loss]),
    [
      ['Reliquary · 1 to 4', true, false],
      ['The first lamp, lit · 12 to 15', true, true],
      ['Kindle', true, false],
    ],
  );
  assert.equal(lampWords(2), 'The second lamp');
});

test('every way of the web is drawn faint, so a route can be planned past the ways on from here', () => {
  const { sheet } = passageSheet(web, { here: 2, come: [0], lit: [] }, 'The passages', patrol);
  const faint = sheet.paths.filter((path) => path.faint);
  assert.equal(faint.length, 3, 'the three ways of the web, wherever the player stands');
  assert.deepEqual(faint[0]?.points, [sheet.marks[0]?.at, sheet.marks[1]?.at]);
});

test('the way come is a track to where the player is; the ways on from there are footpaths', () => {
  const { sheet, you } = passageSheet(web, { here: 2, come: [0], lit: [] }, 'The passages', patrol);
  const [track, ...ways] = sheet.paths.filter((path) => !path.faint);
  assert.ok(track?.track);
  assert.equal(track.points.length, 3, 'the patrol zone, the zone come through, here');
  assert.deepEqual(track.points.at(-1), you);
  assert.deepEqual(ways, [], 'no way on from the second depth here');
  const atFirst = passageSheet(web, { here: 0, come: [], lit: [] }, 'The passages', patrol).sheet;
  assert.equal(atFirst.paths.filter((path) => !path.track && !path.faint).length, 2);
  assert.throws(() => passageSheet(web, { here: 9, come: [], lit: [] }, 'The passages', null), /no zone 9/);
});

test('the map opens on the whole web: every mark inside the map, wherever the player stands', async () => {
  const { viewOn } = await import('../../heldmap/heldMapLaw.ts');
  const { GLYPH_HALF } = await import('../../heldmap/landGlyphs.ts');
  const { LAND_SCALE_MOST } = await import('../../heldmap/heldMap.ts');
  // Deep in a long web, the player far from the patrol zone.
  const deep = [...web.zones, zone(3, 9, [40_000, 60_000]), zone(4, 9, [-20_000, 50_000])];
  for (const here of [0, 3]) {
    const where = { here, come: [], lit: [] };
    const { sheet, you } = passageSheet({ ...web, zones: deep }, where, 'The passages', patrol);
    for (const ink of [
      { width: 1000, height: 700 },
      { width: 600, height: 900 },
    ]) {
      // Held to the land's closest zoom, as the map on land holds it (heldMap.ts `openLand`).
      const view = viewOn(you, ink, { width: sheet.width, height: sheet.height, most: LAND_SCALE_MOST }, sheet.span);
      for (const mark of sheet.marks) {
        const [x, y] = [(mark.at[0] - view.left) * view.scale, (mark.at[1] - view.top) * view.scale];
        const inside =
          x >= GLYPH_HALF && y >= GLYPH_HALF && x <= ink.width - GLYPH_HALF && y <= ink.height - GLYPH_HALF;
        assert.ok(inside, `${mark.word} at ${[x, y]} on a map ${ink.width} by ${ink.height}`);
      }
    }
  }
});
