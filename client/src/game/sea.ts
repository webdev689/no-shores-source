import type { Point2 } from '../overworld/ground.ts';
import { nearestIsland, ringCentre, sideNodes } from '../overworld/islandView.ts';
import { type Press, pressAt, pressMove } from '../overworld/overworldInput.ts';
import type { Mark, PlacedMark } from '../overworld/overworldMarks.ts';
import { pickAt } from '../overworld/overworldPick.ts';
import type { Pace } from '../overworld/voyage.ts';
import { panShot, type Shot } from './camera.ts';
import type { Landmass } from './landmass.ts';
import { portOf } from './nodes.ts';
import type { Swell } from '../rules/landRules.ts';
import type { SeaFacts } from '../rules/watersRules.ts';
import { type Lying, SLOOP_DECK } from '../ships/deck.ts';
import { Aboard } from './aboard.ts';
import { Boarding } from './deckBoarding.ts';
import { Foot, type FootContext } from './foot.ts';
import { Passage } from './passage.ts';
import type { SeaFrame, SeaInput } from './seaFrame.ts';
import { Chase } from './seaChase.ts';
import { Wake } from './seaWake.ts';
import { HOSTILE_PREFIX, SeaWatch, type WaterNamed } from './seaHostiles.ts';
import { islandMarksOf, seaMarks } from './seaMarks.ts';
import { type SeaHull, SeaShips } from './seaShips.ts';
import { SeaCombat } from './seaCombat.ts';
import { SeaRoom } from './seaRoom.ts';
import { type Landfall, landfallOf, pictureAt, roomWords, shownScale } from './seaLaw.ts';
import { isleOff, isleWords, keptClear } from './isleLaw.ts';
import type { Isles } from './isles.ts';
import { SeaShots } from './seaShots.ts';

/** The Overworld is not to scale: the Sloop is drawn this long, metres, so one reads from the raised view, and every
 *  hull as many times its own length. */
const SHIP_DRAWN_M = 75;

/**
 * The player's ship on the Overworld's sea: DFO's raised camera over it, voyages planned round the land and sailed
 * at the pace dial, stopped and resumed, a port's icon over it once the ship is near, and the bird's-eye view of the
 * island's side it lies off, where a landing is chosen. Online, its course goes to the sea room and every other ship
 * there is shown.
 */
export class Sea {
  /** The sea's islands as the page holds them: offered to land at, and kept clear of by every voyage. */
  isles: Isles | null = null;
  private landmass: Landmass;
  /** Its waterline, and what draws a fight's marks; how many times its size every ship is drawn on the sea's view;
   *  each ship's rig by who sails it. */
  private readonly hull: SeaHull;
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

  /** The sea's rules as its waters' table gives them: the reaches the chase meets it within and the voyage is held
   *  within. */
  set facts(facts: SeaFacts) {
    [this.chase.metM, this.passage.holdReachM] = [facts.engageM, facts.holdReachM];
  }
  private readonly watch = new SeaWatch();
  private readonly chase = new Chase((ship) => this.room?.chase(ship));
  /** Where it lies and heads, its voyage and pace dial, and its courses to the sea room. */
  private readonly passage: Passage;
  /** The sea's camera, where its view is, and its shots. */
  private readonly shots: SeaShots;
  /** Its wake; and whether the sea room's link was lost. */
  private readonly wake = new Wake();
  private roomLost = false;
  private side: readonly Mark[] = [];
  private press: Press | null = null;
  private room: SeaRoom | null = null;
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
  chosen: string | null = null;

  constructor(
    landmass: Landmass,
    outlines: readonly (readonly Point2[])[],
    hull: SeaHull,
    start: Point2,
    heading: number,
    aboard: FootContext,
  ) {
    this.landmass = landmass;
    this.hull = hull;
    this.drawn = new SeaShips(hull.shown);
    [this.aboard, this.boarding] = [
      new Aboard(aboard, SLOOP_DECK),
      new Boarding(aboard, (...asked) => Foot.onDeck(...asked)),
    ];
    this.scale = SHIP_DRAWN_M / hull.waterline.lengthM;
    this.passage = new Passage(outlines, () => this.landmass.mask, start, heading);
    this.passage.keepClear = () => keptClear(this.isles?.all() ?? []);
    this.shots = new SeaShots(start, heading);
    this.setLandmass(landmass);
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
    // Every hull is made ready behind the veil, so the first of each seen never holds a frame; one that fails to come
    // is drawn as the Sloop, as before.
    const warmed = this.hull.warm?.().catch(() => undefined);
    [this.room] = await Promise.all([SeaRoom.join(open, this.position, this.passage.pace), warmed]);
    [this.passage.room, this.roomLost] = [this.room, false];
    this.sendLie(this.room);
  }

  /** Puts to sea at rest, it is turned as it lies, so the room shows every player its heading; under way, it sails
   *  on its voyage. */
  private sendLie(room: SeaRoom): void {
    if (!this.passage.sailing) room.face(this.heading);
    this.passage.sendVoyage();
  }

