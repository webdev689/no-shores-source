// The player's ship's passage at sea: where it lies and heads, the voyage it sails (one planned round the land to a
// point, or the helm's straight on along its heading), the pace it was set at, and each course sent to the sea room,
// which sails it by its own law while the page draws it toward where the room has it.
import { WORLD_FRAME } from '../overworld/worldFrame.ts';
import type { Point2 } from '../overworld/ground.ts';
import { maskFromOutlines, planSeaRoute, type RouteRefusal, type SeaMask } from '../overworld/seaRoute.ts';
import { CLICK_PACE, type Pace, SHIP_SPEED, secondsLeft, shipAt, type Voyage, voyageOf } from '../overworld/voyage.ts';
import type { Lies } from '../ships/swellPose.ts';
import { distanceText } from '../plus/compass.ts';
import { SLOOP_HULL } from '../ships/hulls.ts';
import { type KeptClear, detour } from './isleLaw.ts';
import { AHEAD, clearAhead, HELM_TURN, turned } from './seaHelm.ts';
import {
  courseAhead,
  easedNote,
  easedPace,
  paceToAskAgain,
  followed,
  heldNote,
  PACE_EASE_S,
  type SailedPace,
  timeText,
} from './seaLaw.ts';
import type { SeaRoom } from './seaRoom.ts';

/** The world's frame, metres: every voyage between landmasses is planned over it. */
const FRAME = { leftM: 0, topM: 0, ...WORLD_FRAME } as const;

const REFUSED: Record<RouteRefusal, string> = {
  outside: 'That lies beyond the charts.',
  aground: 'The ship is aground.',
  inland: 'That lies too far inland to sail to.',
  'no way': 'No water leads there.',
};

/** How far the room's word may lie off its course straight on before it is laid where the room has it and the course set
 *  again from there, metres. */
const DRIFT_M = 30;

export class Passage {
  private readonly outlines: readonly (readonly Point2[])[];
  /** The open landmass's fine sea mask, for a voyage within its window. */
  private readonly landmassMask: () => SeaMask;
  private frameMask: SeaMask | null = null;
  private lie: Lies;
  private voyage: Voyage | null = null;
  /** Where the last voyage set out for, kept while it is stopped short, so it can be resumed; and whether it is the
   *  helm's, straight on along its heading, set again as it nears its end. */
  private destination: Point2 | null = null;
  private straight = false;
  private travelled = 0;
  /** The pace the voyage was set at: a click's, or the held map's. */
  private set: Pace = CLICK_PACE;
  /** The furthest a hostile ship may hold it, as the sea's rules give it (`Sea.facts`); none known, none held. */
  holdReachM = 0;
  /** The pace it is sailed at, eased toward the view's a step at a time, and the seconds toward its next step. */
  private sailed: SailedPace = CLICK_PACE;
  private easing = 0;
  private said = '';
  /** The sea room it sails in, once joined. */
  room: SeaRoom | null = null;

  /** The sea's islands in sight, which every voyage is bent round: the route's grid is far coarser than an island. */
  keepClear: () => readonly KeptClear[] = () => [];

  /** Each hull's way on a course against the Sloop's, by its number: its class's, as the room's rules build it. */
  private readonly classWay: (hull: number) => number;

  constructor(
    outlines: readonly (readonly Point2[])[],
    landmassMask: () => SeaMask,
    start: Point2,
    heading: number,
    classWay: (hull: number) => number = () => 1,
  ) {
    this.outlines = outlines;
    this.landmassMask = landmassMask;
    this.lie = { x: start[0], y: start[1], heading };
    this.classWay = classWay;
  }

  /** Where it lies and heads. */
  get ship(): Lies {
    return this.lie;
  }

  get position(): Point2 {
    return [this.lie.x, this.lie.y];
  }

