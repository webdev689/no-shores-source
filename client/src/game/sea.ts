import type { SeenShip } from '../network/messages.ts';
import { RoomConnection } from '../network/roomConnection.ts';
import type { Point2, Vec3 } from '../overworld/ground.ts';
import { flyRig, frameSide, nearestIsland, ringCentre, SIDE, sideNodes } from '../overworld/islandView.ts';
import {
  type CameraPose,
  ceilingFor,
  FIELD_OF_VIEW,
  horizonOf,
  initialCamera,
  type OverworldCamera,
  poseOf,
  type Rig,
  shotOf,
  stepCamera,
  type Viewport,
} from '../overworld/overworldCamera.ts';
import { dragCamera, keyTurn, type Press, pressAt, pressMove, zoomCamera } from '../overworld/overworldInput.ts';
import { type Mark, type PlacedMark, placeMarks } from '../overworld/overworldMarks.ts';
import { pickAt } from '../overworld/overworldPick.ts';
import { maskFromOutlines, planSeaRoute, type RouteRefusal, type SeaMask } from '../overworld/seaRoute.ts';
import { PACE_DEFAULT, type Pace, sail, secondsLeft, stepPace, type Voyage, voyageOf } from '../overworld/voyage.ts';
import { lookOf, type Shot } from './camera.ts';
import type { ScreenMark } from './hud.ts';
import { distanceText } from './hudLaw.ts';
import type { Landmass } from './landmass.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { Mesh, Placing } from './meshView.ts';
import {
  courseAhead,
  declutter,
  type Landfall,
  landfallOf,
  namesShown,
  paintOf,
  PORT_SEEN_M,
  timeText,
} from './seaLaw.ts';

/** The world's frame, metres: every voyage between landmasses is planned over it. */
const FRAME = { leftM: 0, topM: 0, widthM: 4_915_200, heightM: 3_072_000 } as const;
/** How far in from the picture's top and foot a held mark stands, clear of the place's name and, at sea, the sea's
 *  bar. */
const MARK_EDGES = { sea: { top: 96, foot: 120 }, side: { top: 96, foot: 48 } } as const;
/** Marks at sea nearer each other on the picture than this are one: the nearer is shown. */
const MARK_GAP_PX = 30;
/** The Overworld is not to scale: ships are drawn this many times their size, so one reads from the raised view. */
const SHIP_SCALE = 2.5;
/** A ship's waterline as drawn, half its length and beam, metres: the hull's (meshes.ts STATIONS) at the waterline. */
const WATERLINE_HALF_M = [14 * SHIP_SCALE, 2.8 * SHIP_SCALE] as const;
/** The way a ship under way shows the water, m/s: her bow wave foams whole. */
const UNDER_WAY = 4;
/** The view the ship first comes to: lower than DFO's, so the island it lies off stands in it. */
const FIRST_TILT = (30 * Math.PI) / 180;
/** Seconds the view takes to fall back from an island's side to the ship. */
const FLY_BACK_SECONDS = 1.4;
/** The helm, on the stern castle: how far aft of the ship's middle and how high over the water the eye stands there,
 *  metres before the ship is drawn larger, and how far down it looks. */
const HELM = { aftM: 11.5, eyeM: 6.1, pitch: 0.1 } as const;
/** Seconds the view takes to come down to the helm, or go back up from it. */
const HELM_SECONDS = 1.1;
/** The player's own ship's paint: a deep sea blue. */
const OWN_PAINT = [0.13, 0.36, 0.58] as const;
/** A mark stands this far over the ground it marks, metres. */
const MARK_RISE_M = 2;

const REFUSED: Record<RouteRefusal, string> = {
  outside: 'That lies beyond the charts.',
  aground: 'The ship is aground.',
  inland: 'That lies too far inland to sail to.',
  'no way': 'No water leads there.',
};

/** Where the view is: over the ship, flying to or from an island's side, or over that side choosing a landing. */
type SeaView =
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

