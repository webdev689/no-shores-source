// The Art's abilities at the bottom left, as Destiny shows a Super and its abilities: the Anima's icon in a diamond,
// lit from the bottom as it charges and glowing once full; the two Tenets' icons in rings, a dark wedge over each
// sweeping clockwise away as it recharges, its last seconds counted in it, the ring lit once ready. Each has its key on
// a keycap under it. A spell just cast flashes its frame white; while the player cannot cast (staggered, down, dead),
// every icon greys under a hatch; one its road has not earned stands dark under a padlock, saying which road earns it.
// What it shows is worked out from the room's numbers alone.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { motionReduced } from '../plus/kit.ts';
import { TONES } from '../plus/tones.ts';
import { LOCK_MAP, mapSvg } from '../player/artGlyphs.ts';
import { roadOf } from '../player/factionNames.ts';
import { ELEMENTS } from '../player/gear.ts';
import type { Child, Node, Picture } from '../ui/node.ts';
import { keycapNode } from './barDraw.ts';
import { ARMS_SIZES, DIAMOND_CELLS, RING_CELLS } from './hudLayout.ts';

/** The keys that cast the Anima and the two Tenets. */
export const ABILITY_KEYS = ['R', 'Q', 'G'] as const;
/** The Anima's icon's rows: it lights a whole row of its picture at a time. */
export const ANIMA_ROWS = 24;
/** A Tenet's icon's cells, and the clear middle of its ring, across. */
const TENET_CELLS = 12;
const RING_CLEAR = 14;
/** The steps a Tenet's wedge sweeps in, round the circle. */
const SWEEP_STEPS = 60;
/** A Tenet counts its seconds only once fewer than this are left. */
const COUNT_UNDER = 10;
/** How long a spell just cast flashes, in seconds. */
export const USED_SECONDS = 0.5;
/** Float error left by a share worked out from ticks, kept from tipping a step. */
const EPSILON = 1e-9;

/** What the bar is shown from: the Art worn (its id in the Arts' file, 0 for none), how far the Anima has charged,
 *  and how far each Tenet has recharged, each a share from 0 (just cast) to 1 (ready); and what its road has earned
 *  (1 the Art, 2 its first Tenet, 4 its second), every bit where none is said. */
export interface AbilityState {
  readonly art: number;
  readonly animaShare: number;
  readonly tenets: readonly [number, number];
  readonly earned?: number;
}

/** A Tenet as the bar shows it: how many degrees of its wedge are still dark, clockwise from the top, the seconds
 *  written in it (none until fewer than ten are left), and whether it is ready. */
export interface TenetShown {
  readonly sweep: number;
  readonly seconds: string;
  readonly ready: boolean;
}

/** What the bar shows: the Art, how many of the Anima's rows are lit from the bottom, whether it is full, each
 *  Tenet, and which of the Anima and the Tenets its road has not yet earned. */
export interface AbilityShown {
  readonly art: number;
  readonly animaRows: number;
  readonly animaFull: boolean;
  readonly tenets: readonly [TenetShown, TenetShown];
  readonly locked: readonly [boolean, boolean, boolean];
}

/** The pictures the bar draws an Art with, as SVG: its Anima's icon and that icon's outline alone, its two Tenets'
 *  icons, and the Anima's diamond and a Tenet's ring. The game's glyphs make them, so the HUD needs no picture of its
 *  own. */
export interface ArtPictures {
  readonly anima: string;
  readonly animaOutline: string;
  readonly tenets: readonly [string, string];
  readonly diamond: string;
  readonly ring: string;
}

const share = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** A Tenet recharging over `rechargeS` seconds, `charged` of the way. */
export function tenetShown(charged: number, rechargeS: number): TenetShown {
  const left = 1 - share(charged);
  const counted = Math.ceil(left * rechargeS - EPSILON);
  const steps = Math.max(0, Math.ceil(left * SWEEP_STEPS - EPSILON));
  return {
    sweep: (steps * 360) / SWEEP_STEPS,
    seconds: counted > 0 && counted < COUNT_UNDER ? String(counted) : '',
    ready: left <= 0,
  };
}

