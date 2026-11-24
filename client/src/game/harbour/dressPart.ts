// The Harbourmaster's paint yard: the ships kept to choose among, and for the one chosen a row of swatches for each of
// its parts (its hull's paint, the stripe along its gunports, its canvas, its flag). A swatch shows its colour, its
// canvas's cloths turn about or its flag's own picture; one kept is clicked to lay it on the ship, one sold is held
// to buy it, kept from then on for every ship, and one not yet had says when it will be.
import { SHIP_PARTS } from '../../textures/shipPictures.ts';
import { flagPicture } from '../../ships/flagPictures.ts';
import { EMBLEM_DEVICE, type DressPart, paintedOf } from '../../ships/fleetDress.ts';
import type { Child, Node } from '../../ui/node.ts';
import factions from '../../../../content/gear/factions.json' with { type: 'json' };
import { RARITIES } from '../../player/gear.ts';
import { INK, tileLabel, words } from '../gearNodes.ts';
import { fillNode } from '../gearHold.ts';
import type { MenuContext } from '../menuPage.ts';
import { headingNode } from '../menuPages.ts';
import { type DressTile, calledOf, dressRows } from './harbourModel.ts';

/** Each part's heading. */
const PART_NAMES: Readonly<Record<DressPart, string>> = {
  paint: 'Hull paint',
  stripe: 'Stripe',
  canvas: 'Canvas',
  flag: 'Flag',
};

/** A swatch's size, pixels: a colour's square, and a flag's, half again as long as it is deep. */
const SWATCH = 44;
const FLAG = [54, 36] as const;
/** The layer the first flag stands at among the ship's pictures. */
const FIRST_FLAG = SHIP_PARTS.length;

/** What a swatch shows: a flag's own picture; else its colour, a canvas's second colour on half of it, and the
 *  painter's own timber or canvas for one as built. */
function swatchOf(tile: DressTile, emblem: number): Node {
  const { entry } = tile;
  if (entry.part === 'flag') {
    const layer = paintedOf([0, 0, 0, tile.number], emblem).flagLayer;
    const picture = flagPicture(layer, FIRST_FLAG);
    const key = entry.device === EMBLEM_DEVICE ? `flag ${entry.id} ${emblem}` : `flag ${entry.id}`;
    return picture
      ? { width: FLAG[0], height: FLAG[1], picture: { key, source: { pixels: () => picture.rgba }, pixel: picture } }
      : { width: FLAG[0], height: FLAG[1], fill: entry.colour ?? '#2f5d9a' };
  }
  const built = entry.part === 'canvas' ? '#e3dac4' : '#7a5b3c';
  const colour = entry.colour ?? built;
  const half = entry.device === 'cloths' && entry.ink ? entry.ink : colour;
  return {
    width: SWATCH,
    height: SWATCH,
    children: [
      { width: SWATCH / 2, height: 'grow', fill: colour },
      { width: SWATCH / 2, height: 'grow', fill: half },
    ],
  };
}

/** What a swatch says under it: how it is had, where it is not yet. */
function standing(tile: DressTile): { readonly said: string; readonly colour: string } {
  const { entry, state } = tile;
  const aurem = (entry.source.aurem ?? 0).toLocaleString('en');
  switch (state) {
    case 'worn':
      return { said: 'Laid', colour: INK.gain };
    case 'kept':
      return { said: 'Kept', colour: INK.word };
    case 'buy':
      return { said: `${aurem} Aurem`, colour: INK.word };
    case 'short':
      return { said: `${aurem} Aurem`, colour: INK.loss };
    case 'locked':
      return { said: `Ship level ${entry.source.level ?? 1}`, colour: INK.faint };
    case 'faction': {
      const house = factions.factions.find((faction) => faction.id === entry.source.faction)?.name ?? 'its house';
      return { said: `${house}, rank ${entry.source.rank ?? 1}`, colour: INK.faint };
    }
  }
}

