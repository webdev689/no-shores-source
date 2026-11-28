// What the held map does on land past what it does at sea: the keepers' coins it rings, and the landing zone a click
// picks on it, fast travelled to from the card at its foot ([[Game]], "Landings").
import type { Point2 } from '../overworld/ground.ts';
import type { Child } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { travelCardNode } from './heldMapCard.ts';
import type { Rect, View } from './heldMapLaw.ts';
import { GLYPH_HALF } from './landGlyphs.ts';
import type { LandSheet } from './landSheet.ts';

/** How near a landing zone a click on the land's map picks it, pixels. */
const PICK_PX = 24;

/** The lit keepers' coins on the land's sheet, `lit` saying which, as `view` rings them: each one's middle and radius,
 *  screen pixels, the map's ink at `ink` (device pixels, `dpr` a CSS pixel, its letters at `scale`); none at sea. */
export function litCoins(
  land: LandSheet | null,
  [view, ink]: readonly [View, Rect],
  [scale, dpr]: readonly [number, number],
  lit: ((glyph: string) => boolean) | undefined,
): Float32Array {
  const coins = land && lit ? land.marks.filter((mark) => lit(mark.glyph)) : [];
  const radius = GLYPH_HALF * scale * dpr;
  return new Float32Array(
    coins.flatMap(({ at }) => [
      ink.x + (at[0] - view.left) * view.scale * dpr,
      ink.y + (at[1] - view.top) * view.scale * dpr,
      radius,
    ]),
  );
}

/** A landing zone picked on the land's map, and what fast travelling to it does. */
export class LandTravel {
  picked: { readonly zone: number; readonly name: string } | null = null;
  travelled: (zone: number) => void = () => undefined;

  /** Picks the landing zone of `land` nearest a click at `under` (the sheet's metres, `scale` pixels a metre) within
   *  `PICK_PX`, or none; none on land with one landing alone. */
  pick(land: LandSheet, under: Point2, scale: number): void {
    const zones = (land.landings ?? []).map((zone, number) => ({ ...zone, number }));
    const far = (zone: (typeof zones)[number]) => Math.hypot(zone.at[0] - under[0], zone.at[1] - under[1]);
    const near = zones.filter((zone) => far(zone) <= PICK_PX / scale).sort((one, other) => far(one) - far(other));
    const picked = zones.length > 1 ? near[0] : undefined;
    this.picked = picked ? { zone: picked.number, name: picked.name } : null;
  }

  /** Fast travels to the zone picked, the map lowered by `close` first; nothing with none picked. */
  travel(close: () => void): void {
    const picked = this.picked;
    if (!picked) return;
    close();
    this.travelled(picked.zone);
  }

  /** The card at the map's foot (`at`, as far up as `lift`) for the zone picked, its press `sail`'s words, which
   *  does `press`. */
  node(
    ui: Interface,
    [foot, lift]: readonly [readonly [number, number], number],
    sail: string,
    press: () => void,
  ): Child {
    const picked = this.picked;
    return picked && travelCardNode(ui, { words: `Fast travel to ${picked.name}`, lift, at: foot, sail }, press);
  }
}
