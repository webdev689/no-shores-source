// The healing drink's light, as the room tells its heal: on any drinker seen from off, a faint glint at the feet and
// a few small motes and crosses swirling up round the figure, in front of it on the near side of the turn and behind it
// on the far, from the feet to just over the head; through the drinker's own eyes, a faint light at the screen's edge
// with motes drifting up its sides. All in the healing charges' red, drawn in cells as Mend's light is, red to pale
// red and fading out, gone in a second. Reduced motion keeps only the still glint and the edge: nothing circles or
// rises.
import type { FightEvent } from '../network/messages.ts';
import type { Node } from '../ui/node.ts';
import { edges, paintBox } from './barDraw.ts';
import { type Ramp, rampOf } from './markSprites.ts';
import { EVENT } from './cues.ts';
import { groundRing, groundWidth } from './spellLines.ts';
import { BODY, CLEAR, LIGHT, type Sprite, billboard, hashOf, sprite, stepOf } from './spellPixels.ts';
import { type Frame, type Point, apartFrom } from './spellPlaces.ts';

/** The heal's red, dark to white-hot: the health bar's shade, lit and tip (`BAR_TONES.blood`), and a pale hot stop. */
export const HEAL_RAMP: Ramp = rampOf('#7a1d16', '#e0584a', '#ff8a76', '#ffe2da');
/** How long a heal's light lasts (seconds). */
export const HEAL_S = 1;
/** The glint at the feet: one faint ring (metres) over the first share of the light. */
const GLINT_SHARE = 0.25;
const GLINT_M = 0.45;
const GLINT_OPACITY = 0.5;
/** The swirl: a few motes and crosses, each leaving the feet within the first share of the light and rising to over
 *  the head (metres) as it turns round the figure this many times, its circle (metres) narrowing as it rises. */
const MOTES = 6;
const CROSSES = 3;
const SWIRL_WAIT = 0.25;
const SWIRL_FEET_M = 0.1;
const SWIRL_TOP_M = 2.1;
const SWIRL_TURNS = 1.25;
const SWIRL_M = 0.5;
const SWIRL_NARROWS_M = 0.12;
/** Past this share of its flight each mote, a dot by then, goes out at a time of its own. */
const SWIRL_GONE = 0.8;
/** The screen's edge frame through the light, in six held steps, and the motes rising there. Its bands run from a
 *  warm red at the rim to a pale red inward, each fainter than the last, so it reads as light coming in, never as a
 *  dull band over the ground; at its peak they are half as wide again. */
const EDGE_STEPS = [0.12, 0.2, 0.2, 0.15, 0.1, 0.05] as const;
const EDGE_PEAK = 0.2;
const EDGE_BANDS = [
  { css: '#ff6b4f', strength: 2 },
  { css: '#ff8a76', strength: 1.2 },
  { css: '#ffa58f', strength: 0.5 },
] as const;
const EDGE_MOTES = 6;
const EDGE_BAND_PX = 8;
const EDGE_MOTE_PX = 10;
/** How far an edge mote sways across as it drifts up (band widths), and how many times. */
const EDGE_SWAY = 0.8;
const EDGE_SWAYS = 1.5;
/** An eye stands over the body's own feet only in first person (within this much across, for the view's sway): a third
 *  person's camera stands back along the look, at least `HIDE_FIGURE_M` off, even pulled in against a wall. */
const OWN_EYES_M = 0.3;