/** What one frame at sea shows: the shot, the ships, the marks, and the words and dial of the sea's bar. */
export interface SeaFrame {
  readonly shot: Shot;
  readonly ships: readonly Placing[];
  /** Each ship's footprint on the water, world metres: none inside her, foam round her bow under way. */
  readonly hulls: readonly HullMask[];
  readonly marks: readonly ScreenMark[];
  readonly note: string;
  /** What the ship is offered off the island's coast: to dock, to go ashore, or nothing. */
  readonly landfall: Landfall;
  /** Under way on a voyage; or stopped short of one, which can be resumed. */
  readonly sailing: boolean;
  readonly resumable: boolean;
  readonly pace: Pace;
  /** Whether the view stands over an island's side, its landings marked. */
  readonly overSide: boolean;
}

/**
 * The player's ship on the Overworld's sea: DFO's raised camera over it, voyages planned round the land and sailed
 * at the pace dial, stopped and resumed, a port's icon over it once the ship is near, and the bird's-eye view of the
 * island's side it lies off, where a landing is chosen. Online, its course goes to the sea room and every other ship
 * there is shown.
 */
export class Sea {
  private landmass: Landmass;
  private readonly outlines: readonly (readonly Point2[])[];
  private readonly shipMesh: Mesh;
  private ship: { x: number; y: number; heading: number };
  private voyage: Voyage | null = null;
  /** Where the last voyage set out for, kept while it is stopped short, so it can be resumed. */
  private destination: Point2 | null = null;
  private travelled = 0;
  private pace: Pace = PACE_DEFAULT;
  private camera: OverworldCamera;
  private seaRig: Rig;
  private view: SeaView = { kind: 'sail' };
  private side: readonly Mark[] = [];
  private sideRig: Rig | null = null;
  private press: Press | null = null;
  private room: SeaRoom | null = null;
  private frameMask: SeaMask | null = null;
  private pose: CameraPose | null = null;
  private viewport: Viewport = { width: 1, height: 1 };
  private placed: PlacedMark[] = [];
  private islandMarks: readonly Mark[] = [];
  private said = '';
  chosen: string | null = null;

  constructor(
    landmass: Landmass,
    outlines: readonly (readonly Point2[])[],
    shipMesh: Mesh,
    start: Point2,
    heading: number,
  ) {
    this.landmass = landmass;
    this.outlines = outlines;
    this.shipMesh = shipMesh;
    this.ship = { x: start[0], y: start[1], heading };
    this.camera = { ...initialCamera([start[0], start[1], 0], heading), tilt: FIRST_TILT };
    this.seaRig = this.camera;
    this.setLandmass(landmass);
  }

  /** Where the ship lies. */
  get position(): Point2 {
    return [this.ship.x, this.ship.y];
  }

  /** The landmass drawn and charted from now on. */
  setLandmass(landmass: Landmass): void {
    this.landmass = landmass;
    const marks: Mark[] = landmass.nodes.map((node) => {
      const ground =
        node.kind === 'social' && landmass.plan ? landmass.plan.social.level : landmass.heightAt(...node.centre);
      const place: Vec3 = [node.centre[0], node.centre[1], Math.max(0, ground) + MARK_RISE_M];
      return { id: node.id, kind: node.kind, name: node.name, at: place, edge: true };
    });
    const harbour = landmass.plan?.harbour;
    if (landmass.plan && harbour) {
      const port = { id: `${landmass.plan.id}-port`, kind: 'port', name: landmass.plan.name, edge: true } as const;
      marks.push({ ...port, at: [harbour[0], harbour[1], MARK_RISE_M] });
    }
    this.islandMarks = marks;
  }

  /** Joins the sea room, the ship put to sea where it lies. */
  async enterRoom(url: string): Promise<void> {
    this.room = await SeaRoom.join(url, this.position, this.pace);
    if (this.voyage) this.room.course(courseAhead(this.voyage, this.travelled), this.pace);
  }

