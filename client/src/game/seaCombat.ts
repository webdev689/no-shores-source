// The fight at sea: once a hostile ship meets the player, or they come upon captains fighting each other, the view pans
// down from the raised sea to their Sloop at true scale, every captain in its own hull and colours, and the sea
// room's fight is fought there, by the World Editor's own fight (its aim, lay, effects and panel), until every
// captain sinks or is gone; then it pans back up.
import { AIM_LOOK_TOP, lookBearing } from '../editor/aim.ts';
import { AIM_ZOOM, AimCamera, type AimFrame, type AimShip } from '../editor/aimCamera.ts';
import { aimStation } from '../editor/aimStation.ts';
import { type FightInput, type FightSource, Fighting } from '../editor/fighting.ts';
import { type MarkDrawer, Naval, type Window } from '../editor/naval.ts';
import { cameraOf, type Orbit } from '../editor/orbit.ts';
import { ORBIT_CLEAR_M, orbitClearance } from '../editor/shipClear.ts';
import { SAILS_RUNG } from '../editor/sailing.ts';
import { FIELD_OF_VIEW, smooth01 } from '../overworld/overworldCamera.ts';
import type { SeaFightModel } from '../plus/seaFight.ts';
import type { FightCaptain, FightVessel, FightView } from '../rules/fightRules.ts';
import { type FeelShip, FightFeel } from '../ships/fightFeel.ts';
import { FightLamps } from '../ships/fightLamps.ts';
import { playCues } from '../ships/fightSounds.ts';
import { Shake } from '../ships/shake.ts';
import type { Stir } from '../ships/swellPose.ts';
import type { ShadowMap } from '../shadow.ts';
import type { LampPlace } from '../sky/lamps.ts';
import { type ShelteredSwell, swellHeight } from '../water/swell.ts';
import type { Pose, ShipFloats } from '../rules/landRules.ts';
import { factionSide, type ShipLook } from '../ships/dress.ts';
import { BOOST_KEY } from '../ships/helmKeys.ts';
import type { BindId } from '../player/binds.ts';
import { BINDS, type InputFrame, axis } from '../player/input.ts';
import { boundCap, boundWord, shipKeys } from './controls.ts';
import { HULL_LINES, type HullLines } from '../ships/hullLines.ts';
import { hullOfCaptain, hullSails, hullWaterline, plateOverM, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import type { MarkView } from '../ships/markView.ts';
import { barOver, type ShipBar } from '../ships/shipBars.ts';
import type { Lying } from '../ships/deck.ts';
import { captainInFight } from '../ships/shipCrew.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import type { ShipCamera, ShipPlace } from '../ships/shipView.ts';
import type { Sailed } from '../terrain/landClient.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { FightHeard } from './audio/ambience/seaFight.ts';
import type { Shot } from './camera.ts';
import { type FightReadout, readoutOf } from './seaPanel.ts';
import type { SeaRoom } from './seaRoom.ts';
import { playerLook } from './seaShips.ts';
import { worldOutput } from './uiSounds.ts';

/** Seconds the view takes to come down to the fight, or go back up. */
const PAN_S = 1.5;
/** The fight's camera: the World Editor's while sailing, its distance behind it and pitch below the horizon, looking
 *  at a point this far over its waterline. */
const ORBIT = { distance: 75, pitch: 0.3, lookOverM: 6 } as const;
/** How fast a drag turns the camera, radians a pixel, and how far up and down it may look. */
const DRAG_TURN = 0.005;
/** The right stick leant whole turns the view as a drag of this many pixels a second. */
const PAD_LOOK_PX = 500;
/** The fight's controls; and the controls whose keys it passes on, for the menus, the sheet and the sea's asks. */
export const FIGHT_CONTROLS = [
  'fightLeft',
  'fightRight',
  'sailsUp',
  'sailsDown',
  'burst',
  'brace',
  'aim',
  'fire',
  'holdFire',
  'shotBack',
  'shotNext',
] as const satisfies readonly BindId[];
const PASSED: readonly BindId[] = ['character', 'inventory', 'controls', 'use', 'chat'];
/** The controls held as the naval rules hear them held: the helm's keys, the rungs', the brace's and the burst's. */
const HELD_AS: Partial<Record<BindId, string>> = {
  fightLeft: 'a',
  fightRight: 'd',
  sailsUp: 'w',
  sailsDown: 's',
  brace: 'c',
  burst: BOOST_KEY,
};
const PITCH = [0.05, 1.2] as const;
/** The quiet the wheel keeps before it steps the load again, seconds, as DFO's keeps: a trackpad's stream of
 *  small turns steps it once. */
const SHOT_WHEEL_S = 0.18;
/** Out of the aim the wheel zooms the fight's camera, DFO's helm zoom: a notch is this many times nearer or farther,
 *  from DFO's nearest (its foot camera's far end, metres) out to the fight camera's own distance. */
const ZOOM = { ratio: 1.5, nearestM: 11.4 } as const;
/** How fast the fight's camera stands back as more of the ship comes between, and comes in again, seconds (time
 *  constants): out about as fast as the aim's eye moves, in slowly enough that a look swinging past the bow never
 *  pumps it. */
const BACK_OUT_S = 0.12;
const BACK_IN_S = 0.6;
/** The way a ship's foam shows round its bow, m/s: a Sloop's whole. */
const UNDER_WAY = 2;

/** The player's Sloop as the fight steers it: where the fight last left it. */
class Fought {
  ship: ShipFloats = new Float64Array(8);
  pose: Pose = { heave: 0, pitch: 0, roll: 0, aground: false };

  adopt(sailed: Sailed): void {
    this.ship = sailed.ship;
    this.pose = sailed.pose;
  }

  place(view: Window, shown: number): ShipPlace {
    const [x = 0, y = 0, heading = 0] = this.ship;
    const { heave, pitch, roll } = this.pose;
    return { x: x - view.leftM, y: y - view.topM, z: heave * shown, heading, pitch, roll };
  }
}

/** A fight the sea room steps: each step sends the orders and answers the room's latest view, every event since. */
export function roomSource(room: SeaRoom, first: FightView): FightSource {
  let latest = first;
  return {
    fightBegin: () => Promise.reject(new Error('the sea room begins its own fights')),
    fightStep: (_id, orders) => {
      room.orders(orders);
      latest = room.takeFight() ?? { ...latest, events: [] };
      return Promise.resolve(latest);
    },
    fightEnd: () => Promise.resolve(),
    quiet: () => room.quiet,
  };
}

export class SeaCombat {
  /** The sea room, whose last word says whether a boarding would be taken now. */
  private readonly room: Pick<SeaRoom, 'mayBoard'>;
  private readonly naval: Naval;
  private readonly fightLamps = new FightLamps();
  private readonly marks: MarkDrawer & Partial<Pick<MarkView, 'drawOver' | 'drawLight' | 'lights'>>;
  /** The hull a ship is drawn as: its own once its model has come. */
  private readonly shown: (hull: number) => number;
  private readonly fought = new Fought();
  /** Each ship's rig, the player's first, one more as each other captain comes into the fight. */
  private readonly rigs = new Map<number, { readonly hull: number; readonly rig: SailRig }>();
  /** The world point the fight is drawn from, where it began: marks lie near it, so float32 holds them exactly. */
  private readonly window: Window;
  private last: FightView;
  private orbit: { yaw: number; pitch: number };
  private readonly held = new Set<string>();
  private readonly presses: string[] = [];
  private aiming = false;
  /** The aim's last frame: the view it drew and the look it laid. */
  private aimed: AimFrame | null = null;
  private fire = false;
  /** Shift tapped since the last frame: a burst of speed asked for. */
  private boost = false;
  private loadSteps = 0;
  /** When the wheel last turned, seconds, and how far back the fight's camera stands. */
  private wheelAt = -Infinity;
  private distance: number = ORBIT.distance;
  /** How far back the camera stands from the ship's middle as drawn, eased toward the zoom's distance or as far as
   *  clears the ship, metres. */
  private backed: number = ORBIT.distance;
  private readonly aimCamera = new AimCamera();
  /** The hull the player's ship is drawn as, and how it lies where it is drawn on another swell than the rules'
   *  (the story's): the aim's eye and the camera's clearance ride it as drawn. */
  private readonly ownHull: number;
  /** How the player's ship is drawn: in the dress they keep, as the room says, at the fight's start; and the hull
   *  whose guns its aim lays, the rules' (the story's rules sail it as the Sloop). */
  private readonly ownLook: ShipLook;
  private readonly ownGuns: number;
  ownPose: ((x: number, y: number, heading: number) => { heave: number; pitch: number; roll: number }) | null = null;
  /** Where the frame's ships were last drawn from, in the window, and when. */
  private drawnFrom: { readonly eye: readonly [number, number, number]; readonly now: number } | null = null;
  /** How far down the view has come, 0 the sea's to 1 the fight's, and which way it goes. */
  private down = 0;
  private going: 1 | -1 = 1;
  /** The size the ships were last drawn at, which the fight's effects are drawn at too, and the water's pushes owed
   *  since the sea last took them. */
  private scale = 1;
  /** The swell the water draws and its clock at the last frame, which what floats rides. */
  private swell: ShelteredSwell | undefined;
  private waterTime = 0;
  private stirred: Stir[] = [];
  /** The eye jarred by the ship's guns, the balls striking it, falls alongside and magazines near. */
  private readonly shake = new Shake(1);

  /** The fight the sea room began (`room`, which steps it and says whether a boarding would be taken now), or one a
   *  source of its own steps (the story's, on the land worker's door, `own` naming the player's ship's kind on its
   *  plate and `hull` the hull it is drawn as); its first view `first`. */
  constructor(
    fought: SeaRoom | { readonly source: FightSource; readonly own: string; readonly hull?: number },
    first: FightView,
    marks: MarkDrawer & Partial<Pick<MarkView, 'drawOver' | 'drawLight' | 'lights'>>,
    now: number,
    shown: (hull: number) => number = (hull) => hull,
  ) {
    this.shown = shown;
    this.marks = marks;
    const own = 'source' in fought ? fought : null;
    this.room = own ? { mayBoard: false } : (fought as SeaRoom);
    // The room's fight sails the player's own hull, as its view says; the story's draws its own.
    this.ownHull = own?.hull ?? first.player.hull_kind ?? SLOOP_HULL;
    this.ownGuns = own ? SLOOP_HULL : this.ownHull;
    this.ownLook = own ? { side: 'player' } : playerLook((fought as SeaRoom).ownShip);
    // Its aim's station found as the fight opens, not on the first aim.
    aimStation(this.ownHull);
    this.naval = new Naval(marks, shown);
    this.naval.shipsOf = (answer) => this.feelShips(answer);
    const source = own?.source ?? roomSource(fought as SeaRoom, first);
    this.naval.join(Fighting.joined(source, 'sea', first, now, own?.own));
    this.last = first;
    const [x = 0, y = 0, heading = 0] = first.player.ship;
    this.window = { leftM: Math.round(x), topM: Math.round(y) };
    this.orbit = { yaw: heading, pitch: ORBIT.pitch };
  }

  /** The fight as the room last showed it. */
  get view(): FightView {
    return this.last;
  }

  /** Whether the view has come back up after the fight: the sea takes over. */
  get done(): boolean {
    return this.going === -1 && this.down === 0;
  }

  /** The fight's events this frame and its ships as they lie, for the sea's sounds. */
  get heard(): FightHeard {
    return { events: this.naval.heard, view: this.last };
  }

  /** Where the fight left the player's Sloop, and its heading. */
  get lying(): { readonly x: number; readonly y: number; readonly heading: number } {
    const [x = 0, y = 0, heading = 0] = this.last.player.ship;
    return { x, y, heading };
  }

  /** A key down or up; answers whether the fight takes it: its own controls (`FIGHT_CONTROLS`), and every other key
   *  but the menus', the sheet's and Use's, so the sea's own (the map, a voyage, the pace) wait for the fight's end. */
  key(key: string, down: boolean): boolean {
    const binds = BINDS.now;
    const own = FIGHT_CONTROLS.find((id) => binds[id].keys.includes(key));
    if (own) this.act(own, down);
    return own !== undefined || !PASSED.some((id) => binds[id].keys.includes(key));
  }

  /** One of the fight's controls pressed or let go: the helm's and the brace held as the naval rules hear them, a
   *  rung or a burst on its press; the aim held and fired as it is let go, a fire while aiming, holding fire, and a
   *  step of the shot. */
  act(id: BindId, down: boolean): void {
    const naval = HELD_AS[id];
    if (naval !== undefined) {
      if (down && !this.held.has(naval) && (naval === 'w' || naval === 's')) this.presses.push(naval);
      if (down && !this.held.has(naval) && naval === BOOST_KEY) this.boost = true;
      if (down) this.held.add(naval);
      else this.held.delete(naval);
    } else if (id === 'aim') this.aim(down);
    else if (id === 'fire' && down && this.aiming) this.aim(false);
    else if (id === 'holdFire' && down && this.aiming) this.holdFire();
    else if (down && (id === 'shotBack' || id === 'shotNext')) this.loadSteps += id === 'shotNext' ? 1 : -1;
  }

  /** The pad's part of a frame, `seconds` long: its controls pressed and let go, a tap both in one frame; the aim
   *  held on its trigger, fired by the other, and held fire as it is let go unfired; and the right stick turning the
   *  view as a drag does. */
  padFrame(pad: InputFrame, seconds: number): void {
    for (const id of FIGHT_CONTROLS) {
      if (pad.pressed(id)) this.act(id, true);
      if (id === 'aim' && pad.released(id)) this.holdFire();
      else if (pad.released(id)) this.act(id, false);
    }
    const look = PAD_LOOK_PX * seconds;
    const [right, down] = [axis(pad, 'turnLeft', 'turnRight'), axis(pad, 'lookUp', 'lookDown')];
    if (right !== 0 || down !== 0) this.drag(right * look, down * look);
  }

  /** Lets go of every key the fight holds, as the player goes on foot on a deck and their keys are the foot's. */
  letGo(): void {
    this.held.clear();
  }

  /** A drag of the view, in pixels: it turns the camera round the ship; while aiming, the look stays square off
   *  the side taken and a drag up or down lays the guns farther or nearer. */
  drag(right: number, down: number): void {
    const yaw = this.aiming ? this.orbit.yaw : this.orbit.yaw + right * DRAG_TURN;
    this.orbit = { yaw, pitch: this.pitched(this.orbit.pitch + down * DRAG_TURN) };
  }

  /** A pitch within the aim's clamp while aiming, else the orbit's. */
  private pitched(pitch: number): number {
    return Math.min(PITCH[1], Math.max(this.aiming ? -AIM_LOOK_TOP : PITCH[0], pitch));
  }

  /** The right button held aims; let go, the lay held fires. A left click while aiming holds fire. */
  aim(held: boolean): void {
    // Let go while the view still eases round to the side taken, nothing is laid, so nothing fires.
    if (this.aiming && !held && this.aimed?.look) this.fire = true;
    if (this.aiming && !held) this.leaveAim();
    this.aiming = held;
    this.orbit = { ...this.orbit, pitch: this.pitched(this.orbit.pitch) };
  }

  holdFire(): void {
    if (this.aiming) this.leaveAim();
    this.aiming = false;
    this.orbit = { ...this.orbit, pitch: this.pitched(this.orbit.pitch) };
  }

  /** Let go of the aim, the camera goes on round the ship looking the way the aim looked, so it eases home without a
   *  swing. */
  private leaveAim(): void {
    if (this.aimed) this.orbit = { ...this.orbit, yaw: this.aimed.yaw };
  }

  /** Whether the right button holds the aim. */
  get aimingNow(): boolean {
    return this.aiming;
  }

  /** The wheel at `time` (seconds): while aiming it steps the load, once after a quiet; otherwise it zooms the fight's
   *  camera, a turn toward the player (`steps` < 0) nearer. */
  wheel(steps: number, time: number): void {
    if (!steps) return;
    if (!this.aiming) {
      const distance = this.distance * ZOOM.ratio ** Math.sign(steps);
      this.distance = Math.min(ORBIT.distance, Math.max(ZOOM.nearestM, distance));
      return;
    }
    if (time - this.wheelAt >= SHOT_WHEEL_S) this.loadSteps += Math.sign(steps);
    this.wheelAt = time;
  }

  /** The player's ship as it is drawn: on the rules' pose, or the swell it is drawn on. */
  private ownShip(): AimShip {
    const [x = 0, y = 0, heading = 0] = this.last.player.ship;
    const [heave = 0, pitch = 0, roll = 0] = this.last.player.pose;
    const drawn = this.ownPose?.(x, y, heading) ?? { heave, pitch, roll };
    return { x, y, heading, ...drawn, hull: this.ownHull, guns: this.ownGuns };
  }

  /** The fight's camera round the player's ship `seconds` on, standing back at least as far as clears its hull and
   *  its rig: eased out quickly as the look comes round to where more of the ship stands, and back in slowly; only
   *  the outer half of its margin is eased, so however fast the look swings it stands a metre clear of the ship and
   *  its sails' swing, past the lens's near plane. */
  private orbitAt(seconds: number): Orbit {
    const ship = this.ownShip();
    const target = { targetX: ship.x - this.window.leftM, targetY: ship.y - this.window.topM, targetZ: ship.heave };
    const lookAt = [ship.x, ship.y, ship.heave + ORBIT.lookOverM] as const;
    const clearance = orbitClearance(ship, lookAt, this.orbit.yaw, Math.max(PITCH[0], this.orbit.pitch));
    const wanted = Math.max(this.distance, clearance);
    const tau = wanted > this.backed ? BACK_OUT_S : BACK_IN_S;
    this.backed += (wanted - this.backed) * (1 - Math.exp(-Math.max(0, seconds) / tau));
    this.backed = Math.max(this.backed, clearance - ORBIT_CLEAR_M / 2);
    return { ...target, targetZ: target.targetZ + ORBIT.lookOverM, ...this.orbit, distance: this.backed };
  }

  /** The aim's frame: the orbit's view eased out to the ship's battery on the side looked at while aiming (never for
   *  a sinking ship, its guns silent), and the look it lays. */
  private aimAt(orbit: Orbit, seconds: number): AimFrame {
    // The orbit's own eye keeps the orbit's clamp, so a look raised over the horizon never takes it under the sea.
    const [eastM, southM, upM] = cameraOf({ ...orbit, pitch: Math.max(PITCH[0], orbit.pitch) }).eye;
    const eye = [eastM + this.window.leftM, southM + this.window.topM, upM] as const;
    const home = { eye, yaw: orbit.yaw, pitch: orbit.pitch };
    const ship = this.ownShip();
    const afloat = this.last.player.state === 'afloat';
    const want = this.aiming && afloat ? (lookBearing(this.orbit.yaw, ship.heading) >= 0 ? 1 : -1) : null;
    const ask = { home, want, ship, pitch: this.orbit.pitch, lay: this.last.lay } as const;
    return this.aimCamera.frame(ask, seconds);
  }

  /** One frame of the fight, `seconds` on at `time`: it steps, and answers the fight's own view, drawing to `far`,
   *  which the view pans down to from the sea's by `share`. */
  frame(seconds: number, time: number, far: number, fail: (error: unknown) => void, swell?: ShelteredSwell): Shot {
    [this.swell, this.waterTime] = [swell, time];
    // The answer that came since the last frame first: the ship is drawn from it, so the eye riding it rides it too.
    this.last = this.naval.view ?? this.last;
    const aimed = this.aimAt(this.orbitAt(seconds), seconds);
    this.aimed = aimed;
    // The guns laid no nearer than their lowest and no farther than their longest, the look's pitch held there.
    if (this.aiming) this.orbit = { ...this.orbit, pitch: aimed.heldPitch };
    const look = this.aiming ? aimed.look : null;
    const input: FightInput = {
      held: this.held,
      press: this.presses.shift(),
      look,
      fire: this.fire,
      loadSteps: this.loadSteps,
      boost: this.boost,
    };
    [this.fire, this.loadSteps, this.boost] = [false, 0, false];
    const splashes = this.naval.step(seconds, input, time, this.fought, this.window, fail);
    // The water's ripples lie round it, drawn as large as it is.
    for (const splash of splashes)
      this.stirred.push({
        x: splash.x + this.window.leftM,
        y: splash.y + this.window.topM,
        radiusM: splash.radiusM * this.scale,
        strength: splash.strength,
      });
    this.last = this.naval.view ?? this.last;
    if (!this.naval.fighting) this.going = -1;
    this.down = Math.min(1, Math.max(0, this.down + (this.going * seconds) / PAN_S));
    const jar = this.shake.jarAt(time);
    const { eye } = aimed;
    return {
      eye: [eye[0] + jar.east, eye[1] + jar.south, eye[2] + jar.up],
      yaw: aimed.yaw + jar.yaw,
      pitch: aimed.pitch + jar.pitch,
      // Zoomed a little as the aim eases in, as Black Flag's.
      fov: FIELD_OF_VIEW * (1 - AIM_ZOOM * aimed.eased),
      near: 0.3,
      far,
    };
  }

  /** How far the view has come down to the fight's, eased: 0 the sea's, 1 the fight's. */
  get share(): number {
    return smooth01(this.down);
  }

  /** The player's Sloop as it lies in the fight, drawn `scale` times its size, while it floats; null once it has
   *  sunk. */
  ownAt(scale: number): Lying | null {
    const vessel = this.last.player;
    if (vessel.state === 'sunk') return null;
    const [x = 0, y = 0, heading = 0] = vessel.ship;
    const [heave = 0, pitch = 0, roll = 0] = vessel.pose;
    return { x, y, heading, scale, heave, pitch, roll };
  }

  /** The player's ship as the fight last showed it: its hurts and its state. */
  get vessel(): FightVessel {
    return this.last.player;
  }

  /** Every captain in the fight: the player's, then any other. */
  get captains(): readonly FightCaptain[] {
    return [this.last.captain, ...(this.last.others ?? [])];
  }

  /** Every ship in the fight with its hull, side and the number its events name it by: the player's own (0), then
   *  each captain's by its own (`FightCaptain.id`). */
  private vessels(answer: FightView = this.last) {
    const player = { vessel: answer.player, hull: this.shown(this.ownHull), side: 'player' as const, number: 0 };
    const captains = [answer.captain, ...(answer.others ?? [])].map((captain) => ({
      vessel: captain,
      hull: this.shown(hullOfCaptain(captain)),
      side: factionSide(captain.faction),
      number: captain.id,
    }));
    return [player, ...captains];
  }

  /** Every ship in the fight by its number, as its feel sees it: each with its rig, made for the hull it sails. */
  private feelShips(answer: FightView = this.last): Map<number, FeelShip> {
    return new Map(
      this.vessels(answer).map(({ vessel, hull, side, number }) => {
        let rigged = this.rigs.get(number);
        if (!rigged || rigged.hull !== hull) {
          rigged = { hull, rig: new SailRig(hullSails(hull)) };
          this.rigs.set(number, rigged);
        }
        return [number, { vessel, rig: rigged.rig, hull, side }];
      }),
    );
  }

  /** Each ship afloat where it is drawn, `scale` times its size, by its number: settling as it goes down. */
  private placed(time: number, scale: number) {
    return [...this.feelShips().entries()].flatMap(([number, ship]) => {
      if (!FightFeel.afloat(ship, time)) return [];
      const [x = 0, y = 0, heading = 0] = ship.vessel.ship;
      const [heave = 0, pitch = 0, roll = 0] = ship.vessel.pose;
      const place = { x, y, z: heave, heading, pitch, roll, scale };
      return [{ ship, place, number }];
    });
  }

  /** Every ship drawn `scale` times its size, each in its hull and its side's colours, with its sails as its rung
   *  sets them and the fight's harm on it; each captain's with its people aboard as the fight leaves them, but the one
   *  whose deck the player stands on (`boarded`, its number), whose crew there is the fight on foot's. */
  ships(seconds: number, time: number, windBearing: number, scale: number, boarded: number | null = null): DrawnShip[] {
    this.scale = scale;
    const captains = new Map(this.captains.map((captain) => [captain.id, captain]));
    return this.placed(time, scale).map(({ ship, place, number }) => {
      const [, , heading = 0, ahead = 0, , , , rung = 0] = ship.vessel.ship;
      const wind = { offDeg: windOff(heading, windBearing), set: rung === SAILS_RUNG, way: ahead };
      ship.rig?.step(seconds, wind, time);
      const captain = number === boarded ? undefined : captains.get(number);
      const crew = captain && number > 0 ? { crew: captainInFight(`fight-${number}`, captain) } : {};
      // A ship running from the fight puts her lanterns out.
      const look = number === 0 ? this.ownLook : { side: ship.side, dark: captains.get(number)?.mode === 'flee' };
      return { hull: ship.hull, place, rig: ship.rig, look, ...crew };
    });
  }

  /** The pushes on the water the fight's splashes owe since last taken, world metres. */
  stirs(): Stir[] {
    const stirred = this.stirred;
    this.stirred = [];
    return stirred;
  }

  /** Each ship's footprint on the water, at its hull's waterline drawn `scale` times its size, while it floats: the
   *  player's first, then the captains nearest it, so the water's budget never leaves the player's out; each in its
   *  hull's own line from `lines`. */
  hulls(scale: number, lines: Pick<HullLines, 'line'> = HULL_LINES): HullMask[] {
    const [own, ...captains] = this.vessels().map(({ vessel, hull, number }) => {
      const [x = 0, y = 0, heading = 0, ahead = 0, abeam = 0] = vessel.ship;
      const way = Math.hypot(ahead, abeam) > 0.5 ? UNDER_WAY : 0;
      const waterline = hullWaterline(hull);
      const [halfLength, halfBeam] = [(waterline.lengthM / 2) * scale, (waterline.beamM / 2) * scale];
      const afloat = vessel.state !== 'sunk' && vessel.state !== 'sinking';
      const id = number === 0 ? 'own' : `captain ${number}`;
      return { mask: { id, x, y, heading, halfLength, halfBeam, way, scale, line: lines.line(hull) }, afloat };
    });
    if (!own) return [];
    const away = ({ mask }: { mask: HullMask }) => Math.hypot(mask.x - own.mask.x, mask.y - own.mask.y);
    return [own, ...captains.sort((one, other) => away(one) - away(other))]
      .filter(({ afloat }) => afloat)
      .map(({ mask }) => mask);
  }

  /** The balls aloft, the lay's arcs and the effects, from a camera in world metres, in the sun's shadows when a map
   *  is given; what floats rides the swell the water draws. */
  draw(pass: GPURenderPassEncoder, camera: ShipCamera, now: number, shadow?: ShadowMap): void {
    const eye = [camera.eye[0] - this.window.leftM, camera.eye[1] - this.window.topM, camera.eye[2]] as const;
    const scarred = this.placed(now, this.scale).map(({ ship, place }) => ({
      ship,
      place: { ...place, x: place.x - this.window.leftM, y: place.y - this.window.topM },
    }));
    const swell = this.swell;
    const water = swell
      ? (x: number, y: number) =>
          swellHeight(swell, x + this.window.leftM, y + this.window.topM, this.waterTime, Infinity)
      : undefined;
    const windowCamera = { fromEye: camera.fromEye, eye };
    this.drawnFrom = { eye, now };
    this.naval.draw(pass, this.window, 1, windowCamera, now, this.scale, scarred, {
      water,
      shadow,
    });
    const cues = this.naval.takeCues();
    this.shake.take(cues, now);
    playCues(worldOutput(), cues, eye, this.orbit.yaw);
  }

  /** The fight's lights (its flashes, fires and blasts) as the last frame drew them, as lamps in world metres. */
  lamps(): readonly LampPlace[] {
    return this.fightLamps.lampsOf(this.marks.lights ?? [], this.window);
  }

  /** The puffs' light on what stands round them, into the light layer's pass. */
  lightInto(pass: GPURenderPassEncoder): void {
    this.marks.drawLight?.(pass);
  }

  /** The fight's see-through puffs, then the lay's aim, over the finished picture `target`, after the water, hidden
   *  where the scene's `depth` stands nearer; the aim from where the frame's ships were drawn (`draw`). */
  overWater(encoder: GPUCommandEncoder, target: GPUTextureView, fromEye: Float32Array, depth: GPUTexture): void {
    this.marks.drawOver?.(encoder, target, depth);
    if (!this.drawnFrom) return;
    const camera = { fromEye, eye: this.drawnFrom.eye };
    this.naval.drawAimOver(encoder, target, depth, this.window, 1, camera, this.drawnFrom.now);
  }

  /** Each captain's bar over its hull's masthead, in world metres, the ship drawn `scale` times its size, while it
   *  floats. */
  bars(scale: number): ShipBar[] {
    // Each keeps its own plate by its number in the fight, as its events name it, which a ship gone from it leaves
    // to no other: plates sharing a key would share one plate's place and losses.
    const bar = (captain: FightCaptain) =>
      barOver(
        { ...captain, maxHull: captain.max_hull },
        { leftM: 0, topM: 0 },
        scale,
        plateOverM(this.shown(hullOfCaptain(captain))),
      );
    return this.captains.map(bar).filter((shown) => shown !== null);
  }

  /** The fight's readout at `now`: its plate and its abilities' bar with their keys as bound, the card on the nearest
   *  captain, E to board one struck alongside, and its last volley's tally; none once the fight is over. */
  display(now: number): SeaFightModel | null {
    const keys = { boardKey: boundWord('use'), braceKey: boundCap('brace'), keys: shipKeys() };
    return this.naval.display(now, { boardable: this.room.mayBoard, ...keys });
  }

  /** The fight's messages standing at `now`, DFO's toasts. */
  messages(now: number): string[] {
    return this.naval.messages(now);
  }

  /** What the fight's task counts at `now`: its ship as the fight last left it, DFO's messages, and how many captains
   *  are still afloat. */
  readout(now: number): FightReadout {
    return readoutOf(this.last, this.naval.messages(now));
  }
}
