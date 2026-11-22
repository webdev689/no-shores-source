// The ship seen sailing away to other waters, and arriving there
// ([[The Held Map Takes the Ship to Other Waters, Seen Sailing Away]]): the camera leaves the helm on a rail out to a
// three-quarter view behind and above the ship as it gets under way; holds as the ship sails off while the picture
// fades to black, the travel asked as the fade begins; waits black while the room moves the ship and the page loads
// the new waters round it; lifts on a low wide shot off its bow quarter that pans round to its stern; and hands the
// view back. Every rail is eased (rail.ts), and the picture is never cut but at black.
import { around, lookAt, type Point3, type RailKey, type RailShot, railShot, smooth } from './rail.ts';

/** Each step's seconds: the rail out, the fade, the least the black waits, the arrival, the lift of the black within
 *  it, the way back to the usual view, and the last of the fade the veil's words stand in (the veil's own fade,
 *  hud.ts `VEIL_S`). */
export const SAIL_AWAY = {
  outS: 3,
  fadeS: 2,
  blackLeastS: 1.5,
  arriveS: 4,
  liftS: 1.5,
  backS: 1.5,
  wordsS: 0.7,
} as const;

export type SailAwayStep = 'out' | 'fade' | 'black' | 'arrive' | 'back' | 'done';

/** Where a ship lies: world metres, x east and y south, its heading clockwise from north. */
interface Lies {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** A camera's shot as the sea hands one in and takes one back: its eye, bearing, drop and lens. */
type Seen = Pick<RailShot, 'yaw' | 'pitch' | 'fov'> & { readonly eye: Point3 };

/** The ship's middle a little over the water, which the camera looks at, in the ship's own frame (it heads north). */
const SHIP: Point3 = [0, 0, 3];

/** The rail out, in the ship's own frame: from the helm (its key added as it leaves) to its aft starboard quarter. */
const OUT_END: RailKey = { at: SAIL_AWAY.outS, eye: around([0, 0, 0], (3 * Math.PI) / 4, 70, 28), look: SHIP };
/** The arrival's rail, in the ship's own frame: low and wide off its bow quarter, round to a view from its stern. */
const ARRIVAL: readonly RailKey[] = [
  { at: 0, eye: around([0, 0, 0], Math.PI / 4, 110, 5), look: SHIP },
  { at: SAIL_AWAY.arriveS / 2, eye: around([0, 0, 0], (5 * Math.PI) / 8, 85, 9), look: SHIP },
  { at: SAIL_AWAY.arriveS, eye: around([0, 0, 0], Math.PI, 60, 16), look: [0, -30, 4] },
];

/** A point in the ship's frame (`lies`) carried into the world, and a world point into the ship's frame. */
function toWorld(lies: Lies, [x, y, z]: Point3): Point3 {
  const [sin, cos] = [Math.sin(lies.heading), Math.cos(lies.heading)];
  return [lies.x + x * cos - y * sin, lies.y + x * sin + y * cos, z];
}
function toShip(lies: Lies, [x, y, z]: Point3): Point3 {
  const [east, south, sin, cos] = [x - lies.x, y - lies.y, Math.sin(lies.heading), Math.cos(lies.heading)];
  return [east * cos + south * sin, -east * sin + south * cos, z];
}

/** A rail's shot in the ship's frame carried into the world. */
function shipShot(lies: Lies, keys: readonly RailKey[], time: number, fov: number): RailShot {
  const shot = railShot(keys, time, fov);
  return { ...shot, eye: [...toWorld(lies, shot.eye)], yaw: shot.yaw + lies.heading };
}

export class SailAway {
  step: SailAwayStep = 'out';
  /** Seconds into the step. */
  private time = 0;
  /** The rail out's first key, the helm's eye in the ship's frame, taken as it leaves; and the eye held over the
   *  fade, in the world. */
  private fromHelm: RailKey | null = null;
  private held: RailShot | null = null;
  private last: RailShot | null = null;
  /** Whether the room has answered the travel, and why it refused it (null taken). */
  answered = false;
  refused: string | null = null;
  readonly words: string;
  private readonly ask: () => void;

  /** Sails away for the water named `water`, `ask` asking the room for the travel as the fade begins. */
  constructor(water: string, ask: () => void) {
    this.words = `Sailing for ${water}`;
    this.ask = ask;
  }

