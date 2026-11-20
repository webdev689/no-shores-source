// The fight at sea: once a pirate meets the player, or they come upon captains fighting each other, the view pans
// down from the raised sea to their Sloop at true scale and the sea room's fight is fought there, by the World
// Editor's own fight (its aim, lay, effects and panel), until every captain sinks or is gone; then it pans back up.
import { type FightInput, type FightSource, Fighting } from '../editor/fighting.ts';
import { type MarkDrawer, Naval, type Window } from '../editor/naval.ts';
import { cameraOf, type Orbit } from '../editor/orbit.ts';
import { SAILS_RUNG } from '../editor/sailing.ts';
import { FIELD_OF_VIEW, smooth01 } from '../overworld/overworldCamera.ts';
import type { FightCaptain, FightVessel, FightView } from '../rules/fightRules.ts';
import type { Pose, ShipFloats } from '../rules/landRules.ts';
import { SailRig, type SailCorners, windOff } from '../ships/sails.ts';
import { barOver, type ShipBar } from '../ships/shipBars.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import type { Lying } from '../ships/deck.ts';
import type { ShipCamera, ShipPlace } from '../ships/shipView.ts';
import type { Sailed } from '../terrain/landClient.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { FightHeard } from './audio/ambience/seaFight.ts';
import type { Shot } from './camera.ts';
import { type FightReadout, readoutOf } from './seaPanel.ts';
import type { SeaRoom } from './seaRoom.ts';
import { gearScreenOpen } from './gearScreen.ts';

/** Seconds the view takes to come down to the fight, or go back up. */
const PAN_S = 1.5;
/** The fight's camera: the World Editor's while sailing, its distance behind her and pitch below the horizon, looking
 *  at a point this far over her waterline. */
const ORBIT = { distance: 75, pitch: 0.3, lookOverM: 6 } as const;
/** How fast a drag turns the camera, radians a pixel, and how far up and down it may look. */
const DRAG_TURN = 0.005;
const PITCH = [0.05, 1.2] as const;
/** The captain's Sloop is drawn darker, as in the World Editor. */
const CAPTAIN_SHADE = 0.55;
/** The way a ship's foam shows round her bow, m/s: a Sloop's whole. */
const UNDER_WAY = 2;

