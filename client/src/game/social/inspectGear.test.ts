import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Details } from '../../network/accounts.ts';
import { WORN, fullyUpgraded } from '../../player/gear.ts';
import { characterOf } from '../gearScreen.ts';
import { ARTS } from '../artsCards.ts';
import { levelOf } from '../artLevels.ts';
import { inspectedGear } from './inspectGear.ts';

const piece = (slot: number, gilded: boolean) => ({
  slot,
  kind: 2,
  rarity: 3,
  level: 22,
  name: 4,
  element: 1,
  attack: slot === 0 ? 310 : 0,
  defense: slot === 0 ? 0 : 60,
  gilded,
});

const details = (shown: Details['shown']): Details => ({
  name: 'Mariner',
  tag: null,
  emblem: 'overlook',
  level: 24,
  place: null,
  playing: true,
  guild: null,
  shown,
});

test("another player's kept pieces stand in their slots, with their level, Defense, Prestige and Art", () => {
  const art = ARTS[1]?.id ?? 0;
  const worn = [piece(0, true), piece(3, false)];
  const shown = { level: 24, defense: 60, attack: 310, emblem: 'overlook', worn, prestige: 84, art, art_level: 4 };
  const gear = inspectedGear(details(shown));
  assert.ok(gear);
  if (!gear) return;
  assert.deepEqual(
    gear.items.map((item) => item.at),
    [WORN, WORN + 3],
  );
  const [gilded, plain] = gear.items;
  assert.ok(gilded && plain);
  assert.equal(fullyUpgraded(gilded), true, 'a gilded piece is drawn gilded');
  assert.equal(fullyUpgraded(plain), false);
  const character = characterOf(gear);
  assert.deepEqual([character.level, character.defense, character.prestige, character.attack[0]], [24, 60, 84, 310]);
  assert.equal(gear.arts?.art, art);
  assert.equal(levelOf(gear.standing, art).level, 4);
  assert.equal(inspectedGear(details(null)), null, 'one who has not played online has nothing to show');
  const sea = inspectedGear(details({ ...shown, worn: [{ ...piece(3, false), source: 5 }, piece(4, false)] }));
  assert.deepEqual(
    sea?.items.map((item) => item.source),
    [5, 0],
    'each drawn in its content’s looks, an older room’s piece in the world’s',
  );
  const old = inspectedGear(details({ level: 3, defense: 0, attack: 0, emblem: 'overlook', worn: [] }));
  assert.deepEqual([old?.prestige, old?.arts], [0, undefined], 'a room that kept neither shows none');
});
