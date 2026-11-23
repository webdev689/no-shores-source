// The Playlist's map, after the owner's reference, Destiny's Vanguard screen: a dark chart under the four entries, each
// a crest standing where `nodeSpots` puts it, joined by faint lines and ringed, the week's dungeons below their
// playlists. Each crest says its entry at a glance: chevrons for the Elite Playlist, an eye of the deep for the Abyss
// Playlist, crossed blades for the Elite Dungeon of the week, a crown over the deep for the Abyss's.
import type { PlaylistKind } from './playlistWords.ts';

/** Where each entry's crest stands, as shares of the map's width and height, in the screen's order: the two playlists
 *  above, each week's dungeon below its playlist. */
const SPOTS: Readonly<Record<PlaylistKind, readonly [number, number]>> = {
  elite: [0.3, 0.33],
  abyss: [0.72, 0.33],
  'week-elite': [0.18, 0.74],
  'week-abyss': [0.84, 0.74],
};

/** The lines the chart draws between crests: each playlist to the other and to its week's dungeon. */
const LINKS: readonly (readonly [PlaylistKind, PlaylistKind])[] = [
  ['elite', 'abyss'],
  ['elite', 'week-elite'],
  ['abyss', 'week-abyss'],
];

/** Where an entry's crest stands on the chart, as shares of its width and height. */
export const spotShare = (kind: PlaylistKind): readonly [number, number] => SPOTS[kind];

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

/** Draws the chart `width` by `height` pixels: its ground, then a ring round each crest's spot and the dotted lines
 *  between them. */
export function drawChart(context: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  drawGround(context, width, height);
  const unit = Math.min(width, height);
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
  context.strokeStyle = CHART.ring;
  for (const kind of Object.keys(SPOTS) as PlaylistKind[]) {
    const [x, y] = spotOf(kind, width, height);
    for (const radius of [0.1, 0.135]) {
      context.beginPath();
      context.arc(x, y, radius * unit, 0, Math.PI * 2);
      context.stroke();
    }
  }
}

/** A crest's inks: its field, its rim, its device, and the device's glow; dimmed where the entry is shut. */
interface CrestInks {
  readonly field: string;
  readonly rim: string;
  readonly device: string;
  readonly glow: string;
}

const LIT: CrestInks = { field: '#14171d', rim: '#c08a3e', device: '#efe8d6', glow: 'rgba(243,207,134,0.35)' };
const DEEP: CrestInks = { field: '#120f1a', rim: '#8f6fc4', device: '#d9c8f5', glow: 'rgba(155,120,220,0.4)' };
const SHUT: CrestInks = { field: '#101114', rim: '#4a4640', device: '#6f6a60', glow: 'rgba(0,0,0,0)' };

/** How much larger the chosen crest's shield is drawn than the rest. */
export const CHOSEN_SCALE = 1.08;

/** A crest's glow ink at rest (0), lit under the pointer or the focus (1), and chosen (2): its alpha raised. */
function glowOf(ink: string, lit: 0 | 1 | 2): string {
  const times = [1, 1.6, 2.4][lit] ?? 1;
  return ink.replace(/[\d.]+\)$/, (alpha) => `${Math.min(1, parseFloat(alpha) * times)})`);
}

/** The shield every crest is cut as, `side` pixels square: a flat top, its sides curving to a point. */
function shield(context: OffscreenCanvasRenderingContext2D, side: number): void {
  const [left, right, top] = [side * 0.16, side * 0.84, side * 0.1];
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(right, top);
  context.lineTo(right, side * 0.5);
  context.quadraticCurveTo(right, side * 0.78, side / 2, side * 0.92);
  context.quadraticCurveTo(left, side * 0.78, left, side * 0.5);
  context.closePath();
}

