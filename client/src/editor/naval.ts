import type { FightEvent, FightLay, FightLook, FightView } from '../rules/fightRules.ts';
import type { ShadowMap } from '../shadow.ts';
import type { LandView } from '../rules/landRules.ts';
import { type AimDrawn, type AimView, aimViewOf } from '../ships/aimView.ts';
import type { Mark, Splash } from '../ships/effects.ts';
import { fightDisplay } from '../ships/fightDisplay.ts';
import { fightLamps } from '../ships/fightLamps.ts';
import { type Cue, type FeelShip, FightFeel } from '../ships/fightFeel.ts';
import type { MarkView } from '../ships/markView.ts';
import { factionSide } from '../ships/dress.ts';
import { hullOfCaptain, hullSails, hullWaterline, plateOverM, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import { barOver, type ShipBar } from '../ships/shipBars.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import type { ShipCamera } from '../ships/shipView.ts';
import type { HullMask } from '../water/hullMask.ts';
import { FIGHT_LAMPS } from '../sky/lamps.ts';
import type { Afloat } from './afloat.ts';
import { lookBearing } from './aim.ts';
import { AimCamera, type AimShip, type Laid } from './aimCamera.ts';
import { type FightInput, type FightSource, Fighting, sideReady } from './fighting.ts';
import { cameraOf, type Orbit } from './orbit.ts';
import { SAILS_RUNG, type Sailing } from './sailing.ts';

/** Where a ship's numbers hold its rung (crates/sailing/src/floats.rs). */
export const SHIP_RUNG = 7;
/** A ball is drawn this many times its size, to be seen. */
const BALL_DRAWN = 2;
/** An arc whose ball is still aloft past its life is drawn this far (seconds). */
const ARC_LONGEST_S = 4;
const BALL = [0.12, 0.12, 0.12] as const;
/** An arc is drawn in this many pieces of its flight, and a landing's ring is never smaller than this (metres). */
const ARC_PIECES = 24;
const LEAST_RING_M = 1.6;
/** The panel keeps a fight's last lines this long after it ends (seconds). */
const FAREWELL_S = 4;

/** A captain's fight round the ship in the World Editor: calling it and sending it off (F), stepping the fight in
 *  its helm's place, the aim's look and camera, its captain's ship in its hull and colours, and drawing the balls,
 *  the lay and the effects. */
/** What draws the marks: the ship layer's mark view, whose device draws the aim too, or a test's. */
export type MarkDrawer = Pick<MarkView, 'drawInto'> & Partial<Pick<MarkView, 'gpu'>>;
/** The player's ship as a fight steers it: it takes each answer, and says where it is drawn. */
export type FightingShip = Pick<Sailing, 'adopt' | 'place'>;
/** Where a fight is drawn from: the window's corner, or the world's own (0, 0) in the game. */
export type Window = Pick<LandView, 'leftM' | 'topM'>;
/** A ship as the aim sees it: where it is drawn. */
export type Aboard = Pick<Afloat, 'place'>;

export class Naval {
  private fight: Fighting | null = null;
  private calling = false;
  /** Each call's own number: a captain answering a call since ended or made again is not taken up. */
  private call = 0;
  private adopted: FightView | null = null;
  private feel = new FightFeel(1);
  /** The player's own ship's rig, whose harm the fight draws on it: the scene's, once its model has come. */
  ownRig: SailRig | null = null;
  /** Where the player's own ship was drawn at the last step, and the wind's bearing the sails were last stepped in. */
  private own: FightingShip | null = null;
  private windBearing = 0;
  /** The answer the last fight to end by itself ended on, until another begins. */
  private ended: FightView | null = null;
  /** The fight's events the last step took, for whatever else hears them (the sea's sounds). */
  heard: readonly FightEvent[] = [];
  private readonly marks: MarkDrawer;
  /** What draws the aim over the water (`drawAimOver`), where the marks' device can; and the eye it is laid from. */
  private readonly aimView: AimView | null;
  private readonly aimEye = new AimCamera();
  /** The look the aim laid at its last frame, while it lays one. */
  private aimed: FightLook | null = null;
  /** The hull a ship is drawn as: its own once its model has come. */
  private readonly shown: (hull: number) => number;
  private farewell: { readonly lines: string[]; readonly said: string[]; readonly until: number } | null = null;
  /** Its captain's rig, for the hull they sail. */
  private rig: { readonly hull: number; readonly rig: SailRig } | null = null;

  constructor(marks: MarkDrawer, shown: (hull: number) => number = (hull) => hull) {
    this.marks = marks;
    this.aimView = marks.gpu ? aimViewOf(marks.gpu) : null;
    this.shown = shown;
  }

  /** Whether a fight is on: the fight steps it, not its own helm. */
  get fighting(): boolean {
    return this.fight !== null;
  }

  /** The fight's last answer: while one is on, else the one a fight ended on, so its end is never missed. */
  get view(): FightView | null {
    return this.fight?.view ?? this.ended;
  }

  /** Whether a fight is on or being called: either way its own helm stands. */
  get busy(): boolean {
    return this.fight !== null || this.calling;
  }

  /** F: calls a Grey Tithe captain round it, or sends the one called off. */
  toggle(source: FightSource | null, id: string, sailing: Sailing, time: number, fail: (error: unknown) => void): void {
    if (this.fight) {
      this.end();
      return;
    }
    if (this.calling || !source) return;
    this.calling = true;
    const call = ++this.call;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    // Its own helm stands while it is called: the fight begins from its numbers once its last step has answered.
    sailing
      .whenStill()
      .then(() =>
        call === this.call ? Fighting.begin(source, id, sailing.floats(), seed, time, sailing.hullKind) : 'sent off',
      )
      .then((fighting) => {
        if (call !== this.call) return;
        this.calling = false;
        if (fighting === 'sent off') return;
        if (typeof fighting === 'string') fail(new Error(fighting));
        // A new fight's effects are its own: one that ended by itself left its feel, a burst under way among it.
        else [this.fight, this.ended, this.feel] = [fighting, null, new FightFeel(1)];
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
    [this.fight, this.ended] = [fighting, null];
  }

  /** Ends the fight, if one is on or called. */
  end(): void {
    const fighting = this.fight;
    [this.fight, this.calling, this.adopted] = [null, false, null];
    this.feel = new FightFeel(1);
    // The fight's harm on it goes with it.
    this.ownRig?.mend();
    this.rig = null;
    this.call++;
    fighting?.end().catch(() => undefined);
  }

  /** Steps the fight for a frame: it takes its answer, its events become effects. Answers the water's pushes. */
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
    this.own = sailing;
    const toWindow = (point: readonly [number, number, number]) =>
      [point[0] - view.leftM, point[1] - view.topM, point[2]] as const;
    this.heard = fighting.takeEvents();
    const splashes = this.feel.frame({
      events: this.heard,
      ships: this.feelShips(answer),
      balls: answer.balls,
      now: time,
      seconds,
      windBearing: this.windBearing,
      toWindow,
    });
    if (answer.over) {
      this.ownRig?.mend();
      this.farewell = { lines: fighting.lines(time), said: fighting.messages(time), until: time + FAREWELL_S };
      [this.fight, this.adopted, this.ended] = [null, null, answer];
      fighting.end().catch(() => undefined);
    }
    return splashes;
  }

  /** The sounds the fight has called for since last taken. */
  takeCues(): Cue[] {
    return this.feel.takeCues();
  }

  /** The fight's ships as its feel sees them, by number: by default the player's ship and their captain's in the hull
   *  they sail; the sea's fight gives its own, every captain in it with its rig. */
  shipsOf: ((answer: FightView) => Map<number, FeelShip>) | null = null;

  private feelShips(answer: FightView): Map<number, FeelShip> {
    if (this.shipsOf) return this.shipsOf(answer);
    const hull = this.shown(hullOfCaptain(answer.captain));
    if (this.rig?.hull !== hull) this.rig = { hull, rig: new SailRig(hullSails(hull)) };
    return new Map([
      [
        0,
        {
          vessel: answer.player,
          rig: this.ownRig,
          hull: this.shown(answer.player.hull_kind ?? SLOOP_HULL),
          side: 'player' as const,
        },
      ],
      [1, { vessel: answer.captain, rig: this.rig.rig, hull, side: factionSide(answer.captain.faction) }],
    ]);
  }

  /** The look the aim camera laid at its last frame (`aimCamera`), while it lays one. */
  look(): FightLook | null {
    return this.aimed;
  }

  /** The camera `seconds` on (`easedAimOf`): eased to its battery while `aiming` and its guns can speak, and home
   *  again; the look it lays is kept for the next step (`look`). */
  aimCamera(orbit: Orbit, sailing: Aboard, view: Window, shown: number, aiming: boolean, seconds: number): Orbit {
    const answer = this.fight?.view;
    const speaks = aiming && answer?.player.state === 'afloat';
    const aimed = easedAimOf(
      this.aimEye,
      orbit,
      sailing,
      view,
      { shown, aiming: speaks, hull: answer?.player.hull_kind ?? SLOOP_HULL },
      answer?.lay ?? null,
      seconds,
    );
    this.aimed = aimed.look;
    return aimed.orbit;
  }

  /** Its footprint on the water while it floats, at its hull's waterline. */
  hull(view: Window): HullMask | null {
    const captain = this.fight?.view.captain;
    if (!captain || captain.state === 'sinking' || captain.state === 'sunk') return null;
    const [x = 0, y = 0, heading = 0, ahead = 0, abeam = 0] = captain.ship;
    const waterline = hullWaterline(this.shown(hullOfCaptain(captain)));
    return {
      id: `captain ${captain.id}`,
      x: x - view.leftM,
      y: y - view.topM,
      heading,
      halfLength: waterline.lengthM / 2,
      halfBeam: waterline.beamM / 2,
      way: Math.hypot(ahead, abeam),
    };
  }

  /** Its captain's bar over its hull's masthead, heights as drawn, while one is on. */
  bars(view: Window, shown: number): ShipBar[] {
    const captain = this.fight?.view.captain;
    const over = captain && plateOverM(this.shown(hullOfCaptain(captain)));
    const bar = captain && barOver({ ...captain, maxHull: captain.max_hull }, view, shown, over);
    return bar ? [bar] : [];
  }

  /** The panel's lines: the fight's, or a fight's last for a while after it ends. */
  lines(now: number): string[] {
    if (this.fight) return this.fight.lines(now);
    if (this.farewell && this.farewell.until > now) return this.farewell.lines;
    return this.calling ? ['Calling a captain…'] : [];
  }

  /** The fight's messages standing at `now` (`Fighting.messages`), or a fight's last for a while after it ends. */
  messages(now: number): string[] {
    if (this.fight) return this.fight.messages(now);
    return this.farewell && this.farewell.until > now ? this.farewell.said : [];
  }

  /** The fight's readout at `now` (`fightDisplay`): its plate and its abilities' bar, the card on the nearest captain with `board`'s
   *  key while it can be boarded, and its last volley's tally; none out of a fight. */
  display(now: number, board: Parameters<typeof fightDisplay>[3]): ReturnType<typeof fightDisplay> | null {
    return this.fight ? fightDisplay(this.fight.view, this.feel, now, board, this.fight.own) : null;
  }

  /** Its captain's ship while it floats, heights as drawn: in its hull and its faction's colours, its sails stepped
   *  `seconds` on in the wind blowing toward `bearing`, set as its rung says. */
  ships(
    view: Window,
    shown: number,
    wind: { readonly bearing: number; readonly seconds: number },
    now: number,
  ): DrawnShip[] {
    this.windBearing = wind.bearing;
    const answer = this.fight?.view;
    const ship = answer && this.feelShips(answer).get(1);
    if (!ship?.rig || !FightFeel.afloat(ship, now)) return [];
    const [, , heading = 0, ahead = 0] = ship.vessel.ship;
    const set = ship.vessel.ship[SHIP_RUNG] === SAILS_RUNG;
    ship.rig.step(wind.seconds, { offDeg: windOff(heading, wind.bearing), set, way: ahead }, now);
    const place = captainPlace(ship, view, shown);
    return [{ hull: ship.hull, place, rig: ship.rig, look: { side: ship.side } }];
  }

  /** Draws the balls aloft and the effects (the lay is `drawAimOver`'s), heights as drawn: each effect and ball
   *  `scale` times its size, as the ships are drawn, and the holes in the hulls where `scarred` says each ship is
   *  drawn (by default the player's ship and their captain's); what floats on the drawn swell (`sea.water`, its height
   *  at a window point) where the page has one, all in the sun's shadows when a map is given. */
  draw(
    pass: GPURenderPassEncoder,
    view: Window,
    shown: number,
    camera: ShipCamera,
    now: number,
    scale = 1,
    scarred: Parameters<FightFeel['scars']>[0] | null = null,
    sea: { readonly water?: (x: number, y: number) => number; readonly shadow?: ShadowMap } = {},
  ): void {
    const answer = this.fight?.view;
    const marks: Mark[] = [];
    if (answer) {
      const ships = this.feelShips(answer);
      const [own, captain] = [ships.get(0), ships.get(1)];
      marks.push(
        ...this.feel.scars(
          scarred ?? [
            own && this.own ? { ship: own, place: this.own.place(view, shown) } : null,
            captain && FightFeel.afloat(captain, now)
              ? { ship: captain, place: captainPlace(captain, view, shown) }
              : null,
          ],
        ),
      );
      for (const [ballX, ballY, ballZ, radius] of answer.balls)
        marks.push({
          x: ballX - view.leftM,
          y: ballY - view.topM,
          z: ballZ * shown,
          radius: radius * BALL_DRAWN * scale,
          colour: BALL,
        });
    }
    // The balls first: past the most marks a frame draws, the effects' last puffs wait.
    const floated = this.feel.marks(now, scale, sea.water ?? null, camera.eye);
    // Its flashes' and fires' light, for the sky's lamps the next frame takes.
    FIGHT_LAMPS.current = fightLamps(floated, view, shown);
    marks.push(...floated.map((mark) => ({ ...mark, z: mark.z * shown })));
    this.marks.drawInto(pass, marks, camera, sea.shadow);
  }

  /** Draws the lay's aim (`aimOf`) over a finished picture, after the water, hidden where `depth` stands nearer;
   *  heights as drawn. */
  drawAimOver(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    depth: GPUTexture,
    view: Window,
    shown: number,
    camera: ShipCamera,
    now: number,
  ): void {
    const answer = this.fight?.view;
    const aim = answer && aimOf(answer.lay, answer.player, view, shown);
    if (aim) this.aimView?.drawOver(encoder, target, depth, aim, camera, now);
  }
}

/** Where its captain's ship is drawn in the window, heights as drawn. */
function captainPlace(ship: FeelShip, view: Window, shown: number) {
  const [x = 0, y = 0, heading = 0] = ship.vessel.ship;
  const [heave = 0, pitch = 0, roll = 0] = ship.vessel.pose;
  return { x: x - view.leftM, y: y - view.topM, z: heave * shown, heading, pitch, roll };
}

/** A ship of `hull` as the aim lays from it: where and how it is drawn. */
function aimShipOf(ship: Aboard, view: Window, hull: number): AimShip {
  const place = ship.place(view, 1);
  const { heading, pitch, roll } = place;
  return { x: place.x + view.leftM, y: place.y + view.topM, heading, heave: place.z, pitch, roll, hull };
}

/** The aim camera while laying from a ship of `hull` (`AimCamera`): `orbit`'s eye eased to its battery's station on
 *  the side looked at while `aiming`, looking at the water its guns are laid on (`lay`,
 *  the rules' last answer), and home again once let go; heights drawn `shown` times their own. Answers the orbit
 *  drawn and the look laid. */
export function easedAimOf(
  camera: AimCamera,
  orbit: Orbit,
  ship: Aboard,
  view: Window,
  how: { readonly shown: number; readonly aiming: boolean; readonly hull: number },
  lay: Laid | null,
  seconds: number,
): { readonly orbit: Orbit; readonly look: FightLook | null } {
  const lying = aimShipOf(ship, view, how.hull);
  const [eastM, southM, upM] = cameraOf(orbit).eye;
  const eye = [eastM + view.leftM, southM + view.topM, upM / how.shown] as const;
  const want: 1 | -1 | null = how.aiming ? (lookBearing(orbit.yaw, lying.heading) >= 0 ? 1 : -1) : null;
  const home = { eye, yaw: orbit.yaw, pitch: orbit.pitch };
  const ask = { home, want, ship: lying, pitch: orbit.pitch, lay };
  const aimed = camera.frame(ask, seconds);
  if (aimed.eye === eye) return { orbit, look: null };
  const ahead = 3;
  const flat = Math.cos(aimed.pitch) * ahead;
  const drawn = {
    ...orbit,
    yaw: aimed.yaw,
    pitch: aimed.pitch,
    targetX: aimed.eye[0] - view.leftM + Math.sin(aimed.yaw) * flat,
    targetY: aimed.eye[1] - view.topM - Math.cos(aimed.yaw) * flat,
    targetZ: (aimed.eye[2] - Math.sin(aimed.pitch) * ahead) * how.shown,
    distance: ahead,
  };
  return { orbit: drawn, look: aimed.look };
}

/** What the aim shows of a lay (DFO's drawn aim): each gun's unscattered flight to where the rules stop it, fanned out
 *  as wide as it scatters while it is newly held, where the volley falls on the sea and where it meets it, the landing
 *  ring (never under DFO's least), and its tone: grey while the side laid cannot fire (loading, braced, its guns
 *  silent), red while it can and would strike it, else brass. */
export function aimOf(
  lay: FightLay | null,
  player: Parameters<typeof sideReady>[0],
  view: Window,
  shown: number,
): AimDrawn | null {
  if (!lay) return null;
  const placed = ([x, y, z]: readonly [number, number, number] | readonly number[]) =>
    [(x ?? 0) - view.leftM, (y ?? 0) - view.topM, (z ?? 0) * shown] as const;
  const flights = lay.launches.map(([x = 0, y = 0, z = 0, east = 0, south = 0, up = 0], index) => {
    const last = lay.ends[index]?.time ?? ARC_LONGEST_S;
    return Array.from({ length: ARC_PIECES + 1 }, (_unused, piece) => {
      const time = (last * piece) / ARC_PIECES;
      return [x + east * time, y + south * time, z + up * time - (9.81 * time * time) / 2] as const;
    });
  });
  // A lay just taken fans out as wide as it scatters, narrowing as it is held (`spread`, Black Flag's focus): each
  // arc bent out from the volley's middle fall in step with how far it has flown, its fall with it.
  const falls = flights.map((flight) => flight[flight.length - 1] ?? ([0, 0, 0] as const));
  // The volley's middle from the balls that come down; one still aloft at the arc's end would pull it out.
  const landed = falls.filter((_fall, index) => lay.ends[index]);
  const middle = [0, 1].map((axis) => landed.reduce((sum, fall) => sum + (fall[axis] ?? 0), 0) / (landed.length || 1));
  const wider = Math.max(0, lay.spread - 1);
  const fanned = (point: readonly number[], fall: readonly number[], share: number) =>
    placed([
      (point[0] ?? 0) + wider * share * ((fall[0] ?? 0) - (middle[0] ?? 0)),
      (point[1] ?? 0) + wider * share * ((fall[1] ?? 0) - (middle[1] ?? 0)),
      point[2] ?? 0,
    ]);
  const arcs = flights.map((flight, index) =>
    flight.map((point, piece) => fanned(point, falls[index] ?? point, piece / ARC_PIECES)),
  );
  const ends = lay.ends.flatMap((end, index) => (end ? [{ end, fall: falls[index] ?? end.point }] : []));
  const ready = sideReady(player, lay.side);
  return {
    arcs,
    zone: ends.filter(({ end }) => end.water && !end.strike).map(({ end, fall }) => fanned(end.point, fall, 1)),
    strikes: ends.flatMap(({ end }) => (end.strike ? [placed(end.strike)] : [])),
    radius: Math.max(LEAST_RING_M, lay.radius),
    tone: !ready ? 'idle' : lay.on_target ? 'hot' : 'laid',
  };
}