/** The player's Sloop as the fight steers her: where it last left her. */
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
  private readonly naval: Naval;
  private readonly fought = new Fought();
  private readonly sails: readonly SailCorners[];
  /** Each Sloop's rig, the player's first, one more as each other captain comes into the fight. */
  private readonly rigs: SailRig[] = [];
  /** The world point the fight is drawn from, where it began: marks lie near it, so float32 holds them exactly. */
  private readonly window: Window;
  private last: FightView;
  /** Her ship's kind, as the HUD names her. */
  private readonly own: string;
  private orbit: { yaw: number; pitch: number };
  private readonly held = new Set<string>();
  private readonly presses: string[] = [];
  private aiming = false;
  private fire = false;
  private loadSteps = 0;
  /** How far down the view has come, 0 the sea's to 1 the fight's, and which way it goes. */
  private down = 0;
  private going: 1 | -1 = 1;

  /** The fight `source` steps (the sea room's, or the land worker's door), its first view `first`; `own` names her
   *  ship's kind on the panel. */
  constructor(
    source: FightSource,
    first: FightView,
    marks: MarkDrawer,
    sails: readonly SailCorners[],
    now: number,
    own?: string,
  ) {
    this.naval = new Naval(marks);
    this.naval.join(Fighting.joined(source, 'sea', first, now, own));
    this.own = own ?? 'Sloop';
    this.last = first;
    const [x = 0, y = 0, heading = 0] = first.player.ship;
    this.window = { leftM: Math.round(x), topM: Math.round(y) };
    this.orbit = { yaw: heading, pitch: ORBIT.pitch };
    this.sails = sails;
  }

  /** Whether the view has come back up after the fight: the sea takes over. */
  get done(): boolean {
    return this.going === -1 && this.down === 0;
  }

  /** The fight's events this frame and its ships as they lie, for the sea's sounds. */
  get heard(): FightHeard {
    return { events: this.naval.heard, view: this.last };
  }

  /** Where the fight left the player's Sloop, and her heading. */
  get lying(): { readonly x: number; readonly y: number; readonly heading: number } {
    const [x = 0, y = 0, heading = 0] = this.last.player.ship;
    return { x, y, heading };
  }

  /** A key down or up; answers whether the fight takes it: the helm's (A, D, Shift), a rung (W, S), the brace (C),
   *  and every other key but the menu's, so the sea's own (the map, a voyage, the pace) wait for the fight's end. */
  key(key: string, down: boolean): boolean {
    if (key === 'm') return false;
    if (!['a', 'd', 'w', 's', 'c', 'shift', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key))
      return true;
    if (down) {
      if (!this.held.has(key) && ['w', 's', 'arrowup', 'arrowdown'].includes(key)) this.presses.push(key);
      this.held.add(key);
    } else this.held.delete(key);
    return true;
  }

  /** A drag of the view, in pixels: it turns the camera round her, or the aim's look. */
  drag(right: number, down: number): void {
    this.orbit = {
      yaw: this.orbit.yaw + right * DRAG_TURN,
      pitch: Math.min(PITCH[1], Math.max(PITCH[0], this.orbit.pitch + down * DRAG_TURN)),
    };
  }

  /** The right button held aims; let go, the lay held fires. A left click while aiming holds fire. */
  aim(held: boolean): void {
    if (this.aiming && !held) this.fire = true;
    this.aiming = held;
  }

  holdFire(): void {
    this.aiming = false;
  }

  /** Whether the right button holds the aim. */
  get aimingNow(): boolean {
    return this.aiming;
  }

  /** The wheel steps the load. */
  wheel(steps: number): void {
    this.loadSteps += Math.sign(steps);
  }

  private orbitAt(): Orbit {
    const [x = 0, y = 0] = this.last.player.ship;
    const [heave = 0] = this.last.player.pose;
    const target = { targetX: x - this.window.leftM, targetY: y - this.window.topM, targetZ: heave + ORBIT.lookOverM };
    return { ...target, ...this.orbit, distance: ORBIT.distance };
  }

  /** One frame of the fight, `seconds` on at `time`: it steps, and answers the fight's own view, drawing to `far`,
   *  which the view pans down to from the sea's by `share`. */
  frame(seconds: number, time: number, far: number, fail: (error: unknown) => void): Shot {
    const orbit = this.orbitAt();
    const look = this.aiming ? this.naval.look(orbit, this.fought, this.window) : null;
    const input: FightInput = {
      held: this.held,
      press: this.presses.shift(),
      look,
      fire: this.fire,
      loadSteps: this.loadSteps,
    };
    [this.fire, this.loadSteps] = [false, 0];
    this.naval.step(seconds, input, time, this.fought, this.window, fail);
    this.last = this.naval.view ?? this.last;
    if (!this.naval.fighting) this.going = -1;
    this.down = Math.min(1, Math.max(0, this.down + (this.going * seconds) / PAN_S));
    const camera = cameraOf(this.aiming ? this.naval.aimCamera(orbit, this.fought, this.window, 1) : orbit);
    return {
      eye: [camera.eye[0] + this.window.leftM, camera.eye[1] + this.window.topM, camera.eye[2]],
      yaw: this.orbit.yaw,
      pitch: this.orbit.pitch,
      fov: FIELD_OF_VIEW,
      near: 0.3,
      far,
    };
  }

  /** How far the view has come down to the fight's, eased: 0 the sea's, 1 the fight's. */
  get share(): number {
    return smooth01(this.down);
  }

  /** The player's Sloop as she lies in the fight, drawn `scale` times her size, while she floats; null once she has
   *  sunk. */
  ownAt(scale: number): Lying | null {
    const vessel = this.last.player;
    if (vessel.state === 'sunk') return null;
    const [x = 0, y = 0, heading = 0] = vessel.ship;
    const [heave = 0, pitch = 0, roll = 0] = vessel.pose;
    return { x, y, heading, scale, heave, pitch, roll };
  }

  /** The player's Sloop as the fight last showed her: her hurts and her state. */
  get vessel(): FightVessel {
    return this.last.player;
  }

  /** Every captain in the fight: hers, then any other. */
  get captains(): readonly FightCaptain[] {
    return [this.last.captain, ...(this.last.others ?? [])];
  }

  /** Every Sloop drawn `scale` times her size, the captains' darker, each with her sails as her rung sets them. */
  ships(
    seconds: number,
    time: number,
    windBearing: number,
    scale: number,
  ): { place: ShipPlace; rig: SailRig; shade: number }[] {
    const all = [this.last.player, ...this.captains];
    while (this.rigs.length < all.length) this.rigs.push(new SailRig(this.sails));
    return all.flatMap((vessel, index) => {
      const rig = this.rigs[index];
      if (!rig || vessel.state === 'sunk') return [];
      const [x = 0, y = 0, heading = 0, , , , , rung = 0] = vessel.ship;
      const [heave = 0, pitch = 0, roll = 0] = vessel.pose;
      rig.step(seconds, { offDeg: windOff(heading, windBearing), set: rung === SAILS_RUNG }, time);
      return [{ place: { x, y, z: heave, heading, pitch, roll, scale }, rig, shade: index === 0 ? 1 : CAPTAIN_SHADE }];
    });
  }

  /** Each Sloop's footprint on the water, drawn `scale` times her size. */
  hulls(waterline: Waterline, scale: number): HullMask[] {
    return [this.last.player, ...this.captains]
      .filter((vessel) => vessel.state !== 'sunk' && vessel.state !== 'sinking')
      .map((vessel) => {
        const [x = 0, y = 0, heading = 0, ahead = 0, abeam = 0] = vessel.ship;
        const way = Math.hypot(ahead, abeam) > 0.5 ? UNDER_WAY : 0;
        const [halfLength, halfBeam] = [(waterline.lengthM / 2) * scale, (waterline.beamM / 2) * scale];
        return { x, y, heading, halfLength, halfBeam, way };
      });
  }

  /** The balls aloft, the lay's arcs and the effects, from a camera in world metres. */
  draw(pass: GPURenderPassEncoder, camera: ShipCamera, now: number): void {
    const eye = [camera.eye[0] - this.window.leftM, camera.eye[1] - this.window.topM, camera.eye[2]] as const;
    this.naval.draw(pass, this.window, 1, { fromEye: camera.fromEye, eye }, null, now, null);
  }

  /** Each captain's bar over her masthead, in world metres, her drawn `scale` times her size, while she floats. */
  bars(scale: number): ShipBar[] {
    // Each keeps her own plate by her number in the fight (the captain 1, each other after her), as its events name
    // her: plates sharing one key would share one plate's place and losses, the last ship's drawn over the rest.
    const bar = (captain: FightCaptain, index: number) =>
      barOver({ ...captain, id: index + 1, maxHull: captain.max_hull }, { leftM: 0, topM: 0 }, scale);
    return this.captains.map(bar).filter((shown) => shown !== null);
  }

  /** What the HUD shows of the fight at `now`: her ship as the fight last left her, DFO's messages, and how many
   *  captains are still afloat. */
  readout(now: number): FightReadout {
    return readoutOf(this.last, this.own, this.naval.said(now));
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
      combat.wheel(event.deltaY);
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
