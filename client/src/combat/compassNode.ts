// The compass as the fight's display draws it in the interface the game draws (`ui/`): its strip of points, its needle and its ships' marks,
// laid afresh each frame from the way the view looks, as `compass.ts` places them.
import type { Node } from '../ui/node.ts';
import {
  COMPASS,
  COMPASS_POINTS,
  compassPlace,
  markPlace,
  SHIP_MARK_COLOURS,
  type PlaceMark,
  type ShipMark,
  shipsMarked,
} from '../plus/compass.ts';
import { motionReduced } from '../plus/kit.ts';
import { TONES } from '../plus/tones.ts';
import { blinkDark, diamondNode } from './publicBanner.ts';

/** A point at an end fades out over this share of the strip rather than being cut in half, where half of NE would
 *  read as N. */
const END_FADE = 0.08;

/** A ship's mark, a bow pointing up, in its kind's colour, with a dark edge. */
const shipSvg = (colour: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 10 7"><path d="M4 0 8 5 0 5Z" fill="${colour}" stroke="rgba(0,0,0,0.9)" stroke-width="0.6"/></svg>`;

/** How a public event's place is marked on the strip's foot: its colour, its size (CSS pixels), and how long its
 *  blink takes (seconds; none for none). The ground gold, its heroic task orange and blinking, a chest waiting a
 *  smaller gold, a store under attack red and blinking faster. */
const PLACE_LOOKS: Readonly<Record<PlaceMark['kind'], { colour: string; size: number; blink: number | null }>> = {
  event: { colour: '#e9b44c', size: 13, blink: null },
  heroic: { colour: '#ff7a3d', size: 13, blink: 0.8 },
  chest: { colour: '#e9b44c', size: 10, blink: null },
  store: { colour: '#e0483c', size: 13, blink: 0.5 },
};

/** The compass `width` CSS pixels wide at `zoom`, turned to `heading` (turns from north), marking `ships` round a
 *  player at `from`, and a public event's `places` on its foot, those that blink by `time` (seconds) unless motion is
 *  reduced. Nothing else on it moves but by the view. */
export function compassNode(
  width: number,
  heading: number,
  zoom = 1,
  from: readonly [number, number] = [0, 0],
  ships: readonly ShipMark[] = [],
  places: { readonly marks: readonly PlaceMark[]; readonly time: number } = { marks: [], time: 0 },
): Node {
  const { height, rule } = COMPASS;
  const points = COMPASS_POINTS.flatMap(([letters, bearing]): Node[] => {
    const place = compassPlace(bearing, heading);
    if (place === null) return [];
    const cardinal = letters.length === 1;
    // The strip's fading end read across the letter's inner half, which shows past its middle.
    const half = (cardinal ? 7 : 6) * zoom;
    const reach = (from: number) => (from * width + half / 2) / (END_FADE * width);
    const shown = Math.min(1, reach(place), reach(1 - place));
    return [
      {
        text: {
          words: letters,
          size: (cardinal ? 2 : 1) * zoom,
          colour: cardinal ? TONES.word : TONES.wordDim,
          // A letter fading at an end has no outline, which would build up where its letters' edges cross.
          ...(shown >= 1 ? { edge: 'halo' as const } : {}),
          wrap: false,
        },
        opacity: shown,
        float: { at: [place, 0], anchor: [0.5, 0], y: (cardinal ? 2 : 8) * zoom, z: 1 },
      },
    ];
  });
  const marks = shipsMarked(ships, from).map((ship): Node => ({
    width: 8 * zoom,
    height: 5 * zoom,
    picture: { key: `compass ship ${ship.kind}`, source: { svg: shipSvg(SHIP_MARK_COLOURS[ship.kind]) } },
    float: { at: [markPlace([ship.x, ship.y], from, heading), 0], anchor: [0.5, 0], z: 1 },
  }));
  const still = motionReduced();
  const placed = places.marks.map((place): Node => {
    const look = PLACE_LOOKS[place.kind];
    const dark = !still && look.blink !== null && blinkDark(places.time, look.blink);
    return {
      ...diamondNode(look.size * zoom, look.colour, TONES.outline, look.colour),
      opacity: dark ? 0.4 : 1,
      float: { at: [markPlace([place.x, place.y], from, heading), 1], anchor: [0.5, 0.5], y: zoom, z: 2 },
    };
  });
  return {
    width,
    height: (height + rule) * zoom,
    children: [
      // The rule under the strip, and its dark line under that.
      {
        width: 'grow',
        height: rule * zoom,
        fill: 'rgba(122,114,96,0.55)',
        float: { at: [0, 1], anchor: [0, 1], z: 1 },
      },
      { width: 'grow', height: zoom, fill: 'rgba(5,6,8,0.5)', float: { at: [0, 1], z: 1 } },
      ...points,
      {
        width: 2 * zoom,
        height: 8 * zoom,
        float: { at: [0.5, 1], anchor: [0.5, 1], z: 1 },
        children: [
          { width: 4 * zoom, height: 10 * zoom, fill: TONES.outline, float: { x: -zoom, y: -zoom, z: 1 } },
          { width: 2 * zoom, height: 8 * zoom, fill: TONES.brass, float: { z: 1 } },
        ],
      },
      ...marks,
      ...placed,
    ],
  };
}