/** What the bar shows for `state`. */
export function abilityBarOf(state: AbilityState): AbilityShown {
  const tenets = arts.arts.find((art) => art.id === state.art)?.tenets ?? [];
  const charged = share(state.animaShare);
  const lockedOf = (bit: number) => ((state.earned ?? 0b111) & bit) === 0;
  return {
    art: state.art,
    animaRows: Math.floor(charged * ANIMA_ROWS + EPSILON),
    animaFull: charged >= 1,
    tenets: [
      tenetShown(state.tenets[0], tenets[0]?.rechargeS ?? 0),
      tenetShown(state.tenets[1], tenets[1]?.rechargeS ?? 0),
    ],
    locked: [lockedOf(1), lockedOf(2), lockedOf(4)],
  };
}

/** Which of the Anima and the two Tenets were spent between `was` and `now`: full before, short of it after. */
export function spentBetween(was: AbilityState | null, now: AbilityState): readonly [boolean, boolean, boolean] {
  const spent = (before: number | undefined, after: number) => before !== undefined && before >= 1 && after < 1;
  const same = was?.art === now.art;
  return [
    same && spent(was.animaShare, now.animaShare),
    same && spent(was.tenets[0], now.tenets[0]),
    same && spent(was.tenets[1], now.tenets[1]),
  ];
}

/** An SVG picture with its colours turned by a filter: `saturate` keeps that share of its colour (0 grey), and
 *  `brightness` scales its light, as CSS's filters of those names do. */
export function filteredSvg(svg: string, saturate: number, brightness: number): string {
  if (saturate === 1 && brightness === 1) return svg;
  const parts = /^\s*(<svg[^>]*>)([\s\S]*)(<\/svg>)\s*$/.exec(svg);
  if (!parts) return svg;
  const slope = `type="linear" slope="${brightness}"`;
  const filter = `<defs><filter id="turned" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${saturate}"/><feComponentTransfer><feFuncR ${slope}/><feFuncG ${slope}/><feFuncB ${slope}/></feComponentTransfer></filter></defs>`;
  return `${parts[1]}${filter}<g filter="url(#turned)">${parts[2]}</g>${parts[3]}`;
}

/** The dark wedge over a recharging Tenet, `sweep` degrees of it still dark, running clockwise to the top. */
const sweepDrawing =
  (sweep: number) =>
  (context: OffscreenCanvasRenderingContext2D, width: number, height: number): void => {
    const [middleX, middleY] = [width / 2, height / 2];
    const start = -Math.PI / 2 + ((360 - sweep) * Math.PI) / 180;
    context.fillStyle = 'rgba(5, 6, 8, 0.72)';
    context.beginPath();
    context.moveTo(middleX, middleY);
    context.arc(middleX, middleY, Math.min(middleX, middleY), start, (3 * Math.PI) / 2);
    context.closePath();
    context.fill();
  };

/** The hatch over an ability while the player cannot cast: dark stripes 3 px wide and 3 apart, in a circle. */
const hatchDrawing = (context: OffscreenCanvasRenderingContext2D, width: number, height: number): void => {
  context.beginPath();
  context.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, 2 * Math.PI);
  context.clip();
  context.strokeStyle = 'rgba(5, 6, 8, 0.75)';
  const unit = width / 30;
  context.lineWidth = 3 * unit * Math.SQRT1_2 * 1.4;
  for (let along = -height; along < width + height; along += 6 * unit * Math.SQRT2) {
    context.beginPath();
    context.moveTo(along, 0);
    context.lineTo(along - height, height);
    context.stroke();
  }
};

/** The bar on the HUD, kept each frame from an `AbilityState` and drawn from what it last kept. */
export class AbilityBar {
  private readonly pictures: (art: number) => ArtPictures | null;
  private shown: AbilityShown | null = null;
  private state: AbilityState | null = null;
  private unable = false;
  /** How long each of the Anima and the Tenets has to flash yet, having just been cast; and the bar's own clock, which
   *  times the full Anima's glow. */
  private readonly used = [0, 0, 0];
  private clock = 0;
  /** Each picture's SVG with its colours turned, by its key, made once. */
  private readonly turned = new Map<string, string>();

  constructor(pictures: (art: number) => ArtPictures | null) {
    this.pictures = pictures;
  }

  /** Shows `state` `seconds` on, greyed while the player is `unable` to cast. */
  update(state: AbilityState, seconds = 0, unable = false): void {
    const spent = spentBetween(this.state, state);
    this.shown = abilityBarOf(state);
    this.state = state;
    this.unable = unable;
    this.clock += seconds;
    spent.forEach(
      (cast, index) => (this.used[index] = cast ? USED_SECONDS : Math.max(0, (this.used[index] ?? 0) - seconds)),
    );
  }

