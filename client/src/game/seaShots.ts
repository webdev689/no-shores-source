// The sea's view and its shots: the Overworld's raised camera over it, turned, dragged and zoomed, brought in close by
// the wheel; the flight up over an island's side and back; and the view coming down to its helm. `sea.ts` keeps its
// voyage, its room and its fight, and asks this for the shot each frame.
import type { Point2 } from '../overworld/ground.ts';
import { flyRig, frameSide, SIDE } from '../overworld/islandView.ts';
import {
  type CameraPose,
  ceilingFor,
  FIELD_OF_VIEW,
  forwardOf,
  heightBand,
  horizonOf,
  initialCamera,
  type OverworldCamera,
  poseOf,
  type Rig,
  shotOf,
  smooth01,
  stepCamera,
  type Viewport,
} from '../overworld/overworldCamera.ts';
import { dragCamera, keyTurn, type pressMove, zoomCamera } from '../overworld/overworldInput.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import type { Lying } from '../ships/deck.ts';
import { lookOf, type Shot } from './camera.ts';
import { CloseZoom } from './seaClose.ts';
import { HELM, helmEye } from './seaLaw.ts';

/** The view the ship first comes to: lower than DFO's, so the island it lies off stands in it. */
const FIRST_TILT = (30 * Math.PI) / 180;
/** Seconds the view takes to fall back from an island's side to the ship. */
const FLY_BACK_SECONDS = 1.4;
/** Seconds the view takes to come down to the helm, or go back up from it. */
const HELM_SECONDS = 1.1;

/** Where the view is: over the ship, flying to or from an island's side, or over that side choosing a landing. */
export type SeaView =
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
  | { readonly kind: 'helm'; readonly at: number; readonly going: 'down' | 'up' };

/** The sea's camera and where its view is, and the shots it gives each frame. */
export class SeaShots {
  private camera: OverworldCamera;
  /** The sea's view as it last stood over it, which the flights leave from and come back to. */
  private seaRig: Rig;
  private sideRig: Rig | null = null;
  view: SeaView = { kind: 'sail' };
  /** How far the view has come down to the helm, eased: 0 the sea's view, 1 at the helm. */
  helmShare = 0;
  /** How far the wheel has brought the view in over it, past the Overworld's lowest. */
  readonly close = new CloseZoom();
  /** The picture's pose as last shown, brought in close or not, and its size: clicks and marks are taken on it. */
  pose: CameraPose | null = null;
  viewport: Viewport = { width: 1, height: 1 };

  constructor(start: Point2, heading: number) {
    this.camera = { ...initialCamera([start[0], start[1], 0], heading), tilt: FIRST_TILT };
    this.seaRig = this.camera;
  }

  /** Whether the view is at the helm, or on its way down or up. */
  get helmView(): boolean {
    return this.view.kind === 'helm';
  }

  /** Whether the view stands at the helm. */
  get atHelm(): boolean {
    return this.view.kind === 'helm' && this.view.going === 'down' && this.view.at >= 1;
  }

  /** Takes the view down to the helm from the sea's; false from any other view. */
  toHelm(): boolean {
    if (this.view.kind !== 'sail') return false;
    this.view = { kind: 'helm', at: 0, going: 'down' };
    return true;
  }

  /** Takes the view back up from the helm to the sea's. */
  fromHelm(): void {
    if (this.view.kind === 'helm') this.view = { ...this.view, going: 'up' };
  }

  /** Flies the view up over the island's `side` in view from `position`, framed on the picture. */
  toSide(position: Point2, side: readonly Mark[], heightAt: (x: number, y: number) => number): void {
    this.sideRig = frameSide(position, side, this.viewport.width / this.viewport.height, heightAt);
    this.close.release();
    this.view = { kind: 'fly', from: this.seaRig, to: this.sideRig, t: 0, seconds: SIDE.flySeconds, then: 'landing' };
  }

  /** Flies the view back down to the ship from the island's side. */
  backToSea(): void {
    if (!this.sideRig) return;
    this.view = { kind: 'fly', from: this.sideRig, to: this.seaRig, t: 0, seconds: FLY_BACK_SECONDS, then: 'sail' };
  }

