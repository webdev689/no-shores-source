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
  landmark: null,
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
    zone(0, 1, [10_000, 5_000], { onward: [1, 2], deal: 'reliquary' }),
    zone(1, 2, [8_000, 9_000], { deal: 'lamp', lamp: 1 }),
    zone(2, 2, [12_000, 9_000], {
      deal: 'kindle',
      currents: [{ key: 'gloom', name: 'Gloom', words: 'It is dark here.', boon: false }],
    }),
  ],
};
const patrol = { name: 'The Saltgrass Downs', at: [10_000, 1_000] as const };

test('every zone of the week is a mark at its place, by its deal’s glyph, the patrol zone its gate', () => {
  const { sheet } = passageSheet(web, { here: 0, come: [], lit: [] }, 'The passages', patrol);
  assert.deepEqual(
    sheet.marks.map((mark) => [mark.glyph, mark.word]),
    [
      ['vault', 'A reliquary'],
      ['beacon', 'A lamp'],
      ['objective', 'A mission'],
      ['gate', 'The Saltgrass Downs'],
    ],
  );
  const [first, , third] = sheet.marks;
  assert.ok(first && third);
  assert.equal(third.at[0] - first.at[0], 2_000, 'each at its place on the island');
  assert.ok(sheet.span && sheet.span < sheet.width, 'it opens round the player, the web drawn back to by the wheel');
});

test('lamps and currents are named under their zones, a lamp lit this week said to be lit', () => {
  const { sheet } = passageSheet(web, { here: 0, come: [], lit: [1] }, 'The passages', patrol);
  assert.deepEqual(
    sheet.places.map((place) => place.name),
    ['The first lamp, lit', 'Gloom'],
  );
  assert.equal(lampWords(2), 'The second lamp');
});

test('the way come is a track to where the player is; the ways on from there are footpaths', () => {
  const { sheet, you } = passageSheet(web, { here: 2, come: [0], lit: [] }, 'The passages', patrol);
  const [track, ...ways] = sheet.paths;
  assert.ok(track?.track);
  assert.equal(track.points.length, 3, 'the patrol zone, the zone come through, here');
  assert.deepEqual(track.points.at(-1), you);
  assert.deepEqual(ways, [], 'no way on from the second depth here');
  const atFirst = passageSheet(web, { here: 0, come: [], lit: [] }, 'The passages', patrol).sheet;
  assert.equal(atFirst.paths.filter((path) => !path.track).length, 2);
  assert.throws(() => passageSheet(web, { here: 9, come: [], lit: [] }, 'The passages', null), /no zone 9/);
});

test('the map opens round the player at the sheet’s span, not the land’s 400 m', async () => {
  const { viewOn } = await import('../../heldmap/heldMapLaw.ts');
  const { sheet, you } = passageSheet(web, { here: 0, come: [], lit: [] }, 'The passages', patrol);
  const ink = { width: 1000, height: 700 };
  const view = viewOn(you, ink, { width: sheet.width, height: sheet.height }, sheet.span);
  assert.ok(Math.abs(ink.width / view.scale - (sheet.span ?? 0)) < 1e-6 || ink.width / view.scale >= sheet.width);
});