  /** Hides the bar until it is next shown a state. */
  hide(): void {
    [this.shown, this.state] = [null, null];
  }

  /** What a screen reader says of each ability: its name, then ready, charging with its share, or its seconds; or,
   *  not yet earned, which road earns it. */
  words(): readonly string[] {
    const shown = this.shown;
    const art = shown && arts.arts.find((each) => each.id === shown.art);
    if (!art || !shown || !this.state) return [];
    const unable = this.unable;
    const lock = (index: number, how: string) => (shown.locked[index] ? `earned on ${roadOf(art.id)}` : how);
    const animaWords = shown.animaFull ? 'ready' : `charging, ${Math.floor(share(this.state.animaShare) * 100)}%`;
    return [
      `${art.anima.name} (${ABILITY_KEYS[0]}), ${lock(0, unable ? 'cannot be cast now' : animaWords)}`,
      ...shown.tenets.map((tenet, index) => {
        const name = art.tenets[index]?.name ?? '';
        const left = Math.ceil((1 - share(this.state?.tenets[index] ?? 0)) * (art.tenets[index]?.rechargeS ?? 0));
        const how = unable ? 'cannot be cast now' : tenet.ready ? 'ready' : `${left} s to recharge`;
        return `${name} (${ABILITY_KEYS[index + 1]}), ${lock(index + 1, how)}`;
      }),
    ];
  }