  /** The look keys turn and tilt the sea's view over it, `seconds` on. */
  turn(turn: number, tilt: number, seconds: number): void {
    if (this.view.kind === 'sail') this.camera = keyTurn(this.camera, turn, tilt, seconds);
  }

  /** A drag on the sea's view swings it round it. */
  drag(moved: ReturnType<typeof pressMove>): void {
    if (this.view.kind === 'sail') this.camera = dragCamera(this.camera, moved);
  }

  /** The wheel's notches, positive in, zoom the camera over the ship, and past its lowest bring the view in close. */
  zoom(notches: number): void {
    if (this.view.kind !== 'sail') return;
    const ceiling = ceilingFor(null);
    const atLowest = this.camera.heightTarget <= heightBand(ceiling)[0] + 1e-6;
    this.camera = zoomCamera(this.camera, this.close.zoom(notches, atLowest), ceiling);
  }

  /** The view coming down to the helm, there, or going back up, `seconds` on: how far down, eased. */
  stepHelm(seconds: number): void {
    if (this.view.kind !== 'helm') {
      this.helmShare = 0;
      return;
    }
    const step = (this.view.going === 'down' ? seconds : -seconds) / HELM_SECONDS;
    const down = Math.min(1, Math.max(0, this.view.at + step));
    this.view = down <= 0 && this.view.going === 'up' ? { kind: 'sail' } : { ...this.view, at: down };
    this.helmShare = smooth01(down);
  }

  /** The helm's view, the eye behind its wheel riding it as it lies, looking along its heading. */
  helmShot(lying: Lying, far: number): Shot {
    return { eye: helmEye(lying), yaw: lying.heading, pitch: HELM.pitch, fov: FIELD_OF_VIEW, near: 0.3, far };
  }

  /** One frame's shots, `seconds` on, over it lying at `ship` (`trueLying` at its true size): the Overworld's, and the
   *  sea's as shown, brought in close over it unless the view stands over an island's side. */
  step(
    seconds: number,
    ship: { readonly x: number; readonly y: number },
    trueLying: Lying,
    heightAt: (x: number, y: number) => number,
  ): { readonly overworld: Shot; readonly seaShot: Shot; readonly pose: CameraPose } {
    const feet: [number, number, number] = [ship.x, ship.y, 0];
    const stepped = stepCamera(this.camera, { feet, dt: seconds, ceiling: ceilingFor(null), heightAt });
    this.camera = stepped.camera;
    let shot = stepped.shot;
    if (this.view.kind === 'sail') this.seaRig = { ...this.camera, height: shot.height, tilt: shot.tilt };
    if (this.view.kind === 'fly') {
      const t = Math.min(1, this.view.t + seconds / this.view.seconds);
      shot = shotOf(flyRig(this.view.from, this.view.to, t));
      this.view = t < 1 ? { ...this.view, t } : this.view.then === 'landing' ? { kind: 'landing' } : { kind: 'sail' };
    } else if (this.view.kind === 'landing' && this.sideRig) shot = shotOf(this.sideRig);
    const look = lookOf(shot.forward);
    const fromShip = Math.hypot(shot.eye[0] - ship.x, shot.eye[1] - ship.y, shot.eye[2]);
    const lens = horizonOf({ nearM: 2, farM: 60_000 }, fromShip);
    const overworld: Shot = { eye: shot.eye, ...look, fov: FIELD_OF_VIEW, near: lens.nearM, far: lens.farM };
    const overShip = this.view.kind !== 'landing';
    const seaShot = overShip ? this.close.shot(overworld, trueLying, this.camera.yaw, this.camera.tilt) : overworld;
    // Clicks and marks are taken on the picture as shown, brought in close or not.
    const pose = poseOf({ eye: seaShot.eye, forward: forwardOf(seaShot.yaw, -seaShot.pitch) }, FIELD_OF_VIEW);
    this.pose = pose;
    return { overworld, seaShot, pose };
  }

  /** The closest the wheel brings the view in over it, from the Overworld's shot. */
  closest(overworld: Shot, trueLying: Lying): Shot {
    return this.close.closest(overworld, trueLying, this.camera.yaw, this.camera.tilt);
  }
}
