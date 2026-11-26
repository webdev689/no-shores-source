// The healing drink's light, as the room tells its heal: on any drinker seen from off, a soft ring flares at the feet,
// motes and small crosses rise off the body and a brief glow wraps the figure; through the drinker's own eyes, a glow
// pulses round the screen's edge with motes rising there. All in the healing charges' red, drawn in cells as Mend's
// light is, held in steps, and gone in a second. Reduced motion keeps the ring and the glows still and lets no mote
// rise.
import type { Rgb } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import type { Node } from '../ui/node.ts';
import { edges, paintBox } from './barDraw.ts';
import { EVENT } from './cues.ts';
import { groundRing, groundWidth } from './spellLines.ts';
import { BODY, CLEAR, GLINTS, DARK, LIGHT, type Sprite, billboard, hashOf, sprite, stepOf } from './spellPixels.ts';
import { type Frame, type Point, apartFrom, onBody } from './spellPlaces.ts';

const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
];
/** The heal's red, dark to white-hot: the health bar's shade, lit and tip (`BAR_TONES.blood`), and a pale hot stop. */
export const HEAL_RAMP: readonly [Rgb, Rgb, Rgb, Rgb] = [
  rgb('#7a1d16'),
  rgb('#e0584a'),
  rgb('#ff8a76'),
  rgb('#ffe2da'),
];
/** How long a heal's light lasts (seconds). */
export const HEAL_S = 1;
/** The ring at the feet flares over this share of the light, swelling in three steps (metres), cooling as it goes. */
const RING_SHARE = 0.5;
const RING_M = [0.45, 0.75, 1.05] as const;
// Its white-hot reads white, not red, on the ground: the light leads.
const RING_STOPS = [LIGHT, BODY, DARK] as const;
const RING_OPACITY = [0.9, 0.7, 0.45] as const;
/** The step a still ring holds. */
const RING_STILL = 1;
/** The glow round the figure over this share of the light, cooling in two steps. */
const GLOW_SHARE = 0.4;
/** The motes and crosses rising off the body. */
const MOTES = 8;
const CROSSES = 4;
/** The screen's edge frame through the light, in six held steps, and the motes rising there. */
const EDGE_STEPS = [0.3, 0.45, 0.45, 0.32, 0.2, 0.08] as const;
const EDGE_MOTES = 8;
const EDGE_BAND_PX = 8;
const EDGE_MOTE_PX = 6;
/** An eye stands over the body's own feet only in first person (within this much across, for the view's sway): a third
 *  person's camera stands back along the look, at least `HIDE_FIGURE_M` off, even pulled in against a wall. */
const OWN_EYES_M = 0.3;

/** A hollow oval a little wider than a figure and as tall, its outer band a stop under its inner: the glow that wraps
 *  the drinker, hot as it comes and cooling. */
const GLOWS: readonly Sprite[] = [LIGHT, BODY].map((inner) =>
  sprite(35, 61, (across, up) => {
    const apart = Math.hypot(across / 17, up / 30);
    if (apart > 1) return CLEAR;
    return apart > 0.94 ? inner - 1 : apart > 0.88 ? inner : CLEAR;
  }),
);
/** A mote: two cells square, in each stop. */
const MOTE: readonly Sprite[] = [0, 1, 2, 3].map((stop) => sprite(2, 2, () => stop));

/** The player's own screen through their heal: the edge frame's opacity (0 for none), and how far its motes have
 *  risen, 0 to 1 (null for none). */
export interface HealScreen {
  readonly edge: number;
  readonly motes: number | null;
}
/** A screen no heal takes. */
export const QUIET_HEAL: HealScreen = { edge: 0, motes: null };

interface Job {
  readonly far: number;
  readonly run: () => void;
}

/** Every drinker's heal light, frame by frame. */
export class HealLights {
  /** The drinkers whose heal was heard since the last frame. */
  private readonly pending: number[] = [];
  /** Each drinker's light, by the room's number for them: the clock it began at. */
  private readonly lights = new Map<number, number>();
  /** The player's own screen, as the last frame left it. */
  screen: HealScreen = QUIET_HEAL;

  /** Takes a frame's events: each heal that gave health back lights its drinker. */
  heard(events: readonly FightEvent[]): void {
    for (const event of events)
      if (event.kind === EVENT.healed && event.amount > 0 && this.pending.length < 64)
        this.pending.push(event.defender);
  }

