import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTLINE } from '../combat/dropPictures.ts';
import { pixelsOf } from '../plus/pixelsForTests.ts';
import { ICON_PIXELS, type IconName, iconSvg, modifierIcon } from './journalIcons.ts';

const NAMES: readonly IconName[] = [
  'land',
  'sea',
  'dungeon',
  'dawn',
  'week',
  'elite-dungeon',
  'abyss-dungeon',
  'bounty',
  'boon',
  'breach',
  'seas-normal',
  'seas-elite',
  'seas-abyss',
  'taken',
  'locked',
  'cache',
  'xp',
  'revive',
  'wipe',
  'back',
  'next',
  'burn',
  'brawler',
  'marksman',
  'lightswitch',
  'ironclad',
  'trickle',
  'juggler',
  'exposure',
  'counters',
  'moorings',
  'resources',
  'foes',
  'blocks',
  'seals',
  'company',
  'places',
  'outpost',
];

test('every icon is twelve square, drawn sharp, outlined as the gear glyphs are, and none another’s twin', () => {
  const drawn = NAMES.map((name) => iconSvg(name));
  assert.equal(new Set(drawn).size, NAMES.length);
  for (const [place, svg] of drawn.entries()) {
    const { width, height, pixels } = pixelsOf(svg);
    assert.deepEqual([width, height], [ICON_PIXELS, ICON_PIXELS], NAMES[place]);
    assert.match(svg, /shape-rendering='crispEdges'/);
    assert.ok([...pixels.values()].includes(OUTLINE), `${NAMES[place]} is outlined`);
    assert.ok(pixels.size > 24, `${NAMES[place]} is a sign, not a speck`);
  }
});

test('every modifier the rules draw has its icon, Burn’s flame in its Art’s colours and none for a key unknown', () => {
  const keys = ['brawler', 'marksman', 'lightswitch', 'ironclad', 'trickle', 'juggler', 'exposure'];
  for (const key of keys) assert.equal(modifierIcon(key)?.name, key);
  const burns = ['burn-storm', 'burn-divine', 'burn-shadow'].map((key) => modifierIcon(key));
  assert.ok(burns.every((burn) => burn?.name === 'burn'));
  const flames = burns.map((burn) => iconSvg('burn', burn?.tones));
  assert.equal(new Set(flames).size, 3, 'each Art burns in its own colours');
  assert.equal(modifierIcon('no-such'), null);
});