  /** Leaves the sea room: the player's ship leaves the sea there. */
  leaveRoom(): void {
    this.room?.close();
    this.room = null;
  }

  /** What the ship is offered off the open landmass's coast: to dock at its port, to go ashore, or nothing. */
  get landfall(): Landfall {
    if (this.view.kind !== 'sail') return null;
    const offCoast = nearestIsland(this.position, [this.landmass.outline]) !== null;
    const { plan } = this.landmass;
    return landfallOf(this.position, offCoast, plan?.harbour ? { name: plan.name, harbour: plan.harbour } : null);
  }

  /** Where the ship lies and heads, as the held map shows it. */
  get heading(): number {
    return this.ship.heading;
  }

  /** The voyage's course still ahead, from the ship; none at rest. */
  get course(): Point2[] {
    return this.voyage ? [this.position, ...courseAhead(this.voyage, this.travelled)] : [];
  }

  /** A course from the ship to a point, as the held map inks it before setting sail, or why there is none. */
  planTo(
    point: Point2,
  ): { readonly ok: true; readonly points: Point2[] } | { readonly ok: false; readonly why: string } {
    const route = planSeaRoute(this.maskFor(this.position, point), this.position, point);
    return route.ok ? { ok: true, points: route.points } : { ok: false, why: REFUSED[route.reason] };
  }

  /** Takes the view down to the ship's helm, in first person, where the held map is raised. */
  toHelm(): boolean {
    if (this.view.kind !== 'sail') return false;
    this.view = { kind: 'helm', at: 0, going: 'down' };
    return true;
  }

  /** Takes the view back up from the helm to the sea's. */
  fromHelm(): void {
    if (this.view.kind === 'helm') this.view = { ...this.view, going: 'up' };
  }

  /** The ids of the landings marked over the island's side in view: the player has seen them. */
  get landings(): string[] {
    return this.side.map((mark) => mark.id);
  }

  /** Whether the view is at the helm, or on its way down or up. */
  get helmView(): boolean {
    return this.view.kind === 'helm';
  }

  /** Whether the view stands at the helm. */
  get atHelm(): boolean {
    return this.view.kind === 'helm' && this.view.going === 'down' && this.view.at >= 1;
  }

  /** Whether a voyage stopped short of its destination can be resumed. */
  get resumable(): boolean {
    return this.view.kind === 'sail' && !this.voyage && this.destination !== null;
  }

  /** Stops the ship where it is; the voyage's destination is kept, to be resumed. */
  stop(): void {
    if (!this.voyage) return;
    this.voyage = null;
    this.room?.course([], this.pace);
  }

  /** Sets sail again for the destination of the voyage last stopped, from wherever the ship lies now. */
  resume(): void {
    if (this.resumable && this.destination) this.sailTo(this.destination);
  }

  /** Plans a voyage from the ship to a point and sets sail; a voyage that cannot be planned says why. */
  sailTo(point: Point2): void {
    const from = this.position;
    const route = planSeaRoute(this.maskFor(from, point), from, point);
    if (!route.ok) {
      this.said = REFUSED[route.reason];
      return;
    }
    this.said = '';
    this.voyage = voyageOf(route.points);
    this.destination = point;
    this.travelled = 0;
    this.room?.course(courseAhead(this.voyage, 0), this.pace);
  }

  /** A voyage within the open landmass's window is planned on its fine mask; any other over the whole frame's. */
  private maskFor(from: Point2, to: Point2): SeaMask {
    const { mask } = this.landmass;
    const inside = ([x, y]: Point2) =>
      x >= mask.leftM &&
      y >= mask.topM &&
      x < mask.leftM + mask.width * mask.cellM &&
      y < mask.topM + mask.height * mask.cellM;
    if (inside(from) && inside(to)) return mask;
    this.frameMask ??= maskFromOutlines(this.outlines, FRAME);
    return this.frameMask;
  }

