// The plates over other players' heads, as the owner's pictures of Destiny's show them: a square with their level, in
// gold past level 20, or a speech bubble's three dots while a menu is open on their screen; and their name beside it. Green for the viewer's company, blue for anyone else. They show as DFO showed names over
// players: every player within the plates' reach whose head the place's blocks and land do not hide, shrinking with
// distance as a foe's plate does, laid so none covers another. The player under the crosshair within a person's reach
// wears the interact mark round their body while Use is offered on them (the game's social layer says so beside it).
import type { PlayerPlate } from '../network/plateMessages.ts';
import { BarLayout } from '../plus/barLayout.ts';
import { EMBLEM_PIXELS, svgOf } from '../plus/emblems.ts';
import { motionReduced } from '../plus/kit.ts';
import { FILLS, TONES } from '../plus/tones.ts';
import { LEVEL_BY_XP } from '../rules/fleetRules.ts';
import { bodyDegrees, HEAD_M, PLATE_OVER_M, PLATE_RANGE_M, PlateSight, plateScale } from './plateSight.ts';
import type { Node } from '../ui/node.ts';

type Point = readonly [number, number, number];

/** How near another player must stand to be interacted with, in metres: DFO's reach for a person. */
export const SOCIAL_REACH_M = 6.4;
/** The square's side over a figure whole, in CSS pixels: a foe's level square's. */
const SIDE = EMBLEM_PIXELS * 2 + 4;
/** The interact mark's least and most side, and the steps it grows in, in CSS pixels. */
const MARK = { least: 8, most: 480, step: 8 } as const;
/** About how wide a letter of a name stands at the plates' size, in CSS pixels: enough to lay plates apart. */
const LETTER_PX = 7;
/** The plate's square and name colours: the company's green, everyone else's blue. */
const COLOURS = {
  company: { fill: FILLS.green, edge: '#173d15', word: TONES.company },
  other: { fill: FILLS.ally, edge: '#12304a', word: TONES.ally },
} as const;

/** Another player as their plate is drawn: their number, where their figure's feet stand, what the room says of them,
 *  whether they are in the viewer's company, and whether a Breach marks them Rewritten. */
export interface PlatedPlayer {
  readonly id: number;
  readonly feet: Point;
  readonly plate: PlayerPlate;
  readonly company: boolean;
  readonly marked?: boolean;
}

/** The Rewritten's word on a plate, in the pale violet of the ring under them (`breachView.ts`). */
const REWRITTEN = '#c4a8ff';

/** How the plates see the world this frame: the camera, whether a line is blocked, where a point falls on the screen
 *  (null behind the eye) with its depth, and the viewer's own feet, from which a person's reach is measured. */
export interface PlayersViewing {
  readonly camera: { readonly eye: Point; readonly forward: Point; readonly focal: number } | null;
  readonly blocked: (from: Point, to: Point) => boolean;
  readonly spot: (point: Point) => { readonly x: number; readonly y: number; readonly depth: number } | null;
  readonly own: Point | null;
}

/** The colour of a plate's level: gold for the levels past 20, which Prestige raises, else the words' own. */
export const levelInk = (level: number): string => (level > LEVEL_BY_XP ? TONES.brassHi : TONES.word);

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
    if (Math.hypot(x - own[0], y - own[1]) > SOCIAL_REACH_M) continue;
    if (bodyDegrees(camera, player.feet, HEAD_M) > 0) continue;
    const depth = Math.hypot(x - camera.eye[0], y - camera.eye[1]);
    if (depth < least) [nearest, least] = [player, depth];
  }
  // A guest nearer on the line stands in the way of one behind them, as a body does.
  return nearest?.plate.name === '' ? null : nearest;
}

/** Each colour's speech bubble, made once. */
const BUBBLES = new Map<string, string>();

/** The speech bubble a player with a menu open wears in place of their square: its three dots, and its tail. */
function bubble(fill: string, edge: string): string {
  const made = BUBBLES.get(fill);
  if (made) return made;
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
  const svg = svgOf({ rows, tones: { B: edge, F: fill, W: TONES.word } });
  BUBBLES.set(fill, svg);
  return svg;
}

