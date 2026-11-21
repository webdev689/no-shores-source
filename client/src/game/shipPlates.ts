// The plates over captains' ships (`shipBars.ts`) as the game draws them: her faction's emblem in a square at the
// left and, to its right, her name, her rank's mark and a Boss's faction over a long thin bar of her hull, coloured by
// her rank, over a dark trough with a hairline edge, her losses pale where the bar stood, bites falling off it and its
// edge flashing with them.
import { pieceAt } from '../plus/barLoss.ts';
import { EMBLEM_PIXELS, emblemUrl, markPicture } from '../plus/emblems.ts';
import { TONES } from '../plus/tones.ts';
import { rankMark } from '../rules/roster.ts';
import type { Drawing, Node } from '../ui/node.ts';
import { type Box, colourOf } from '../ui/quads.ts';
import type { PlacedBar } from '../ships/shipBars.ts';

/** The SVG markup an emblem's data URL holds. */
const svgOf = (url: string) => decodeURIComponent(url.slice(url.indexOf(',') + 1));

/** The cream a bar's losses are lit with, and a colour `share` of the way to it. */
const CREAM = '#fff6e4';
function toward(colour: string, share: number): string {
  const [from, to] = [colourOf(colour), colourOf(CREAM)];
  const [red, green, blue] = [0, 1, 2].map((index) =>
    Math.round(255 * ((from[index] ?? 0) + ((to[index] ?? 0) - (from[index] ?? 0)) * share)),
  );
  return `rgba(${red}, ${green}, ${blue}, 1)`;
}

/** The bar of her hull inside the box it is drawn over: trough, losses, fill, its lit top, its edge, the flash of a
 *  bite and the pieces falling. */
function hullBar(bar: PlacedBar): Drawing {
  return (ui, box, scale, clip, shown) => {
    const add = (part: Box, css: string, alpha = 1) => {
      const [red, green, blue, own] = colourOf(css);
      ui.quads.add(part, [red, green, blue, own * alpha * shown], clip);
    };
    const frame = (part: Box, css: string, alpha = 1, width = scale) => {
      add({ ...part, height: width }, css, alpha);
      add({ ...part, y: part.y + part.height - width, height: width }, css, alpha);
      add({ ...part, y: part.y + width, width, height: part.height - 2 * width }, css, alpha);
      add(
        { ...part, x: part.x + part.width - width, y: part.y + width, width, height: part.height - 2 * width },
        css,
        alpha,
      );
    };
    const span = box.width;
    add(box, TONES.groundTrack);
    if ((bar.lost ?? 0) > bar.share) add({ ...box, width: span * (bar.lost ?? 0) }, toward(bar.colour, 0.55), 0.6);
    add({ ...box, width: span * bar.share }, bar.colour);
    add({ ...box, width: span * bar.share, height: scale }, 'rgba(255,255,255,0.34)');
    const outside = {
      x: box.x - scale,
      y: box.y - scale,
      width: box.width + 2 * scale,
      height: box.height + 2 * scale,
    };
    frame(outside, TONES.stoneLo);
    if ((bar.flash ?? 0) > 0) frame(outside, CREAM, bar.flash ?? 0);
    for (const piece of bar.pieces ?? []) {
      const left = box.x + span * piece.left;
      const halves = [
        [pieceAt(piece.age, 'left'), left, span * piece.width * 0.55],
        [pieceAt(piece.age, 'right'), left + span * piece.width * 0.55, span * piece.width * 0.45],
      ] as const;
      for (const [fallen, x, width] of halves) {
        if (!fallen) continue;
        const part = { x: x + fallen.x * scale, y: box.y + fallen.y * scale, width, height: box.height };
        add(part, bar.colour, fallen.opacity);
        frame(part, TONES.outline, fallen.opacity);
        add({ ...part, height: Math.min(2 * scale, box.height) }, CREAM, fallen.opacity);
      }
    }
  };
}

/** Each plate of `bars` as a node set on the screen, the farthest first so the nearest stands in front. */
export function shipPlateNodes(bars: readonly PlacedBar[]): Node[] {
  return bars.map((bar): Node => {
    const square = bar.height;
    const side = Math.floor((square - 4) / EMBLEM_PIXELS) * EMBLEM_PIXELS;
    const emblem = emblemUrl(bar.faction);
    const mark = rankMark(bar.rank);
    const markShown = mark && markPicture(mark);
    const large = bar.bar > 8;
    return {
      width: bar.width,
      height: bar.height,
      gap: 5,
      through: true,
      float: { to: 'screen', x: Math.round(bar.left), y: Math.round(bar.top) },
      children: [
        {
          width: square,
          height: square,
          fill: TONES.groundChip,
          outline: { width: 1, colour: TONES.stoneMid },
          alignX: 'center',
          alignY: 'center',
          children: [
            emblem
              ? {
                  width: side,
                  height: side,
                  picture: {
                    key: `emblem ${bar.faction}`,
                    source: { svg: svgOf(emblem) },
                    pixel: { width: EMBLEM_PIXELS, height: EMBLEM_PIXELS },
                  },
                }
              : null,
          ],
        },
        {
          width: 'grow',
          height: 'grow',
          direction: 'column',
          children: [
            {
              width: 'grow',
              height: 'grow',
              alignY: 'end',
              gap: 5,
              padding: [0, 0, large ? 0 : 3, 0],
              children: [
                { text: { words: bar.name, size: large ? 2 : 1, colour: TONES.word, edge: 'halo', wrap: false } },
                markShown && {
                  width: markShown.width * 2,
                  height: markShown.height * 2,
                  picture: {
                    key: `rank mark ${mark}`,
                    source: { svg: svgOf(markShown.url) },
                    pixel: { width: markShown.width, height: markShown.height },
                  },
                },
                bar.words !== '' && {
                  padding: [0, 0, 0, 7],
                  children: [
                    {
                      text: {
                        words: bar.words.toUpperCase(),
                        colour: TONES.wordDim,
                        edge: 'halo',
                        wrap: false,
                        tracking: 3,
                      },
                    },
                  ],
                },
              ],
            },
            { width: 'grow', height: bar.bar, draw: hullBar(bar) },
          ],
        },
      ],
    };
  });
}
