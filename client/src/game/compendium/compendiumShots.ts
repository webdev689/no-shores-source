// Pictures of the Compendium, headless (`tools/uiShot.mjs`): the menu drawn whole as the game starts it, opened at the
// Compendium over sample lore (`loreForTests.ts`) with some of it found, and over the lore in the repository. The game
// never imports it.
import type { GearState } from '../../network/gearMessages.ts';
import { state } from '../../network/gearForTests.ts';
import type { Node } from '../../ui/node.ts';
import type { Layer } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { openGearWindow } from '../gearScreen.ts';
import { startGearWindow } from '../gearWindow.ts';
import { Lore } from './lore.ts';
import { LORE, type LoreFile } from './loreBook.ts';
import { SAMPLE_LORE } from './loreForTests.ts';

/** The menu as the game starts it, opened at the Compendium, the player having found `found` of `lore`: built afresh
 *  for each interface a shot draws with. */
function compendiumShot(found: readonly number[], lore: LoreFile): (ui: Interface) => Node {
  const layers = new WeakMap<Interface, Layer>();
  return (ui) => {
    let layer = layers.get(ui);
    if (!layer) {
      const gear: GearState = state({ level: 12, prologueDone: true, lore: found });
      const here = { gear, ask: () => undefined, forge: null, dress: null };
      const source = { week: () => null, kept: () => gear };
      const read = new Lore(
        null,
        () => null,
        () => 0,
        lore,
      );
      layer = startGearWindow(
        () => false,
        null,
        () => here,
        () => null,
        undefined,
        undefined,
        undefined,
        source,
        read,
      );
      layers.set(ui, layer);
      openGearWindow({ view: 'compendium' });
    }
    return layer(ui) || {};
  };
}

/** The sample's front: two categories, three of six chapters found, some unread. */
export const compendiumSampleShot = compendiumShot([0, 2, 4], SAMPLE_LORE);
/** The lore in the repository, none found. */
export const compendiumRepoShot = compendiumShot([], LORE);
/** The houses' books, the first four chapters of each road found: the front, and each book as its category opens on it
 *  (`at` a click on the tile), one house found at a time so the category opens at that house's book. */
const range = (from: number, count: number) => Array.from({ length: count }, (unused, step) => from + step);
export const housesShot = compendiumShot([...range(0, 4), ...range(11, 4), ...range(22, 4)], LORE);
export const stormBookShot = compendiumShot(range(0, 4), LORE);
export const lampBookShot = compendiumShot(range(11, 11), LORE);
export const veilBookShot = compendiumShot(range(22, 11), LORE);
