// The way between two places on an island played while the room gone to is joined, never the veil: through a passage
// zone's mouth, a lamp's Home, or a crossing gate between two patrol zones. Its rails are passageWay.ts's; this keeps
// the way under way, its clock and the flow's `passing`: the character walks into the mouth taken before the room is
// left, and once the room gone to has stood the body and the place is drawn whole unseen under the island, the way
// comes down to it in the place's own frame and the character walks in, the camera handed over to the foot's.
import type { Shot } from '../camera.ts';
import { type Flow, type Happening, next, READY_WAIT_S } from '../flow.ts';
import type { Foot } from '../foot.ts';
import type { NodeInfo } from '../worldData.ts';
import type { Point2, Vec3 } from '../../overworld/ground.ts';
import { IDLE, type InputFrame } from '../../player/input.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { wayDotsNode } from './passagePanels.ts';
import { LEAVE_S, settledShot, type Way, type WayAsk, type WayFrame, wayAt, wayClock, wayOf } from './passageWay.ts';

/** How long the way waits over the island for the place gone to to be joined, seconds: a join that has not settled
 *  by then (a room that never answers, or never opens) fails back as a trip's failure does. Past the passage room's
 *  own wait to hear it took the player (`passageEnter.ts`) and the welcome's (`roomConnection.ts`). */
export const JOIN_WAIT_S = 40;

/** How near the mouth taken the leave walks the body, metres, before the camera rises. */
const MOUTH_NEAR_M = 0.6;

/** The walk the way steps the body by: forward along the way it faces, nothing else pressed. */
const FORWARD: InputFrame = { ...IDLE, held: (action) => action === 'forward' };

/** What the way asks of the game. */
export interface WayHost {
  readonly flow: () => Flow;
  setFlow(flow: Flow): void;
  /** Whether the place gone to has come: set false as the way begins and true once its room is joined. */
  setReady(ready: boolean): void;
  readonly foot: () => Foot | null;
  /** The player's body as the walker stands it, and the bearing it faces. */
  readonly player: () => { readonly body: { x: number; y: number; z: number }; readonly facing: number };
  /** Turns the player's body and view to `facing`, clockwise from north, for the way to walk them. */
  face(facing: number): void;
  /** Asked as a way sets out, while the player still stands where they were: what a failure of the way to `place`
   *  does, the player taken back (to `back`, else where they stood) or to the hub and told why, as a trip is. */
  readonly fallback: (place: string, back?: NodeInfo) => (error: unknown) => void;
}

/** A way to play: what happens (`onward`, `home` or `cross`), the way come on the island (the places passed, the place
 *  left last) and the place gone to, every place to frame, where the frame the player stands in now stands in the
 *  world (none: the world's own), the place gone to by name and where a failed way goes back to (none: where the
 *  player stands), the mouth taken in the frame the player stands in (none: no walk into one), and whether the
 *  place gone to is open to the sky (false under ground). */
export interface WayPlayed {
  readonly happening: Extract<Happening, { kind: 'onward' | 'home' | 'cross' }>;
  readonly come: readonly Point2[];
  readonly to: Point2;
  readonly framed: readonly Point2[];
  readonly left?: Point2;
  readonly place: string;
  readonly back?: NodeInfo;
  readonly mouth?: Point2;
  readonly open?: boolean;
}

/** A way under way: what it plays and the work that joins the place gone to, what its failure does, how long the
 *  leave has walked, its rails once the leave is over (none before), its clock and frame, whether it has come down to
 *  the body the room stood (`landed`), whether the place has come (`come`: once, so a later frame not drawn whole
 *  never stops the way part down), how long it has waited since the room was joined, how long the join has taken,
 *  and whether the body walks. */
interface Playing {
  readonly played: WayPlayed;
  readonly work: () => Promise<void>;
  readonly failed: (error: unknown) => void;
  leaving: number;
  way: Way | null;
  seconds: number;
  frame: WayFrame | null;
  landed: boolean;
  come: boolean;
  waited: number;
  joining: number;
  walking: boolean;
}

export class WayBetween {
  private readonly host: WayHost;
  private way: Playing | null = null;
  /** The foot's camera as it last stood, which a way rises from. */
  private lastShot: Shot | null = null;

  constructor(host: WayHost) {
    this.host = host;
  }

  /** The way under way while the flow passes; one left by another road (its room shut, the player sent to their
   *  ship) is over. */
  private current() {
    if (this.host.flow().mode !== 'passing') this.way = null;
    return this.way;
  }

  /** Plays `played`: the walk into its mouth, then over the island while `work` joins the place gone to; nothing
   *  unless the flow passes. */
  play(played: WayPlayed, work: () => Promise<void>): void {
    const after = next(this.host.flow(), played.happening);
    if (after === this.host.flow() || after.mode !== 'passing') return;
    const failed = this.host.fallback(played.place, played.back);
    const start = { leaving: 0, way: null, seconds: 0, frame: null, landed: false, come: false, waited: 0, joining: 0 };
    this.way = { played, work, failed, ...start, walking: false };
    this.host.setFlow(after);
    this.host.setReady(false);
    document.exitPointerLock();
  }

  /** Whether the leave still walks the body into the mouth, turned to it; once it has reached it, or walked its
   *  time, the room may be left. */
  private leaves(playing: Playing, seconds: number): boolean {
    const { mouth } = playing.played;
    playing.leaving += seconds;
    if (!mouth || playing.leaving > LEAVE_S) return false;
    const { body } = this.host.player();
    const [east, south] = [mouth[0] - body.x, mouth[1] - body.y];
    if (Math.hypot(east, south) < MOUTH_NEAR_M) return false;
    this.host.face(Math.atan2(east, -south));
    return true;
  }

