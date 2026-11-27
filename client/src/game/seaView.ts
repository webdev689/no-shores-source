import type { HeightAt, Point2, Vec3 } from '../overworld/ground.ts';
import { flyRig, SIDE } from '../overworld/islandView.ts';
import {
  FIELD_OF_VIEW,
  initialCamera,
  type OverworldCamera,
  type Rig,
  shotOf,
  smooth01,
  stepCamera,
} from '../overworld/overworldCamera.ts';
import { dragCamera, keyTurn, zoomCamera } from '../overworld/overworldInput.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { type Deck, type Lying, SLOOP_DECK } from '../ships/deck.ts';
import type { Shot } from './camera.ts';
import { CloseZoom } from './seaClose.ts';
import { HELM, helmEye } from './seaLaw.ts';
import { landable } from './seaMarks.ts';

/** The view the ship first comes to: lower than DFO's, so the island it lies off stands in it. */
const FIRST_TILT = (30 * Math.PI) / 180;
/** Seconds the view takes to fall back from an island's side to the ship. */
const FLY_BACK_SECONDS = 1.4;
/** Seconds the view takes to come down to the helm, or go back up from it. */
const HELM_SECONDS = 1.1;

/** Where the view is: over the ship, flying to or from an island's side, or over that side choosing a landing. */
type Where =
  | { readonly kind: 'sail' }
  | {
      readonly kind: 'fly';
      readonly from: Rig;
      readonly to: Rig;
      readonly t: number;
      readonly seconds: number;
      readonly then: 'landing' | 'sail';
    }
  | { readonly kind: 'landing' }
  /** Coming down to the helm, there, or going back up: `at` how far down, 0 the sea's view, 1 the helm. */
  | { readonly kind: 'helm'; readonly at: number; readonly going: 'down' | 'up' }
  /** Travelling by the held map (`TravelFade`), which no press, key or wheel moves. */
  | { readonly kind: 'travel' };

/** The sea's two views over the player's ship: Oversea, DFO's raised camera, and Sealevel, close on the ship. */
export type SeaLevel = 'oversea' | 'sealevel';

/**
 * The view over the player's ship at sea: the Oversea view, DFO's raised camera turned and zoomed, or the Sealevel view
 * close on it, switched between and never by the wheel; the flight up over an island's side to choose a landing and
 * back down; and the way down to the helm and up again.
 */
export class SeaView {
  private camera: OverworldCamera;
  /** The camera's rig as it last stood over the ship, which the view flies back down to. */
  private seaRig: Rig;
  private where: Where = { kind: 'sail' };
  /** How far the view has come down to the helm, eased: 0 the sea's view, 1 at the helm. */
  helmShare = 0;
  /** How far the view has come down to sea level from the Oversea view. */
  private readonly close = new CloseZoom();
  /** The landings over the island's side in view and the rig over it; and the mark chosen at sea, a hostile ship's
   *  while it is chased. */
  private side: readonly Mark[] = [];
  private sideRig: Rig | null = null;
  chosen: string | null = null;
  /** Whether the view over the island was flown to docking at its port, rather than going ashore on its coast. */
  docked = false;

  /** The deck of the hull the player sails, whose wheel the helm's view stands behind. */
  private readonly deckOf: () => Deck;

  constructor(start: Point2, heading: number, deckOf: () => Deck = () => SLOOP_DECK) {
    this.camera = { ...initialCamera([start[0], start[1], 0], heading), tilt: FIRST_TILT };
    this.seaRig = this.camera;
    this.deckOf = deckOf;
  }

  /** Over the ship, flying, over an island's side, or on the way to or from the helm. */
  get kind(): Where['kind'] {
    return this.where.kind;
  }

  /** Whether the view is at the helm, or on its way down or up. */
  get helmView(): boolean {
    return this.where.kind === 'helm';
  }

  /** Whether the view stands at the helm. */
  get atHelm(): boolean {
    return this.where.kind === 'helm' && this.where.going === 'down' && this.where.at >= 1;
  }

  /** How far the view has come down to sea level, eased: 0 the Oversea view, 1 the Sealevel view. */
  get closeShare(): number {
    return this.close.eased;
  }

  /** The view switched to: Oversea or Sealevel, eased there or not. */
  get level(): SeaLevel {
    return this.close.down ? 'sealevel' : 'oversea';
  }

  /** Switches to `level`, or to the other view; the view eases there. Over the ship alone: no switch flies up over an
   *  island, goes down to the helm or sails away. Answers whether it switched. */
  switchLevel(level: SeaLevel = this.level === 'oversea' ? 'sealevel' : 'oversea'): boolean {
    if (this.where.kind !== 'sail') return false;
    this.close.set(level === 'sealevel');
    return true;
  }

