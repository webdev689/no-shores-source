// The way between two places on an island played while the room gone to is joined, never the veil: through a passage
// zone's mouth, a lamp's Home, or a crossing gate between two patrol zones. Its rails are passageWay.ts's; this keeps
// the way under way, its clock and the flow's `passing`, and once the room has stood the body it comes down to it
// in the place's own frame, so the camera hands over to the foot's where it stands.
import type { Shot } from '../camera.ts';
import { type Flow, type Happening, next } from '../flow.ts';
import type { Foot } from '../foot.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { wayDotsNode } from './passagePanels.ts';
import { settledShot, type Way, type WayFrame, wayAt, wayClock, wayOf } from './passageWay.ts';

type Point2 = readonly [number, number];

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

/** A way to play: what happens (`onward`, `home` or `cross`), the place left and the place gone to on the island,
 *  every place to frame, where the frame the player stands in now stands in the world (none: the world's own), and
 *  where the frame of the place gone to stands (none: the world's own). */
export interface WayPlayed {
  readonly happening: Extract<Happening, { kind: 'onward' | 'home' | 'cross' }>;
  readonly from: Point2;
  readonly to: Point2;
  readonly framed: readonly Point2[];
  readonly left?: Point2;
  readonly origin?: readonly [number, number, number];
}

export class WayBetween {
  private readonly host: WayHost;
  /** The way under way, which comes down to the body the room stood once its first snapshot has come (`landed`). */
  private way: { way: Way; seconds: number; frame: WayFrame | null; landed: boolean } | null = null;

  constructor(host: WayHost) {
    this.host = host;
  }

  /** Plays `played` over the island while `work` joins the place gone to; nothing unless the flow passes. */
  play(played: WayPlayed, work: () => Promise<void>): void {
    const after = next(this.host.flow(), played.happening);
    if (after === this.host.flow() || after.mode !== 'passing') return;
    const { body } = this.host.player();
    const [east, south] = played.left ?? [0, 0];
    const eye = { x: body.x + east, y: body.y + south, z: body.z };
    const way = wayOf({
      from: { eye: [eye.x, eye.y - 4, eye.z + 2.2], look: [eye.x, eye.y, eye.z + 1.4], fov: 1.1 },
      come: [played.from],
      to: played.to,
      framed: played.framed,
      arrive: { at: [0, 0, 0], facing: 0 },
      viewport: { width: innerWidth, height: innerHeight },
      origin: played.origin,
    });
    this.way = { way, seconds: 0, frame: null, landed: false };
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

  /** Across a crossing gate from the patrol zone at `from` to the one at `to`, framed on the two, both in the world's
   *  own frame, while `work` joins the far zone's room; false for any other happening, which is not a way's. */
  cross(happening: Happening, from: Point2, to: Point2, work: () => Promise<void>): boolean {
    if (happening.kind !== 'cross') return false;
    this.play({ happening, from, to, framed: [from, to] }, work);
    return true;
  }

  /** One frame of the way, `seconds` long: the camera's shot over the island, `place` from the way down (drawn as
   *  the place on foot, `shot`), or null once it has played and the place has come (`ready`), when the flow goes on
   *  foot. */
  passing(seconds: number, ready: boolean): Shot | 'place' | null {
    const playing = this.way;
    if (!playing) return null;
    // The place has come once its room has stood the body: the walk in starts where the room put it.
    const body = this.host.foot()?.fight.own;
    const come = ready && !!body;
    if (come && body && !playing.landed) {
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
   *  in; `own` itself otherwise. */
  shot(own: Shot): Shot {
    // A way left by another road (its room shut, the player sent to their ship) is over.
    if (this.host.flow().mode !== 'passing') this.way = null;
    const frame = this.way?.frame;
    return frame?.inPlace ? { ...own, ...settledShot(frame.shot, own, frame.walked) } : own;
  }

  /** The way's dots over the island while it is framed there; null with no way. */
  dots(ui: Interface): Node | null {
    const playing = this.way;
    return playing?.frame ? wayDotsNode(playing.frame, ui.size, playing.way.ask.framed) : null;
  }
}
