import type { FightLay, FightLook, FightView } from '../rules/fightRules.ts';
import type { LandView } from '../rules/landRules.ts';
import { Effects, type Mark, type Splash } from '../ships/effects.ts';
import type { MarkView } from '../ships/markView.ts';
import { factionSide } from '../ships/dress.ts';
import { hullOfCaptain, hullSails, hullWaterline, plateOverM } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import { barOver, type ShipBar } from '../ships/shipBars.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import type { ShipCamera } from '../ships/shipView.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { Afloat } from './afloat.ts';
import { aimEye, type Lying, lookBearing, lookRange } from './aim.ts';
import { type FightInput, type FightSource, Fighting } from './fighting.ts';
import type { Orbit } from './orbit.ts';
import { SAILS_RUNG, type Sailing } from './sailing.ts';

/** Where a ship's numbers hold her rung (crates/sailing/src/floats.rs). */
export const SHIP_RUNG = 7;
/** A fire's flames rise from this far over her waterline (metres): just over her deck. */
export const DECK_M = 2.4;
/** A ball is drawn this many times its size, to be seen; the lay's arcs a dot every this many seconds of flight. */
const BALL_DRAWN = 2;
const ARC_STEP_S = 0.1;
/** An arc whose ball is still aloft past its life is drawn this far (seconds); a strike's mark is this big and a
 *  landing zone's ring this many dots (metres, dots). */
const ARC_LONGEST_S = 4;
const STRIKE_M = 0.25;
const ZONE_DOTS = 24;
const BALL = [0.12, 0.12, 0.12] as const;
const ARC = [0.95, 0.95, 0.85] as const;
const ON_TARGET = [0.95, 0.2, 0.15] as const;
/** The panel keeps a fight's last lines this long after it ends (seconds). */
const FAREWELL_S = 4;

/** A captain's fight round the Sloop in the World Editor: calling her and sending her off (F), stepping the fight in
 *  her helm's place, the aim's look and camera, her captain's ship in her hull and colours, and drawing the balls,
 *  the lay and the effects. */
/** What draws the marks: the ship layer's mark view, or a test's. */
export type MarkDrawer = Pick<MarkView, 'drawInto'>;
/** The player's ship as a fight steers her: she takes each answer, and says where she is drawn. */
export type FightingShip = Pick<Sailing, 'adopt' | 'place'>;
/** Where a fight is drawn from: the window's corner, or the world's own (0, 0) in the game. */
export type Window = Pick<LandView, 'leftM' | 'topM'>;
/** A Sloop as the aim sees her: where she is drawn. */
export type Aboard = Pick<Afloat, 'place'>;

export class Naval {
  private fight: Fighting | null = null;
  private calling = false;
  /** Each call's own number: a captain answering a call since ended or made again is not taken up. */
  private call = 0;
  private adopted: FightView | null = null;
  private readonly effects = new Effects(1);
  private readonly marks: MarkDrawer;
  private farewell: { readonly lines: string[]; readonly until: number } | null = null;
  /** Her captain's rig, for the hull she sails. */
  private rig: { readonly hull: number; readonly rig: SailRig } | null = null;

  constructor(marks: MarkDrawer) {
    this.marks = marks;
  }

  /** Whether a fight is on: the fight steps her, not her own helm. */
  get fighting(): boolean {
    return this.fight !== null;
  }

  /** The fight's last answer, while one is on. */
  get view(): FightView | null {
    return this.fight?.view ?? null;
  }

  /** Whether a fight is on or being called: either way her own helm stands. */
  get busy(): boolean {
    return this.fight !== null || this.calling;
  }

  /** F: calls a pirate captain round her, or sends the one called off. */
  toggle(source: FightSource | null, id: string, sailing: Sailing, time: number, fail: (error: unknown) => void): void {
    if (this.fight) {
      this.end();
      return;
    }
    if (this.calling || !source) return;
    this.calling = true;
    const call = ++this.call;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    // Her own helm stands while she is called: the fight begins from her numbers once her last step has answered.
    sailing
      .whenStill()
      .then(() => (call === this.call ? Fighting.begin(source, id, sailing.floats(), seed, time) : 'sent off'))
      .then((fighting) => {
        if (call !== this.call) return;
        this.calling = false;
        if (fighting === 'sent off') return;
        if (typeof fighting === 'string') fail(new Error(fighting));
        else this.fight = fighting;
      })
      .catch((error: unknown) => {
        if (call !== this.call) return;
        this.calling = false;
        fail(error);
      });
  }