  /** The bar at its step (`wide`) and `zoom`: the Anima's diamond and the two Tenets' rings, each over its key; none
   *  without an Art drawn. */
  node(wide: boolean, zoom = 1): Node | null {
    const shown = this.shown;
    const pictures = shown && this.pictures(shown.art);
    const element = shown && ELEMENTS[arts.arts.find((each) => each.id === shown.art)?.element ?? 0];
    if (!shown || !pictures || !element) return null;
    const { cell, gap } = wide ? ARMS_SIZES.wide : ARMS_SIZES.base;
    const unit = cell * zoom;
    const still = motionReduced();
    const unable = this.unable;
    const words = this.words();
    /** A picture of the bar's, keyed by the Art and its look, its colours turned as `look` asks. */
    const picture = (name: string, svg: string, saturate = 1, brightness = 1, tint?: string): Picture => {
      const [turnedSaturate, turnedBrightness] = unable ? [0, 0.6 * brightness] : [saturate, brightness];
      const key = `art ${shown.art} ${name} ${turnedSaturate} ${turnedBrightness}`;
      let turned = this.turned.get(key);
      if (turned === undefined) this.turned.set(key, (turned = filteredSvg(svg, turnedSaturate, turnedBrightness)));
      return {
        key,
        source: { svg: turned },
        ...(tint ? { tint } : {}),
      };
    };
    const layered = (side: number, children: readonly Child[]): Node => ({ width: side, height: side, children });
    const whole = (made: Picture, more: Partial<Node> = {}): Node => ({
      width: 'grow',
      height: 'grow',
      picture: made,
      ...more,
      float: { z: 1, ...more.float },
    });
    /** A frame with its hard shadow, and, while it glows, the Art's colour round it `glow` pixels out. */
    const framed = (
      name: string,
      svg: string,
      saturate: number,
      brightness: number,
      glow: number,
      side: number,
    ): Child[] => [
      glow > 0 && {
        width: side + 2 * glow,
        height: side + 2 * glow,
        opacity: 0.45,
        picture: picture(name, svg, 1, 1, element.colour),
        float: { x: -glow, y: -glow, z: 1 },
      },
      whole(picture(name, svg, saturate, brightness, TONES.outline), { float: { x: 1, y: 1 } }),
      whole(picture(name, svg, saturate, brightness)),
    ];
    const glowing = (this.clock / 0.4) % 8;
    const pulse = still ? 2 : 1 + Math.floor(glowing < 4 ? glowing : 8 - glowing) / 1.5;
    const usedFor = (index: number) => (this.used[index] ?? 0) > USED_SECONDS / 2 && !still;
    const usedRing = (index: number): Child =>
      (this.used[index] ?? 0) > 0 && still
        ? { width: 'grow', height: 'grow', outline: { width: 2, colour: '#ffffff' }, float: { z: 1 } }
        : null;
    const artElement = arts.arts.find((each) => each.id === shown.art)?.element ?? 0;
    /** A padlock over an ability its road has not earned. */
    const lockOver = (index: number): Child =>
      shown.locked[index]
        ? {
            width: 10 * unit,
            height: 12 * unit,
            picture: { key: `ability lock ${artElement}`, source: { svg: mapSvg(LOCK_MAP, artElement) } },
            float: { at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
          }
        : null;
    const hatchOver = (side: number): Child =>
      unable
        ? {
            width: Math.round(side * 0.56),
            height: Math.round(side * 0.56),
            picture: { key: 'unable hatch', source: { draw: hatchDrawing } },
            float: { at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
          }
        : null;
    const diamond = DIAMOND_CELLS * unit;
    const icon = ANIMA_ROWS * unit;
    const [animaLocked] = shown.locked;
    const full = shown.animaFull && !animaLocked;
    const lit = animaLocked ? 0 : Math.round((shown.animaRows / ANIMA_ROWS) * icon);
    const anima = layered(diamond, [
      ...framed(
        'diamond',
        pictures.diamond,
        full ? 1 : animaLocked ? 0 : 0.45,
        usedFor(0) ? 3 : full ? 1 : animaLocked ? 0.5 : 0.8,
        full ? Math.round(pulse * zoom) : 0,
        diamond,
      ),
      {
        width: icon,
        height: icon,
        float: { at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
        children: [
          whole(picture('anima unlit', pictures.anima, 0.15, 0.5)),
          whole(picture('anima outline', pictures.animaOutline)),
          lit > 0 && {
            width: 'grow',
            height: lit,
            clip: true,
            float: { at: [0, 1], anchor: [0, 1], z: 1 },
            children: [
              {
                width: icon,
                height: icon,
                picture: picture('anima lit', pictures.anima),
                float: { at: [0, 1], anchor: [0, 1], z: 1, clipped: true },
              },
            ],
          },
        ],
      },
      hatchOver(diamond),
      lockOver(0),
      usedRing(0),
    ]);
    const ring = RING_CELLS * unit;
    const tenet = (index: 0 | 1): Node => {
      const state = shown.tenets[index];
      const locked = shown.locked[index + 1] ?? false;
      const ready = state.ready && !locked;
      const counting = state.seconds !== '' && !locked;
      return layered(ring, [
        ...framed(
          'ring',
          pictures.ring,
          ready ? 1 : locked ? 0 : 0.45,
          usedFor(index + 1) ? 3 : ready ? 1.25 : locked ? 0.5 : 0.8,
          ready ? 2 * zoom : 0,
          ring,
        ),
        {
          width: TENET_CELLS * unit,
          height: TENET_CELLS * unit,
          ...(counting ? { opacity: 0.3 } : {}),
          picture: picture(`tenet ${index}`, pictures.tenets[index], ready ? 1 : locked ? 0 : 0.5, ready ? 1 : 0.7),
          float: { at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
        },
        !ready &&
          !locked && {
            width: RING_CLEAR * unit,
            height: RING_CLEAR * unit,
            picture: { key: `tenet sweep ${state.sweep}`, source: { draw: sweepDrawing(state.sweep) } },
            float: { at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
          },
        counting && {
          text: {
            words: state.seconds,
            size: (cell === 2 ? 2 : 3) * zoom,
            colour: TONES.word,
            edge: 'halo',
            wrap: false,
          },
          float: { at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
        },
        hatchOver(ring),
        lockOver(index + 1),
        usedRing(index + 1),
      ]);
    };
    const keyTall = cell === 2 ? 17 : 27;
    const slot = (made: Node, key: string, label: string): Node => ({
      direction: 'column',
      alignX: 'center',
      label,
      children: [
        made,
        { height: (keyTall - cell * 3) * zoom },
        {
          ...keycapNode(key, cell === 2 ? 1 : 2, cell * 9, keyTall, zoom),
          float: { at: [0.5, 1], anchor: [0.5, 1], z: 1 },
        },
      ],
    });
    return {
      label: 'Your Art',
      direction: 'row',
      alignY: 'end',
      gap: gap * zoom,
      children: [
        slot(anima, ABILITY_KEYS[0], words[0] ?? ''),
        slot(tenet(0), ABILITY_KEYS[1], words[1] ?? ''),
        slot(tenet(1), ABILITY_KEYS[2], words[2] ?? ''),
      ],
    };
  }
}