const RARITY = ['normal', 'magic', 'rare', 'legendary', 'atheric'];

/** One swatch: clicked to lay a dress kept, held to buy one sold, and carded with its name and words. */
function swatchTile(context: MenuContext, tile: DressTile, emblem: number): Node {
  const { ui, holds } = context;
  const id = `dress-${tile.number}`;
  const ask = tile.ask;
  const rarity = Math.max(0, RARITY.indexOf(tile.entry.rarity));
  const ring = RARITIES[rarity]?.colour ?? INK.faint;
  let charged = 0;
  if (ask && tile.state === 'kept' && ui.clicked(id)) context.ask(ask);
  if (ask && tile.state === 'buy') charged = holds.press(ui, id, () => context.ask(ask));
  const said = standing(tile);
  const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
  const doing = tile.state === 'kept' ? 'click to lay it' : tile.state === 'buy' ? 'hold to buy' : said.said;
  context.card(id, () => ({
    role: 'panel',
    direction: 'column',
    gap: 6,
    padding: [12, 16],
    width: 300,
    children: [
      words(tile.entry.name, context.sizes.name, ring),
      { width: 'grow', text: { words: tile.entry.words, size: context.sizes.label, colour: INK.faint, wrap: true } },
      words(doing, context.sizes.label, INK.word),
    ],
  }));
  return {
    id,
    press: true,
    role: 'tile',
    label: `${tileLabel(tile.entry.name, rarity)}, ${doing}`,
    direction: 'column',
    alignX: 'center',
    gap: 4,
    padding: [6, 6, 8, 6],
    outline: {
      width: tile.state === 'worn' ? 2 : 1,
      colour: tile.state === 'worn' ? INK.gain : lit ? INK.brassLit : ring,
    },
    children: [swatchOf(tile, emblem), words(said.said, 1, said.colour), fillNode(charged)],
  };
}

/** A chip for each ship kept, the one dressed or named lit; a click chooses another. */
export function shipChips(context: MenuContext, chosen: number, choose: (hull: number) => void, prefix: string): Child {
  const fleet = context.gear.ship?.fleet ?? [];
  const names = ['Sloop', 'Schooner', 'Brig', 'Frigate'];
  return {
    gap: 8,
    wrap: true,
    children: fleet.map((ship): Node => {
      const id = `${prefix}-ship-${ship.hull}`;
      if (context.ui.clicked(id)) choose(ship.hull);
      const named = calledOf(ship);
      const said = named ? `${names[ship.hull] ?? 'Ship'}, ${named}` : (names[ship.hull] ?? 'Ship');
      return {
        id,
        press: true,
        role: 'chip',
        label: said,
        padding: [7, 12],
        children: [words(said, context.sizes.label, ship.hull === chosen ? INK.brassLit : INK.word)],
      };
    }),
  };
}

/** The paint yard for the ship kept of `hull`, chosen among the ships kept by `choose`. */
export function dressPart(context: MenuContext, hull: number, choose: (hull: number) => void): Node {
  const emblem = context.gear.emblem ?? 0;
  const rows = dressRows(context.gear, hull);
  const size = context.sizes.label;
  return {
    width: 'grow',
    direction: 'column',
    gap: 12,
    padding: [0, 18, 14, 18],
    children: [
      shipChips(context, hull, choose, 'dress'),
      ...(rows.length === 0
        ? [words('Keep a ship first: the Harbourmaster dresses only ships of yours.', size, INK.faint)]
        : rows.map(({ part, tiles }): Node => ({
            role: 'panel',
            width: 'grow',
            direction: 'column',
            gap: 8,
            padding: [12, 18],
            children: [
              headingNode(PART_NAMES[part], null, size),
              { width: 'grow', wrap: true, gap: 8, children: tiles.map((tile) => swatchTile(context, tile, emblem)) },
            ],
          }))),
    ],
  };
}
