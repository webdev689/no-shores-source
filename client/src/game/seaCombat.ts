// The fight at sea: once a pirate meets the player, or they come upon captains fighting each other, the view pans
// down from the raised sea to their Sloop at true scale, every captain in its own hull and colours, and the sea
// room's fight is fought there, by the World Editor's own fight (its aim, lay, effects and panel), until every
// captain sinks or is gone; then it pans back up.
import { AIM_LOOK_TOP, batterySide, lookBearing, yawInBattery } from '../editor/aim.ts';
import { AimCamera, aimHullOf } from '../editor/aimCamera.ts';
import { type FightInput, type FightSource, Fighting } from '../editor/fighting.ts';
import { type MarkDrawer, Naval, type Window } from '../editor/naval.ts';
import { cameraOf, type Orbit } from '../editor/orbit.ts';
import { SAILS_RUNG } from '../editor/sailing.ts';
import { FIELD_OF_VIEW, smooth01 } from '../overworld/overworldCamera.ts';
import type { SeaFightModel } from '../plus/seaFight.ts';
import type { FightCaptain, FightVessel, FightView } from '../rules/fightRules.ts';
import { type FeelShip, FightFeel } from '../ships/fightFeel.ts';
import { playCues } from '../ships/fightSounds.ts';
import { Shake } from '../ships/shake.ts';
import type { Stir } from '../ships/swellPose.ts';
import type { ShadowMap } from '../shadow.ts';
import { type ShelteredSwell, swellHeight } from '../water/swell.ts';
import type { Pose, ShipFloats } from '../rules/landRules.ts';
import { factionSide } from '../ships/dress.ts';
import { hullOfCaptain, hullSails, hullWaterline, plateOverM, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import type { MarkView } from '../ships/markView.ts';
import { barOver, type ShipBar } from '../ships/shipBars.ts';
import type { Lying } from '../ships/deck.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import type { ShipCamera, ShipPlace } from '../ships/shipView.ts';
import type { Sailed } from '../terrain/landClient.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { FightHeard } from './audio/ambience/seaFight.ts';
import type { Shot } from './camera.ts';
import { type FightReadout, readoutOf } from './seaPanel.ts';
import type { SeaRoom } from './seaRoom.ts';
import { gearScreenOpen } from './gearScreen.ts';
import { worldOutput } from './uiSounds.ts';

/** Seconds the view takes to come down to the fight, or go back up. */
const PAN_S = 1.5;
/** The fight's camera: the World Editor's while sailing, its distance behind it and pitch below the horizon, looking
 *  at a point this far over its waterline. */
const ORBIT = { distance: 75, pitch: 0.3, lookOverM: 6 } as const;
/** How fast a drag turns the camera, radians a pixel, and how far up and down it may look. */
const DRAG_TURN = 0.005;
const PITCH = [0.05, 1.2] as const;
/** The quiet the wheel keeps before it steps the load again, seconds, as DFO's keeps: a trackpad's stream of
 *  small turns steps it once. */
const SHOT_WHEEL_S = 0.18;
/** Out of the aim the wheel zooms the fight's camera, DFO's helm zoom: a notch is this many times nearer or farther,
 *  from DFO's nearest (its foot camera's far end, metres) out to the fight camera's own distance. */
const ZOOM = { ratio: 1.5, nearestM: 11.4 } as const;
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
  };
}

