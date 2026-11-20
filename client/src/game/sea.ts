import type { Point2, Vec3 } from '../overworld/ground.ts';
import { frameSide, nearestIsland, ringCentre, sideNodes } from '../overworld/islandView.ts';
import {
  type CameraPose,
  ceilingFor,
  FIELD_OF_VIEW,
  forwardOf,
  heightBand,
  horizonOf,
  poseOf,
  type Viewport,
} from '../overworld/overworldCamera.ts';
import { type Press, pressAt, pressMove } from '../overworld/overworldInput.ts';
import type { Mark, PlacedMark } from '../overworld/overworldMarks.ts';
import { pickAt } from '../overworld/overworldPick.ts';
import { type Pace, SHIP_SPEED } from '../overworld/voyage.ts';
import { lookOf, panShot, type Shot } from './camera.ts';
import type { ScreenMark } from './hud.ts';
import type { Landmass } from './landmass.ts';
import type { CardAt } from '../player/cards.ts';
import type { InputFrame } from '../player/input.ts';
import type { Swell } from '../rules/landRules.ts';
import { SKY_NOW } from '../sky/skyDriver.ts';
import { type Lying, SLOOP_DECK } from '../ships/deck.ts';
import type { ShipBar } from '../ships/shipBars.ts';
import { type Stir, wakeStirs } from '../ships/swellPose.ts';
import type { HullMask } from '../water/hullMask.ts';
import { Aboard, type AboardContext } from './aboard.ts';
import { Passage } from './passage.ts';
import { seaMarks } from './seaMarks.ts';
import { type SeaHull, type SeaShip, SeaShips } from './seaShips.ts';
import type { FightHeard } from './audio/ambience/seaFight.ts';
import { roomSource, SeaCombat } from './seaCombat.ts';
import { SeaRoom } from './seaRoom.ts';
import { type Landfall, landfallOf, pictureAt, shownScale } from './seaLaw.ts';
import { SeaView } from './seaView.ts';

/** The Overworld is not to scale: a ship is drawn this long, metres, so one reads from the raised view. */
const SHIP_DRAWN_M = 75;
/** Her wake stirs the ripples only where she is drawn near her own size, the ripples round her a 32 m field, and at
 *  most as often as they step, seconds. */
const WAKE = { mostScale: 1.5, everyS: 1 / 60 } as const;
/** A mark stands this far over the ground it marks, metres. */
const MARK_RISE_M = 2;

/** What one frame at sea is handed: `seconds` on, at world time `time`, on a picture of `viewport` CSS pixels; the
 *  look keys' `turn` and `tilt`; the sea's `swell`, the steady wind blowing the way it runs; and the controls the
 *  player walks her deck by, none while `paused`. */
export interface SeaInput {
  readonly seconds: number;
  readonly time: number;
  readonly viewport: Viewport;
  readonly turn: number;
  readonly tilt: number;
  readonly swell: Swell | undefined;
  readonly controls: InputFrame;
  readonly paused: boolean;
}

/** What one frame at sea shows: the shot, the ships, the marks, and the words and dial of the sea's bar. */
export interface SeaFrame {
  readonly shot: Shot;
  readonly ships: readonly SeaShip[];
  /** Each ship's footprint on the water, world metres: none inside her, foam round her bow under way. */
  readonly hulls: readonly HullMask[];
  /** In a fight, each captain's bar over her masthead as she is drawn. */
  readonly bars: readonly ShipBar[];
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
  /** Everyone aboard the player's Sloop once the view is down there, and whether the player sees through their own
   *  eyes on her deck. */
  readonly figures: readonly CardAt[];
  readonly firstPerson: boolean;
  /** Where the player's feet are walking her deck, world metres, as she is drawn; none off the walk. */
  readonly feet: readonly [number, number, number] | null;
  /** Where her bow and quarters stir the water's ripples this frame, which follow her (`focus`, world metres). */
  readonly stirs: readonly Stir[];
  readonly focus: readonly [number, number];
  /** A fight's events this frame and its ships as they lie, for the sea's sounds; none out of a fight. */
  readonly fightHeard: FightHeard | null;
}

