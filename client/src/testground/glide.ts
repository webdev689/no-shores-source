/** A place in the world: east, south and up, in metres. */
export type Place = readonly [number, number, number];

/**
 * A figure the room moves a snapshot at a time, drawn gliding between its places: each new place starts a glide from
 * where the figure is drawn to it, over the room ticks between it and the place before. A snapshot come late leaves
 * the figure at the last place until the next; one come early starts from wherever it is drawn. Either way it never
 * jumps, and it moves on every frame however many frames a tick has.
 */
export class Glide {
  private from: Place;
  private to: Place;
  private tick: number;
  private span = 1;
  private age = 0;

  constructor(place: Place, tick: number) {
    this.from = place;
    this.to = place;
    this.tick = tick;
  }

  /** Where to draw the figure now, `ticks` (a share of them, as a frame lasts) after the last frame: `to` its place at
   *  room tick `tick`. */
  follow(to: Place, tick: number, ticks: number): Place {
    if (tick > this.tick) {
      this.from = this.now;
      this.to = to;
      this.span = tick - this.tick;
      this.tick = tick;
      this.age = 0;
    }
    this.age += ticks;
    return this.now;
  }

  private get now(): Place {
    const share = Math.min(1, this.age / this.span);
    const [fromX, fromY, fromZ] = this.from;
    const [toX, toY, toZ] = this.to;
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
