import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import type { Outfit } from '../forge/outfit.ts';
import { item, state } from '../network/gearForTests.ts';
import type { Wardrobe } from './dressing.ts';
import { MELEE, RANGED_SLOT } from './gear.ts';
import { gearOutfit } from './gearLooks.ts';

/** Each faction piece as the room sends it, and the layers the room lets its colour stand on in a dress others see,
 *  by the start of their names: written by the protocol's tests. */
interface Piece {
  readonly named: string;
  readonly kind: number;
  readonly at: number;
  readonly ranged: boolean;
  readonly colour: string;
  readonly on: readonly string[];
}

const pieces = async (): Promise<readonly Piece[]> =>
  JSON.parse(
    await readFile(new URL('../../../target/protocol/dress_layers.json', import.meta.url), 'utf8').catch(() => {
      throw new Error('dress_layers.json is not written: run `cargo test -p protocol`');
    }),
  ) as Piece[];

const sets = ['chain', 'steel', 'iron', 'leather', 'knights', 'fighters', 'mages', 'brotherhood'];
const metals = ['iron', 'elven', 'silver', 'ebony'];
/** A wardrobe that draws the guilds' sets and every weapon in the factions' metals. */
const wardrobe: Wardrobe = {
  sets: { helm: sets, pauldrons: sets, cuirass: sets, gauntlets: sets, greaves: sets, boots: sets },
  garments: ['shirt_long_round', 'breeches', 'shoes', 'casual_cloak', 'formal_cloak'],
  right: ['sword', 'dagger', 'staff', 'bow_long', 'bow_short']
    .flatMap((weapon) => metals.map((metal) => `${weapon}_${metal}`))
    .concat(['pistolet', 'thunderlock']),
  left: ['shield_buckler', 'shield_kite', 'shield_round', 'shield_tower', 'dagger'].flatMap((shield) =>
    metals.map((metal) => `${shield}_${metal}`),
  ),
  hairStyles: ['crop'],
};
const plain: Outfit = {
  armour: {},
  garments: [],
  dyes: {},
  right: null,
  left: null,
  drawn: true,
  hair: { style: 'crop', colour: 'black' },
};
/** Every colour that is a faction's: its own, by its key, and its dye, by its id. */
const factionColours = new Set(factions.factions.flatMap((faction) => [faction.key, faction.dye]));

test("every layer the page dresses a faction piece's colour on, and that colour, is one the room keeps for others", async () => {
  const all = await pieces();
  assert.equal(all.length, 21, 'seven pieces a faction');
  for (const piece of all) {
    const dressed = gearOutfit(
      state({ items: [item({ kind: piece.kind, rarity: 3, at: piece.at, named: piece.named })] }),
      wardrobe,
      plain,
      piece.ranged ? RANGED_SLOT : MELEE,
    );
    const coloured = Object.entries(dressed.dyes).filter(([, colour]) => factionColours.has(colour));
    assert.ok(coloured.length > 0, `${piece.named} is dressed in its faction's colour`);
    const armour = Object.entries(dressed.armour).map(([part, set]) => `${part}_${set}`);
    for (const layer of [...armour, dressed.right, dressed.left].filter((each) => each !== null))
      assert.ok(
        piece.on.some((start) => layer.startsWith(start)),
        `${piece.named}: the room drops ${layer}`,
      );
    for (const [layer, colour] of coloured) {
      assert.ok(
        piece.on.some((start) => layer.startsWith(start)),
        `${piece.named}: the room strips ${layer}, so others never see it`,
      );
      assert.equal(colour, piece.colour, `${piece.named}: the room keeps only ${piece.colour} on ${layer}`);
    }
  }
});
