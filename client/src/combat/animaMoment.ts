// An Anima's moment, as a Super is cast in the games that have one: while the player's own cast charges, its Art's
// sigil lights ring by ring at their feet; at the release every screen sees the sigil flare, a ring burst out across
// the ground and the Art's own flourish (lightning from the sky, the sun's shaft, a raven's dusk), and the caster's own
// screen takes a frame of the element round its edge and a push in. No flash fills the screen, and none comes faster
// than an Anima can be cast.
import { GLOW_RAMPS, type GlowElement, type GlowLook } from '../elementGlow.ts';
import { SPELLS } from '../network/artMessages.ts';
import type { Lands } from './spellLands.ts';
import { BLAZE, COSMIC, type Frame, type Point, VOLT, apartFrom, seenFrom, shoulderOf } from './spellPlaces.ts';
import { sigilSprite, sigilState } from './spellPictures.ts';
import { BODY, CELL_M, LIGHT, groundSprite } from './spellPixels.ts';

/** Each Anima's Art (1 Storm, 2 Divine, 3 Shadow) and element, by its spell. */
const ANIMAS: ReadonlyMap<number, { readonly art: number; readonly look: GlowElement }> = new Map([
  [SPELLS.tempest, { art: 1, look: VOLT }],
  [SPELLS.sunwell, { art: 2, look: BLAZE }],
  [SPELLS.duskraven, { art: 3, look: COSMIC }],
]);
/** A cast's charge, as the room holds it (ticks), and how long past it a sigil waits for its release before it lets go
 *  (a cast refused or lost; seconds). */
const CHARGE_TICKS = 18;
const CHARGE_MOST_S = 1;
/** A sigil's cell: three of a figure's pixels, so its 63 cells lie 3 m across. */
const SIGIL_CELL_M = 1.5 * CELL_M;
/** A caster's release is marked once in this long (seconds): a Tempest's later orbs are the same cast. */
const ONE_RELEASE_S = 2;
/** Sparks are thrown only from farther from the eye than this (metres). */
const NEAR_EYE_M = 2;
/** The Sunwell's sun stands this high over the ground and this far along its caster's aim from its middle (metres). */
const SUN_UP_M = 3.5;
const SUN_AHEAD_M = 1.5;
/** The caster's screen at each frame after the release: the edge frame's opacity, and the view's push in. */
const EDGE_STEPS = [0.25, 0.25, 0.17, 0.17, 0.09, 0.09] as const;
const PUSH_STEPS = [
  0.05, 0.05, 0.05, 0.05, 0.04, 0.04, 0.04, 0.04, 0.03, 0.03, 0.03, 0.03, 0.02, 0.02, 0.02, 0.02, 0.01, 0.01, 0.01,
  0.01,
] as const;
const FRAME_S = 1 / 60;

/** The Anima a spell is, if it is one. */
export const animaOf = (spell: number) => ANIMAS.get(spell) ?? null;

/** Where the Sunwell's sun stands over a well at `well` cast aiming along `aim`: ahead of its caster, high in their view,
 *  never straight over their head. */
export function sunAbove(well: Point, aim: number): Point {
  return [well[0] + Math.sin(aim) * SUN_AHEAD_M, well[1] - Math.cos(aim) * SUN_AHEAD_M, well[2] + SUN_UP_M];
}

/** The caster's own screen this frame: the element its edge frame is in (none for none), that frame's opacity (0 to
 *  0.25), and the view's push in (a share of its zoom). */
export interface AnimaScreen {
  readonly look: GlowLook;
  readonly edge: number;
  readonly push: number;
}
/** A screen no Anima takes. */
export const QUIET: AnimaScreen = { look: 0, edge: 0, push: 0 };

/** The caster's screen `seconds` after their own release in `look`. */
export function animaScreen(look: GlowLook, seconds: number): AnimaScreen {
  const frame = Math.floor(seconds / FRAME_S + 1e-6);
  if (frame < 0 || frame >= PUSH_STEPS.length) return QUIET;
  return { look, edge: EDGE_STEPS[frame] ?? 0, push: PUSH_STEPS[frame] ?? 0 };
}

/** A view pushed in by `push`, a share of its zoom. */
export function pushedIn<View extends { readonly zoom?: number }>(view: View, push: number): View {
  return push > 0 ? { ...view, zoom: (view.zoom ?? 1) * (1 + push) } : view;
}

/** The Anima moments of every caster in a fight, frame by frame. */
export class AnimaMoments {
  private sent: object | null = null;
  private charging: { readonly art: number; readonly look: GlowElement; readonly from: number } | null = null;
  private readonly released = new Map<number, number>();
  private flaring: { art: number; look: GlowElement; at: Point; from: number }[] = [];
  private own: { readonly look: GlowElement; readonly from: number } | null = null;
  /** The player's own screen, as the last frame left it. */
  screen: AnimaScreen = QUIET;