  /** Its way against a whole Sloop's at the same pace: by the canvas it keeps, never under half, and its hull's class,
   *  as the room sails it. */
  get way(): number {
    return Math.max(0.5, this.room?.kept?.sail ?? 1) * this.classWay(this.room?.ownShip?.hull ?? SLOOP_HULL);
  }

  /** Its way at the world's own time, m/s. */
  get speed(): number {
    return SHIP_SPEED * this.way;
  }

  /** Whether it is under way on a voyage. */
  get sailing(): boolean {
    return this.voyage !== null;
  }

  /** Where the voyage under way, or the one stopped short, is bound; none at rest. */
  get bound(): Point2 | null {
    return this.destination;
  }

  /** Whether a voyage stopped short of its destination waits to be resumed. */
  get stoppedShort(): boolean {
    return !this.voyage && this.destination !== null;
  }

  /** The pace its voyage was set at. */
  get pace(): Pace {
    return this.set;
  }

  /** The pace it sails at now: the voyage's, eased down to the world's own time while it is watched close. */
  get paceNow(): SailedPace {
    return this.sailed;
  }

  /** The pace the room holds it to under the pace it is sailed at, a hostile ship near; none while it is not held. */
  get heldTo(): number | null {
    const settled = this.voyage ? (this.room?.settledShip ?? null) : null;
    return settled && settled.pace > 0 && settled.pace < this.sailed ? settled.pace : null;
  }

  /** How far along a voyage to a point it has sailed, a share; none straight on or at rest. */
  get share(): number | null {
    return this.voyage && !this.straight ? Math.min(1, this.travelled / Math.max(1, this.voyage.lengthM)) : null;
  }

  /** The voyage's course still ahead, from the ship; none at rest. */
  get course(): Point2[] {
    return this.voyage ? [this.position, ...courseAhead(this.voyage, this.travelled)] : [];
  }

  /** Sends the room the voyage it is on, as it joins it. */
  sendVoyage(): void {
    if (this.voyage) this.room?.course(courseAhead(this.voyage, this.travelled), this.sailed);
  }

  /** Where a fight left it. */
  placeAt(lie: Lies): void {
    this.lie = lie;
  }

  /** A course from the ship to a point, as the held map inks it before setting sail, or why there is none. */
  planTo(
    point: Point2,
  ): { readonly ok: true; readonly points: Point2[] } | { readonly ok: false; readonly why: string } {
    const route = planSeaRoute(this.maskFor(this.position, point), this.position, point);
    if (!route.ok) return { ok: false, why: REFUSED[route.reason] };
    return { ok: true, points: detour(route.points, this.keepClear()) };
  }

  /** Plans a voyage from the ship to a point and sets sail at `pace`, a click's unless said; a voyage that cannot be
   *  planned says why. */
  sailTo(point: Point2, pace: Pace = CLICK_PACE): void {
    const route = planSeaRoute(this.maskFor(this.position, point), this.position, point);
    if (!route.ok) {
      this.said = REFUSED[route.reason];
      return;
    }
    this.said = '';
    this.voyage = voyageOf(detour(route.points, this.keepClear()));
    [this.destination, this.travelled, this.straight, this.set] = [point, 0, false, pace];
    this.room?.course(courseAhead(this.voyage, 0), this.sailed);
  }

  /** Plans a voyage to `point` as `sailTo` does, then sets sail through it and on straight through `after`, at a
   *  click's pace: the way in to an island's anchorage from its offing. Whether it set sail; if not, it says why. */
  sailVia(point: Point2, after: readonly Point2[]): boolean {
    const route = planSeaRoute(this.maskFor(this.position, point), this.position, point);
    if (!route.ok) this.said = REFUSED[route.reason];
    else this.sailAlong([...detour(route.points, this.keepClear()).slice(1), ...after]);
    return route.ok;
  }