/**
 * The player's ship on the Overworld's sea: DFO's raised camera over it, voyages planned round the land and sailed
 * at the pace dial, stopped and resumed, a port's icon over it once the ship is near, and the bird's-eye view of the
 * island's side it lies off, where a landing is chosen. Online, its course goes to the sea room and every other ship
 * there is shown.
 */
export class Sea {
  private landmass: Landmass;
  /** Her waterline and sails, and what draws a fight's marks; how many times her size she is drawn on the sea's view;
   *  each ship's rig by who sails her. */
  private readonly hull: SeaHull;
  private readonly scale: number;
  private readonly drawn: SeaShips;
  /** The view brought down aboard her: Manage, or the walk off the helm. */
  readonly aboard: Aboard;
  /** The fight the sea room began for the player, from the pan down to the pan back up. */
  private combat: SeaCombat | null = null;
  /** Where she lies and heads, her voyage and pace dial, and her courses to the sea room. */
  private readonly passage: Passage;
  /** The view over her: the sea's, over an island's side, or down at her helm. */
  readonly view: SeaView;
  /** Seconds since her wake last stirred the water; and whether the sea room's link was lost. */
  private sinceStir = 0;
  private roomLost = false;
  private press: Press | null = null;
  private room: SeaRoom | null = null;
  private pose: CameraPose | null = null;
  private viewport: Viewport = { width: 1, height: 1 };
  private placed: PlacedMark[] = [];
  private islandMarks: readonly Mark[] = [];
  /** The sea her ships ride: the swell as last handed, and its depth off the open landmass. */
  private readonly water: { swell: Swell | undefined; depthAt: (x: number, y: number) => number } = {
    swell: undefined,
    depthAt: (x, y) => {
      const ground = this.landmass.heightAt(x, y);
      return Number.isFinite(ground) ? Math.max(0, -ground) : Infinity;
    },
  };

  constructor(
    landmass: Landmass,
    outlines: readonly (readonly Point2[])[],
    hull: SeaHull,
    start: Point2,
    heading: number,
    aboard: AboardContext,
  ) {
    this.landmass = landmass;
    this.hull = hull;
    this.drawn = new SeaShips(hull);
    this.aboard = new Aboard(aboard, SLOOP_DECK);
    this.scale = SHIP_DRAWN_M / hull.waterline.lengthM;
    this.passage = new Passage(outlines, () => this.landmass.mask, start, heading);
    this.view = new SeaView(start, heading);
    this.setLandmass(landmass);
  }

