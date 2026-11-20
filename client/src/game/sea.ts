import type { Point2, Vec3 } from '../overworld/ground.ts';
import { flyRig, frameSide, nearestIsland, ringCentre, SIDE, sideNodes } from '../overworld/islandView.ts';
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
import { dragCamera, keyTurn, type Press, pressAt, pressMove, zoomCamera } from '../overworld/overworldInput.ts';
import type { Mark, PlacedMark } from '../overworld/overworldMarks.ts';
import { pickAt } from '../overworld/overworldPick.ts';
import type { Pace } from '../overworld/voyage.ts';
import { lookOf, panShot, type Shot } from './camera.ts';
import type { Landmass } from './landmass.ts';
import { portOf } from './nodes.ts';
import type { Swell } from '../rules/landRules.ts';
import { type Lying, SLOOP_DECK } from '../ships/deck.ts';
import { Aboard, type AboardContext } from './aboard.ts';
import { CloseZoom } from './seaClose.ts';
import { Passage } from './passage.ts';
import type { SeaFrame, SeaInput } from './seaFrame.ts';
import { Chase } from './seaChase.ts';
import { Wake } from './seaWake.ts';
import { HOSTILE_PREFIX, SeaWatch, type WaterNamed } from './seaHostiles.ts';
import { seaMarks } from './seaMarks.ts';
import { type SeaHull, SeaShips } from './seaShips.ts';
import { SeaCombat } from './seaCombat.ts';
import { SeaRoom } from './seaRoom.ts';
import { HELM, helmEye, type Landfall, landfallOf, pictureAt, shownScale } from './seaLaw.ts';

/** The Overworld is not to scale: the Sloop is drawn this long, metres, so one reads from the raised view, and every
 *  hull as many times her own length. */
const SHIP_DRAWN_M = 75;
/** The view the ship first comes to: lower than DFO's, so the island it lies off stands in it. */
const FIRST_TILT = (30 * Math.PI) / 180;
/** Seconds the view takes to fall back from an island's side to the ship. */
const FLY_BACK_SECONDS = 1.4;
/** Seconds the view takes to come down to the helm, or go back up from it. */
const HELM_SECONDS = 1.1;
/** A mark stands this far over the ground it marks, metres. */
const MARK_RISE_M = 2;

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

/**
 * The player's ship on the Overworld's sea: DFO's raised camera over it, voyages planned round the land and sailed
 * at the pace dial, stopped and resumed, a port's icon over it once the ship is near, and the bird's-eye view of the
 * island's side it lies off, where a landing is chosen. Online, its course goes to the sea room and every other ship
 * there is shown.
 */
