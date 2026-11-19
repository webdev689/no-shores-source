// The player's ship's passage at sea: where she lies and heads, the voyage she sails (one planned round the land to a
// point, or the helm's straight on along her heading), the pace dial, and each course sent to the sea room, which sails
// her by its own law while the page draws her toward where it has her.
import { WORLD_FRAME } from '../overworld/discovery.ts';
import type { Point2 } from '../overworld/ground.ts';
import { maskFromOutlines, planSeaRoute, type RouteRefusal, type SeaMask } from '../overworld/seaRoute.ts';
import { PACE_DEFAULT, type Pace, secondsLeft, shipAt, stepPace, type Voyage, voyageOf } from '../overworld/voyage.ts';
import type { Lies } from '../ships/swellPose.ts';
import { distanceText } from './hudLaw.ts';
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

/** How far the room's word may lie off her course straight on before she is laid where it has her and the course set
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
   *  helm's, straight on along her heading, set again as she nears its end. */
  private destination: Point2 | null = null;
  private straight = false;
  private travelled = 0;
  private dial: Pace = PACE_DEFAULT;
  /** The pace she is sailed at, eased toward the view's a step at a time, and the seconds toward its next step. */
  private sailed: SailedPace = PACE_DEFAULT;
  private easing = 0;
  private said = '';
  /** The sea room she sails in, once joined. */
  room: SeaRoom | null = null;

  constructor(outlines: readonly (readonly Point2[])[], landmassMask: () => SeaMask, start: Point2, heading: number) {
    this.outlines = outlines;
    this.landmassMask = landmassMask;
    this.lie = { x: start[0], y: start[1], heading };
  }

  /** Where she lies and heads. */
  get ship(): Lies {
    return this.lie;
  }

  get position(): Point2 {
    return [this.lie.x, this.lie.y];
  }

  /** Whether she is under way on a voyage. */
  get sailing(): boolean {
    return this.voyage !== null;
  }

  /** Whether a voyage stopped short of its destination waits to be resumed. */
  get stoppedShort(): boolean {
    return !this.voyage && this.destination !== null;
  }

  /** Her pace dial's step. */
  get pace(): Pace {
    return this.dial;
  }

  /** The voyage's course still ahead, from the ship; none at rest. */
  get course(): Point2[] {
    return this.voyage ? [this.position, ...courseAhead(this.voyage, this.travelled)] : [];
  }

  /** Sends the room the voyage she is on, as she joins it. */
  sendVoyage(): void {
    if (this.voyage) this.room?.course(courseAhead(this.voyage, this.travelled), this.sailed);
  }

  /** Where a fight left her. */
  placeAt(lie: Lies): void {
    this.lie = lie;
  }

  /** A course from the ship to a point, as the held map inks it before setting sail, or why there is none. */
  planTo(
    point: Point2,
  ): { readonly ok: true; readonly points: Point2[] } | { readonly ok: false; readonly why: string } {
    const route = planSeaRoute(this.maskFor(this.position, point), this.position, point);
    return route.ok ? { ok: true, points: route.points } : { ok: false, why: REFUSED[route.reason] };
  }

  /** Plans a voyage from the ship to a point and sets sail; a voyage that cannot be planned says why. */
  sailTo(point: Point2): void {
    const route = planSeaRoute(this.maskFor(this.position, point), this.position, point);
    if (!route.ok) {
      this.said = REFUSED[route.reason];
      return;
    }
    this.said = '';
    this.voyage = voyageOf(route.points);
    [this.destination, this.travelled, this.straight] = [point, 0, false];
    this.room?.course(courseAhead(this.voyage, 0), this.sailed);
  }

  /** Stops the ship where she is; the voyage's destination is kept, to be resumed. */
  stop(): void {
    if (!this.voyage) return;
    this.voyage = null;
    this.room?.course([], this.sailed);
  }

  /** Sets sail again: straight on, or for the destination of the voyage last stopped, from wherever she lies now. */
  resume(): void {
    if (!this.destination) return;
    if (this.straight) this.straightOn();
    else this.sailTo(this.destination);
  }

  /** The helm turned `steer` (-1 to port, 1 to starboard) for `seconds`: under way onto a course straight on, at rest
   *  where she lies. */
  steer(steer: number, seconds: number): void {
    this.lie = { ...this.lie, heading: turned(this.lie.heading, steer * HELM_TURN * seconds) };
    if (this.voyage) this.straightOn();
    else this.room?.face(this.lie.heading);
  }

  /** Sets her sailing straight on along her heading, short of the first coast that way; where land lies too near,
   *  she comes to rest and the voyage's line says so. */
  straightOn(): void {
    // From where the room has her once it has taken her course, so a drift of the page's is never carried on.
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
    [this.destination, this.travelled, this.straight] = [point, 0, true];
    this.room?.course(courseAhead(this.voyage, 0), this.sailed);
  }

  /** One step of the pace dial: -1 slower, +1 faster. */
  stepPace(direction: number): void {
    const atDial = this.sailed === this.dial;
    this.dial = stepPace(this.dial, direction);
    if (atDial) this.sailed = this.dial;
    this.sendVoyage();
  }

  /** Sails her `seconds` on: at the room's pace and drawn to where it has her once it has taken her course; the helm's
   *  course straight on set again as she nears its end, while the way beyond lies clear. The pace she is sailed at
   *  eases to the world's own time while the view is close on her (`watched`), and back to the dial's once not. */
  advance(seconds: number, watched = false): void {
    this.easePace(seconds, watched);
    if (!this.voyage) return;
    const settled = this.room?.settledShip ?? null;
    // A step the room refused is asked again, once its word on the last has come, until the two agree.
    if (paceToAskAgain(this.sailed, settled, this.room?.pirates ?? [])) this.sendVoyage();
    if (settled?.pace === 0) {
      this.restWhereTheRoomHasHer(this.voyage, settled);
      return;
    }
    const held = this.room?.ownShip?.pace ?? null;
    const fix = shipAt(this.voyage, followed(this.voyage, this.travelled, seconds, this.sailed, settled, held));
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

  /** One step down or up the ladder each `PACE_EASE_S`, each sent to the room with her voyage, until at the view's. */
  private easePace(seconds: number, watched: boolean): void {
    this.easing += Math.max(0, seconds);
    while (this.easing >= PACE_EASE_S) {
      this.easing -= PACE_EASE_S;
      const next = easedPace(this.sailed, this.dial, watched);
      if (next === this.sailed) {
        this.easing = 0;
        return;
      }
      this.sailed = next;
      this.sendVoyage();
    }
  }

  /** At the end of her voyage: straight on, she comes to the end of a course only where a coast lies too near to set
   *  it again. */
  private arrived(): void {
    if (this.straight) this.said = 'Land lies ahead.';
    [this.voyage, this.destination, this.straight] = [null, null, false];
  }

  /** The room has her at rest, having taken her course, while the page sails her: at its end, she has arrived; short
   *  of it (a course it would not take), she is hove to where it has her, her voyage kept to be resumed. */
  private restWhereTheRoomHasHer(voyage: Voyage, settled: { readonly x: number; readonly y: number }): void {
    this.lie = { ...this.lie, x: settled.x, y: settled.y };
    const end = voyage.points.at(-1);
    if (end && Math.hypot(end[0] - settled.x, end[1] - settled.y) < 2) this.arrived();
    else this.voyage = null;
  }

  /** Where her voyage stands: under way straight on, or with the way and time to go; hove to short of it; or at
   *  anchor. */
  get note(): string {
    if (this.voyage) {
      const settled = this.room?.settledShip ?? null;
      // The eased pace is said only once the room sails her at it.
      const eased = settled?.pace === this.sailed ? easedNote(this.sailed, this.dial) : '';
      const held = heldNote(this.sailed, settled) + eased;
      if (this.straight) return `Sailing straight on${held}`;
      const remaining = this.voyage.lengthM - this.travelled;
      const left = timeText(secondsLeft(this.voyage, this.travelled, this.dial));
      return `Sailing · ${distanceText(remaining)} to go · ${left}${held}`;
    }
    return this.said || (this.destination ? 'Hove to' : 'At anchor');
  }

  /** Says why something asked of her could not be done, on the voyage's line. */
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
