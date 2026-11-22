// The plates over other players' heads, as the owner's pictures of Destiny's show them: a square with their level, or
// from level 20 the Prestige of what they wear, or a speech bubble's three dots while a menu is open on their screen;
// and their name beside it. Green for the viewer's company, blue for anyone else. They show as DFO showed names over
// players: every player within the plates' reach whose head the place's blocks and land do not hide, shrinking with
// distance as a foe's plate does, laid so none covers another. The player under the crosshair within a person's reach
// wears the interact mark round their body while Use is offered on them (the game's social layer says so beside it).
import type { PlayerPlate } from '../network/plateMessages.ts';
import { BarLayout } from '../plus/barLayout.ts';
import { EMBLEM_PIXELS, svgOf } from '../plus/emblems.ts';
import { motionReduced } from '../plus/kit.ts';
import { FILLS, TONES } from '../plus/tones.ts';
import { bodyDegrees, PLATE_RANGE_M, PlateSight, plateScale } from './plateSight.ts';
import type { Node } from '../ui/node.ts';

type Point = readonly [number, number, number];

/** The level XP raises a player to at most; past it, their square shows their Prestige (crates/gear/src/power.rs). */
export const XP_LEVEL_MOST = 20;
/** How near another player must stand to be interacted with, in metres: DFO's reach for a person. */
export const SOCIAL_REACH_M = 6.4;
/** How high over a player's feet their plate's foot stands, and their head, in metres. */
const PLATE_OVER_M = 1.9;
const HEAD_M = 1.8;
/** The square's side over a figure whole, in CSS pixels: a foe's level square's. */
const SIDE = EMBLEM_PIXELS * 2 + 4;
/** About how wide a letter of a name stands at the plates' size, in CSS pixels: enough to lay plates apart. */
const LETTER_PX = 7;
/** The plate's square and name colours: the company's green, everyone else's blue. */
const COLOURS = {
  company: { fill: FILLS.green, edge: '#173d15', word: TONES.company },
  other: { fill: FILLS.ally, edge: '#12304a', word: TONES.ally },
} as const;

/** Another player as their plate is drawn: their number, where their figure's feet stand, what the room says of them,
 *  and whether they are in the viewer's company. */
export interface PlatedPlayer {
  readonly id: number;
  readonly feet: Point;
  readonly plate: PlayerPlate;
  readonly company: boolean;
}

/** How the plates see the world this frame: the camera, whether a line is blocked, where a point falls on the screen
 *  (null behind the eye) with its depth, and the viewer's own feet, from which a person's reach is measured. */
export interface PlayersViewing {
  readonly camera: { readonly eye: Point; readonly forward: Point; readonly focal: number } | null;
  readonly blocked: (from: Point, to: Point) => boolean;
  readonly spot: (point: Point) => { readonly x: number; readonly y: number; readonly depth: number } | null;
  readonly own: Point | null;
}

/** The number a plate's square shows: the level, or from level 20, the most XP gives, the Prestige. */
export function squareNumber(plate: PlayerPlate): number {
  return plate.level >= XP_LEVEL_MOST ? plate.prestige : plate.level;
}

/** The player the crosshair rests on within a person's reach of `own`, the nearest the eye of several; null for none.
 *  Only a player with a name can be interacted with: a guest has no username to be asked by. */
export function aimedPlayer(
  players: readonly PlatedPlayer[],
  camera: PlayersViewing['camera'],
  own: Point | null,
): PlatedPlayer | null {
  if (!camera || !own) return null;
  let nearest: PlatedPlayer | null = null;
  let least = Infinity;
  for (const player of players) {
    const [x, y] = player.feet;
    if (player.plate.name === '' || Math.hypot(x - own[0], y - own[1]) > SOCIAL_REACH_M) continue;
    if (bodyDegrees(camera, player.feet, HEAD_M) > 0) continue;
    const depth = Math.hypot(x - camera.eye[0], y - camera.eye[1]);
    if (depth < least) [nearest, least] = [player, depth];
  }
  return nearest;
}

/** The speech bubble a player with a menu open wears in place of their square: its three dots, and its tail. */
function bubble(fill: string, edge: string): string {
  const rows = [
    'BBBBBBBBBBBBBB',
    ...Array.from({ length: 4 }, () => 'BFFFFFFFFFFFFB'),
    'BFWWFFWWFFWWFB',
    'BFWWFFWWFFWWFB',
    ...Array.from({ length: 4 }, () => 'BFFFFFFFFFFFFB'),
    'BBFFFBBBBBBBBB',
    '.BFFB.........',
    '.BFB..........',
    '.BB...........',
  ];
  return svgOf({ rows, tones: { B: edge, F: fill, W: TONES.word } });
}

/** The interact mark round a player's body: a thin diamond, a chevron in each of its corners pointing out, drawn in
 *  lines that stay thin at any size. */
