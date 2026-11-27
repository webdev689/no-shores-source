// The Playlist's map, after Destiny's Vanguard screen: a dark chart under the entries, each a
// crest (`playlistCrest.ts`) standing where `SPOTS` puts it on a dial of its own, joined by faint lines, the week's
// dungeons below their playlists and a Breach's Hard below its Normal between them.
import type { PlaylistKind } from './playlistWords.ts';

/** Where each entry's crest stands, as shares of the map's width and height, in the screen's order: the two playlists
 *  above, each week's dungeon below its playlist. */
const SPOTS: Readonly<Record<PlaylistKind, readonly [number, number]>> = {
  elite: [0.2, 0.3],
  abyss: [0.8, 0.3],
  'week-elite': [0.2, 0.74],
  'week-abyss': [0.8, 0.74],
  'breach-normal': [0.5, 0.3],
  'breach-hard': [0.5, 0.74],
};

/** The lines the chart draws between crests: each playlist to the Breach between them and to its week's dungeon, and
 *  a Breach's Normal to its Hard. */
const LINKS: readonly (readonly [PlaylistKind, PlaylistKind])[] = [
  ['elite', 'breach-normal'],
  ['breach-normal', 'abyss'],
  ['elite', 'week-elite'],
  ['abyss', 'week-abyss'],
  ['breach-normal', 'breach-hard'],
];

/** Where an entry's crest stands on the chart, as shares of its width and height. */
export const spotShare = (kind: PlaylistKind): readonly [number, number] => SPOTS[kind];

/** The least share of the map's width between two crests side by side in a row, so each crest's words fit it. */
export const SPOTS_APART = Math.min(
  ...Object.values(SPOTS).flatMap(([x, y]) =>
    Object.values(SPOTS).flatMap(([other, down]) => (down === y && other > x ? [other - x] : [])),
  ),
);

/** Where an entry's crest stands on a chart `width` by `height` pixels. */
const spotOf = (kind: PlaylistKind, width: number, height: number): readonly [number, number] => {
  const [across, down] = SPOTS[kind];
  return [across * width, down * height];
};

/** The chart's inks: its lit middle, fading to nothing before its edges so it lies on the screen's dark without a
 *  rim, its rings and lines, and its stars. */
const CHART = {
  lit: 'rgba(36,46,62,0.55)',
  ring: 'rgba(192,138,62,0.16)',
  line: 'rgba(243,207,134,0.22)',
  star: 'rgba(239,232,214,0.5)',
} as const;

/** A number from 0 to 1, the same every time for one `seed`: the chart's stars stand still from frame to frame. */
function seeded(seed: number): number {
  const turned = Math.sin(seed * 12.9898) * 43758.5453;
  return turned - Math.floor(turned);
}

/** Draws the chart's ground `width` by `height` pixels: lit toward the middle, a field of faint stars, and wide rings
 *  round the middle as a chart's compass; the stacked screen lays its crests in a grid over it. */
export function drawGround(context: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  const middle = context.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.min(width, height) * 0.7,
  );
  middle.addColorStop(0, CHART.lit);
  middle.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = middle;
  context.fillRect(0, 0, width, height);
  context.fillStyle = CHART.star;
  for (let star = 0; star < 160; star += 1) {
    const size = seeded(star * 3 + 2) < 0.9 ? 1 : 2;
    context.globalAlpha = 0.2 + seeded(star * 3 + 1) * 0.6;
    context.fillRect(Math.floor(seeded(star * 3) * width), Math.floor(seeded(star * 7 + 5) * height), size, size);
  }
  context.globalAlpha = 1;
  const unit = Math.min(width, height);
  context.strokeStyle = CHART.ring;
  context.lineWidth = 1;
  for (const radius of [0.34, 0.47]) {
    context.beginPath();
    context.arc(width / 2, height / 2, radius * unit, 0, Math.PI * 2);
    context.stroke();
  }
}

/** Draws the chart `width` by `height` pixels: its ground, then the dotted lines between the crests' spots; each
 *  crest's dial stands round its spot. */
export function drawChart(context: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  drawGround(context, width, height);
  context.strokeStyle = CHART.line;
  context.setLineDash([4, 6]);
  for (const [from, to] of LINKS) {
    const [[fromX, fromY], [toX, toY]] = [spotOf(from, width, height), spotOf(to, width, height)];
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
  }
  context.setLineDash([]);
}
