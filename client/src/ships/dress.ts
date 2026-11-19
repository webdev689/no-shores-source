// The sides a ship sails for, and the colours each dresses one model of a hull in: her hull's paint, the stripe
// along her gunports, her canvas and the flag at her masthead. A side's colours are the painter's, laid over the
// same pictures every hull wears.

/** Whose a ship is: a player's, a friendly merchantman's, the Grey Tithe's or the pirates'. */
export const SHIP_SIDES = ['player', 'friendly', 'tithe', 'pirate'] as const;
export type ShipSide = (typeof SHIP_SIDES)[number];

/** A colour as red, green and blue, 0 to 1. */
export type Colour = readonly [number, number, number];

/** A side's colours: her hull's paint, her stripe's and her canvas's (each null where her pictures stand as painted),
 *  her flag's ground and the faction whose emblem it bears (null for none). */
export interface ShipDress {
  readonly hull: Colour | null;
  readonly stripe: Colour | null;
  readonly canvas: Colour | null;
  readonly flag: Colour;
  readonly emblem: number | null;
}

/** A colour from its hex code, `#rrggbb`. */
export function colourOf(hex: string): Colour {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Overlook's blue, which its own ships fly and band their hulls with. */
export const OVERLOOK_BLUE = colourOf('#2f5d9a');

export const DRESSES: Readonly<Record<ShipSide, ShipDress>> = {
  player: { hull: null, stripe: null, canvas: null, flag: OVERLOOK_BLUE, emblem: null },
  friendly: { hull: null, stripe: OVERLOOK_BLUE, canvas: colourOf('#f1ede2'), flag: OVERLOOK_BLUE, emblem: null },
  tithe: {
    hull: colourOf('#59636b'),
    stripe: colourOf('#ebe0c2'),
    canvas: colourOf('#8f9092'),
    // A darker slate than her hull, so the balance's grey stone stands out on it.
    flag: colourOf('#2e3438'),
    emblem: 1,
  },
  pirate: {
    hull: colourOf('#1d1c1c'),
    stripe: colourOf('#b0302a'),
    canvas: colourOf('#4b4640'),
    flag: colourOf('#151414'),
    emblem: 2,
  },
};

/** The side a captain of a faction sails for: 1 the Grey Tithe, 2 the pirates; any other a friendly ship. */
export function factionSide(faction: number): ShipSide {
  return faction === 1 ? 'tithe' : faction === 2 ? 'pirate' : 'friendly';
}

/** How a ship is drawn: her side, and how light (1 as painted, less for another player's in the World Editor). */
export interface ShipLook {
  readonly side: ShipSide;
  readonly shade?: number;
}

export const PLAYER_LOOK: ShipLook = { side: 'player' };