  /** One step of the pace dial: -1 slower, +1 faster. */
  stepPace(direction: number): void {
    this.pace = stepPace(this.pace, direction);
    if (this.voyage) this.room?.course(courseAhead(this.voyage, this.travelled), this.pace);
  }

  /** A mark chosen at sea: the ship sails for it, to the water nearest it. */
  sailToMark(id: string): void {
    const mark = this.islandMarks.find((each) => each.id === id);
    if (mark) this.sailTo([mark.at[0], mark.at[1]]);
  }

  /** Docks or goes ashore as the landfall offers: flies the view up over the island's side the ship lies off, its
   *  nodes marked, the city's social space among them when docking; false with nothing offered. The ship heaves to
   *  while its captain looks, and its voyage can be resumed on coming back to sea. */
  goAshore(): boolean {
    const landfall = this.landfall;
    if (!landfall) return false;
    const nodes = this.islandMarks.filter((mark) => mark.kind !== 'port');
    const side = sideNodes(this.position, ringCentre(this.landmass.outline), nodes);
    const social = nodes.find((mark) => mark.kind === 'social');
    this.side = landfall.kind === 'dock' && social && !side.includes(social) ? [social, ...side] : side;
    this.sideRig = frameSide(
      this.position,
      this.side,
      this.viewport.width / this.viewport.height,
      this.landmass.heightAt,
    );
    this.voyage = null;
    this.room?.course([], this.pace);
    this.chosen = null;
    this.view = { kind: 'fly', from: this.seaRig, to: this.sideRig, t: 0, seconds: SIDE.flySeconds, then: 'landing' };
    return true;
  }

  /** The player is back aboard: the view stands over the ship, whatever it showed when they landed. */
  cameAboard(): void {
    this.view = { kind: 'sail' };
    this.chosen = null;
    this.press = null;
  }

  /** A press that ends off the canvas only looked. */
  pointerCancel(): void {
    this.press = null;
  }

  /** Flies the view back down to the ship. */
  backToSea(): void {
    this.chosen = null;
    if (!this.sideRig) return;
    this.view = { kind: 'fly', from: this.sideRig, to: this.seaRig, t: 0, seconds: FLY_BACK_SECONDS, then: 'sail' };
  }

  /** The id and name of a landing on the side in view, or null. */
  landingOf(id: string): { readonly id: string; readonly name: string } | null {
    const mark = this.side.find((each) => each.id === id);
    return mark ? { id: mark.id, name: mark.name } : null;
  }

  pointerDown(x: number, y: number): void {
    this.press = pressAt(x, y);
  }

  pointerMove(x: number, y: number): void {
    if (!this.press) return;
    const moved = pressMove(this.press, x, y);
    this.press = moved.press;
    if (this.view.kind === 'sail') this.camera = dragCamera(this.camera, moved);
  }

  /** A press let go: a click on the sea or the land sails there, on a mark for its node; a drag only looked. */
  pointerUp(x: number, y: number): void {
    const press = this.press;
    this.press = null;
    if (!press || press.dragging || this.view.kind !== 'sail' || !this.pose) return;
    const pick = pickAt(this.pose, this.viewport, x, y, this.landmass.heightAt, this.placed);
    if (pick.kind === 'mark') this.sailToMark(pick.id);
    else if (pick.kind !== 'none') this.sailTo([pick.point[0], pick.point[1]]);
  }

  /** The wheel's notches, positive in, zoom the camera over the ship. */
  zoom(notches: number): void {
    if (this.view.kind === 'sail') this.camera = zoomCamera(this.camera, notches, ceilingFor(null));
  }