/** A mote, two cells square, and a small cross, in each stop. */
const MOTE: readonly Sprite[] = [0, 1, 2, 3].map((stop) => sprite(2, 2, () => stop));
/** A mote near its end: one cell in the light. */
const DOT: Sprite = sprite(1, 1, () => LIGHT);
const CROSS: readonly Sprite[] = [0, 1, 2, 3].map((stop) =>
  sprite(3, 3, (across, up) => (across !== 0 && up !== 0 ? CLEAR : stop)),
);

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
  if (share < GLINT_SHARE) {
    const band = groundWidth(eye, feet, 0.06);
    groundRing(frame.ground, feet, GLINT_M - band, GLINT_M, [...HEAL_RAMP[LIGHT], GLINT_OPACITY]);
  }
  if (still) return;
  // Each stands where it truly is round the figure, so the depth puts it before the figure's card on the near side of
  // its turn and behind it on the far: red, then pale red, then a single pale red cell going out at its own time; never
  // the blood's dark, nor the white-hot or a faded light, which read white or brown over the ground.
  for (let mote = 0; mote < MOTES + CROSSES; mote++) {
    const wait = SWIRL_WAIT * hashOf(id, mote, 1);
    if (share < wait) continue;
    const flown = (share - wait) / (1 - wait);
    const turn = (2 * Math.PI * mote) / (MOTES + CROSSES) + hashOf(id, mote, 2) + flown * 2 * Math.PI * SWIRL_TURNS;
    const out = SWIRL_M - SWIRL_NARROWS_M * flown;
    const up = SWIRL_FEET_M + (SWIRL_TOP_M - SWIRL_FEET_M) * flown;
    const place: Point = [feet[0] + Math.sin(turn) * out, feet[1] - Math.cos(turn) * out, feet[2] + up];
    if (flown > SWIRL_GONE + (1 - SWIRL_GONE) * hashOf(id, mote, 3)) continue;
    const picture =
      flown < 0.45 ? (mote < MOTES ? MOTE : CROSS)[BODY] : flown < 0.7 ? (mote < MOTES ? MOTE : CROSS)[LIGHT] : DOT;
    if (picture) billboard(frame.out, picture, HEAL_RAMP, place, eye);
  }
}

/** The player's own screen as it was last shown. */
let edgeShown: HealScreen = QUIET_HEAL;

/** Shows `screen`'s edge over the view from now on (`healEdgeNode` draws it). */
export function showHealEdge(screen: HealScreen): void {
  edgeShown = screen;
}

/** The heal's edge as it was last shown: faint bands round the view's edge, warm red at the rim paling inward, at the
 *  screen's opacity, and motes drifting up the sides with a gentle sway, fading as they rise; none when it has none. */
export function healEdgeNode(screen: HealScreen = edgeShown): Node | null {
  if (screen.edge <= 0) return null;
  const { motes } = screen;
  return {
    width: 'grow',
    height: 'grow',
    float: { to: 'screen', z: 1 },
    draw: (ui, box, scale, clip, fade) => {
      const wide = Math.round(EDGE_BAND_PX * (1 + (0.5 * screen.edge) / EDGE_PEAK));
      const step = wide * scale;
      EDGE_BANDS.forEach(({ css, strength }, band) => {
        const inset = band * step;
        const inner = {
          x: box.x + inset,
          y: box.y + inset,
          width: box.width - 2 * inset,
          height: box.height - 2 * inset,
        };
        edges({ ui, box, scale, clip, fade: fade * Math.min(1, screen.edge * strength) }, inner, [css], wide);
      });
      if (motes === null) return;
      const size = EDGE_MOTE_PX * scale;
      const mote = { ui, box, scale, clip, fade: fade * (0.8 - 0.6 * motes) };
      for (let each = 0; each < EDGE_MOTES; each++) {
        const right = each % 2 === 1;
        const rise = Math.min(1, motes * (0.7 + 0.6 * hashOf(each, 1)) + 0.2 * hashOf(each, 2));
        const sway = Math.sin((rise * EDGE_SWAYS + hashOf(each, 4)) * 2 * Math.PI) * EDGE_SWAY;
        const aside = (1.2 + 1.5 * hashOf(each, 3) + sway) * step;
        const x = right ? box.x + box.width - aside - size : box.x + aside;
        const y = box.y + box.height - step - rise * box.height * 0.6;
        paintBox(mote, { x, y, width: size, height: size }, EDGE_BANDS[1].css);
      }
    },
  };
}