/** The interact mark round a player's body: a thin diamond, a chevron in each of its corners pointing out. */
const DIAMOND = (() => {
  // Its lines stand 1.5 px wide however large it is drawn.
  const line =
    "fill='none' stroke='rgba(244,241,232,0.85)' stroke-width='1.5' vector-effect='non-scaling-stroke' stroke-linejoin='miter'";
  const chevrons = ['M14 44 L8 50 L14 56', 'M86 44 L92 50 L86 56', 'M44 14 L50 8 L56 14', 'M44 86 L50 92 L56 86'];
  const paths = chevrons.map((way) => `<path d='${way}' ${line}/>`).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><path d='M50 1 L99 50 L50 99 L1 50 Z' ${line}/>${paths}</svg>`;
  return { svg };
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
      // The name's letters are drawn whole at any distance: only the square shrinks.
      width: (SIDE + 6) * scale + player.plate.name.length * LETTER_PX,
      height: SIDE * scale,
    }));
    const laid = this.layout.lay(spots, motionReduced() ? Infinity : seconds);
    this.drawn = shown.map(({ player, x, y, scale }) => {
      const place = laid.get(player.id) ?? { lift: 0, front: 0 };
      return { player, x, y: y - place.lift, scale, front: place.front };
    });
    const seen = new Set(shown.map((each) => each.player.id));
    const aimed = aimedPlayer(
      players.filter((player) => seen.has(player.id)),
      camera,
      viewing.own,
    );
    this.aimed = aimed;
    const [feet, head] = aimed
      ? [viewing.spot(aimed.feet), viewing.spot([aimed.feet[0], aimed.feet[1], aimed.feet[2] + HEAD_M])]
      : [null, null];
    this.markAt = feet && head ? { x: feet.x, y: (feet.y + head.y) / 2, height: (feet.y - head.y) * 1.15 } : null;
  }

  /** The plates, the nearest drawn over the farther (those `hidden` says laid unseen), and the interact mark round the
   *  player aimed at. */
  nodes(hidden: (id: string, x: number, y: number) => boolean = () => false): Node[] {
    const order = [...this.drawn].sort((one, two) => two.front - one.front);
    const plates = order.map(({ player, x, y, scale }): Node => ({
      ...plateNode(player, scale),
      id: `player-plate-${player.id}`,
      ...(hidden(`player-plate-${player.id}`, x, y - 4) ? { opacity: 0 } : {}),
      through: true,
      float: { to: 'screen', anchor: [0.5, 1], x, y: y - 4, z: 1 },
    }));
    const mark = this.markAt;
    if (!mark || mark.height < MARK.least || !this.offer) return plates;
    // Drawn at its own size, so its lines stay thin; in steps, so a body walking near draws it again only now and then.
    const side = Math.min(MARK.most, Math.round(mark.height / MARK.step) * MARK.step);
    const diamond: Node = {
      width: side,
      height: side,
      through: true,
      picture: { key: 'interact mark', source: { svg: DIAMOND.svg } },
      float: { to: 'screen', anchor: [0.5, 0.5], x: mark.x, y: mark.y, z: 1 },
    };
    return [diamond, ...plates];
  }
}

/** A player's plate at `scale`: its square (or the bubble) and their name, in the company's colours or another's, and
 *  the Breach's Rewritten mark after it while they bear it. */
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
        children: [{ text: { words: String(plate.level), colour: levelInk(plate.level), edge: 'halo', wrap: false } }],
      };
  return {
    direction: 'row',
    alignY: 'center',
    gap: Math.round(5 * scale),
    children: [
      square,
      plate.name !== '' && { text: { words: plate.name, colour: colours.word, edge: 'halo', wrap: false } },
      !!player.marked && { text: { words: 'Rewritten', colour: REWRITTEN, edge: 'halo', wrap: false } },
    ],
  };
}