  /** One frame at sea, `dt` seconds on, at world time `time`, on a picture of `viewport` CSS pixels. */
  frame(dt: number, time: number, viewport: Viewport, turn: number, tilt: number): SeaFrame {
    this.viewport = viewport;
    if (this.voyage) {
      const fix = sail(this.voyage, this.travelled, dt, this.pace);
      this.ship = { x: fix.position[0], y: fix.position[1], heading: fix.heading ?? this.ship.heading };
      this.travelled = fix.travelledM;
      if (fix.arrived) [this.voyage, this.destination] = [null, null];
    }
    if (this.view.kind === 'sail') this.camera = keyTurn(this.camera, turn, tilt, dt);
    const { heightAt } = this.landmass;
    const stepped = stepCamera(this.camera, {
      feet: [this.ship.x, this.ship.y, 0],
      dt,
      ceiling: ceilingFor(null),
      heightAt,
    });
    this.camera = stepped.camera;
    let shot = stepped.shot;
    if (this.view.kind === 'sail') this.seaRig = { ...this.camera, height: shot.height, tilt: shot.tilt };
    if (this.view.kind === 'fly') {
      const t = Math.min(1, this.view.t + dt / this.view.seconds);
      shot = shotOf(flyRig(this.view.from, this.view.to, t));
      this.view = t < 1 ? { ...this.view, t } : this.view.then === 'landing' ? { kind: 'landing' } : { kind: 'sail' };
    } else if (this.view.kind === 'landing' && this.sideRig) shot = shotOf(this.sideRig);
    const pose = poseOf(shot, FIELD_OF_VIEW);
    this.pose = pose;
    const look = lookOf(pose.forward);
    const fromShip = Math.hypot(pose.eye[0] - this.ship.x, pose.eye[1] - this.ship.y, pose.eye[2]);
    const lens = horizonOf({ fogEndM: 28_000, nearM: 2, farM: 60_000 }, 1, fromShip);
    const seaShot: Shot = { eye: pose.eye, ...look, fov: FIELD_OF_VIEW, near: lens.nearM, far: lens.farM };
    return {
      shot: this.view.kind === 'helm' ? this.helmShot(dt, time, seaShot) : seaShot,
      ships: this.ships(time),
      hulls: this.hulls(),
      marks: this.marks(pose, viewport),
      note: this.note(),
      landfall: this.landfall,
      sailing: this.voyage !== null,
      resumable: this.resumable,
      pace: this.pace,
      overSide: this.view.kind === 'landing',
    };
  }

  /** The view coming down to the helm, there, or going back up, eased between the sea's shot and the helm's. */
  private helmShot(dt: number, time: number, sea: Shot): Shot {
    if (this.view.kind !== 'helm') return sea;
    const step = (this.view.going === 'down' ? dt : -dt) / HELM_SECONDS;
    const down = Math.min(1, Math.max(0, this.view.at + step));
    this.view = down <= 0 && this.view.going === 'up' ? { kind: 'sail' } : { ...this.view, at: down };
    const eased = down * down * (3 - 2 * down);
    const { heading } = this.ship;
    // The eye rides the swell with the ship, as she is drawn.
    const eye = [
      this.ship.x - Math.sin(heading) * HELM.aftM * SHIP_SCALE,
      this.ship.y + Math.cos(heading) * HELM.aftM * SHIP_SCALE,
      HELM.eyeM * SHIP_SCALE + 0.35 * Math.sin(time * 0.9) - 0.4,
    ] as const;
    const turn = Math.atan2(Math.sin(heading - sea.yaw), Math.cos(heading - sea.yaw));
    const mix = (from: number, to: number) => from + (to - from) * eased;
    return {
      eye: [mix(sea.eye[0], eye[0]), mix(sea.eye[1], eye[1]), mix(sea.eye[2], eye[2])],
      yaw: sea.yaw + turn * eased,
      pitch: mix(sea.pitch, HELM.pitch),
      fov: FIELD_OF_VIEW,
      near: eased > 0.5 ? 0.3 : sea.near,
      far: sea.far,
    };
  }