export class SeaCombat {
  /** The sea room, whose last word says whether a boarding would be taken now. */
  private readonly room: Pick<SeaRoom, 'mayBoard'>;
  private readonly naval: Naval;
  private readonly marks: MarkDrawer & Partial<Pick<MarkView, 'drawOver' | 'drawLight'>>;
  /** The hull a ship is drawn as: its own once its model has come. */
  private readonly shown: (hull: number) => number;
  private readonly fought = new Fought();
  /** Each ship's rig, the player's first, one more as each other captain comes into the fight. */
  private readonly rigs = new Map<number, { readonly hull: number; readonly rig: SailRig }>();
  /** The world point the fight is drawn from, where it began: marks lie near it, so float32 holds them exactly. */
  private readonly window: Window;
  private last: FightView;
  /** Her ship's kind, as the HUD names her. */
  private readonly own: string;
  private orbit: { yaw: number; pitch: number };
  private readonly held = new Set<string>();
  private readonly presses: string[] = [];
  private aiming = false;
  /** The side the aim's look has laid on since the aim was taken, or null until it first does: from then until it is
   *  let go, no drag and no turn of the ship under it takes the look out of that battery's arc. */
  private aimSide: 1 | -1 | null = null;
  private fire = false;
  private loadSteps = 0;
  /** When the wheel last turned, seconds, and how far back the fight's camera stands. */
  private wheelAt = -Infinity;
  private distance: number = ORBIT.distance;
  private readonly aimCamera = new AimCamera();
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
   *  source of its own steps (the story's, on the land worker's door, `own` naming the player's ship's kind on the
   *  panel); its first view `first`. */
  constructor(
    fought: SeaRoom | { readonly source: FightSource; readonly own: string },
    first: FightView,
    marks: MarkDrawer & Partial<Pick<MarkView, 'drawOver' | 'drawLight'>>,
    now: number,
    shown: (hull: number) => number = (hull) => hull,
  ) {
    this.shown = shown;
    this.marks = marks;
    const own = 'source' in fought ? fought : null;
    this.room = own ? { mayBoard: false } : (fought as SeaRoom);
    this.naval = new Naval(marks, shown);
    this.naval.shipsOf = (answer) => this.feelShips(answer);
    const source = own?.source ?? roomSource(fought as SeaRoom, first);
    this.naval.join(Fighting.joined(source, 'sea', first, now, own?.own));
    this.own = own?.own ?? 'Sloop';
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

  /** A key down or up; answers whether the fight takes it: the helm's (A, D, Shift), a rung (W, S), the brace (C),
   *  and every other key but the menu's, so the sea's own (the map, a voyage, the pace) wait for the fight's end. */
  key(key: string, down: boolean): boolean {
    // The menu's key, and E for the sea's own asks (to board a captain who struck, to leave its won deck).
    if (key === 'm' || key === 'e') return false;
    if (!['a', 'd', 'w', 's', 'c', 'shift', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key))
      return true;
    if (down) {
      if (!this.held.has(key) && ['w', 's', 'arrowup', 'arrowdown'].includes(key)) this.presses.push(key);
      this.held.add(key);
    } else this.held.delete(key);
    return true;
  }

  /** Lets go of every key the fight holds, as the player goes on foot on a deck and their keys are the foot's. */
  letGo(): void {
    this.held.clear();
  }

  /** A drag of the view, in pixels: it turns the camera round the ship, or the aim's look, which may rise over the
   *  horizon. */
  drag(right: number, down: number): void {
    this.orbit = { yaw: this.orbit.yaw + right * DRAG_TURN, pitch: this.pitched(this.orbit.pitch + down * DRAG_TURN) };
    this.holdAimSide();
  }

  /** A pitch within the aim's clamp while aiming, else the orbit's. */
  private pitched(pitch: number): number {
    return Math.min(PITCH[1], Math.max(this.aiming ? -AIM_LOOK_TOP : PITCH[0], pitch));
  }

  /** While aiming, the look kept on the battery it first laid on; out of the aim, no side is held. */
  private holdAimSide(): void {
    if (!this.aiming) {
      this.aimSide = null;
      return;
    }
    const heading = this.last.player.ship[2] ?? 0;
    this.aimSide ??= batterySide(this.orbit.yaw, heading);
    if (this.aimSide !== null) this.orbit = { ...this.orbit, yaw: yawInBattery(this.orbit.yaw, heading, this.aimSide) };
  }

  /** The right button held aims; let go, the lay held fires. A left click while aiming holds fire. */
  aim(held: boolean): void {
    if (this.aiming && !held) this.fire = true;
    this.aiming = held;
    this.orbit = { ...this.orbit, pitch: this.pitched(this.orbit.pitch) };
    this.holdAimSide();
  }

  holdFire(): void {
    this.aiming = false;
    this.orbit = { ...this.orbit, pitch: this.pitched(this.orbit.pitch) };
    this.holdAimSide();
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

  private orbitAt(): Orbit {
    const [x = 0, y = 0] = this.last.player.ship;
    const [heave = 0] = this.last.player.pose;
    const target = { targetX: x - this.window.leftM, targetY: y - this.window.topM, targetZ: heave + ORBIT.lookOverM };
    return { ...target, ...this.orbit, distance: this.distance };
  }

  /** The eye the fight is drawn from this frame, world metres: the orbit's, eased out to the ship's battery on the side
   *  looked at while aiming (never for a crippled ship, its guns silent), short of every other ship afloat. */
  private eyeAt(orbit: Orbit, seconds: number): readonly [number, number, number] {
    // The orbit's own eye keeps the orbit's clamp, so a look raised over the horizon never takes it under the sea.
    const [eastM, southM, upM] = cameraOf({ ...orbit, pitch: Math.max(PITCH[0], orbit.pitch) }).eye;
    const home = [eastM + this.window.leftM, southM + this.window.topM, upM] as const;
    const { ship, pose, state } = this.last.player;
    const [x = 0, y = 0, heading = 0] = ship;
    const lying = { x, y, heading, heave: pose[0] ?? 0 };
    const want = this.aiming && state === 'afloat' ? (lookBearing(this.orbit.yaw, heading) >= 0 ? 1 : -1) : null;
    const alongside = this.vessels()
      .slice(1)
      .filter(({ vessel }) => vessel.state !== 'sunk')
      .map(({ vessel, hull }) => aimHullOf(vessel.ship, vessel.pose[0] ?? 0, hull));
    return this.aimCamera.eye(home, want, lying, alongside, seconds);
  }

  /** One frame of the fight, `seconds` on at `time`: it steps, and answers the fight's own view, drawing to `far`,
   *  which the view pans down to from the sea's by `share`. */
  frame(seconds: number, time: number, far: number, fail: (error: unknown) => void, swell?: ShelteredSwell): Shot {
    [this.swell, this.waterTime] = [swell, time];
    // Nor does the ship turning under a held aim leave the look outside its battery's arc.
    this.holdAimSide();
    const orbit = this.orbitAt();
    const eye = this.eyeAt(orbit, seconds);
    const look = this.aiming ? this.naval.look(orbit, this.fought, this.window, eye) : null;
    const input: FightInput = {
      held: this.held,
      press: this.presses.shift(),
      look,
      fire: this.fire,
      loadSteps: this.loadSteps,
    };
    [this.fire, this.loadSteps] = [false, 0];
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
    return {
      eye: [eye[0] + jar.east, eye[1] + jar.south, eye[2] + jar.up],
      yaw: this.orbit.yaw + jar.yaw,
      pitch: this.orbit.pitch + jar.pitch,
      fov: FIELD_OF_VIEW,
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

  /** Every ship in the fight with its hull, side and the number its events name it by: the player's Sloop (0), then
   *  each captain's by its own (`FightCaptain.id`). */
  private vessels(answer: FightView = this.last) {
    const player = { vessel: answer.player, hull: SLOOP_HULL, side: 'player' as const, number: 0 };
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

  /** Each ship afloat where it is drawn, `scale` times its size: settling as it goes down. */
  private placed(time: number, scale: number) {
    return [...this.feelShips().values()].flatMap((ship) => {
      if (!FightFeel.afloat(ship, time)) return [];
      const [x = 0, y = 0, heading = 0] = ship.vessel.ship;
      const [heave = 0, pitch = 0, roll = 0] = ship.vessel.pose;
      const place = { x, y, z: heave, heading, pitch, roll, scale };
      return [{ ship, place }];
    });
  }

  /** Every ship drawn `scale` times its size, each in its hull and its side's colours, with its sails as its rung
   *  sets them and the fight's harm on it. */
  ships(seconds: number, time: number, windBearing: number, scale: number): DrawnShip[] {
    this.scale = scale;
    return this.placed(time, scale).map(({ ship, place }) => {
      const [, , heading = 0, ahead = 0, , , , rung = 0] = ship.vessel.ship;
      const wind = { offDeg: windOff(heading, windBearing), set: rung === SAILS_RUNG, way: ahead };
      ship.rig?.step(seconds, wind, time);
      return { hull: ship.hull, place, rig: ship.rig, look: { side: ship.side } };
    });
  }

  /** The pushes on the water the fight's splashes owe since last taken, world metres. */
  stirs(): Stir[] {
    const stirred = this.stirred;
    this.stirred = [];
    return stirred;
  }

  /** Each ship's footprint on the water, at its hull's waterline drawn `scale` times its size, while it floats: the
   *  player's first, then the captains nearest it, so the water's budget never leaves the player's out. */
  hulls(scale: number): HullMask[] {
    const [own, ...captains] = this.vessels().map(({ vessel, hull }) => {
      const [x = 0, y = 0, heading = 0, ahead = 0, abeam = 0] = vessel.ship;
      const way = Math.hypot(ahead, abeam) > 0.5 ? UNDER_WAY : 0;
      const waterline = hullWaterline(hull);
      const [halfLength, halfBeam] = [(waterline.lengthM / 2) * scale, (waterline.beamM / 2) * scale];
      const afloat = vessel.state !== 'sunk' && vessel.state !== 'sinking';
      return { mask: { x, y, heading, halfLength, halfBeam, way, scale }, afloat };
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

  /** The fight's readout at `now`: its plate and rose, the card on the nearest captain, E to board one struck
   *  alongside, and its last volley's tally; none once the fight is over. */
  display(now: number): SeaFightModel | null {
    return this.naval.display(now, { boardable: this.room.mayBoard, boardKey: 'E' });
  }

  /** The fight's messages standing at `now`, DFO's toasts. */
  messages(now: number): string[] {
    return this.naval.messages(now);
  }

  /** What the fight's task counts at `now`: its ship as the fight last left it, DFO's messages, and how many captains
   *  are still afloat. */
  readout(now: number): FightReadout {
    return readoutOf(this.last, this.own, this.naval.messages(now));
  }
}

/** Hands the keys and the pointer to the fight while one is on, ahead of the sea's own controls: the helm's keys, a
 *  drag to look, the right button to aim and fire, a left click to hold fire, the wheel for the load. */
export function fightControls(canvas: HTMLCanvasElement, fight: () => SeaCombat | null): void {
  const taken = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  // A key let go still reaches the sea's own controls, so none is held there once the fight is over.
  const key = (down: boolean) => (event: KeyboardEvent) => {
    // Under the gear screen the fight takes no key pressed, they are the screen's; a key let go is still the fight's,
    // so nothing it held stays held.
    if (down && gearScreenOpen()) return;
    if (!fight()?.key(event.key.toLowerCase(), down)) return;
    if (down) taken(event);
    else event.preventDefault();
  };
  addEventListener('keydown', key(true), { capture: true });
  addEventListener('keyup', key(false), { capture: true });
  let held = false;
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      const combat = fight();
      if (!combat) return;
      taken(event);
      holdPointer(canvas, event.pointerId);
      if (event.button === 2) combat.aim(true);
      else if (combat.aimingNow) combat.holdFire();
      held = true;
    },
    { capture: true },
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const combat = fight();
      if (!combat) return;
      taken(event);
      if (held) combat.drag(event.movementX, event.movementY);
    },
    { capture: true },
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      const combat = fight();
      held = false;
      if (!combat) return;
      taken(event);
      if (event.button === 2) combat.aim(false);
    },
    { capture: true },
  );
  // A pointer let go without its button coming up on the canvas lets the aim go unfired.
  canvas.addEventListener('lostpointercapture', () => {
    held = false;
    const combat = fight();
    if (combat?.aimingNow) combat.holdFire();
  });
  canvas.addEventListener(
    'wheel',
    (event) => {
      const combat = fight();
      if (!combat) return;
      taken(event);
      combat.wheel(event.deltaY, event.timeStamp / 1000);
    },
    { capture: true, passive: false },
  );
  canvas.addEventListener('contextmenu', (event) => {
    if (fight()) event.preventDefault();
  });
}

/** Holds the pointer to the canvas, so its button let go off the canvas still comes up there. A locked pointer is
 *  held already, and the browser refuses to capture it. */
export function holdPointer(canvas: HTMLCanvasElement, pointerId: number): void {
  try {
    canvas.setPointerCapture(pointerId);
  } catch {
    // A locked pointer, or one the browser no longer has: nothing to hold.
  }
}
