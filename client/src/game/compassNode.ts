// The compass (`compass.ts`) as the game draws it: its strip of points over the rule, the brass needle under its
// middle, and its ships' marks on its top edge, a bow pointing up, for a view `width` CSS pixels wide. A point near an
// end fades out rather than being cut in half, where half of NE would read as N.
import type { Node } from '../ui/node.ts';
import {
  COMPASS,
  COMPASS_POINTS,
  compassPlace,
  markPlace,
  SHIP_MARK_COLOURS,
  type ShipMark,
  shipsMarked,
} from '../plus/compass.ts';
import { TONES } from '../plus/tones.ts';

/** How much of the strip at each end a point fades across, so marks come and go softly at its ends. */
const FADE_SHARE = 0.08;

/** A ship's mark in `colour`: a bow pointing up, filling the node (10 pixels wide and 6 tall where it is laid), its
 *  colour inside a dark edge a pixel wide so it reads over the sky. */
const bow = (colour: string): Node['picture'] => ({
  key: `compass bow ${colour}`,
  source: {
    draw: (context, width, height) => {
      const unit = width / 10;
      context.fillStyle = 'rgba(0,0,0,0.9)';
      context.beginPath();
      context.moveTo(5 * unit, 0);
      context.lineTo(10 * unit, height);
      context.lineTo(0, height);
      context.fill();
      context.fillStyle = colour;
      context.beginPath();
      context.moveTo(5 * unit, unit);
      context.lineTo(9 * unit, height - unit);
      context.lineTo(unit, height - unit);
      context.fill();
    },
  },
});

/** The compass turned to `heading` (turns from north), marking `ships` round a player at `from`, in a view `width`
 *  CSS pixels wide. */
export function compassNode(
  width: number,
  heading: number,
  from: readonly [number, number] = [0, 0],
  ships: readonly ShipMark[] = [],
): Node {
  const span = Math.round(Math.min(COMPASS.width, COMPASS.share * width));
  const { height, rule } = COMPASS;
  const points = COMPASS_POINTS.flatMap(([letters, bearing]): Node[] => {
    const place = compassPlace(bearing, heading);
    if (place === null) return [];
    const cardinal = letters.length === 1;
    return [
      {
        opacity: Math.min(1, place / FADE_SHARE, (1 - place) / FADE_SHARE),
        float: { at: [place, 0], anchor: [0.5, 0], y: cardinal ? 2 : 8 },
        text: {
          words: letters,
          size: cardinal ? 2 : 1,
          colour: cardinal ? TONES.word : TONES.wordDim,
          edge: 'halo',
          wrap: false,
          // The page tracked the points 0.18 of an em apart.
          tracking: 4,
        },
      },
    ];
  });
  const marks = shipsMarked(ships, from).map((ship): Node => ({
    width: 10,
    height: 6,
    float: { at: [markPlace([ship.x, ship.y], from, heading), 0], anchor: [0.5, 0], y: -1 },
    picture: bow(SHIP_MARK_COLOURS[ship.kind]),
  }));
  return {
    width: span,
    height: height + rule,
    children: [
      // The rule under the strip, half clear, with a dark line under it.
      { width: 'grow', height: rule, float: { at: [0, 1], anchor: [0, 1] }, fill: 'rgba(122,114,96,0.55)' },
      { width: 'grow', height: 1, float: { at: [0, 1], anchor: [0, 0] }, fill: 'rgba(5,6,8,0.5)' },
      ...points,
      {
        width: 4,
        height: 10,
        fill: TONES.outline,
        float: { at: [0.5, 1], anchor: [0.5, 1], y: 1 },
        children: [{ width: 2, height: 8, fill: TONES.brass, float: { at: [0.5, 0.5], anchor: [0.5, 0.5] } }],
      },
      ...marks,
    ],
  };
}
