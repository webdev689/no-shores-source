// The way between two places on an island played while the room gone to is joined, never the veil: through a passage
// zone's mouth, a lamp's Home, or a crossing gate between two patrol zones. Its rails are passageWay.ts's; this keeps
// the way under way, its clock and the flow's `passing`, and once the room has stood the body it comes down to it
// in the place's own frame, so the camera hands over to the foot's where it stands.
import type { Shot } from '../camera.ts';
import { type Flow, type Happening, next, READY_WAIT_S } from '../flow.ts';
import type { Foot } from '../foot.ts';
import type { Point2, Vec3 } from '../../overworld/ground.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { wayDotsNode } from './passagePanels.ts';
import { settledShot, type Way, type WayAsk, type WayFrame, wayAt, wayClock, wayOf } from './passageWay.ts';

/** What the way asks of the game. */
export interface WayHost {
  readonly flow: () => Flow;
  setFlow(flow: Flow): void;
  /** Whether the place gone to has come: set false as the way begins and true once its room is joined. */
  setReady(ready: boolean): void;
  readonly foot: () => Foot | null;
  /** The player's body as the walker stands it, and the bearing it faces. */
  readonly player: () => { readonly body: { x: number; y: number; z: number }; readonly facing: number };
  /** A way that fails: the player goes back to their ship, told why. */
  readonly failed: (why: string) => void;
}

/** A way to play: what happens (`onward`, `home` or `cross`), the way come on the island (the places passed, the place
 *  left last) and the place gone to, every place to frame, where the frame the player stands in now stands in the
 *  world (none: the world's own), and where the frame of the place gone to stands (none: the world's own). */
export interface WayPlayed {
  readonly happening: Extract<Happening, { kind: 'onward' | 'home' | 'cross' }>;
  readonly come: readonly Point2[];
  readonly to: Point2;
  readonly framed: readonly Point2[];
  readonly left?: Point2;
  readonly origin?: readonly [number, number, number];
}

export class WayBetween {
  private readonly host: WayHost;
  /** The way under way, which comes down to the body the room stood once its first snapshot has come (`landed`), and
   *  how long it has waited on that body since the room was joined. */
  private way: { way: Way; seconds: number; frame: WayFrame | null; landed: boolean; waited: number } | null = null;
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

  /** Plays `played` over the island while `work` joins the place gone to; nothing unless the flow passes. */
  play(played: WayPlayed, work: () => Promise<void>): void {
    const after = next(this.host.flow(), played.happening);
    if (after === this.host.flow() || after.mode !== 'passing') return;
    const way = wayOf({
      from: this.risenFrom(played.left ?? [0, 0]),
      come: played.come,
      to: played.to,
      framed: played.framed,
      arrive: { at: [0, 0, 0], facing: 0 },
      viewport: { width: innerWidth, height: innerHeight },
      origin: played.origin,
    });
    this.way = { way, seconds: 0, frame: null, landed: false, waited: 0 };
    this.host.setFlow(after);
    this.host.setReady(false);
    document.exitPointerLock();
    work().then(
      () => this.host.setReady(true),
      (error: unknown) => {
        this.way = null;
        this.host.failed(error instanceof Error ? error.message : String(error));
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
    this.play({ happening, come: [from], to, framed: [from, to] }, work);
    return true;
  }

  /** One frame of the way, `seconds` long: the camera's shot over the island, `place` from the way down (drawn as
   *  the place on foot, `shot`), or null once it has played and the place has come (`ready`), when the flow goes on
   *  foot. */
  passing(seconds: number, ready: boolean): Shot | 'place' | null {
    const playing = this.current();
    if (!playing) return null;
    // The place has come once its room has stood the body: the walk in starts where the room put it. A room that
    // never stands it is waited on as the veil waits, and the walk in starts where the walker stands.
    if (ready && !playing.landed) playing.waited += seconds;
    const own = this.host.foot()?.fight.own;
    const late = playing.waited > READY_WAIT_S;
    const body = own ?? (late ? this.host.player().body : null);
    const come = ready && !!body;
    if (come && body && !playing.landed) {
      if (!own) console.warn(`The way came down after ${READY_WAIT_S} s, its room not having stood the body.`);
      const { facing } = this.host.player();
      playing.way = wayOf({ ...playing.way.ask, arrive: { at: [body.x, body.y, body.z], facing } });
      playing.landed = true;
    }
    playing.seconds = wayClock(playing.seconds, seconds, come);
    const frame = wayAt(playing.way, playing.seconds);
    playing.frame = frame;
    if (frame.beat === 'done' && come) {
      this.way = null;
      this.host.setFlow(next(this.host.flow(), { kind: 'loaded' }));
      return null;
    }
    return frame.inPlace ? 'place' : { ...frame.shot, near: 0.5, far: 60_000 };
  }

  /** The foot's camera while the way comes down in the place's own frame, settling into `own` as the character walks
   *  in; `own` itself otherwise. The shot is kept, for the next way to rise from. */
  shot(own: Shot): Shot {
    const frame = this.current()?.frame;
    this.lastShot = frame?.inPlace ? { ...own, ...settledShot(frame.shot, own, frame.walked) } : own;
    return this.lastShot;
  }

  /** The way's dots over the island while it is framed there; null with no way. */
  dots(ui: Interface): Node | null {
    const playing = this.current();
    return playing?.frame ? wayDotsNode(playing.frame, ui.size, playing.way.ask.framed) : null;
  }
}