/** Each crest's device, drawn in the device's ink over the shield's field, `side` pixels square. */
const DEVICES: Readonly<Record<PlaylistKind, (context: OffscreenCanvasRenderingContext2D, side: number) => void>> = {
  // Three chevrons, one over another, as a strike playlist's mark.
  elite: (context, side) => {
    context.lineWidth = side * 0.07;
    for (const down of [0.3, 0.46, 0.62]) {
      context.beginPath();
      context.moveTo(side * 0.32, side * down);
      context.lineTo(side / 2, side * (down + 0.12));
      context.lineTo(side * 0.68, side * down);
      context.stroke();
    }
  },
  // An eye of the deep: a ring round a slit, rings spreading under it.
  abyss: (context, side) => {
    context.lineWidth = side * 0.05;
    context.beginPath();
    context.ellipse(side / 2, side * 0.44, side * 0.2, side * 0.12, 0, 0, Math.PI * 2);
    context.stroke();
    context.fillRect(side * 0.475, side * 0.34, side * 0.05, side * 0.2);
    for (const [down, wide] of [
      [0.66, 0.16],
      [0.74, 0.1],
    ] as const) {
      context.beginPath();
      context.moveTo(side * (0.5 - wide), side * down);
      context.quadraticCurveTo(side / 2, side * (down + 0.06), side * (0.5 + wide), side * down);
      context.stroke();
    }
  },
  // Two blades crossed under a star.
  'week-elite': (context, side) => {
    context.lineWidth = side * 0.06;
    for (const [fromX, toX] of [
      [0.32, 0.68],
      [0.68, 0.32],
    ] as const) {
      context.beginPath();
      context.moveTo(side * fromX, side * 0.34);
      context.lineTo(side * toX, side * 0.74);
      context.stroke();
    }
    star(context, side / 2, side * 0.24, side * 0.07);
  },
  // A crown over the deep's rings.
  'week-abyss': (context, side) => {
    context.beginPath();
    context.moveTo(side * 0.3, side * 0.48);
    for (const [x, y] of [
      [0.3, 0.26],
      [0.4, 0.38],
      [0.5, 0.22],
      [0.6, 0.38],
      [0.7, 0.26],
      [0.7, 0.48],
    ] as const)
      context.lineTo(side * x, side * y);
    context.closePath();
    context.fill();
    context.lineWidth = side * 0.05;
    for (const radius of [0.12, 0.2]) {
      context.beginPath();
      context.arc(side / 2, side * 0.6, side * radius, 0.15 * Math.PI, 0.85 * Math.PI);
      context.stroke();
    }
  },
};

/** A five-pointed star of `radius` about (x, y), filled. */
function star(context: OffscreenCanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const reach = point % 2 === 0 ? radius : radius * 0.45;
    const turn = (point * Math.PI) / 5 - Math.PI / 2;
    context.lineTo(x + Math.cos(turn) * reach, y + Math.sin(turn) * reach);
  }
  context.closePath();
  context.fill();
}

/** Draws the dot that marks a reward waiting, round and gold with a dark rim, `side` pixels square. */
export function drawWaiting(context: OffscreenCanvasRenderingContext2D, side: number): void {
  context.beginPath();
  context.arc(side / 2, side / 2, side / 2 - 1, 0, Math.PI * 2);
  context.fillStyle = '#f0c94a';
  context.fill();
  context.lineWidth = Math.max(1, side / 8);
  context.strokeStyle = '#050608';
  context.stroke();
}

/** Draws an entry's crest in a square: its glow, its shield's field and rim, and its device; grey where it is shut.
 *  `lit` 1 (under the pointer or the focus) brightens its glow; 2 (chosen) more, its shield filling the square. */
export function drawCrest(kind: PlaylistKind, shut: boolean, lit: 0 | 1 | 2 = 0) {
  const inks = shut ? SHUT : kind === 'abyss' || kind === 'week-abyss' ? DEEP : LIT;
  // At rest the shield stands a step inside its square, so the chosen one is drawn larger in the same room.
  const shrink = lit === 2 ? 1 : 1 / CHOSEN_SCALE;
  return (context: OffscreenCanvasRenderingContext2D, drawn: number): void => {
    const glow = context.createRadialGradient(drawn / 2, drawn / 2, 0, drawn / 2, drawn / 2, drawn / 2);
    glow.addColorStop(0, glowOf(inks.glow, shut ? 0 : lit));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, drawn, drawn);
    const side = drawn * shrink;
    context.translate((drawn - side) / 2, (drawn - side) / 2);
    shield(context, side);
    context.fillStyle = inks.field;
    context.fill();
    context.lineWidth = side * 0.045;
    context.strokeStyle = inks.rim;
    context.stroke();
    context.save();
    context.scale(0.86, 0.86);
    context.translate(side * 0.08, side * 0.07);
    shield(context, side);
    context.restore();
    context.lineWidth = Math.max(1, side * 0.012);
    context.stroke();
    context.strokeStyle = inks.device;
    context.fillStyle = inks.device;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    DEVICES[kind](context, side);
  };
}