  /** Asks the room to travel the voyage still ahead: to take the ship to the other waters it ends in (`SeaTravel`).
   *  Answers the course sent, none with no voyage. */
  travel(): Point2[] {
    const ahead = this.voyage ? courseAhead(this.voyage, this.travelled) : [];
    if (ahead.length) this.room?.travel(ahead, this.sailed);
    return ahead;
  }

  /** Sets sail through a course's points in turn, from where the ship lies, as planned, at `pace`: to anchor off an
   *  island, or on from where a travel to other waters laid it. */
  sailAlong(points: readonly Point2[], pace: Pace = CLICK_PACE): void {
    const end = points.at(-1);
    if (!end) return;
    this.said = '';
    this.voyage = voyageOf([this.position, ...points.filter((point) => point !== this.position)]);
    [this.destination, this.travelled, this.straight, this.set] = [end, 0, false, pace];
    this.room?.course(courseAhead(this.voyage, 0), this.sailed);
  }

  /** Bends the voyage still ahead round an island come into sight since it was planned (the room judges a course by
   *  the islands the player is told of, so one far off held no voyage then), and tells the room the course. */
  bendRound(): void {
    if (!this.voyage || this.straight) return;
    const ahead = [this.position, ...courseAhead(this.voyage, this.travelled)];
    const bent = detour(ahead, this.keepClear());
    if (bent.length === ahead.length) return;
    this.voyage = voyageOf(bent);
    this.travelled = 0;
    this.room?.course(courseAhead(this.voyage, 0), this.sailed);
  }

  /** Stops the ship where it is; the voyage's destination is kept, to be resumed. */
  stop(): void {
    if (!this.voyage) return;
    this.voyage = null;
    this.room?.course([], this.sailed);
  }

  /** Sets sail again: straight on, or for the destination of the voyage last stopped, from wherever it lies now. */
  resume(): void {
    if (!this.destination) return;
    if (this.straight) this.straightOn();
    else this.sailTo(this.destination, this.set);
  }

  /** The helm turned `steer` (-1 to port, 1 to starboard) for `seconds`: under way onto a course straight on, at rest
   *  where it lies. */
  steer(steer: number, seconds: number): void {
    this.lie = { ...this.lie, heading: turned(this.lie.heading, steer * HELM_TURN * seconds) };
    if (this.voyage) this.straightOn();
    else this.room?.face(this.lie.heading);
  }

  /** Sets it sailing straight on along its heading, short of the first coast that way; where land lies too near,
   *  it comes to rest and the voyage's line says so. */
  straightOn(): void {
    // From where the room has it once it has taken its course, so a drift of the page's is never carried on.
    const settled = this.room?.settledShip;
    if (settled) this.lie = { ...this.lie, x: settled.x, y: settled.y };
    const point = clearAhead(this.outlines, this.position, this.lie.heading);
    if (!point) {
      this.stop();
      this.room?.face(this.lie.heading);
      this.said = 'Land lies ahead.';
      return;
    }
    this.said = '';
    this.voyage = voyageOf([this.position, point]);
    [this.destination, this.travelled, this.straight, this.set] = [point, 0, true, CLICK_PACE];
    this.room?.course(courseAhead(this.voyage, 0), this.sailed);
  }

