// The sea's lettering on the parchment's picture: painted whole when anything on it changes, but while only the ship's
// arrow moves (as it does every frame under way), painted again only round where the arrow was and is, so only that
// much of the picture goes to the device (heldMapView.ts).
import { type askLines, paintHover, paintTravelAsk, type HoverSaid } from './heldMapAsk.ts';
import type { Rect } from './heldMapLaw.ts';
import { paintCard } from './mapRegions.ts';
import type { Lettering } from './mapLayout.ts';
import { type DotInk, type IsleInk, type Painter, paintLettering } from './mapLetters.ts';

/** How far the ship's arrow reaches from its middle, units at the lettering's scale 1, with its parchment ring. */
const ARROW_REACH = 12;

/** What the sea's lettering shows: the layout and the ship's arrow where it is now, the found islands' and other
 *  ships' marks, the pointer's words, the prompt's lines (`askLines`), and the face's loading they were measured in. */
export interface SeaPainting {
  readonly lettering: Lettering;
  readonly isles: readonly IsleInk[];
  readonly others: readonly DotInk[];
  readonly said: HoverSaid | null;
  readonly asked: ReturnType<typeof askLines> | null;
  readonly fonts: string;
  /** The map, ink pixels, the words and cards are kept inside. */
  readonly ink: { readonly width: number; readonly height: number };
}

/** What was painted: the whole picture, a part of it (its pixels), or nothing. */
export type Painted = 'all' | Rect | null;

export class SeaLettering {
  private shape: string | null = null;
  private arrow: Lettering['ship'] = null;

  /** The picture holds another map now: the next painting is whole. */
  forget(): void {
    this.shape = null;
  }

  /** Paints `painting` onto the `picture` (device pixels, the map's top-left at `inkAt` in it) with `painter`, if
   *  anything painted has changed: whole, or round the arrow alone where nothing else has. */
  paint(
    painter: Painter,
    picture: { readonly width: number; readonly height: number },
    inkAt: { readonly x: number; readonly y: number },
    dpr: number,
    painting: SeaPainting,
  ): Painted {
    const { lettering, isles, others, said, asked, fonts, ink } = painting;
    const still = { ...lettering, ship: null };
    const shape = JSON.stringify([picture.width, picture.height, inkAt, dpr, fonts, still, isles, others, said, asked]);
    const arrow = lettering.ship;
    const sameArrow = JSON.stringify(arrow) === JSON.stringify(this.arrow);
    if (shape === this.shape && sameArrow) return null;
    const part = shape === this.shape ? round(this.arrow, arrow, lettering.scale, inkAt, dpr, picture) : null;
    [this.shape, this.arrow] = [shape, arrow];
    painter.save();
    if (part) {
      painter.setTransform(1, 0, 0, 1, 0, 0);
      painter.beginPath();
      painter.rect(part.x, part.y, part.width, part.height);
      painter.clip();
    }
    paintLettering(painter, picture, inkAt, dpr, lettering, isles, others);
    // While the prompt asks, it says what the pointer's words would.
    if (said?.card && !asked) paintCard(painter, said, [said.x, said.y], ink, lettering.scale);
    else if (said && !asked) paintHover(painter, said.line, said.x, said.y, ink, lettering.scale);
    if (asked) paintTravelAsk(painter, ink, lettering.scale, asked);
    painter.restore();
    return part ?? 'all';
  }
}

/** The whole pixels round the arrow where it was and where it is now, inside the picture. */
function round(
  was: Lettering['ship'],
  now: Lettering['ship'],
  scale: number,
  inkAt: { readonly x: number; readonly y: number },
  dpr: number,
  picture: { readonly width: number; readonly height: number },
): Rect {
  const reach = ARROW_REACH * scale * dpr + 2;
  const boxes = [was, now].flatMap((arrow) =>
    arrow ? [{ x: (inkAt.x + arrow.x) * dpr - reach, y: (inkAt.y + arrow.y) * dpr - reach }] : [],
  );
  const left = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.x))));
  const top = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.y))));
  const right = Math.min(picture.width, Math.ceil(Math.max(...boxes.map((box) => box.x)) + reach * 2));
  const bottom = Math.min(picture.height, Math.ceil(Math.max(...boxes.map((box) => box.y)) + reach * 2));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