  /** Whether the ship is in the sea room, which judges the helm left and taken. */
  get inRoom(): boolean {
    return this.room !== null;
  }

  /** The other ships the sea room shows round it, every other player's and every hostile one; none out of a room. */
  get sighted(): SeaRoom | null {
    return this.room;
  }

  /** Leaves the sea room: the player's ship leaves the sea there. */
  leaveRoom(): void {
    this.room?.close();
    [this.room, this.passage.room] = [null, null];
  }

  /** What the ship is offered off the open landmass's coast: to dock at its port, to go ashore, or nothing. */
  get landfall(): Landfall {
    if (this.shots.view.kind !== 'sail' || this.combat || this.aboard.active) return null;
    const isle = isleOff(this.position, this.isles?.all() ?? []);
    if (isle) return { kind: 'isle', id: isle.seen.id, words: isleWords(isle.seen) };
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

  /** Opens Manage, the view down over its deck, or closes it. */
  manage(): void {
    if (!this.combat && this.shots.view.kind === 'sail') this.aboard.manage();
  }

  /** The player leaves the helm to walk its deck; answers whether they did. */
  leaveHelm(): boolean {
    if (this.combat || this.shots.view.kind !== 'sail' || !this.room) return false;
    return this.aboard.leaveHelm(this.room);
  }

  /** The player takes the helm again, at its wheel. */
  takeHelm(): void {
    if (this.room) this.aboard.takeHelm(this.room);
  }

  /** Takes the view down to the ship's helm, in first person, where the held map is raised. */
  toHelm(): boolean {
    return !this.combat && !this.aboard.active && this.shots.toHelm();
  }

  /** Takes the view back up from the helm to the sea's. */
  fromHelm(): void {
    this.shots.fromHelm();
  }

  /** The ids of the landings marked over the island's side in view: the player has seen them. */
  get landings(): string[] {
    return this.side.map((mark) => mark.id);
  }

  /** Whether the view is at the helm, or on its way down or up. */
  get helmView(): boolean {
    return this.shots.helmView;
  }

  /** Whether the view stands at the helm. */
  get atHelm(): boolean {
    return this.shots.atHelm;
  }

  /** Whether a voyage stopped short of its destination can be resumed. */
  get resumable(): boolean {
    return this.shots.view.kind === 'sail' && this.passage.stoppedShort;
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
   *  its `seconds` on, under way onto a course straight on and at rest where it lies; `ahead` (W pressed) sets it
   *  sailing straight on; `heaveTo` (S pressed) heaves it to. */
  helm(steer: number, ahead: boolean, heaveTo: boolean, seconds: number): void {
    if (this.combat || this.aboard.active || this.shots.view.kind !== 'sail') return;
    if (steer || ahead || heaveTo) this.chase.stop();
    if (heaveTo) this.passage.stop();
    if (steer) this.passage.steer(steer, seconds);
    if (ahead && !heaveTo) this.passage.straightOn();
  }

  /** Plans a voyage from the ship to a point and sets sail; a voyage that cannot be planned says why. */
  /** Sails a course already planned, through each of its points in turn: the way in to an island's anchorage. */
  sailAlong(points: readonly Point2[]): void {
    this.passage.sailAlong(points);
  }

  sailTo(point: Point2): void {
    this.chase.stop();
    this.passage.sailTo(point);
  }

  /** One step of the pace dial: -1 slower, +1 faster. */
  stepPace(direction: number): void {
    // Off the helm the room takes no new course, so the dial waits for the player's return to it.
    if (!this.aboard.walking) this.passage.stepPace(direction);
  }

  /** A mark chosen at sea: the ship sails for it, to the water nearest it; for a sighted hostile ship's, the ship
   *  chases it, the mark kept chosen while it does. True for a mark it sails for. */
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
    return (
      this.shots.view.kind === 'sail' && chosen !== null && chosen.startsWith(HOSTILE_PREFIX) && this.sailToMark(chosen)
    );
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
    this.passage.stop();
    this.chosen = null;
    this.shots.toSide(this.position, this.side, this.landmass.heightAt);
    return true;
  }

  /** The player is back aboard: the view stands over the ship, whatever it showed when they landed. */
  cameAboard(): void {
    this.shots.view = { kind: 'sail' };
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
    this.shots.backToSea();
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
    else if (!this.aboard.active) this.shots.drag(moved);
  }

  /** A press let go: a click on the sea or the land sails there, on a mark for its node; a drag only looked. */
  pointerUp(x: number, y: number): void {
    const press = this.press;
    this.press = null;
    const { pose, viewport } = this.shots;
    if (!press || press.dragging || this.shots.view.kind !== 'sail' || this.aboard.active || !pose) return;
    const pick = pickAt(pose, viewport, x, y, this.landmass.heightAt, this.placed);
    if (pick.kind === 'mark') this.sailToMark(pick.id);
    else if (pick.kind !== 'none') this.sailTo([pick.point[0], pick.point[1]]);
  }

  /** The wheel's notches, positive in, zoom the camera over the ship, and past its lowest bring the view in close. */
  zoom(notches: number): void {
    if (this.aboard.active) this.aboard.zoom(notches);
    else this.shots.zoom(notches);
  }

  /** One frame at sea. */
  frame(input: SeaInput): SeaFrame {
    const { seconds: dt, time, viewport } = input;
    const windBearing = input.swell?.bearing ?? 0;
    this.shots.viewport = viewport;
    this.water.swell = input.swell;
    this.keepRoom(dt, time);
    this.aboard.step(dt, time, input.controls, input.paused, this.room);
    const { close } = this.shots;
    if (!this.combat) this.passage.advance(dt, close.eased > 0 || this.shots.helmView || this.aboard.active);
    close.step(dt);
    this.shots.stepHelm(dt);
    if (!this.aboard.active) this.shots.turn(input.turn, input.tilt, dt);
    const { ship } = this.passage;
    const own = { ...ship, underWay: this.passage.sailing };
    // Every view near it is laid on it at its own size; it is drawn as large as the eye's distance calls for.
    const truePlace = this.drawn.placeOf('own', own, 1, this.water, dt, time);
    const trueLying: Lying = { ...ship, scale: 1, heave: truePlace.z, pitch: truePlace.pitch, roll: truePlace.roll };
    const { overworld, seaShot, pose } = this.shots.step(dt, ship, trueLying, this.landmass.heightAt);
    const combat = this.combat;
    const fail = (error: unknown) => this.passage.say(error instanceof Error ? error.message : String(error));
    const aboardShot = this.aboard.target(trueLying);
    // The fight's view, the helm's or one aboard, which the view comes down to from the sea's.
    const fought = combat?.frame(dt, time, seaShot.far, fail, input.swell);
    const boarded = this.boarding.frame(this.room, combat?.view ?? null, input);
    if (boarded) combat?.letGo();
    const down =
      combat && fought
        ? { near: boarded?.shot ?? fought, share: combat.share }
        : this.shots.view.kind === 'helm'
          ? { near: this.shots.helmShot(trueLying, seaShot.far), share: this.shots.helmShare }
          : aboardShot && { near: aboardShot, share: this.aboard.share };
    const shown = down ? panShot(seaShot, down.near, down.share) : seaShot;
    const { near, share } = down ?? { near: this.shots.closest(overworld, trueLying), share: close.eased };
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
    if (combat?.done) {
      this.passage.placeAt(this.room?.takeWashed() ?? combat.lying);
      this.combat = null;
    } else if (!combat) {
      // Out of a fight, where the room moored it is where it lies.
      const moored = this.room?.takeWashed();
      if (moored) this.passage.placeAt(moored);
    }
    const others = this.room?.others ?? [];
    const pirates = this.room?.pirates ?? [];
    const aboard = combat ? combat.ownAt(scale) : lying;
    const kind = this.shots.view.kind === 'sail' || this.shots.view.kind === 'landing' ? this.shots.view.kind : 'other';
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
    const toward = combat || this.shots.view.kind !== 'sail' ? null : this.chase.step(dt, pirates, this.position);
    if (toward) this.passage.sailTo(toward);
    // A hostile ship's mark stays chosen only while it is chased.
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
      figures: boarded
        ? boarded.figures
        : aboard
          ? this.aboard.figures(aboard, shown.eye, time, own.underWay && !combat, this.shots.helmShare > 0.5)
          : [],
      firstPerson: boarded ? boarded.firstPerson : !combat && this.aboard.firstPerson,
      stirs: combat ? combat.stirs() : own.underWay ? this.wake.stirs(lying, this.hull.waterline, dt) : [],
      focus: combat ? [combat.lying.x, combat.lying.y] : [ship.x, ship.y],
      note: this.note(),
      landfall: this.landfall,
      sailing: this.passage.sailing,
      resumable: this.resumable,
      pace: this.passage.pace,
      overSide: this.shots.view.kind === 'landing',
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
    if (this.shots.helmView) this.shots.view = { kind: 'sail' };
    this.combat = new SeaCombat(this.room, first, this.hull.marks, time, this.hull.shown);
  }

  private note(): string {
    const room = roomWords(this.room, this.roomLost);
    if (this.combat) return `Fighting${room}`;
    if (this.shots.view.kind !== 'sail') return room.slice(3);
    // Off the helm, its helmsman has it while it sails on.
    const helmsman = this.aboard.walking && this.passage.sailing ? ' · Its helmsman has the helm' : '';
    return this.voyageNote + helmsman + room;
  }

  /** Where its voyage stands: a hostile ship just sighted or other waters entered; under way, hove to, or at anchor. */
  get voyageNote(): string {
    return this.watch.words ?? this.chase.words ?? this.passage.note;
  }

  /** The water it is in, as the status line names it; null before the waters are open. */
  get waterWords(): string | null {
    return this.watch.waterWords;
  }

  /** Its pace dial's step. */
  get paceStep(): Pace {
    return this.passage.pace;
  }
}
