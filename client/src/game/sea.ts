import type { Point2 } from '../overworld/ground.ts';
import { frameSide, nearestIsland, ringCentre } from '../overworld/islandView.ts';
import {
  type CameraPose,
  ceilingFor,
  FIELD_OF_VIEW,
  forwardOf,
  horizonOf,
  poseOf,
  rayThrough,
  type Viewport,
} from '../overworld/overworldCamera.ts';
import { type Press, pressAt, pressMove } from '../overworld/overworldInput.ts';
import type { Mark, PlacedMark } from '../overworld/overworldMarks.ts';
import { pickAt } from '../overworld/overworldPick.ts';
import { CLICK_PACE, type Pace, PLANNED_PACE } from '../overworld/voyage.ts';
import { lookOf, panShot, QA_EYE, type Shot } from './camera.ts';
import type { Landmass } from './landmass.ts';
import { portOf } from './nodes.ts';
import type { Swell } from '../rules/landRules.ts';
import type { PageSeaFacts } from './pageWaters.ts';
import { SKY_NOW } from '../sky/skyDriver.ts';
import type { Lying } from '../ships/deck.ts';
import { Aboard } from './aboard.ts';
import { Boarding } from './deckBoarding.ts';
import { Foot, type FootContext } from './foot.ts';
import type { GearHere } from './gearScreen.ts';
import { Passage } from './passage.ts';
import type { SeaFrame, SeaInput } from './seaFrame.ts';
import { Chase } from './seaChase.ts';
import { Wake } from './seaWake.ts';
import { HOSTILE_PREFIX, orHostile, SeaWatch, type WaterNamed } from './seaHostiles.ts';
import { islandMarksOf, landfallMarks, seaMarks } from './seaMarks.ts';
import { type SeaHull, SeaShips } from './seaShips.ts';
import { SeaCombat } from './seaCombat.ts';
import { SeaRoom } from './seaRoom.ts';
import { type Landfall, landfallOf, pictureAt, roomWords, seaNote, shownScale } from './seaLaw.ts';
import { isleOff, isleWords, keptClear } from './isleLaw.ts';
import type { Isles } from './isles.ts';
import { seaPlated } from './seaPlates.ts';
import { SeaTravel } from './seaTravel.ts';
import { type SeaLevel, SeaView } from './seaView.ts';

/** The Overworld is not to scale: the Sloop is drawn this long, metres, so one reads from the raised view, and every
 *  hull as many times its own length. */
const SHIP_DRAWN_M = 75;

/**
 * The player's ship on the Overworld's sea: the Oversea view, DFO's raised camera over it, where a click sails and a
 * voyage planned on the map sails faster, and the Sealevel view close on it, where the helm's keys sail; voyages
 * stopped and resumed, a port's icon over it once the ship is near, and the bird's-eye view of the island it lies off,
 * where a landing is chosen. Online, its course goes to the sea room and every other ship there is shown.
 */
export class Sea {
  /** The sea's islands as the page holds them: offered to land at, and kept clear of by every voyage. */
  isles: Isles | null = null;
  private landmass: Landmass;
  /** Its waterline, and what draws a fight's marks; how many times its size every ship is drawn on the sea's view;
   *  each ship's rig by who sails it. */
  private readonly hull: SeaHull;
  /** What the deck is walked with, whose forge and walker draw what the feed tells. */
  private readonly context: FootContext;
  private readonly scale: number;
  private readonly drawn: SeaShips;
  /** The view brought down aboard it: Manage, or the walk off the helm. */
  readonly aboard: Aboard;
  /** The fight on foot on the deck of a struck ship the player boarded, laid on it as the sea's fight shows it. */
  readonly boarding: Boarding;
  /** The fight the sea room began for the player, from the pan down to the pan back up. */
  private combat: SeaCombat | null = null;
  /** The water at a point, once the page has opened the waters; and what the voyage's line says of them. */
  waterAt: ((point: Point2) => WaterNamed | null) | null = null;