  /** Takes up a fight begun elsewhere: the sea room's. */
  join(fighting: Fighting): void {
    this.end();
    this.fight = fighting;
  }

  /** Ends the fight, if one is on or called. */
  end(): void {
    const fighting = this.fight;
    [this.fight, this.calling, this.adopted] = [null, false, null];
    this.call++;
    fighting?.end().catch(() => undefined);
  }

  /** Steps the fight for a frame: she takes its answer, its events become effects. Answers the water's pushes. */
  step(
    seconds: number,
    input: FightInput,
    time: number,
    sailing: FightingShip,
    view: Window,
    fail: (error: unknown) => void,
  ): Splash[] {
    const fighting = this.fight;
    if (!fighting) return [];
    fighting.advance(seconds, input, time, fail);
    const answer = fighting.view;
    if (answer !== this.adopted) {
      this.adopted = answer;
      sailing.adopt(fighting.player);
    }
    const toWindow = (point: readonly [number, number, number]) =>
      [point[0] - view.leftM, point[1] - view.topM, point[2]] as const;
    const splashes = this.effects.take(fighting.takeEvents(), time, toWindow);
    for (const ship of [answer.player, answer.captain]) {
      const [x = 0, y = 0] = ship.ship;
      const [heave = 0] = ship.pose;
      this.effects.burn(toWindow([x, y, heave + DECK_M]), ship.state === 'sinking' ? 0 : ship.fires, time, seconds);
    }
    if (answer.over) {
      this.farewell = { lines: fighting.lines(time), until: time + FAREWELL_S };
      [this.fight, this.adopted] = [null, null];
      fighting.end().catch(() => undefined);
    }
    return splashes;
  }

  /** The look the camera lays while aiming (`lookOf`). */
  look(orbit: Orbit, sailing: FightingShip, view: Window): FightLook {
    return lookOf(orbit, sailing, view);
  }

  /** The camera while aiming (`aimCameraOf`). */
  aimCamera(orbit: Orbit, sailing: FightingShip, view: Window, shown: number): Orbit {
    return aimCameraOf(orbit, sailing, view, shown);
  }

  /** Her footprint on the water while she floats, at her hull's waterline. */
  hull(view: Window): HullMask | null {
    const captain = this.fight?.view.captain;
    if (!captain || captain.state === 'sinking' || captain.state === 'sunk') return null;
    const [x = 0, y = 0, heading = 0, ahead = 0, abeam = 0] = captain.ship;
    const waterline = hullWaterline(hullOfCaptain(captain));
    return {
      x: x - view.leftM,
      y: y - view.topM,
      heading,
      halfLength: waterline.lengthM / 2,
      halfBeam: waterline.beamM / 2,
      way: Math.hypot(ahead, abeam),
    };
  }

  /** Her captain's bar over her hull's masthead, heights as drawn, while one is on. */
  bars(view: Window, shown: number): ShipBar[] {
    const captain = this.fight?.view.captain;
    const over = captain && plateOverM(hullOfCaptain(captain));
    const bar = captain && barOver({ ...captain, maxHull: captain.max_hull }, view, shown, over);
    return bar ? [bar] : [];
  }

  /** The panel's lines: the fight's, or a fight's last for a while after it ends. */
  lines(now: number): string[] {
    if (this.fight) return this.fight.lines(now);
    if (this.farewell && this.farewell.until > now) return this.farewell.lines;
    return this.calling ? ['Calling a captain…'] : [];
  }

  /** Her captain's ship while she floats, heights as drawn: in her hull and her faction's colours, her sails stepped
   *  `seconds` on in the wind blowing toward `bearing`, set as her rung says. */
  ships(
    view: Window,
    shown: number,
    wind: { readonly bearing: number; readonly seconds: number },
    now: number,
  ): DrawnShip[] {
    const captain = this.fight?.view.captain;
    if (!captain || captain.state === 'sunk') return [];
    const hull = hullOfCaptain(captain);
    if (this.rig?.hull !== hull) this.rig = { hull, rig: new SailRig(hullSails(hull)) };
    const [x = 0, y = 0, heading = 0] = captain.ship;
    const [heave = 0, pitch = 0, roll = 0] = captain.pose;
    const set = captain.ship[SHIP_RUNG] === SAILS_RUNG;
    this.rig.rig.step(wind.seconds, { offDeg: windOff(heading, wind.bearing), set }, now);
    const place = { x: x - view.leftM, y: y - view.topM, z: heave * shown, heading, pitch, roll };
    return [{ hull, place, rig: this.rig.rig, look: { side: factionSide(captain.faction) } }];
  }

