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
import { courseAhead, declutter, namesShown, paintOf, timeText } from './seaLaw.ts';

/** The world's frame, metres: every voyage between landmasses is planned over it. */
const FRAME = { leftM: 0, topM: 0, widthM: 4_915_200, heightM: 3_072_000 } as const;
/** At sea, the island's marks within this of the ship are shown (the island view's own reach), and its port at any
 *  distance; each is held at the picture's edge when off it, so the way to every one is always in sight. */
const MARK_REACH_M = SIDE.reachM;
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
  | { readonly kind: 'landing' };

/** What one frame at sea shows: the shot, the ships, the marks, and the words and dial of the sea's bar. */
export interface SeaFrame {
  readonly shot: Shot;
  readonly ships: readonly Placing[];
  /** Each ship's footprint on the water, world metres: none inside her, foam round her bow under way. */
  readonly hulls: readonly HullMask[];
  readonly marks: readonly ScreenMark[];
  readonly note: string;
  readonly canLand: boolean;
  readonly pace: Pace;
  /** Whether the view stands over an island's side, its landings marked. */
  readonly overSide: boolean;
}

/**
 * The player's ship on the Overworld's sea: DFO's raised camera over it, voyages planned round the land and sailed
 * at the pace dial, the island's nodes and port marked, and the bird's-eye view of the island's side it lies off,
 * where a landing is chosen. Online, its course goes to the sea room and every other ship there is shown.
 */
export class Sea {
  private landmass: Landmass;
  private readonly outlines: readonly (readonly Point2[])[];
  private readonly shipMesh: Mesh;
  private ship: { x: number; y: number; heading: number };
  private voyage: Voyage | null = null;
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

  /** Whether the ship lies within the island view's reach of the open landmass's coast. */
  get canLand(): boolean {
    return this.view.kind === 'sail' && nearestIsland(this.position, [this.landmass.outline]) !== null;
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

  /** Flies the view up over the island's side the ship lies off, its nodes marked; false out of reach. The ship
   *  heaves to while its captain looks. */
  viewLandings(): boolean {
    if (!this.canLand) return false;
    const nodes = this.islandMarks.filter((mark) => mark.kind !== 'port');
    this.side = sideNodes(this.position, ringCentre(this.landmass.outline), nodes);
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
      if (fix.arrived) this.voyage = null;
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
    return {
      shot: { eye: pose.eye, ...look, fov: FIELD_OF_VIEW, near: lens.nearM, far: lens.farM },
      ships: this.ships(time),
      hulls: this.hulls(),
      marks: this.marks(pose, viewport),
      note: this.note(),
      canLand: this.canLand,
      pace: this.pace,
      overSide: this.view.kind === 'landing',
    };
  }

  private marks(pose: CameraPose, viewport: Viewport): ScreenMark[] {
    const ship = this.position;
    const away = (mark: Mark) => Math.hypot(mark.at[0] - ship[0], mark.at[1] - ship[1]);
    const shown =
      this.view.kind === 'sail'
        ? this.islandMarks.filter((mark) => mark.kind === 'port' || away(mark) <= MARK_REACH_M)
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
    return (this.said || 'At anchor') + room;
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