  /** Where the ship lies. */
  get position(): Point2 {
    return this.passage.position;
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

  /** Joins the sea room `open` makes, a server's or the page's own, the ship put to sea where it lies. */
  async enterRoom(open: Parameters<typeof SeaRoom.join>[0]): Promise<void> {
    this.room = await SeaRoom.join(open, this.position, this.passage.pace);
    [this.passage.room, this.roomLost] = [this.room, false];
    this.sendLie(this.room);
  }

  /** Puts to sea at rest, she is turned as she lies, so the room shows every player her heading; under way, she sails
   *  on her voyage. */
  private sendLie(room: SeaRoom): void {
    if (!this.passage.sailing) room.face(this.heading);
    this.passage.sendVoyage();
  }

  /** Whether the ship is in the sea room, which judges the helm left and taken. */
  get inRoom(): boolean {
    return this.room !== null;
  }

  /** The other ships the sea room shows round her, every other player's and every hostile one; none out of a room. */
  get sighted(): Pick<SeaRoom, 'others' | 'pirates'> | null {
    return this.room;
  }

  /** Leaves the sea room: the player's ship leaves the sea there. */
  leaveRoom(): void {
    this.room?.close();
    [this.room, this.passage.room] = [null, null];
  }

  /** What the ship is offered off the open landmass's coast: to dock at its port, to go ashore, or nothing. */
  get landfall(): Landfall {
    if (this.view.kind !== 'sail' || this.combat || this.aboard.active) return null;
    const offCoast = nearestIsland(this.position, [this.landmass.outline]) !== null;
    const { plan } = this.landmass;
    return landfallOf(this.position, offCoast, plan?.harbour ? { name: plan.name, harbour: plan.harbour } : null);
  }

  /** Where the ship lies and heads, as the held map shows it. */
  get heading(): number {
    return this.passage.ship.heading;
  }

  /** The voyage's course still ahead, from the ship; none at rest. */
  get course(): Point2[] {
    return this.passage.course;
  }

  /** A course from the ship to a point, as the held map inks it before setting sail, or why there is none. */
  planTo(point: Point2): ReturnType<Passage['planTo']> {
    return this.passage.planTo(point);
  }

  /** Opens Manage, the view down over her deck, or closes it. */
  manage(): void {
    if (!this.combat && this.view.kind === 'sail') this.aboard.manage();
  }

  /** The player leaves the helm to walk her deck; answers whether they did. */
  leaveHelm(): boolean {
    if (this.combat || this.view.kind !== 'sail' || !this.room) return false;
    return this.aboard.leaveHelm(this.room);
  }

  /** The player takes the helm again, at her wheel. */
  takeHelm(): void {
    if (this.room) this.aboard.takeHelm(this.room);
  }

  /** Takes the view down to the ship's helm, in first person, where the held map is raised. */
  toHelm(): boolean {
    return !this.combat && !this.aboard.active && this.view.toHelm();
  }

  /** Whether a voyage stopped short of its destination can be resumed. */
  get resumable(): boolean {
    return this.view.kind === 'sail' && this.passage.stoppedShort;
  }

  /** Stops the ship where it is; the voyage's destination is kept, to be resumed. */
  stop(): void {
    this.passage.stop();
  }

  /** Sets sail again, straight on or for the destination of the voyage last stopped, from wherever the ship lies. */
  resume(): void {
    if (this.resumable) this.passage.resume();
  }

  /** The helm's keys, as in a fight, from the sea's own view: `steer` (A and D held: -1 to port, 1 to starboard) turns
   *  her `seconds` on, under way onto a course straight on and at rest where she lies; `ahead` (W pressed) sets her
   *  sailing straight on; `heaveTo` (S pressed) heaves her to. */
  helm(steer: number, ahead: boolean, heaveTo: boolean, seconds: number): void {
    if (this.combat || this.aboard.active || this.view.kind !== 'sail') return;
    if (heaveTo) this.passage.stop();
    if (steer) this.passage.steer(steer, seconds);
    if (ahead && !heaveTo) this.passage.straightOn();
  }

  /** Plans a voyage from the ship to a point and sets sail; a voyage that cannot be planned says why. */
  sailTo(point: Point2): void {
    this.passage.sailTo(point);
  }

  /** One step of the pace dial: -1 slower, +1 faster. */
  stepPace(direction: number): void {
    // Off the helm the room takes no course, so the dial waits for the player's return to it.
    if (!this.aboard.walking) this.passage.stepPace(direction);
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
    const near = sideNodes(this.position, ringCentre(this.landmass.outline), nodes);
    const social = nodes.find((mark) => mark.kind === 'social');
    const side = landfall.kind === 'dock' && social && !near.includes(social) ? [social, ...near] : near;
    const aspect = this.viewport.width / this.viewport.height;
    this.passage.stop();
    this.view.flyToSide(side, frameSide(this.position, side, aspect, this.landmass.heightAt));
    return true;
  }

  /** The player is back aboard: the view stands over the ship, whatever it showed when they landed. */
  cameAboard(): void {
    this.view.sail();
    this.view.chosen = null;
    this.press = null;
  }

  /** A press that ends off the canvas only looked. */
  pointerCancel(): void {
    this.press = null;
  }

  pointerDown(x: number, y: number): void {
    this.press = pressAt(x, y);
  }

  pointerMove(x: number, y: number): void {
    if (!this.press) return;
    const moved = pressMove(this.press, x, y);
    this.press = moved.press;
    if (this.aboard.managing) this.aboard.drag(moved.acrossPx);
    else if (this.view.kind === 'sail' && !this.aboard.active) this.view.drag(moved);
  }

  /** A press let go: a click on the sea or the land sails there, on a mark for its node; a drag only looked. */
  pointerUp(x: number, y: number): void {
    const press = this.press;
    this.press = null;
    if (!press || press.dragging || this.view.kind !== 'sail' || this.aboard.active || !this.pose) return;
    const pick = pickAt(this.pose, this.viewport, x, y, this.landmass.heightAt, this.placed);
    if (pick.kind === 'mark') this.sailToMark(pick.id);
    else if (pick.kind !== 'none') this.sailTo([pick.point[0], pick.point[1]]);
  }

  /** The wheel's notches, positive in, zoom the camera over the ship, and past its lowest bring the view in close. */
  zoom(notches: number): void {
    if (this.aboard.active) this.aboard.zoom(notches);
    else if (this.view.kind === 'sail') {
      const ceiling = ceilingFor(SKY_NOW.current.reading);
      this.view.zoom(notches, ceiling, heightBand(ceiling)[0]);
    }
  }

  /** One frame at sea. */
  frame(input: SeaInput): SeaFrame {
    const { seconds: dt, time, viewport } = input;
    const windBearing = SKY_NOW.current.sails ?? input.swell?.bearing ?? 0;
    this.viewport = viewport;
    // A room whose link was lost says no more: the player is called to the helm and sails on alone.
    if (this.room?.lost) {
      this.aboard.drop();
      this.leaveRoom();
      this.roomLost = true;
    }
    // Joined again after its socket closed, the room has her as a new player: she puts to sea again where she lies.
    if (this.room?.rejoined()) {
      this.aboard.drop();
      this.room.course([this.position], this.passage.pace);
      this.sendLie(this.room);
    }
    this.water.swell = input.swell;
    this.room?.pump(dt);
    this.meet(time);
    this.aboard.step(dt, time, input.controls, input.paused, this.room);
    if (!this.combat) this.passage.advance(dt);
    this.view.step(dt);
    if (this.view.kind === 'sail' && !this.aboard.active) this.view.turn(input.turn, input.tilt, dt);
    const { ship } = this.passage;
    const own = { ...ship, underWay: this.passage.sailing };
    // Every view near her is laid on her at her own size; she is drawn as large as the eye's distance calls for.
    const truePlace = this.drawn.placeOf('own', own, 1, this.water, dt, time);
    const trueLying: Lying = { ...ship, scale: 1, heave: truePlace.z, pitch: truePlace.pitch, roll: truePlace.roll };
    const ceiling = ceilingFor(SKY_NOW.current.reading);
    const shot = this.view.shot({ feet: [ship.x, ship.y, 0], dt, ceiling, heightAt: this.landmass.heightAt });
    const look = lookOf(shot.forward);
    const fromShip = Math.hypot(shot.eye[0] - ship.x, shot.eye[1] - ship.y, shot.eye[2]);
    const lens = horizonOf({ nearM: 2, farM: 60_000 }, fromShip);
    const overworld: Shot = { eye: shot.eye, ...look, fov: FIELD_OF_VIEW, near: lens.nearM, far: lens.farM };
    const overShip = this.view.kind !== 'landing';
    const seaShot = overShip ? this.view.closeShot(overworld, trueLying) : overworld;
    // Clicks and marks are taken on the picture as shown, brought in close or not.
    const pose = poseOf({ eye: seaShot.eye, forward: forwardOf(seaShot.yaw, -seaShot.pitch) }, FIELD_OF_VIEW);
    this.pose = pose;
    const combat = this.combat;
    const fail = (error: unknown) => this.passage.say(error instanceof Error ? error.message : String(error));
    const aboardShot = this.aboard.target(trueLying);
    // The fight's view, the helm's or one aboard, which the view comes down to from the sea's.
    const down = combat
      ? { near: combat.frame(dt, time, seaShot.far, fail), share: combat.share }
      : this.view.kind === 'helm'
        ? { near: this.view.helmShot(trueLying, seaShot.far), share: this.view.helmShare }
        : aboardShot && { near: aboardShot, share: this.aboard.share };
    const shown = down ? panShot(seaShot, down.near, down.share) : seaShot;
    const { near, share } = down ?? { near: this.view.closest(overworld, trueLying), share: this.view.closeShare };
    const her = combat ? combat.lying : ship;
    const atHer = (view: Shot) => pictureAt(view, [her.x, her.y, 0]);
    const scale = shownScale(this.scale, { seaM: atHer(overworld), shownM: atHer(shown), nearM: atHer(near), share });
    // Asked again no time on, her swing stands: she is posed on the swell at the size she is drawn.
    const place = scale === 1 ? truePlace : this.drawn.placeOf('own', own, scale, this.water, 0, time);
    const lying: Lying = { ...ship, scale, heave: place.z, pitch: place.pitch, roll: place.roll };
    if (combat?.done) {
      this.passage.placeAt(combat.lying);
      this.combat = null;
    }
    const others = this.room?.others ?? [];
    const pirates = this.room?.pirates ?? [];
    const aboard = combat ? combat.ownAt(scale) : lying;
    const kind = this.view.kind === 'sail' || this.view.kind === 'landing' ? this.view.kind : 'other';
    const marks = seaMarks(
      combat || this.aboard.active ? 'other' : kind,
      this.islandMarks,
      this.view.sideMarks,
      this.position,
      pose,
      viewport,
      this.view.chosen,
    );
    this.placed = marks.placed;
    return {
      shot: shown,
      ships: combat
        ? combat.ships(dt, time, windBearing, scale)
        : this.drawn.ships(dt, time, windBearing, { lies: own, place }, others, pirates, scale, this.water),
      hulls: combat ? combat.hulls(this.hull.waterline, scale) : this.drawn.hulls(own, others, pirates, scale),
      bars: combat?.bars(scale) ?? [],
      marks: marks.shown,
      figures: aboard
        ? this.aboard.figures(aboard, shown.eye, time, own.underWay && !combat, this.view.helmShare > 0.5)
        : [],
      firstPerson: !combat && this.aboard.firstPerson,
      feet: combat ? null : this.aboard.feetOn(lying),
      stirs: !combat && own.underWay ? this.wake(lying, dt) : [],
      focus: combat ? [combat.lying.x, combat.lying.y] : [ship.x, ship.y],
      fightHeard: combat?.heard ?? null,
      note: this.note(),
      landfall: this.landfall,
      sailing: this.passage.sailing,
      resumable: this.resumable,
      pace: this.passage.pace,
      overSide: this.view.kind === 'landing',
    };
  }

  /** Her bow and quarters stir the water under way, as she is drawn, at a ship's own way: near her own size, where
   *  the ripples round her hold her, and as often as they step. */
  private wake(lying: Lying, seconds: number): Stir[] {
    this.sinceStir += seconds;
    if (lying.scale > WAKE.mostScale || this.sinceStir < WAKE.everyS) return [];
    this.sinceStir = 0;
    const { lengthM, beamM } = this.hull.waterline;
    return wakeStirs(lying, (lengthM / 2) * lying.scale, (beamM / 2) * lying.scale, SHIP_SPEED).map((stir) => ({
      ...stir,
      radiusM: stir.radiusM * lying.scale,
    }));
  }

  /** The fight the sea room began for the player, while it is on screen. */
  get fight(): SeaCombat | null {
    return this.combat;
  }

  /** Takes up a fight the sea room has begun for the player: the ship heaves to, her voyage kept to be resumed, and
   *  the view pans down to it, from the helm's view too. */
  private meet(time: number): void {
    if (this.combat || !this.room?.fighting) return;
    const first = this.room.takeFight();
    if (!first) return;
    this.aboard.drop();
    this.passage.stop();
    if (this.view.helmView) this.view.sail();
    this.combat = new SeaCombat(roomSource(this.room, first), first, this.hull.marks, this.hull.sails, time);
  }

  private note(): string {
    const lost = this.roomLost ? ' · The sea room was lost: sailing on alone' : '';
    const joined = this.room?.rejoining ? ' · Reconnecting…' : ` · In the sea room as player ${this.room?.own}`;
    const room = this.room ? joined : lost;
    if (this.combat) return `Fighting${room}`;
    if (this.view.kind !== 'sail') return room.slice(3);
    // Off the helm, her helmsman has her while she sails on.
    const helmsman = this.aboard.walking && this.passage.sailing ? ' · Her helmsman has the helm' : '';
    return this.passage.note + helmsman + room;
  }

  /** Where her voyage stands: under way, hove to short of it, or at anchor. */
  get voyageNote(): string {
    return this.passage.note;
  }

  /** Her pace dial's step. */
  get paceStep(): Pace {
    return this.passage.pace;
  }
}