  /** Draws the balls aloft, the lay's arcs and the effects, heights as drawn. */
  draw(pass: GPURenderPassEncoder, view: Window, shown: number, camera: ShipCamera, now: number): void {
    const answer = this.fight?.view;
    const marks: Mark[] = this.effects.marks(now).map((mark) => ({ ...mark, z: mark.z * shown }));
    if (answer) {
      for (const [ballX, ballY, ballZ, radius] of answer.balls)
        marks.push({
          x: ballX - view.leftM,
          y: ballY - view.topM,
          z: ballZ * shown,
          radius: radius * BALL_DRAWN,
          colour: BALL,
        });
      marks.push(...Naval.arcs(answer, view, shown));
    }
    this.marks.drawInto(pass, marks, camera);
  }

  /** The lay's arcs (`arcsOf`) of the fight's answer. */
  static arcs(answer: FightView, view: Window, shown: number): Mark[] {
    return arcsOf(answer.lay, view, shown);
  }
}

/** Where a Sloop lies, for the aim. */
function lyingOf(ship: Aboard, view: Window): Lying {
  const place = ship.place(view, 1);
  return { x: place.x + view.leftM, y: place.y + view.topM, heading: place.heading, heave: place.z };
}

/** The look the camera lays while aiming from a Sloop: its bearing off her bow, its range out along her fire, and its
 *  ray from the aim eye. */
export function lookOf(orbit: Orbit, ship: Aboard, view: Window): FightLook {
  const lying = lyingOf(ship, view);
  const bearing = lookBearing(orbit.yaw, lying.heading);
  const eye = aimEye(lying, bearing >= 0 ? 1 : -1);
  const flat = Math.cos(orbit.pitch);
  const way = [Math.sin(orbit.yaw) * flat, -Math.cos(orbit.yaw) * flat, -Math.sin(orbit.pitch)];
  return { bearing, range: Math.max(0, lookRange(lying, eye, orbit.yaw, -orbit.pitch)), ray: [...eye, ...way] };
}

/** The camera while aiming from a Sloop: at DFO's aim eye on the side looked at, along the orbit's yaw and pitch. */
export function aimCameraOf(orbit: Orbit, ship: Aboard, view: Window, shown: number): Orbit {
  const lying = lyingOf(ship, view);
  const [x, y, z] = aimEye(lying, lookBearing(orbit.yaw, lying.heading) >= 0 ? 1 : -1);
  const ahead = 3;
  const flat = Math.cos(orbit.pitch) * ahead;
  return {
    ...orbit,
    targetX: x - view.leftM + Math.sin(orbit.yaw) * flat,
    targetY: y - view.topM - Math.cos(orbit.yaw) * flat,
    targetZ: (z - Math.sin(orbit.pitch) * ahead) * shown,
    distance: ahead,
  };
}

/** A lay's arcs, red on target: each gun's unscattered flight in dots up to where the rules say it stops, a mark where
 *  it strikes her, and the landing zone's ring where it splashes. */
export function arcsOf(lay: FightLay | null, view: Window, shown: number): Mark[] {
  if (!lay) return [];
  const colour = lay.on_target ? ON_TARGET : ARC;
  const placed = (x: number, y: number, z: number, radius: number, tint: Mark['colour']): Mark => ({
    x: x - view.leftM,
    y: y - view.topM,
    z: z * shown,
    radius,
    colour: tint,
  });
  return lay.launches.flatMap(([x = 0, y = 0, z = 0, east = 0, south = 0, up = 0], index) => {
    const end = lay.ends[index] ?? null;
    const dots: Mark[] = [];
    for (let time = ARC_STEP_S; time < (end?.time ?? ARC_LONGEST_S); time += ARC_STEP_S)
      dots.push(placed(x + east * time, y + south * time, z + up * time - (9.81 * time * time) / 2, 0.07, colour));
    if (end?.strike) dots.push(placed(...end.strike, STRIKE_M, ON_TARGET));
    if (end?.water) {
      const [endX, endY, endZ] = end.point;
      for (let step = 0; step < ZONE_DOTS; step++) {
        const turn = (step / ZONE_DOTS) * 2 * Math.PI;
        const ring = [endX + Math.cos(turn) * lay.radius, endY + Math.sin(turn) * lay.radius] as const;
        dots.push(placed(ring[0], ring[1], endZ, 0.07, colour));
      }
    }
    return dots;
  });
}