  private marks(pose: CameraPose, viewport: Viewport): ScreenMark[] {
    const ship = this.position;
    const away = (mark: Mark) => Math.hypot(mark.at[0] - ship[0], mark.at[1] - ship[1]);
    const shown =
      this.view.kind === 'sail'
        ? this.islandMarks.filter((mark) => mark.kind === 'port' && away(mark) <= PORT_SEEN_M)
        : this.view.kind === 'landing'
          ? this.side
          : [];
    const placed = placeMarks(shown, pose, viewport, 1, this.view.kind === 'sail' ? MARK_EDGES.sea : MARK_EDGES.side);
    this.placed = this.view.kind === 'sail' ? declutter(placed, MARK_GAP_PX) : placed;
    const named = namesShown(this.placed);
    return this.placed.map((placed) => {
      const mark = shown.find((each) => each.id === placed.id);
      return {
        ...placed,
        note: distanceText(mark ? away(mark) : placed.distance),
        chosen: placed.id === this.chosen,
        named: named.has(placed.id) || placed.id === this.chosen,
      };
    });
  }

  private ships(time: number): Placing[] {
    // Each ship rides the swell a little out of step with the others.
    const riding = (
      x: number,
      y: number,
      heading: number,
      paint: readonly [number, number, number],
      phase: number,
    ) => ({
      mesh: this.shipMesh,
      at: [x, y, 0.35 * Math.sin(time * 0.9 + phase) - 0.4] as const,
      scale: SHIP_SCALE,
      heading,
      roll: 0.035 * Math.sin(time * 0.7 + phase),
      pitch: 0.015 * Math.sin(time * 0.53 + phase),
      paint,
    });
    const own = riding(this.ship.x, this.ship.y, this.ship.heading, OWN_PAINT, 0);
    const others = (this.room?.others ?? []).map((ship) =>
      riding(ship.x, ship.y, ship.heading, paintOf(ship.player), ship.player),
    );
    return [own, ...others];
  }

  private hulls(): HullMask[] {
    const [halfLength, halfBeam] = WATERLINE_HALF_M;
    const hull = (x: number, y: number, heading: number, moving: boolean): HullMask => ({
      x,
      y,
      heading,
      halfLength,
      halfBeam,
      way: moving ? UNDER_WAY : 0,
    });
    const own = hull(this.ship.x, this.ship.y, this.ship.heading, this.voyage !== null);
    const others = (this.room?.others ?? []).map((ship) => hull(ship.x, ship.y, ship.heading, ship.pace > 0));
    return [own, ...others];
  }

  private note(): string {
    const room = this.room ? ` · In the sea room as player ${this.room.own}` : '';
    if (this.view.kind !== 'sail') return room.slice(3);
    if (this.voyage) {
      const remaining = this.voyage.lengthM - this.travelled;
      const left = timeText(secondsLeft(this.voyage, this.travelled, this.pace));
      return `Sailing · ${distanceText(remaining)} to go · ${left}${room}`;
    }
    return (this.said || (this.destination ? 'Hove to' : 'At anchor')) + room;
  }
}

/** The sea room as the ship sails in it: its course sent when set, and every ship the room last moved. */
class SeaRoom {
  readonly own: number;
  private readonly connection: RoomConnection;
  private ships: readonly SeenShip[] = [];

  private constructor(connection: RoomConnection) {
    this.connection = connection;
    this.own = connection.player;
  }

  /** Joins the sea at `url`, the ship put to sea at `start`, at rest. */
  static async join(url: string, start: Point2, pace: Pace): Promise<SeaRoom> {
    let room: SeaRoom | null = null;
    const connection = await RoomConnection.open(url, (snapshot) => {
      if (room) room.ships = snapshot.ships;
    });
    room = new SeaRoom(connection);
    connection.sendCourse([start], pace);
    return room;
  }

  /** Every other player's ship. */
  get others(): readonly SeenShip[] {
    return this.ships.filter((ship) => ship.player !== this.own);
  }

  /** Sets the ship's course: the points ahead, at a pace; none brings it to rest. */
  course(points: readonly Point2[], pace: Pace): void {
    this.connection.sendCourse(points, pace);
  }

  close(): void {
    this.connection.close();
  }
}