  /** Lays one frame's sigils: the player's own charging at `ownFeet` from `sent`, the cast they last sent, and every
   *  release's flaring and fading. */
  frame(frame: Frame, sent: { readonly spell: number } | null, ownFeet: Point | null): void {
    const anima = sent && sent !== this.sent ? animaOf(sent.spell) : null;
    this.sent = sent;
    if (anima) this.charging = { ...anima, from: frame.clock };
    const charging = this.charging;
    if (charging && frame.clock - charging.from > CHARGE_MOST_S) this.charging = null;
    else if (charging && ownFeet) {
      const state = sigilState((frame.clock - charging.from) / FRAME_S, CHARGE_TICKS, null);
      if (state !== null)
        groundSprite(frame.ground, sigilSprite(charging.art, state), charging.look, ownFeet, SIGIL_CELL_M);
    }
    this.flaring = this.flaring.filter(({ art, look, at, from }) => {
      const state = sigilState(0, CHARGE_TICKS, (frame.clock - from) / FRAME_S);
      if (state !== null) groundSprite(frame.ground, sigilSprite(art, state), look, at, SIGIL_CELL_M);
      return state !== null;
    });
    for (const [caster, when] of this.released) if (frame.clock - when > ONE_RELEASE_S) this.released.delete(caster);
    this.screen = this.own ? animaScreen(this.own.look, frame.clock - this.own.from) : QUIET;
  }

  /** Marks an Anima `spell` released by `caster`, whose figure stands at `feet` aiming along `aim`: once a cast, its
   *  sigil flares, its ring bursts and its Art's flourish plays; the player's own release takes their screen too. */
  release(frame: Frame, lands: Lands, spell: number, caster: number, feet: Point, aim: number): void {
    const anima = animaOf(spell);
    if (!anima || this.released.has(caster)) return;
    const { clock } = frame;
    // Sparks thrown through the caster's own eyes would hang across the view: only those seen from off are thrown.
    const burst = (from: Point, count: number, look: GlowElement) => {
      if (apartFrom(frame.eye, from) > NEAR_EYE_M) frame.sparks.burst(from, [0, 0], count, look);
    };
    this.released.set(caster, clock);
    this.flaring.push({ ...anima, at: feet, from: clock });
    lands.add('ring', feet, anima.look, clock);
    const lift = (point: Point, up: number): Point => [point[0], point[1], point[2] + up];
    if (anima.look === VOLT) {
      lands.add('pillar', lift(feet, 9), VOLT, clock, { to: feet, seed: caster });
      burst(lift(feet, 0.1), 30, VOLT);
    } else if (anima.look === BLAZE) {
      const sun = sunAbove(feet, aim);
      lands.add('pillar', sun, BLAZE, clock, { to: lift(sun, -sun[2] + feet[2]) });
      burst(lift(sun, -sun[2] + feet[2] + 0.1), 30, BLAZE);
    } else if (!seenFrom(frame.eye, feet)) {
      // Through the caster's own eyes the raven's dusk would stand against the eye: only the ring and sigil show.
      const shoulder = shoulderOf(feet, aim);
      lands.add('pop', shoulder, COSMIC, clock);
      for (let puff = 0; puff < 3; puff++) {
        const turn = (puff / 3) * 2 * Math.PI + caster;
        const place: Point = [feet[0] + Math.sin(turn) * 0.7, feet[1] - Math.cos(turn) * 0.7, feet[2] + 0.4];
        lands.add('smoke', place, COSMIC, clock, { seed: caster * 3 + puff, size: 1.6 });
      }
      burst(shoulder, 24, COSMIC);
    }
    if (caster === frame.own) [this.own, this.charging] = [{ look: anima.look, from: clock }, null];
  }
}

/** The edge frame over the page, made the first time it shows. */
let edgeFrame: HTMLElement | null = null;
let edgeShown = '';
const cssOf = ([red, green, blue]: readonly number[]) =>
  `rgb(${Math.round((red ?? 0) * 255)} ${Math.round((green ?? 0) * 255)} ${Math.round((blue ?? 0) * 255)})`;

/** Shows `screen`'s edge frame over the page: hard bands 8 pixels each round its edge, the element's light outside its
 *  body, at the screen's opacity; none when it has none. */
export function showAnimaEdge(screen: AnimaScreen): void {
  const shown = screen.look && screen.edge > 0 ? `${screen.look}:${screen.edge}` : '';
  if (shown === edgeShown) return;
  edgeShown = shown;
  if (!edgeFrame) {
    edgeFrame = document.createElement('div');
    Object.assign(edgeFrame.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5' });
    document.body.append(edgeFrame);
  }
  edgeFrame.hidden = !screen.look;
  if (!screen.look) return;
  const ramp = GLOW_RAMPS[screen.look];
  edgeFrame.style.boxShadow = `inset 0 0 0 8px ${cssOf(ramp[LIGHT])}, inset 0 0 0 16px ${cssOf(ramp[BODY])}`;
  edgeFrame.style.opacity = String(screen.edge);
}