  /** The sea's rules as the waters give them: the reaches the chase meets it within and the voyage is held within,
   *  and the locked seas no voyage is planned into. */
  set facts(facts: PageSeaFacts) {
    [this.chase.metM, this.passage.holdReachM, this.passage.locked] = [facts.engageM, facts.holdReachM, facts.locked];
  }
  private readonly watch = new SeaWatch();
  private readonly chase = new Chase({ tell: (ship) => this.room?.chase(ship), speed: () => this.passage.speed });
  /** Where it lies and heads, its voyage and its pace, and its courses to the sea room. */
  readonly passage: Passage;
  /** The view over it: the sea's, over an island's side, or down at its helm. */
  readonly view: SeaView;
  /** Its wake; and whether the sea room's link was lost. */
  private readonly wake = new Wake();
  private roomLost = false;
  /** A travel by the held map under way, faded out and in, until the player has the ship again. */
  travelling: SeaTravel | null = null;
  private press: Press | null = null;
  private room: SeaRoom | null = null;
  /** Each join and leave counted, so a join that comes after another, or after the player left, is let go. */
  private joins = 0;
  /** The picture's pose as last shown, brought in close or not, and its size: clicks and marks are taken on it. */
  private pose: CameraPose | null = null;
  /** The size the frame last drew the ships at, which a click on one is judged against. */
  private drawnScale = 1;
  private viewport: Viewport = { width: 1, height: 1 };
  private placed: PlacedMark[] = [];
  private islandMarks: readonly Mark[] = [];
  /** The sea its ships ride: the swell as last handed, and its depth off the open landmass. */
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
    aboard: FootContext,
  ) {
    [this.landmass, this.hull, this.context] = [landmass, hull, aboard];
    this.drawn = new SeaShips(hull.shown, undefined, () => this.room?.ownShip ?? null);
    [this.aboard, this.boarding] = [
      new Aboard(aboard, () => this.drawn.ownDeck()),
      new Boarding(aboard, (...asked) => Foot.onDeck(...asked)),
    ];
    this.scale = SHIP_DRAWN_M / hull.waterline.lengthM;
    this.passage = new Passage(outlines, () => this.landmass.mask, start, heading, hull.way);
    this.passage.keepClear = () => keptClear(this.isles?.all() ?? [], this.room?.chartMarks);
    this.view = new SeaView(start, heading, () => this.drawn.ownDeck());
    this.setLandmass(landmass);
  }

  /** The player's gear at sea, for the feed to tell what they gain; the menu at sea keeps to the ship, asking nothing. */
  get gear(): GearHere | null {
    const { forge, walker } = this.context;
    return this.room ? { gear: this.room.gearSent, ask: () => undefined, forge, dress: walker.you.dress } : null;
  }

  /** Where the ship lies. */
  get position(): Point2 {
    return this.passage.position;
  }

  /** The landmass drawn and charted from now on. */
  setLandmass(landmass: Landmass): void {
    this.landmass = landmass;
    this.islandMarks = islandMarksOf(landmass);
  }

  /** Joins the sea room `open` makes, a server's or the page's own, the ship put to sea where it lies. */
  async enterRoom(open: Parameters<typeof SeaRoom.join>[0]): Promise<void> {
    const join = ++this.joins;
    // Every hull is made ready behind the veil, so the first of each seen never holds a frame; one that fails to come
    // is drawn as the Sloop, as before.
    const warmed = this.hull.warm?.().catch(() => undefined);
    const [room] = await Promise.all([SeaRoom.join(open, this.position, this.passage.pace), warmed]);
    // Left, or joined again, while this join was on its way: its room is closed, never kept open behind the player.
    if (join !== this.joins) {
      room.close();
      return;
    }
    this.room?.close();
    this.room = room;
    [this.passage.room, this.roomLost] = [room, false];
    this.sendLie(room);
  }

  /** Puts to sea: at rest turned as it lies, so the room shows every player its heading; under way on its voyage. */
  private sendLie(room: SeaRoom): void {
    if (!this.passage.sailing) room.face(this.heading);
    this.passage.sendVoyage();
  }

  /** The sea room the ship is in, which judges the helm left and taken, and shows the ships round it: every other
   *  player's, every hostile one and the friendly ones it keeps; none out of a room. */
  get sighted(): SeaRoom | null {
    return this.room;
  }

  /** Leaves the sea room: the player's ship leaves the sea there. */
  leaveRoom(): void {
    this.joins++;
    this.room?.close();
    [this.room, this.passage.room] = [null, null];
  }

  /** A sea room that would not open: the ship sails on alone to `point` at `pace`, and the player is told so, as when
   *  a link is lost. */
  sailAlone(point: Point2, pace: Pace = CLICK_PACE): void {
    this.leaveRoom();
    this.roomLost = true;
    this.sailTo(point, pace);
  }

  /** What the ship is offered off the open landmass's coast: to dock at its port, to go ashore, or nothing. */
  get landfall(): Landfall {
    if (this.view.kind !== 'sail' || this.combat || this.aboard.active) return null;
    const isle = isleOff(this.position, this.isles?.all() ?? []);
    if (isle) return { kind: 'isle', id: isle.seen.id, words: isleWords(isle.seen) };
    const offCoast = nearestIsland(this.position, [this.landmass.outline]) !== null;
    const { plan } = this.landmass;
    return landfallOf(this.position, offCoast, portOf(plan), this.landmass.regions);
  }

  /** Where the ship lies and heads, as the held map shows it. */
  get heading(): number {
    return this.passage.ship.heading;
  }

  /** The voyage's course still ahead, from the ship; none at rest. */
  get course(): Point2[] {
    return this.passage.course;
  }

  /** Where the voyage under way, or the one stopped short, is bound; none at rest. */
  get bound(): Point2 | null {
    return this.passage.bound;
  }

  /** Bends the voyage ahead round the islands in sight now. */
  bendRound(): void {
    this.passage.bendRound();
  }

  /** A course from the ship to a point, as the held map inks it before setting sail, or why there is none. */
  planTo(point: Point2): ReturnType<Passage['planTo']> {
    return this.passage.planTo(point);
  }

  /** Opens Manage, the view down over its deck, or closes it. */
  manage(): void {
    if (!this.combat && this.view.kind === 'sail') this.aboard.manage();
  }

  /** The player leaves the helm to walk its deck; answers whether they did. */
  leaveHelm(): boolean {
    if (this.combat || this.view.kind !== 'sail' || !this.room) return false;
    return this.aboard.leaveHelm(this.room);
  }

  /** The player takes the helm again, at its wheel. */
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
    // A travel under way is the fade's to end: no press stops it.
    if (this.travelling) return;
    this.chase.stop();
    this.passage.stop();
  }

  /** Sets sail again, straight on or for the destination of the voyage last stopped, from wherever the ship lies. */
  resume(): void {
    this.chase.stop();
    if (this.resumable) this.passage.resume();
  }

  /** The helm's keys, as in a fight, in the Sealevel view alone: `steer` (A and D held: -1 to port, 1 to starboard)
   *  turns its `seconds` on, under way onto a course straight on and at rest where it lies; `ahead` (W pressed) sets it
   *  sailing straight on; `heaveTo` (S pressed) heaves it to. */
  helm(steer: number, ahead: boolean, heaveTo: boolean, seconds: number): void {
    if (this.combat || this.aboard.active || this.view.kind !== 'sail' || this.view.level !== 'sealevel') return;
    if (steer || ahead || heaveTo) this.chase.stop();
    if (heaveTo) this.passage.stop();
    if (steer) this.passage.steer(steer, seconds);
    if (ahead && !heaveTo) this.passage.straightOn();
  }

  /** Sails for a berth's `offing`, planned on water as `sailTo` plans, then on in through `inward`: whether it did. */
  sailIn(offing: Point2, inward: readonly Point2[]): boolean {
    this.chase.stop();
    return this.passage.sailVia(offing, inward);
  }

  /** Plans a voyage from the ship to a point and sets sail at `pace` (a click's, or the map's when planned there); a
   *  voyage that cannot be planned says why. */
  sailTo(point: Point2, pace: Pace = CLICK_PACE): void {
    this.chase.stop();
    this.passage.sailTo(point, pace);
  }

  /** Travels to `point` in the water named `water`, the picture fading out and in: under way for it from the helm, the
   *  room asked as the picture fades; `ready` says when the waters round the ship have loaded. Answers whether it set
   *  off: not in a fight, nor on a travel already, nor with no sea room to ask. */
  travelTo(point: Point2, water: string, ready: () => boolean): boolean {
    if (this.combat || this.travelling || !this.room) return false;
    this.sailTo(point, PLANNED_PACE);
    this.travelling = new SeaTravel(water, point, this.passage, ready);
    this.view.travel();
    return true;
  }

  /** A mark chosen at sea: the ship sails for it, to the water nearest it; for a hostile ship's, the ship chases it,
   *  the mark kept chosen while it does. True for a mark it sails for. */
  sailToMark(id: string): boolean {
    const toward = this.chase.begin(id, this.room?.hostiles ?? [], this.position);
    if (toward) {
      this.view.chosen = id;
      this.passage.sailTo(toward);
      return true;
    }
    const mark = this.islandMarks.find((each) => each.id === id);
    if (mark) this.sailTo([mark.at[0], mark.at[1]]);
    return mark !== undefined;
  }

  /** Chases the hostile ship whose mark is chosen, if it is still drawn: true then. */
  chaseChosen(): boolean {
    const { chosen } = this.view;
    return this.view.kind === 'sail' && chosen !== null && chosen.startsWith(HOSTILE_PREFIX) && this.sailToMark(chosen);
  }

  /** Docks or goes ashore as the landfall offers: flies the view up over the island the ship lies off, framed on the
   *  nodes of its region (its side's, with no regions), the city's social space among them when docking, each chosen
   *  from its tiles; false with nothing offered. The ship heaves to while its captain looks; its voyage can resume. */
  goAshore(): boolean {
    const landfall = this.landfall;
    if (!landfall) return false;
    this.chase.stop();
    const [centre, docking] = [ringCentre(this.landmass.outline), landfall.kind === 'dock'];
    const framed = landfallMarks(this.islandMarks, this.position, centre, docking, this.landmass.regions);
    const rig = frameSide(this.position, framed, this.viewport.width / this.viewport.height, this.landmass.heightAt);
    this.passage.stop();
    this.view.flyToSide(
      this.islandMarks.filter((mark) => mark.kind !== 'port'),
      rig,
      docking,
    );
    return true;
  }

  /** Whether the ship holds the player, down aboard it or travelling: nothing takes them elsewhere meanwhile. */
  get busy(): boolean {
    return this.aboard.active || this.travelling !== null;
  }

  /** The player is back aboard: the view stands over the ship, whatever it showed when they landed, and a travel left
   *  under way is over. */
  cameAboard(): void {
    this.endTravel();
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

  /** A press let go: what the click met, the sea's islands' ground too, for the landings to answer; null for a drag.
   *  A sighted hostile ship met before what stands behind it is met as its mark is. */
  pointerUp(x: number, y: number): ReturnType<typeof pickAt> | null {
    const press = this.press;
    this.press = null;
    if (!press || press.dragging || this.view.kind !== 'sail' || this.aboard.active || !this.pose) return null;
    const ground = (east: number, south: number) =>
      this.isles?.groundAt(east, south) ?? this.landmass.heightAt(east, south);
    const picked = pickAt(this.pose, this.viewport, x, y, ground, this.placed);
    const ray = { eye: this.pose.eye, direction: rayThrough(this.pose, this.viewport, x, y) };
    return orHostile(picked, ray, this.room?.hostiles ?? [], this.drawnScale, this.hull.shown);
  }

  /** The view switched to over the ship, Oversea or Sealevel. */
  get level(): SeaLevel {
    return this.view.level;
  }

  /** Switches to `level`, or to the other view, over the ship alone. */
  switchLevel(level?: SeaLevel): void {
    if (!this.combat && !this.aboard.active && !this.travelling) this.view.switchLevel(level);
  }

  /** The wheel's notches, positive in, zoom a walker's view on deck; the views over the ship keep their distance. */
  zoom(notches: number): void {
    if (this.aboard.active) this.aboard.zoom(notches);
  }

  /** One frame at sea. */
  frame(input: SeaInput): SeaFrame {
    const { seconds: dt, time, viewport } = input;
    const windBearing = SKY_NOW.current.sails ?? input.swell?.bearing ?? 0;
    this.viewport = viewport;
    this.water.swell = input.swell;
    this.keepRoom(dt, time);
    this.aboard.step(dt, time, input.controls, input.paused, this.room);
    const { view } = this;
    const watched = view.closeShare > 0 || view.helmView || this.aboard.active || this.travelling !== null;
    if (!this.combat) this.passage.advance(dt, watched);
    this.travelling?.step(dt, this.room);
    if (this.travelling?.fade.control) this.endTravel();
    view.step(dt);
    if (view.kind === 'sail' && !this.aboard.active) view.turn(input.turn, input.tilt, dt);
    const { ship } = this.passage;
    const own = { ...ship, underWay: this.passage.sailing };
    // Every view near it is laid on it at its own size; it is drawn as large as the eye's distance calls for.
    const truePlace = this.drawn.placeOf('own', own, 1, this.water, dt, time);
    const trueLying: Lying = { ...ship, scale: 1, heave: truePlace.z, pitch: truePlace.pitch, roll: truePlace.roll };
    const ceiling = ceilingFor(SKY_NOW.current.reading);
    const shot = view.shot({ feet: [ship.x, ship.y, 0], dt, ceiling, heightAt: this.landmass.heightAt });
    const fromShip = Math.hypot(shot.eye[0] - ship.x, shot.eye[1] - ship.y, shot.eye[2]);
    const lens = horizonOf({ nearM: 2, farM: 60_000 }, fromShip);
    const overworld: Shot = {
      eye: shot.eye,
      ...lookOf(shot.forward),
      fov: FIELD_OF_VIEW,
      near: lens.nearM,
      far: lens.farM,
    };
    const seaShot = view.kind !== 'landing' ? view.closeShot(overworld, trueLying) : overworld;
    // Clicks and marks are taken on the picture as shown, brought in close or not.
    const pose = poseOf({ eye: seaShot.eye, forward: forwardOf(seaShot.yaw, -seaShot.pitch) }, FIELD_OF_VIEW);
    this.pose = pose;
    const combat = this.combat;
    const fail = (error: unknown) => this.passage.say(error instanceof Error ? error.message : String(error));
    const aboardShot = this.aboard.target(trueLying);
    // The fight's view, the helm's or one aboard, which the view comes down to from the sea's.
    const fought = combat?.frame(dt, time, seaShot.far, fail, input.swell);
    const boarded = this.boarding.frame(this.room, combat?.view ?? null, input);
    if (boarded) combat?.letGo();
    const helmShot = view.helmShot(trueLying, seaShot.far);
    const travelled = this.travelling?.fade;
    const down =
      combat && fought
        ? { near: boarded?.shot ?? fought, share: combat.share }
        : travelled
          ? { near: helmShot, share: travelled.helmShare }
          : view.kind === 'helm'
            ? { near: helmShot, share: view.helmShare }
            : aboardShot && { near: aboardShot, share: this.aboard.share };
    const shown = { ...(down ? panShot(seaShot, down.near, down.share) : seaShot), ...QA_EYE.shot };
    const { near, share } = down ?? { near: view.closest(overworld, trueLying), share: view.closeShare };
    const posed = combat ? combat.lying : ship;
    const atShip = (view: Shot) => pictureAt(view, [posed.x, posed.y, 0]);
    const scale = shownScale(this.scale, {
      seaM: atShip(overworld),
      shownM: atShip(shown),
      nearM: atShip(near),
      share,
    });
    // Asked again no time on, its swing stands: it is posed on the swell at the size it is drawn.
    const place = scale === 1 ? truePlace : this.drawn.placeOf('own', own, scale, this.water, 0, time);
    const lying: Lying = { ...ship, scale, heave: place.z, pitch: place.pitch, roll: place.roll };
    this.drawnScale = scale;
    if (combat?.done) {
      this.passage.placeAt(this.room?.takeWashed() ?? combat.lying);
      this.combat = null;
    } else if (!combat) {
      // Out of a fight, where the room moored it is where it lies.
      const moored = this.room?.takeWashed();
      if (moored) this.passage.placeAt(moored);
    }
    const others = this.room?.others ?? [];
    const hostiles = this.room?.hostiles ?? [];
    const friendlies = this.room?.friendlies ?? [];
    const aboard = combat ? combat.ownAt(scale) : lying;
    const kind = view.kind === 'sail' || view.kind === 'landing' ? view.kind : 'other';
    const marks = seaMarks(
      combat || this.aboard.active ? 'other' : kind,
      this.islandMarks,
      this.position,
      pose,
      viewport,
      view.chosen,
      hostiles,
    );
    this.watch.step(dt, combat ? [] : hostiles, this.position, this.waterAt?.(this.position) ?? null);
    const toward = combat || view.kind !== 'sail' ? null : this.chase.step(dt, hostiles, this.position);
    if (toward) this.passage.sailTo(toward);
    // A hostile ship's mark stays chosen only while it is chased.
    if (this.chase.chasing === null && view.chosen?.startsWith(HOSTILE_PREFIX)) view.chosen = null;
    this.placed = marks.placed;
    const helmsman = this.aboard.walking && this.passage.sailing;
    const noted = { fighting: this.combat !== null, overShip: view.kind === 'sail', voyage: this.voyageNote, helmsman };
    return {
      shot: shown,
      ships: combat
        ? combat.ships(dt, time, windBearing, scale, this.boarding.boardedCaptain)
        : this.drawn.ships(
            dt,
            time,
            windBearing,
            { lies: own, place },
            others,
            hostiles,
            scale,
            this.water,
            friendlies,
          ),
      shipScale: scale,
      hulls: combat ? combat.hulls(scale) : this.drawn.hulls(own, others, hostiles, scale, friendlies),
      bars: combat?.bars(scale) ?? [],
      players: combat ? [] : seaPlated(others, this.room?.plates ?? new Map(), scale),
      marks: marks.shown,
      figures: boarded
        ? boarded.figures
        : aboard
          ? this.aboard.figures(aboard, shown.eye, time, own.underWay && !combat, view.helmShare > 0.5)
          : [],
      firstPerson: boarded ? boarded.firstPerson : !combat && this.aboard.firstPerson,
      dark: boarded?.dark ?? this.travelling?.fade.dark ?? 0,
      feet: combat ? null : this.aboard.feetOn(lying),
      stirs: combat ? combat.stirs() : own.underWay ? this.wake.stirs(lying, this.hull.waterline, dt) : [],
      focus: combat ? [combat.lying.x, combat.lying.y] : [ship.x, ship.y],
      fightHeard: combat?.heard ?? null,
      note: seaNote(roomWords(this.room, this.roomLost), noted),
      landfall: this.landfall,
      sailing: this.passage.sailing,
      pace: this.passage.pace,
    };
  }

  /** The fight the sea room began for the player, while it is on screen. */
  get fight(): SeaCombat | null {
    return this.combat;
  }

  /** The sea room's upkeep, `seconds` on: a link lost leaves it, a room rejoined has it put to sea again, and its
   *  word is taken in, a fight it began met. */
  private keepRoom(seconds: number, time: number): void {
    // A room whose link was lost says no more: the player is called to the helm and sails on alone.
    if (this.room?.lost) {
      this.aboard.drop();
      this.leaveRoom();
      this.roomLost = true;
    }
    // Joined again after its socket closed, the room has it as a new player: it puts to sea again where it lies.
    if (this.room?.rejoined()) {
      this.aboard.drop();
      this.room.course([this.position], this.passage.pace);
      this.sendLie(this.room);
    }
    this.room?.pump(seconds);
    this.meet(time);
  }

  /** Takes up a fight the sea room has begun for the player: the ship heaves to, its voyage kept to be resumed, and
   *  the view pans down to it, from the helm's view too. */
  private meet(time: number): void {
    if (this.combat || !this.room?.fighting) return;
    const first = this.room.takeFight();
    if (!first) return;
    this.aboard.drop();
    this.chase.stop();
    this.passage.stop();
    this.endTravel();
    if (this.view.helmView) this.view.sail();
    this.combat = new SeaCombat(this.room, first, this.hull.marks, time, this.hull.shown);
  }

  /** Ends a travel under way at once, the room told to forget it: the view is the player's again. */
  private endTravel(): void {
    this.travelling?.cut(this.room);
    this.travelling = null;
    if (this.view.kind === 'travel') this.view.sail();
  }

  /** Where the voyage stands: a chase, under way, hove to, or at anchor. */
  get voyageNote(): string {
    return this.chase.words ?? this.passage.note;
  }

  /** What the watch says now, a notice: a hostile ship just sighted, or another hold of the sea entered; none else. */
  get watchWords(): string | null {
    return this.watch.words;
  }

  /** The water it is in, as the status line names it; null before the waters are open. */
  get waterWords(): string | null {
    return this.watch.waterWords;
  }

  /** The pace its voyage was set at: a click's, or the map's. */
  get pace(): Pace {
    return this.passage.pace;
  }
}