export class Sea {
  private landmass: Landmass;
  /** Her waterline, and what draws a fight's marks; how many times her size every ship is drawn on the sea's view;
   *  each ship's rig by who sails her. */
  private readonly hull: SeaHull;
  private readonly scale: number;
  private readonly drawn: SeaShips;
  /** The view brought down aboard her: Manage, or the walk off the helm. */
  readonly aboard: Aboard;
  /** The fight the sea room began for the player, from the pan down to the pan back up. */
  private combat: SeaCombat | null = null;
  /** The water at a point, once the page has opened the waters; and what the voyage's line says of them. */
  waterAt: ((point: Point2) => WaterNamed | null) | null = null;
  private readonly watch = new SeaWatch();
  private readonly chase = new Chase((ship) => this.room?.chase(ship));
  /** Where she lies and heads, her voyage and pace dial, and her courses to the sea room. */
  private readonly passage: Passage;
  private camera: OverworldCamera;
  private seaRig: Rig;
  private view: SeaView = { kind: 'sail' };
  /** How far the view has come down to the helm, eased: 0 the sea's view, 1 at the helm. */
  private helmShare = 0;
  /** How far the wheel has brought the view in over her, past the Overworld's lowest. */
  private readonly close = new CloseZoom();
  /** Her wake; and whether the sea room's link was lost. */
  private readonly wake = new Wake();
  private roomLost = false;
  private side: readonly Mark[] = [];
  private sideRig: Rig | null = null;
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
  chosen: string | null = null;

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
    this.drawn = new SeaShips(hull.shown);
    this.aboard = new Aboard(aboard, SLOOP_DECK);
    this.scale = SHIP_DRAWN_M / hull.waterline.lengthM;
    this.passage = new Passage(outlines, () => this.landmass.mask, start, heading);
    this.camera = { ...initialCamera([start[0], start[1], 0], heading), tilt: FIRST_TILT };
    this.seaRig = this.camera;
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
    const harbour = portOf(landmass.plan)?.harbour;
    if (landmass.plan && harbour) {
      const port = { id: `${landmass.plan.id}-port`, kind: 'port', name: landmass.plan.name, edge: true } as const;
      marks.push({ ...port, at: [harbour[0], harbour[1], MARK_RISE_M] });
    }
    this.islandMarks = marks;
  }

  /** Joins the sea room `open` makes, a server's or the page's own, the ship put to sea where it lies. */
  async enterRoom(open: Parameters<typeof SeaRoom.join>[0]): Promise<void> {
    // Every hull is made ready behind the veil, so the first of each seen never holds a frame; one that fails to come
    // is drawn as the Sloop, as before.
    const warmed = this.hull.warm?.().catch(() => undefined);
    [this.room] = await Promise.all([SeaRoom.join(open, this.position, this.passage.pace), warmed]);
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
    return landfallOf(this.position, offCoast, portOf(plan));
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
    if (this.combat || this.aboard.active) return false;
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
    return this.view.kind === 'sail' && this.passage.stoppedShort;
  }

  /** Stops the ship where it is; the voyage's destination is kept, to be resumed. */
  stop(): void {
    this.chase.stop();
    this.passage.stop();
  }

  /** Sets sail again, straight on or for the destination of the voyage last stopped, from wherever the ship lies. */
  resume(): void {
    this.chase.stop();
    if (this.resumable) this.passage.resume();
  }

  /** The helm's keys, as in a fight, from the sea's own view: `steer` (A and D held: -1 to port, 1 to starboard) turns
   *  her `seconds` on, under way onto a course straight on and at rest where she lies; `ahead` (W pressed) sets her
   *  sailing straight on; `heaveTo` (S pressed) heaves her to. */
  helm(steer: number, ahead: boolean, heaveTo: boolean, seconds: number): void {
    if (this.combat || this.aboard.active || this.view.kind !== 'sail') return;
    if (steer || ahead || heaveTo) this.chase.stop();
    if (heaveTo) this.passage.stop();
    if (steer) this.passage.steer(steer, seconds);
    if (ahead && !heaveTo) this.passage.straightOn();
  }

  /** Plans a voyage from the ship to a point and sets sail; a voyage that cannot be planned says why. */
  sailTo(point: Point2): void {
    this.chase.stop();
    this.passage.sailTo(point);
  }

  /** One step of the pace dial: -1 slower, +1 faster. */
  stepPace(direction: number): void {
    // Off the helm the room takes no new course, so the dial waits for the player's return to it.
    if (!this.aboard.walking) this.passage.stepPace(direction);
  }

  /** A mark chosen at sea: the ship sails for it, to the water nearest it; for a sighted hostile ship's, she chases
   *  her, the mark kept chosen while she does. True for a mark she sails for. */
  sailToMark(id: string): boolean {
    const toward = this.chase.begin(id, this.room?.pirates ?? [], this.position);
    if (toward) {
      this.chosen = id;
      this.passage.sailTo(toward);
      return true;
    }
    const mark = this.islandMarks.find((each) => each.id === id);
    if (mark) this.sailTo([mark.at[0], mark.at[1]]);
    return mark !== undefined;
  }

  /** Chases the hostile ship whose mark is chosen, if one is still sighted: true then. */
  chaseChosen(): boolean {
    const chosen = this.chosen;
    return this.view.kind === 'sail' && chosen !== null && chosen.startsWith(HOSTILE_PREFIX) && this.sailToMark(chosen);
  }

  /** Docks or goes ashore as the landfall offers: flies the view up over the island's side the ship lies off, its
   *  nodes marked, the city's social space among them when docking; false with nothing offered. The ship heaves to
   *  while its captain looks, and its voyage can be resumed on coming back to sea. */
  goAshore(): boolean {
    const landfall = this.landfall;
    if (!landfall) return false;
    this.chase.stop();
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
    this.passage.stop();
    this.chosen = null;
    this.close.release();
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
    if (this.aboard.managing) this.aboard.drag(moved.acrossPx);
    else if (this.view.kind === 'sail' && !this.aboard.active) this.camera = dragCamera(this.camera, moved);
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
      const ceiling = ceilingFor(null);
      const atLowest = this.camera.heightTarget <= heightBand(ceiling)[0] + 1e-6;
      this.camera = zoomCamera(this.camera, this.close.zoom(notches, atLowest), ceiling);
    }
  }

  /** One frame at sea. */
  frame(input: SeaInput): SeaFrame {
    const { seconds: dt, time, viewport } = input;
    const windBearing = input.swell?.bearing ?? 0;
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
    if (!this.combat) this.passage.advance(dt, this.close.eased > 0 || this.view.kind === 'helm' || this.aboard.active);
    this.close.step(dt);
    this.stepHelmView(dt);
    if (this.view.kind === 'sail' && !this.aboard.active)
      this.camera = keyTurn(this.camera, input.turn, input.tilt, dt);
    const { ship } = this.passage;
    const own = { ...ship, underWay: this.passage.sailing };
    // Every view near her is laid on her at her own size; she is drawn as large as the eye's distance calls for.
    const truePlace = this.drawn.placeOf('own', own, 1, this.water, dt, time);
    const trueLying: Lying = { ...ship, scale: 1, heave: truePlace.z, pitch: truePlace.pitch, roll: truePlace.roll };
    const stepped = stepCamera(this.camera, {
      feet: [ship.x, ship.y, 0],
      dt,
      ceiling: ceilingFor(null),
      heightAt: this.landmass.heightAt,
    });
    this.camera = stepped.camera;
    let shot = stepped.shot;
    if (this.view.kind === 'sail') this.seaRig = { ...this.camera, height: shot.height, tilt: shot.tilt };
    if (this.view.kind === 'fly') {
      const t = Math.min(1, this.view.t + dt / this.view.seconds);
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
    const combat = this.combat;
    const fail = (error: unknown) => this.passage.say(error instanceof Error ? error.message : String(error));
    const aboardShot = this.aboard.target(trueLying);
    // The fight's view, the helm's or one aboard, which the view comes down to from the sea's.
    const down = combat
      ? { near: combat.frame(dt, time, seaShot.far, fail), share: combat.share }
      : this.view.kind === 'helm'
        ? { near: this.helmShot(trueLying, seaShot.far), share: this.helmShare }
        : aboardShot && { near: aboardShot, share: this.aboard.share };
    const shown = down ? panShot(seaShot, down.near, down.share) : seaShot;
    const closest = this.close.closest(overworld, trueLying, this.camera.yaw, this.camera.tilt);
    const { near, share } = down ?? { near: closest, share: this.close.eased };
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
      this.side,
      this.position,
      pose,
      viewport,
      this.chosen,
      pirates,
    );
    this.watch.step(dt, combat ? [] : pirates, this.position, this.waterAt?.(this.position) ?? null);
    const toward = combat || this.view.kind !== 'sail' ? null : this.chase.step(dt, pirates, this.position);
    if (toward) this.passage.sailTo(toward);
    // A hostile ship's mark stays chosen only while she is chased.
    if (this.chase.chasing === null && this.chosen?.startsWith(HOSTILE_PREFIX)) this.chosen = null;
    this.placed = marks.placed;
    return {
      shot: shown,
      ships: combat
        ? combat.ships(dt, time, windBearing, scale)
        : this.drawn.ships(dt, time, windBearing, { lies: own, place }, others, pirates, scale, this.water),
      shipScale: scale,
      hulls: combat ? combat.hulls(scale) : this.drawn.hulls(own, others, pirates, scale),
      bars: combat?.bars(scale) ?? [],
      marks: marks.shown,
      figures: aboard
        ? this.aboard.figures(aboard, shown.eye, time, own.underWay && !combat, this.helmShare > 0.5)
        : [],
      firstPerson: !combat && this.aboard.firstPerson,
      stirs: combat ? combat.stirs() : own.underWay ? this.wake.stirs(lying, this.hull.waterline, dt) : [],
      focus: combat ? [combat.lying.x, combat.lying.y] : [ship.x, ship.y],
      note: this.note(),
      landfall: this.landfall,
      sailing: this.passage.sailing,
      resumable: this.resumable,
      pace: this.passage.pace,
      overSide: this.view.kind === 'landing',
    };
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
    this.chase.stop();
    this.passage.stop();
    if (this.view.kind === 'helm') this.view = { kind: 'sail' };
    this.combat = new SeaCombat(this.room, first, this.hull.marks, time, this.hull.shown);
  }

  /** The view coming down to the helm, there, or going back up, `seconds` on: how far down, eased. */
  private stepHelmView(seconds: number): void {
    if (this.view.kind !== 'helm') {
      this.helmShare = 0;
      return;
    }
    const step = (this.view.going === 'down' ? seconds : -seconds) / HELM_SECONDS;
    const down = Math.min(1, Math.max(0, this.view.at + step));
    this.view = down <= 0 && this.view.going === 'up' ? { kind: 'sail' } : { ...this.view, at: down };
    this.helmShare = smooth01(down);
  }

  /** The helm's view, the eye behind her wheel riding her as she lies, looking along her heading. */
  private helmShot(lying: Lying, far: number): Shot {
    return { eye: helmEye(lying), yaw: lying.heading, pitch: HELM.pitch, fov: FIELD_OF_VIEW, near: 0.3, far };
  }

  private note(): string {
    const lost = this.roomLost ? ' · The sea room was lost: sailing on alone' : '';
    const joined = this.room?.rejoining ? ' · Reconnecting…' : ` · In the sea room as player ${this.room?.own}`;
    const room = this.room ? joined : lost;
    if (this.combat) return `Fighting${room}`;
    if (this.view.kind !== 'sail') return room.slice(3);
    // Off the helm, her helmsman has her while she sails on.
    const helmsman = this.aboard.walking && this.passage.sailing ? ' · Her helmsman has the helm' : '';
    return this.voyageNote + helmsman + room;
  }

  /** Where her voyage stands: a hostile ship just sighted or other waters entered; under way, hove to, or at anchor. */
  get voyageNote(): string {
    return this.watch.words ?? this.chase.words ?? this.passage.note;
  }

  /** The water she is in, as the status line names it; null before the waters are open. */
  get waterWords(): string | null {
    return this.watch.waterWords;
  }

  /** Her pace dial's step. */
  get paceStep(): Pace {
    return this.passage.pace;
  }
}