const DIAMOND = (() => {
  const line = "fill='none' stroke='rgba(244,241,232,0.85)' stroke-width='1.2' stroke-linejoin='miter'";
  const chevrons = ['M14 44 L8 50 L14 56', 'M86 44 L92 50 L86 56', 'M44 14 L50 8 L56 14', 'M44 86 L50 92 L56 86'];
  const paths = chevrons.map((way) => `<path d='${way}' ${line}/>`).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><path d='M50 1 L99 50 L50 99 L1 50 Z' ${line}/>${paths}</svg>`;
  return { svg, size: 100 };
})();

/** One plate as drawn this frame: its player, where its foot stands, its size, and its place front to back. */
interface Drawn {
  readonly player: PlatedPlayer;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly front: number;
}

/** Every other player's plate, laid each frame, and the one the crosshair rests on within reach. */
export class PlayerPlates {
  private readonly layout = new BarLayout();
  private readonly sight = new PlateSight();
  private drawn: readonly Drawn[] = [];
  /** Where the interact mark stands round the player aimed at, its middle and height in CSS pixels; null for none. */
  markAt: { readonly x: number; readonly y: number; readonly height: number } | null = null;
  /** The player whom holding Use interacts with: under the crosshair within reach, named; null for none. */
  aimed: PlatedPlayer | null = null;
  /** Whether Use is offered on the player aimed at (nothing else is within its reach, no menu is up), and how far it
   *  has been held (0 to 1; null while it is not). */
  offer: { readonly held: number | null } | null = null;

  /** Lays the plates of `players` as `viewing` sees them, `seconds` after the last frame. */
  update(players: readonly PlatedPlayer[], viewing: PlayersViewing, seconds: number): void {
    const { camera } = viewing;
    const shown: { player: PlatedPlayer; x: number; y: number; depth: number; scale: number }[] = [];
    const tried = new Set<number>();
    for (const player of players) {
      const [x, y, z] = player.feet;
      const head: Point = [x, y, z + HEAD_M];
      const far = !!camera && Math.hypot(x - camera.eye[0], y - camera.eye[1]) > PLATE_RANGE_M;
      const spot = viewing.spot([x, y, z + PLATE_OVER_M]);
      if (!spot || far) continue;
      tried.add(player.id);
      if (this.sight.hidden(player.id, !!camera && viewing.blocked(camera.eye, head), seconds)) continue;
      shown.push({ player, ...spot, scale: plateScale(spot.depth, camera?.focal ?? Number.NaN) });
    }
    this.sight.keep(tried);
    const spots = shown.map(({ player, x, y, depth, scale }) => ({
      key: player.id,
      x,
      y,
      depth,
      width: (SIDE + 6 + player.plate.name.length * LETTER_PX) * scale,
      height: SIDE * scale,
    }));
    const laid = this.layout.lay(spots, motionReduced() ? Infinity : seconds);
    this.drawn = shown.map(({ player, x, y, scale }) => {
      const place = laid.get(player.id) ?? { lift: 0, front: 0 };
      return { player, x, y: y - place.lift, scale, front: place.front };
    });
    const aimed = aimedPlayer(
      players.filter((player) => shown.some((each) => each.player.id === player.id)),
      camera,
      viewing.own,
    );
    this.aimed = aimed;
    const [feet, head] = aimed
      ? [viewing.spot(aimed.feet), viewing.spot([aimed.feet[0], aimed.feet[1], aimed.feet[2] + HEAD_M])]
      : [null, null];
    this.markAt = feet && head ? { x: feet.x, y: (feet.y + head.y) / 2, height: (feet.y - head.y) * 1.15 } : null;
  }

  /** The plates, the nearest drawn over the farther, and the interact mark round the player aimed at. */
  nodes(): Node[] {
    const order = [...this.drawn].sort((one, two) => two.front - one.front);
    const plates = order.map(({ player, x, y, scale }): Node => ({
      ...plateNode(player, scale),
      through: true,
      float: { to: 'screen', anchor: [0.5, 1], x, y: y - 4, z: 1 },
    }));
    const mark = this.markAt;
    if (!mark || mark.height < 8 || !this.offer) return plates;
    const side = Math.round(mark.height);
    const diamond: Node = {
      width: side,
      height: side,
      through: true,
      picture: {
        key: 'interact mark',
        source: { svg: DIAMOND.svg },
        pixel: { width: DIAMOND.size, height: DIAMOND.size },
      },
      float: { to: 'screen', anchor: [0.5, 0.5], x: mark.x, y: mark.y, z: 1 },
    };
    return [diamond, ...plates];
  }
}

/** A player's plate at `scale`: its square (or the bubble) and their name, in the company's colours or another's. */
export function plateNode(player: PlatedPlayer, scale: number): Node {
  const colours = player.company ? COLOURS.company : COLOURS.other;
  const side = Math.round(SIDE * scale);
  const { plate } = player;
  const square: Node = plate.menu
    ? {
        width: side,
        height: Math.round((side * 15) / 14),
        picture: {
          key: `bubble ${colours.fill}`,
          source: { svg: bubble(colours.fill, colours.edge) },
          pixel: { width: 14, height: 15 },
        },
        offset: [0, Math.round(side / 14)],
      }
    : {
        width: side,
        height: side,
        fill: colours.fill,
        outline: { width: 1, colour: colours.edge },
        alignX: 'center',
        alignY: 'center',
        children: [{ text: { words: String(squareNumber(plate)), colour: TONES.word, edge: 'halo', wrap: false } }],
      };
  return {
    direction: 'row',
    alignY: 'center',
    gap: Math.round(5 * scale),
    children: [
      square,
      plate.name !== '' && { text: { words: plate.name, colour: colours.word, edge: 'halo', wrap: false } },
    ],
  };
}
