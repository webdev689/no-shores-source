/** A place in the world: east, south and up, in metres. */
export type Place = readonly [number, number, number];

/** Past this many ticks between the draw clock and its place (a pause, or a figure seen again), the clock jumps there. */
const RESET_TICKS = 12;
/** The share of that gap the clock closes each tick, so it keeps the frames' pace and drifts onto the snapshots'. */
const EASE = 0.03;
/** The snapshots kept, newest last: enough to draw between however far behind the newest the clock runs. */
const KEPT = 8;

/**
 * A figure the room moves a snapshot at a time, drawn between its snapshots along a clock that runs at the frames' pace
 * a snapshot's span and a tick behind the newest. A frame that takes no new snapshot, or two, still moves the figure on
 * by its own pace, where drawing at the newest would stop it for a frame and lurch it on the next. A snapshot come late
 * leaves it at the newest until the next, and the clock eases back into place.
 */
export class Glide {
  private readonly snapshots: { readonly tick: number; readonly place: Place }[];
  private clock: number;

  constructor(place: Place, tick: number) {
    this.snapshots = [{ tick, place }];
    this.clock = tick;
  }

  /** Where to draw the figure now, `ticks` (a share of them, as a frame lasts) after the last frame: `to` its place at
   *  room tick `tick`. */
  follow(to: Place, tick: number, ticks: number): Place {
    const newest = this.snapshots.at(-1) ?? { tick, place: to };
    if (tick > newest.tick) {
      this.snapshots.push({ tick, place: to });
      if (this.snapshots.length > KEPT) this.snapshots.shift();
    }
    const last = this.snapshots.at(-1)?.tick ?? tick;
    const span = last - (this.snapshots.at(-2)?.tick ?? last - 1);
    const wanted = last - span - 1;
    this.clock += ticks;
    const gap = wanted - this.clock;
    this.clock = Math.abs(gap) > RESET_TICKS ? wanted : this.clock + gap * Math.min(1, EASE * ticks);
    // Never past the newest: a figure waiting on a late snapshot resumes from where it stands, not with a jump.
    this.clock = Math.min(this.clock, last);
    return this.placeAt(this.clock);
  }

  /** The place at room tick `tick`, between the snapshots either side of it; the first's before them all. */
  private placeAt(tick: number): Place {
    const after = this.snapshots.findIndex((snapshot) => snapshot.tick >= tick);
    const later = this.snapshots[after === -1 ? this.snapshots.length - 1 : after];
    const earlier = this.snapshots[after - 1];
    if (!later) return [0, 0, 0];
    if (!earlier) return later.place;
    const share = (tick - earlier.tick) / (later.tick - earlier.tick);
    const [fromX, fromY, fromZ] = earlier.place;
    const [toX, toY, toZ] = later.place;
    return [fromX + (toX - fromX) * share, fromY + (toY - fromY) * share, fromZ + (toZ - fromZ) * share];
  }
}

/** A glide for each figure, by a number, made where each is first seen and let go once it is gone. */
export class Glides {
  private readonly kept = new Map<number, Glide>();

  /** Where to draw figure `id` now, as `Glide.follow` answers. */
  follow(id: number, to: Place, tick: number, ticks: number): Place {
    const glide = this.kept.get(id) ?? new Glide(to, tick);
    this.kept.set(id, glide);
    return glide.follow(to, tick, ticks);
  }

  /** Lets go every glide whose figure is not in `present`. */
  keep(present: ReadonlySet<number>): void {
    for (const id of this.kept.keys()) if (!present.has(id)) this.kept.delete(id);
  }
}
