// The sides a ship sails for, and the colours each dresses one model of a hull in: its hull's paint, the stripe
// along its gunports, its canvas and the flag at its masthead. A side's colours are the painter's, laid over the
// same pictures every hull wears; a player's ship may wear its own instead (`fleetDress.ts`).
import type { Painted } from './fleetDress.ts';

/** Whose a ship is: a player's, a friendly merchantman's or the Grey Tithe's. */
export const SHIP_SIDES = ['player', 'friendly', 'tithe'] as const;
export type ShipSide = (typeof SHIP_SIDES)[number];

/** A colour as red, green and blue, 0 to 1. */
export type Colour = readonly [number, number, number];

/** A side's colours: its hull's paint, its stripe's and its canvas's (each null where its pictures stand as painted),
 *  its flag's ground, the faction whose emblem it bears (null for none) and the colour the emblem's tones are shaded
 *  from on its flag (null for the emblem's own). */
export interface ShipDress {
  readonly hull: Colour | null;
  readonly stripe: Colour | null;
  readonly canvas: Colour | null;
  readonly flag: Colour;
  readonly emblem: number | null;
  readonly emblemTint: Colour | null;
}

/** A colour from its hex code, `#rrggbb`. */
export function colourOf(hex: string): Colour {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Overlook's blue, which its own ships fly and band their hulls with. */
export const OVERLOOK_BLUE = colourOf('#2f5d9a');

export const DRESSES: Readonly<Record<ShipSide, ShipDress>> = {
  player: { hull: null, stripe: null, canvas: null, flag: OVERLOOK_BLUE, emblem: null, emblemTint: null },
  friendly: {
    hull: null,
    stripe: OVERLOOK_BLUE,
    canvas: colourOf('#f1ede2'),
    flag: OVERLOOK_BLUE,
    emblem: null,
    emblemTint: null,
  },
  tithe: {
    hull: colourOf('#59636b'),
    stripe: colourOf('#ebe0c2'),
    canvas: colourOf('#8f9092'),
    // Its canvas grey and its flag the same; the balance on it in dark slate.
    flag: colourOf('#8f9092'),
    emblem: 1,
    emblemTint: colourOf('#2e3438'),
  },
};

/** The side a captain of a faction sails for: 0, the players', a friendly ship; any other a hostile one, the Grey
 *  Tithe's (the Lattice's ships come later). */
export function factionSide(faction: number): ShipSide {
  return faction === 0 ? 'friendly' : 'tithe';
}

/** How a ship is drawn: its side, how light (1 as painted, less for another player's in the World Editor), and a
 *  player's own paint and flag in place of its side's (`fleetDress.ts`), none for the side's. */
export interface ShipLook {
  readonly side: ShipSide;
  readonly shade?: number;
  readonly painted?: Painted;
  /** Whether she runs dark, her lanterns out: a friendly ship running from an attack. */
  readonly dark?: boolean;
  /** How lit her lanterns are now (0 out to 1 burning), as a frame draws her; none for out. */
  readonly lanterns?: number;
}

export const PLAYER_LOOK: ShipLook = { side: 'player' };
