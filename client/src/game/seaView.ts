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
import type { Lying } from '../ships/deck.ts';
import type { Shot } from './camera.ts';
import { CloseZoom } from './seaClose.ts';
import { landingChoice } from './seaMarks.ts';
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
  /** Sailing away to other waters on the cinematic's rails (`SailAway`), which no press, key or wheel moves. */
  | { readonly kind: 'travel' };

/**
 * The view over the player's ship at sea: DFO's raised camera, turned and zoomed, brought in close past its lowest;
 * the flight up over an island's side to choose a landing and back down; and the way down to the helm and up again.
 */
export class SeaView {
  private camera: OverworldCamera;
  /** The camera's rig as it last stood over the ship, which the view flies back down to. */
  private seaRig: Rig;
  private where: Where = { kind: 'sail' };
  /** How far the view has come down to the helm, eased: 0 the sea's view, 1 at the helm. */
  helmShare = 0;
  /** How far the wheel has brought the view in over it, past the Overworld's lowest. */
  private readonly close = new CloseZoom();
  /** The landings marked over the island's side in view, the rig over it, and the landing chosen there. */
  private side: readonly Mark[] = [];
  private sideRig: Rig | null = null;
  chosen: string | null = null;
  /** What the view over an island's side says of the mark last clicked: that its node is locked. */
  said = '';

  constructor(start: Point2, heading: number) {
    this.camera = { ...initialCamera([start[0], start[1], 0], heading), tilt: FIRST_TILT };
    this.seaRig = this.camera;
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

  /** How far the view is brought in close over it, eased: 0 not at all, 1 as close as it goes. */
  get closeShare(): number {
    return this.close.eased;
  }

  /** The sea's shot `sea` brought in over it as it `lying` lies, as far as the wheel has brought it. */
  closeShot(sea: Shot, lying: Lying): Shot {
    return this.close.shot(sea, lying, this.camera.yaw, this.camera.tilt);
  }

  /** The sea's shot `sea` brought in over it as close as it goes. */
  closest(sea: Shot, lying: Lying): Shot {
    return this.close.closest(sea, lying, this.camera.yaw, this.camera.tilt);
  }

  /** The landings marked over the island's side in view. */
  get sideMarks(): readonly Mark[] {
    return this.side;
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

  /** The view is given to the cinematic of a travel to other waters, until `sail` gives it back. */
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

  /** Flies the view up from over the ship to `rig`, over an island's side, its landings `side` marked. */
  flyToSide(side: readonly Mark[], rig: Rig): void {
    [this.side, this.sideRig, this.chosen, this.said] = [side, rig, null, ''];
    this.close.release();
    this.where = { kind: 'fly', from: this.seaRig, to: rig, t: 0, seconds: SIDE.flySeconds, then: 'landing' };
  }

  /** A click on a mark over the side in view, `chosen` the landing chosen before (`landingChoice`): its landing is
   *  chosen, or landed at once it was; a locked node is neither, and the view says so. */
  choose(id: string, chosen: string | null): 'choose' | 'land' | null {
    const choice = landingChoice(this.side, chosen, id);
    this.said = choice?.kind === 'locked' ? choice.words : '';
    if (choice?.kind === 'choose') this.chosen = id;
    return choice?.kind === 'locked' ? null : (choice?.kind ?? null);
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

  /** The wheel's notches, positive in, zoom the camera under `ceiling`, and past its lowest bring the view in close. */
  zoom(notches: number, ceiling: number, lowest: number): void {
    const atLowest = this.camera.heightTarget <= lowest + 1e-6;
    this.camera = zoomCamera(this.camera, this.close.zoom(notches, atLowest), ceiling);
  }

  /** `seconds` on: the close view's ease, and the view coming down to the helm, there, or going back up. */
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
    return { eye: helmEye(lying), yaw: lying.heading, pitch: HELM.pitch, fov: FIELD_OF_VIEW, near: 0.3, far };
  }
}
