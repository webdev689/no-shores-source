// How a player's ship is dressed (content/gear/ship_dress.json, which the rules read too): its hull's paint, the stripe
// along its gunports, its canvas (a colour, or two laid on alternate cloths) and its flag (a ground, a device in its
// ink, or the emblem its player wears), each part's dress by its number in the file. What the ship shader lays of it
// is a `Painted`, a side's as its colours have it (`dress.ts`) or a player's own.
import catalogue from '../../../content/gear/ship_dress.json' with { type: 'json' };
import { EMBLEMS } from '../plus/emblemArt.ts';
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import { type Colour, colourOf, DRESSES, SHIP_SIDES, type ShipSide } from './dress.ts';

/** The parts a dress is laid on, in the order the wire carries each ship's four. */
export const DRESS_PARTS = ['paint', 'stripe', 'canvas', 'flag'] as const;
export type DressPart = (typeof DRESS_PARTS)[number];

/** A dress as the catalogue holds it. */
export interface DressEntry {
  readonly id: string;
  readonly part: string;
  readonly name: string;
  readonly rarity: string;
  readonly source: {
    readonly kind: string;
    readonly aurem?: number;
    readonly level?: number;
    readonly faction?: number;
    readonly rank?: number;
  };
  readonly colour: string | null;
  readonly ink?: string;
  readonly device?: string;
  readonly words: string;
}

/** Every dress, numbered by its place, as the wire numbers them. */
export const SHIP_DRESSES: readonly DressEntry[] = catalogue.dress;

/** The device of the flag that bears the emblem its player wears. */
export const EMBLEM_DEVICE = 'emblem';
/** The flags drawn as pictures of their own, in the order their layers follow the sides' flags: every flag dress but
 *  the one that flies its player's emblem, which takes that emblem's flag (`emblemFlagLayer`). */
export const FLAG_DESIGNS: readonly DressEntry[] = SHIP_DRESSES.filter(
  (entry) => entry.part === 'flag' && entry.device !== EMBLEM_DEVICE,
);

/** A ship's paint as the shader lays it: its hull's, its stripe's and its canvas's colours (null where its pictures
 *  stand as painted), its canvas's second colour on alternate cloths (null for none), and its flag's picture layer. */
export interface Painted {
  readonly hull: Colour | null;
  readonly stripe: Colour | null;
  readonly canvas: Colour | null;
  readonly ink: Colour | null;
  readonly flagLayer: number;
}

/** The first flag layer after the parts' pictures: the sides' flags, then each design's, then each emblem's. */
const SIDES_FLAGS_AT = SHIP_PARTS.length;
const DESIGNS_AT = SIDES_FLAGS_AT + SHIP_SIDES.length;
const EMBLEMS_AT = DESIGNS_AT + FLAG_DESIGNS.length;

/** The picture layer of the flag that flies emblem `emblem` (its number in content/gear/emblems.json). */
export function emblemFlagLayer(emblem: number): number {
  return EMBLEMS_AT + (emblem >= 0 && emblem < EMBLEMS.length ? emblem : 0);
}

/** A side's paint, as its colours dress it. */
export function sidePainted(side: ShipSide): Painted {
  const dress = DRESSES[side];
  const flagLayer = SIDES_FLAGS_AT + SHIP_SIDES.indexOf(side);
  return { hull: dress.hull, stripe: dress.stripe, canvas: dress.canvas, ink: null, flagLayer };
}

const asColour = (hex: string | null | undefined): Colour | null => (hex ? colourOf(hex) : null);

/** The dress on a part, by its number; the part's start entry, as built, for a number that is none of its part's. */
export function dressOn(part: DressPart, number: number | undefined): DressEntry | null {
  const found = number === undefined ? undefined : SHIP_DRESSES[number];
  if (found?.part === part) return found;
  return SHIP_DRESSES.find((entry) => entry.part === part && entry.source.kind === 'start') ?? null;
}

/** A player's ship's paint from its four dresses by number (paint, stripe, canvas, flag) and the emblem its player
 *  wears: a part with none, or one not of its part, as built. */
export function paintedOf(dress: readonly number[], emblem: number): Painted {
  const [paint, stripe, canvas, flag] = DRESS_PARTS.map((part, index) => dressOn(part, dress[index]));
  const flown = FLAG_DESIGNS.findIndex((design) => design.id === flag?.id);
  const flagLayer =
    flag?.device === EMBLEM_DEVICE
      ? emblemFlagLayer(emblem)
      : flown >= 0
        ? DESIGNS_AT + flown
        : sidePainted('player').flagLayer;
  return {
    hull: asColour(paint?.colour),
    stripe: asColour(stripe?.colour),
    canvas: asColour(canvas?.colour),
    ink: canvas?.device === 'cloths' ? asColour(canvas.ink) : null,
    flagLayer,
  };
}
