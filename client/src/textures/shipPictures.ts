// The pictures a ship's parts wear, by the forged world's painter: her hull's strakes and her deck's boards as
// Daggerfall's ship archive files them, a spar's grain, her canvas's weave and her guns' iron. Each repeats over her
// at 40 texels a metre, as a forged model's pictures do.
import { planks } from './boards.ts';
import { finish } from './finish.ts';
import { hash01 } from './noise.ts';
import { paintPicture, type Picture } from './picture.ts';
import { kitMats } from './recipes/thingMats.ts';
import { mottle } from './stone.ts';
import { Surface } from './surface.ts';

/** A ship's parts, in the order her mesh numbers them. */
export const SHIP_PARTS = ['hull', 'deck', 'spar', 'sail', 'iron'] as const;
export type ShipPart = (typeof SHIP_PARTS)[number];

/** Every part's picture is this many texels a side. */
export const SHIP_PICTURE_TEXELS = 64;
/** Daggerfall's ship archive, whose records the hull and deck wear; the records past its own seed the rest. */
const SHIP_ARCHIVE = 50;
/** A sail's cloths are this many texels wide, a share of the picture so it repeats whole. */
const SAIL_CLOTH_TEXELS = 32;

/** One picture a part, in `SHIP_PARTS`' order: the same bytes every time. */
export function shipPictures(): Picture[] {
  return SHIP_PARTS.map(shipPicture);
}

function shipPicture(part: ShipPart, index: number): Picture {
  if (part === 'hull' || part === 'deck') {
    // Record 0 is boards along it; record 6 named for a floor, the deck's planking.
    const picture = paintPicture(
      SHIP_ARCHIVE,
      part === 'hull' ? 0 : 6,
      0,
      new Map(part === 'deck' ? [['50.6', new Set(['floor'] as const)]] : []),
    );
    if (!picture) throw new Error(`the ship archive painted no ${part}`);
    return picture;
  }
  const side = SHIP_PICTURE_TEXELS;
  const mats = kitMats();
  const { index: named } = mats;
  const surf = new Surface(side, side);
  const seed = SHIP_ARCHIVE * 1000 + index;
  if (part === 'spar') {
    // One length of timber, its grain up the picture: a spar lays its length along v.
    planks(surf, { material: named.wood, dir: 'v', count: 1, joints: false, seed, base: 0.5, grain: 0.18, amp: 0.2 });
  } else if (part === 'sail') {
    // Cloths 0.8 m wide, sewn along the picture's height, over a faint weave.
    surf.each((x, y, place) => {
      const seam = x % SAIL_CLOTH_TEXELS < 1 ? 1 : 0;
      const weave = ((Math.floor(x) + Math.floor(y)) & 1) * 0.02 + (hash01(seed, x, y) - 0.5) * 0.02;
      surf.material[place] = named.parchment;
      surf.tone[place] = 0.8 + weave - seam * 0.12;
      surf.relief[place] = weave - seam * 0.5;
    });
  } else {
    mottle(surf, { material: named.iron, seed, base: 0.38, amp: 0.1, cells: 4, bump: 0.5 });
  }
  return { ...finish(surf, mats, SHIP_ARCHIVE, 100 + index, { strength: 0.7 }), glass: null };
}