  /** The sea's shot `sea` brought down over it as it `lying` lies, as far as the switch to sea level has eased it. */
  closeShot(sea: Shot, lying: Lying): Shot {
    return this.close.shot(sea, lying, this.camera.yaw, this.camera.tilt);
  }

  /** The sea's shot `sea` brought down over it to sea level. */
  closest(sea: Shot, lying: Lying): Shot {
    return this.close.closest(sea, lying, this.camera.yaw, this.camera.tilt);
  }

  /** The id and name of a landing on the side in view, or null; a social space still locked is none. */
  landingOf(id: string): { readonly id: string; readonly name: string } | null {
    const mark = landable(this.side, id);
    return mark ? { id: mark.id, name: mark.name } : null;
  }

  /** The view stands over the ship again, at once. */
  sail(): void {
    this.where = { kind: 'sail' };
  }

  /** The view is given to a travel by the held map, until `sail` gives it back. */
  travel(): void {
    this.where = { kind: 'travel' };
  }

  /** Sets off down to the helm, from over the ship only; answers whether it did. */
  toHelm(): boolean {
    if (this.where.kind !== 'sail') return false;
    this.where = { kind: 'helm', at: 0, going: 'down' };
    return true;
  }

  /** Takes the view back up from the helm to the sea's. */
  fromHelm(): void {
    if (this.where.kind === 'helm') this.where = { ...this.where, going: 'up' };
  }

  /** Flies the view up from over the ship to `rig`, over an island, its landings `side`, `docked` at its port or
   *  not. */
  flyToSide(side: readonly Mark[], rig: Rig, docked = false): void {
    [this.side, this.sideRig, this.chosen, this.docked] = [side, rig, null, docked];
    this.close.set(false);
    this.where = { kind: 'fly', from: this.seaRig, to: rig, t: 0, seconds: SIDE.flySeconds, then: 'landing' };
  }

  /** Flies the view back down to the ship. */
  backToSea(): void {
    this.chosen = null;
    if (!this.sideRig) return;
    this.where = { kind: 'fly', from: this.sideRig, to: this.seaRig, t: 0, seconds: FLY_BACK_SECONDS, then: 'sail' };
  }

  /** A drag across the sea's view turns and tilts the camera. */
  drag(moved: Parameters<typeof dragCamera>[1]): void {
    this.camera = dragCamera(this.camera, moved);
  }

  /** The look keys held, `seconds` on, turn and tilt the camera. */
  turn(turn: number, tilt: number, seconds: number): void {
    this.camera = keyTurn(this.camera, turn, tilt, seconds);
  }

  /** The wheel's notches, positive in, zoom the Oversea camera under `ceiling`; at sea level they do nothing, as the
   *  wheel never changes the view. */
  zoom(notches: number, ceiling: number): void {
    if (this.level === 'oversea') this.camera = zoomCamera(this.camera, notches, ceiling);
  }

  /** `seconds` on: the ease between the two views, and the view coming down to the helm, there, or going back up. */
  step(seconds: number): void {
    this.close.step(seconds);
    if (this.where.kind !== 'helm') {
      this.helmShare = 0;
      return;
    }
    const step = (this.where.going === 'down' ? seconds : -seconds) / HELM_SECONDS;
    const down = Math.min(1, Math.max(0, this.where.at + step));
    this.where = down <= 0 && this.where.going === 'up' ? { kind: 'sail' } : { ...this.where, at: down };
    this.helmShare = smooth01(down);
  }

  /** The shot over the ship, the camera stepped `dt` on toward its `feet`; flying, the flight's shot, and over an
   *  island's side, the side's. */
  shot(toward: { readonly feet: Vec3; readonly dt: number; readonly ceiling: number; readonly heightAt: HeightAt }) {
    const stepped = stepCamera(this.camera, toward);
    this.camera = stepped.camera;
    const { shot } = stepped;
    if (this.where.kind === 'sail') this.seaRig = { ...this.camera, height: shot.height, tilt: shot.tilt };
    if (this.where.kind === 'fly') {
      const t = Math.min(1, this.where.t + toward.dt / this.where.seconds);
      const flown = shotOf(flyRig(this.where.from, this.where.to, t));
      this.where =
        t < 1 ? { ...this.where, t } : this.where.then === 'landing' ? { kind: 'landing' } : { kind: 'sail' };
      return flown;
    }
    return this.where.kind === 'landing' && this.sideRig ? shotOf(this.sideRig) : shot;
  }

  /** The helm's view, the eye behind its wheel riding it as it lies, looking along its heading. */
  helmShot(lying: Lying, far: number): Shot {
    const eye = helmEye(lying, this.deckOf());
    return { eye, yaw: lying.heading, pitch: HELM.pitch, fov: FIELD_OF_VIEW, near: 0.3, far };
  }
}
