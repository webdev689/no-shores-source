// Every item the game can hold, and the forge's two bodies as the page loads them, for the tests that dress each item
// on each body.
import items from '../../../content/gear/items.json' with { type: 'json' };
import rolled from '../../../content/gear/rolled.json' with { type: 'json' };
import female from '../../../tools/forge/tools/sprite-forge/fitted/female.json' with { type: 'json' };
import male from '../../../tools/forge/tools/sprite-forge/fitted/male.json' with { type: 'json' };
import { KINDS } from './gear.ts';
import { SOURCES } from './sourceLooks.ts';

/** Every layer of a fitted body, by the moves it is drawn in, as the page loads a body's layers. */
function layersOfBody(fitted: object): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const [move, heads] of Object.entries(fitted))
    for (const names of Object.values(heads as Record<string, string[]>))
      for (const name of names) (found[name] ??= []).includes(move) || found[name].push(move);
  return found;
}
export const BODIES = { male: layersOfBody(male), female: layersOfBody(female) };

/** The rarities a piece is rolled at, Normal to Legendary, and how many looks each rolls among
 *  (`vestige::LOOK_ROLLS`): every choice of look is its roll's, none its number's. */
const LOOK_ROLLS = [36, 36, 36, 36] as const;
/** One item number: a piece's look never turns on it. */
const NUMBERS = [1];
const LEVELS = Array.from({ length: 20 }, (unused, place) => place + 1);

/** Every weapon and armour item the game can hold: each named piece, and each rolled kind at each rarity a Vestige or
 *  a smith rolls it at, under each of its look rolls, a spread of numbers and every level. */
export function held() {
  const named = items.items.map((each) => ({
    kind: KINDS.indexOf(each.kind as never),
    named: each.id,
    id: 1,
    name: 0,
    level: 20,
    source: Math.max(
      SOURCES.findIndex((source) => 'source' in each && source.key === each.source),
      0,
    ),
  }));
  // A rolled piece is drawn in its content's looks, so it is rolled in every content.
  const rolls = Object.keys(rolled.kinds).flatMap((kind) =>
    LOOK_ROLLS.flatMap((looks, number) =>
      Array.from({ length: looks }, (unused, name) => name).flatMap((name) =>
        NUMBERS.flatMap((id) =>
          LEVELS.flatMap((level) =>
            SOURCES.map((unused, source) => ({
              kind: KINDS.indexOf(kind as never),
              rarity: number,
              name,
              id,
              level,
              source,
            })),
          ),
        ),
      ),
    ),
  );
  const rarityOf = (id: string) =>
    ['normal', 'magic', 'rare', 'legendary', 'atheric'].indexOf(items.items.find((each) => each.id === id)!.rarity);
  // The prologue's own pieces, Normal and of level 1, each kind it lends.
  const story = KINDS.map((unused, kind) => ({ kind, rarity: 0, name: 0, id: 1, level: 1, source: 0, story: true }));
  return [
    ...named.filter((each) => each.kind > 0).map((each) => ({ ...each, rarity: rarityOf(each.named) })),
    ...rolls.filter((each) => each.kind > 0),
    ...story.filter((each) => each.kind > 0),
  ];
}