  /** Sails it `seconds` on: at the room's pace and drawn to where the room has it once it has taken its course; the helm's
   *  course straight on set again as it nears its end, while the way beyond lies clear. The pace it is sailed at
   *  eases to the world's own time while the view is close on it (`watched`), and back to the voyage's once not. */
  advance(seconds: number, watched = false): void {
    this.easePace(seconds, watched);
    if (!this.voyage) return;
    const settled = this.room?.settledShip ?? null;
    // A step the room refused is asked again, once its word on the last has come, until the two agree.
    if (paceToAskAgain(this.sailed, settled, this.room?.hostiles ?? [], this.holdReachM)) this.sendVoyage();
    if (settled?.pace === 0) {
      this.restWhereTheRoomHasIt(this.voyage, settled);
      return;
    }
    const held = this.room?.ownShip?.pace ?? null;
    const fix = shipAt(
      this.voyage,
      followed(this.voyage, this.travelled, seconds, this.sailed, settled, held, this.way),
    );
    this.lie = { x: fix.position[0], y: fix.position[1], heading: fix.heading ?? this.lie.heading };
    this.travelled = fix.travelledM;
    if (fix.arrived) {
      this.arrived();
      return;
    }
    if (!this.straight) return;
    const away = settled ? [settled.x - this.lie.x, settled.y - this.lie.y] : [0, 0];
    const aside = Math.abs((away[0] ?? 0) * Math.cos(this.lie.heading) + (away[1] ?? 0) * Math.sin(this.lie.heading));
    const left = this.voyage.lengthM - this.travelled;
    if (aside > DRIFT_M) this.straightOn();
    else if (left < AHEAD.renewM) {
      const point = clearAhead(this.outlines, this.position, this.lie.heading);
      if (point && Math.hypot(point[0] - this.lie.x, point[1] - this.lie.y) > left + 1) this.straightOn();
    }
  }

  /** One step down or up the ladder each `PACE_EASE_S`, each sent to the room with its voyage, until at the view's. */
  private easePace(seconds: number, watched: boolean): void {
    this.easing += Math.max(0, seconds);
    while (this.easing >= PACE_EASE_S) {
      this.easing -= PACE_EASE_S;
      const next = easedPace(this.sailed, this.set, watched);
      if (next === this.sailed) {
        this.easing = 0;
        return;
      }
      this.sailed = next;
      this.sendVoyage();
    }
  }

  /** At the end of its voyage: straight on, it comes to the end of a course only where a coast lies too near to set
   *  it again. */
  private arrived(): void {
    if (this.straight) this.said = 'Land lies ahead.';
    [this.voyage, this.destination, this.straight] = [null, null, false];
  }

  /** The room has it at rest, having taken its course, while the page sails it: at its end, it has arrived; short
   *  of it (a course it would not take), it is hove to where the room has it, its voyage kept to be resumed. */
  private restWhereTheRoomHasIt(voyage: Voyage, settled: { readonly x: number; readonly y: number }): void {
    this.lie = { ...this.lie, x: settled.x, y: settled.y };
    const end = voyage.points.at(-1);
    if (end && Math.hypot(end[0] - settled.x, end[1] - settled.y) < 2) this.arrived();
    else this.voyage = null;
  }

  /** Where its voyage stands: under way straight on, or with the way and time to go; hove to short of it; or at
   *  anchor. */
  get note(): string {
    if (this.voyage) {
      const settled = this.room?.settledShip ?? null;
      // The eased pace is said only once the room sails it at it.
      const eased = settled?.pace === this.sailed ? easedNote(this.sailed, this.set) : '';
      const held = heldNote(this.sailed, settled) + eased;
      if (this.straight) return `Sailing straight on${held}`;
      const remaining = this.voyage.lengthM - this.travelled;
      const left = timeText(secondsLeft(this.voyage, this.travelled, this.set) / this.way);
      return `Sailing · ${distanceText(remaining)} to go · ${left}${held}`;
    }
    return this.said || (this.destination ? 'Hove to' : 'At anchor');
  }

  /** Says why something asked of it could not be done, on the voyage's line. */
  say(words: string): void {
    this.said = words;
  }

  /** A voyage within the open landmass's window is planned on its fine mask; any other over the whole frame's. */
  private maskFor(from: Point2, to: Point2): SeaMask {
    const mask = this.landmassMask();
    const inside = ([x, y]: Point2) =>
      x >= mask.leftM &&
      y >= mask.topM &&
      x < mask.leftM + mask.width * mask.cellM &&
      y < mask.topM + mask.height * mask.cellM;
    if (inside(from) && inside(to)) return mask;
    this.frameMask ??= maskFromOutlines(this.outlines, FRAME);
    return this.frameMask;
  }
}