  /** The leave over: the way's rails laid from where the foot's camera stood, and the room gone to joined. A way
   *  ended by another road meanwhile (its room shut, the player sent to their ship) neither readies nor fails. */
  private setOut(playing: Playing): void {
    const { played } = playing;
    playing.way = wayOf({
      from: this.risenFrom(played.left ?? [0, 0]),
      come: played.come,
      to: played.to,
      framed: played.framed,
      arrive: { at: [0, 0, 0], facing: 0 },
      open: played.open ?? true,
      viewport: { width: innerWidth, height: innerHeight },
    });
    playing.work().then(
      () => void (this.current() === playing && this.host.setReady(true)),
      (error: unknown) => {
        if (this.current() !== playing) return;
        this.way = null;
        playing.failed(error);
      },
    );
  }

  /** Where the way rises from: the foot's camera as it last stood, in the world (`left`, where the frame stood in it),
   *  or behind the body with none yet. */
  private risenFrom([east, south]: Point2): WayAsk['from'] {
    const shot = this.lastShot;
    if (!shot) {
      const { body } = this.host.player();
      const [x, y, z] = [body.x + east, body.y + south, body.z];
      return { eye: [x, y - 4, z + 2.2], look: [x, y, z + 1.4], fov: 1.1 };
    }
    const eye: Vec3 = [shot.eye[0] + east, shot.eye[1] + south, shot.eye[2]];
    const across = Math.cos(shot.pitch);
    const look: Vec3 = [
      eye[0] + Math.sin(shot.yaw) * across,
      eye[1] - Math.cos(shot.yaw) * across,
      eye[2] - Math.sin(shot.pitch),
    ];
    return { eye, look, fov: shot.fov };
  }

  /** Across a crossing gate from the patrol zone at `from` to the one at `to`, framed on the two, both in the world's
   *  own frame, while `work` joins the far zone's room; false for any other happening, which is not a way's. */
  cross(happening: Happening, from: Point2, to: Point2, work: () => Promise<void>): boolean {
    if (happening.kind !== 'cross') return false;
    this.play({ happening, come: [from], to, framed: [from, to], place: happening.name }, work);
    return true;
  }

  /** One frame of the way, `seconds` long: the camera's shot over the island, `place` while the place is drawn as on
   *  foot with the camera `shot` gives (the leave, and from the way down), or null once it has played and the place
   *  has come (`ready`, and `whole`: the last frames drew it whole), when the flow goes on foot. */
  passing(seconds: number, ready: boolean, whole: boolean): Shot | 'place' | null {
    const playing = this.current();
    if (!playing) return null;
    if (!playing.way) {
      playing.walking = this.leaves(playing, seconds);
      if (playing.walking) return 'place';
      this.setOut(playing);
    }
    if (!ready) playing.joining += seconds;
    if (playing.joining > JOIN_WAIT_S) {
      this.way = null;
      playing.failed(new Error(`${playing.played.place} did not answer`));
      return null;
    }
    // The place has come once its room has stood the body, the way laid to where it stands, and the place has been
    // drawn whole under the island. A room that never stands it, or a place never drawn whole, is waited on as the
    // veil waits, and the way comes down where the walker stands.
    if (ready) playing.waited += seconds;
    const own = this.host.foot()?.fight.own;
    const late = playing.waited > READY_WAIT_S;
    const body = own ?? (late ? this.host.player().body : null);
    if (ready && body && !playing.landed && playing.way) {
      if (!own) console.warn(`The way came down after ${READY_WAIT_S} s, its room not having stood the body.`);
      const { facing } = this.host.player();
      playing.way = wayOf({ ...playing.way.ask, arrive: { at: [body.x, body.y, body.z], facing } });
      playing.landed = true;
      this.host.face(facing);
    }
    playing.come ||= playing.landed && (whole || late);
    const { come } = playing;
    playing.seconds = wayClock(playing.seconds, seconds, come);
    const frame = playing.way && wayAt(playing.way, playing.seconds);
    if (!frame) return null;
    [playing.frame, playing.walking] = [frame, frame.walking];
    if (frame.beat === 'done' && come) {
      this.way = null;
      this.host.setFlow(next(this.host.flow(), { kind: 'loaded' }));
      return null;
    }
    return frame.inPlace ? 'place' : { ...frame.shot, near: 0.5, far: 60_000 };
  }

  /** Whether the way has come down to the body the room gone to stood, so the place is drawn, unseen under the island
   *  until the way comes down to it. */
  landed(): boolean {
    return !!this.current()?.landed;
  }

  /** The walk the way steps the body by this frame, into the mouth or in from the way in; null while it stands. */
  walk(): InputFrame | null {
    return this.current()?.walking ? FORWARD : null;
  }

  /** The foot's camera while the way comes down in the place's own frame, settling into `own`; `own` itself
   *  otherwise. The shot is kept, for the next way to rise from. */
  shot(own: Shot): Shot {
    const frame = this.current()?.frame;
    this.lastShot = frame?.inPlace ? { ...own, ...settledShot(frame.shot, own, frame.settled) } : own;
    return this.lastShot;
  }

  /** The way's dots over the island while it is framed there; null with no way. */
  dots(ui: Interface): Node | null {
    const playing = this.current();
    return playing?.frame && playing.way ? wayDotsNode(playing.frame, ui.size, playing.way.ask.framed) : null;
  }
}