  /** The room's answer to the travel: taken (null), or why it refused it. */
  answer(refused: string | null): void {
    [this.answered, this.refused] = [true, refused];
  }

  /** `seconds` on, `ready` whether the new waters round the ship have loaded. */
  advance(seconds: number, ready: boolean): void {
    this.time += seconds;
    for (;;) {
      const over = this.time - this.length(ready);
      if (over < 0 || this.step === 'done') return;
      // The black waited on the room and the waters past its least: none of that wait is carried on.
      this.time = this.step === 'black' ? Math.min(over, seconds) : over;
      this.step = this.next();
      if (this.step === 'fade') this.ask();
    }
  }

  /** The step's length; the black's until the room has answered and the waters are ready. */
  private length(ready: boolean): number {
    if (this.step === 'black') return this.answered && (ready || this.refused) ? SAIL_AWAY.blackLeastS : Infinity;
    const lengths = { out: SAIL_AWAY.outS, fade: SAIL_AWAY.fadeS, arrive: SAIL_AWAY.arriveS, back: SAIL_AWAY.backS };
    return this.step === 'done' ? Infinity : lengths[this.step];
  }

  private next(): SailAwayStep {
    const order: Record<SailAwayStep, SailAwayStep> = {
      out: 'fade',
      fade: 'black',
      black: this.refused === null ? 'arrive' : 'back',
      arrive: 'back',
      back: 'done',
      done: 'done',
    };
    return order[this.step];
  }

  /** How dark the picture is: 0 open, 1 black. */
  get dark(): number {
    const { step, time } = this;
    if (step === 'fade') return smooth(time / SAIL_AWAY.fadeS);
    if (step === 'black') return 1;
    if (step === 'arrive') return 1 - smooth(time / SAIL_AWAY.liftS);
    return step === 'back' && this.refused !== null ? 1 - smooth(time / SAIL_AWAY.backS) : 0;
  }

  /** The veil's words while the picture is black or nearly: where the ship sails for. */
  get veil(): string | null {
    const black = this.step === 'black' || (this.step === 'fade' && this.time >= SAIL_AWAY.fadeS - SAIL_AWAY.wordsS);
    return black ? this.words : null;
  }

  /** Whether the player has the ship again. */
  get control(): boolean {
    return this.step === 'done';
  }

  /** The camera's shot now, the ship lying at `lies`, `helm` the helm's shot it leaves from; and how much of the
   *  picture is the shot, 1 all, 0 the usual view. */
  shot(lies: Lies, helm: Seen): { readonly near: Seen; readonly share: number } {
    const { step, time } = this;
    const look: Point3 = [
      helm.eye[0] + Math.sin(helm.yaw) * Math.cos(helm.pitch) * 50,
      helm.eye[1] - Math.cos(helm.yaw) * Math.cos(helm.pitch) * 50,
      helm.eye[2] - Math.sin(helm.pitch) * 50,
    ];
    this.fromHelm ??= { at: 0, eye: toShip(lies, helm.eye), look: toShip(lies, look) };
    if (step === 'out') this.last = shipShot(lies, [this.fromHelm, OUT_END], time, helm.fov);
    else if (step === 'fade' || (step === 'black' && this.refused === null && !this.answered)) {
      // The eye holds where the rail left it, the ship sailing off from it.
      this.held ??= this.last ?? shipShot(lies, [OUT_END], 0, helm.fov);
      const ship = toWorld(lies, SHIP);
      this.last = { ...this.held, ...lookAt(this.held.eye, ship) };
    } else if (step === 'arrive' || (step === 'black' && this.refused === null)) {
      this.last = shipShot(lies, ARRIVAL, step === 'arrive' ? time : 0, helm.fov);
    } else if (step === 'back' && this.refused === null) {
      this.last = shipShot(lies, ARRIVAL, SAIL_AWAY.arriveS, helm.fov);
      return { near: this.last, share: 1 - smooth(time / SAIL_AWAY.backS) };
    }
    const shown = this.last ?? helm;
    return { near: shown, share: step === 'done' || (step === 'back' && this.refused !== null) ? 0 : 1 };
  }
}