  /** Lays one frame's lights as `jobs`, each drinker's at their feet; the player's own through their eyes takes their
   *  screen instead. `still` for reduced motion. */
  frame(frame: Frame, jobs: Job[], still: boolean): void {
    for (const id of this.pending.splice(0)) this.lights.set(id, frame.clock);
    this.screen = QUIET_HEAL;
    for (const [id, from] of this.lights) {
      const share = (frame.clock - from) / HEAL_S;
      const drinker = frame.players.find((player) => player.id === id);
      if (share >= 1 || share < 0 || !drinker) {
        if (share >= 1 || share < 0) this.lights.delete(id);
        continue;
      }
      const across = Math.hypot(frame.eye[0] - drinker.feet[0], frame.eye[1] - drinker.feet[1]);
      const up = frame.eye[2] - drinker.feet[2];
      if (id === frame.own && across < OWN_EYES_M && up > 0 && up < 3) {
        this.screen = { edge: EDGE_STEPS[stepOf(share, EDGE_STEPS.length)] ?? 0, motes: still ? null : share };
        continue;
      }
      const { feet } = drinker;
      jobs.push({ far: apartFrom(frame.eye, feet), run: () => healOn(frame, feet, id, share, still) });
    }
  }

  /** Lets every light go: the room left. */
  clear(): void {
    this.pending.length = 0;
    this.lights.clear();
    this.screen = QUIET_HEAL;
  }
}

/** One drinker's light `share` of the way through, its feet at `feet`. */
function healOn(frame: Frame, feet: Point, id: number, share: number, still: boolean): void {
  const { eye } = frame;
  if (share < RING_SHARE) {
    const step = still ? RING_STILL : stepOf(share / RING_SHARE, RING_M.length);
    const radius = RING_M[step] ?? RING_M[0];
    const band = groundWidth(eye, feet, 0.1);
    const colour = [...(HEAL_RAMP[RING_STOPS[step] ?? BODY] ?? HEAL_RAMP[BODY]), RING_OPACITY[step] ?? 0.5] as const;
    groundRing(frame.ground, feet, radius - band, radius, colour);
  }
  if (share < GLOW_SHARE) {
    const glow = GLOWS[still ? 0 : stepOf(share / GLOW_SHARE, GLOWS.length)];
    if (glow) billboard(frame.out, glow, HEAL_RAMP, onBody(feet, eye, 0.5, 0.47), eye);
  }
  if (still) return;
  // Each rises at its own pace from its own place on the body, cooling a stop each third of the light.
  const cooled = LIGHT - stepOf(share, 3);
  for (let mote = 0; mote < MOTES + CROSSES; mote++) {
    const rise = Math.min(1, share * (0.8 + 0.5 * hashOf(id, mote, 1)) + 0.15 * hashOf(id, mote, 2));
    const place = onBody(feet, eye, hashOf(id, mote, 3), rise * 1.1, 0.1);
    const picture = mote < MOTES ? MOTE[cooled] : GLINTS[cooled];
    if (picture) billboard(frame.out, picture, HEAL_RAMP, place, eye);
  }
}

/** The player's own screen as it was last shown. */
let edgeShown: HealScreen = QUIET_HEAL;
const cssOf = ([red, green, blue]: Rgb) =>
  `rgb(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)})`;

/** Shows `screen`'s edge over the view from now on (`healEdgeNode` draws it). */
export function showHealEdge(screen: HealScreen): void {
  edgeShown = screen;
}

/** The heal's edge as it was last shown: hard bands 8 pixels each round the view's edge, the red's light outside its
 *  body, at the screen's opacity, and motes rising up the sides in its light, fading as they rise; none when it
 *  has none. */
export function healEdgeNode(screen: HealScreen = edgeShown): Node | null {
  if (screen.edge <= 0) return null;
  const { motes } = screen;
  return {
    width: 'grow',
    height: 'grow',
    float: { to: 'screen', z: 1 },
    draw: (ui, box, scale, clip, fade) => {
      const pen = { ui, box, scale, clip, fade: fade * screen.edge };
      const step = EDGE_BAND_PX * scale;
      edges(pen, box, [cssOf(HEAL_RAMP[LIGHT])], EDGE_BAND_PX);
      const inner = { x: box.x + step, y: box.y + step, width: box.width - 2 * step, height: box.height - 2 * step };
      edges(pen, inner, [cssOf(HEAL_RAMP[BODY])], EDGE_BAND_PX);
      if (motes === null) return;
      const size = EDGE_MOTE_PX * scale;
      const mote = { ...pen, fade: fade * (0.9 - 0.6 * motes) };
      for (let each = 0; each < EDGE_MOTES; each++) {
        const right = each % 2 === 1;
        const rise = Math.min(1, motes * (0.7 + 0.6 * hashOf(each, 1)) + 0.2 * hashOf(each, 2));
        const aside = (0.5 + 2.5 * hashOf(each, 3)) * step;
        const x = right ? box.x + box.width - aside - size : box.x + aside;
        const y = box.y + box.height - step - rise * box.height * 0.6;
        paintBox(mote, { x, y, width: size, height: size }, cssOf(HEAL_RAMP[LIGHT]));
      }
    },
  };
}
