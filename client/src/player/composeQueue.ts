/** How soon a frame is wanted: shown now, next in a move just shown, or composed ahead of need. */
export type Haste = 'now' | 'ahead' | 'later';
const ORDER: Readonly<Record<Haste, number>> = { now: 0, ahead: 1, later: 2 };

/**
 * The order a worker composes its frames in. Each waits for its strips without holding up any other; of those whose
 * strips have come, the most wanted goes first, one a turn, so a frame asked for or hurried meanwhile goes ahead of
 * every frame still waiting. Composing is what the frames contend for, so it is ordered there and nowhere else.
 */
export class ComposeQueue {
  private readonly wanted = new Map<number, Haste>();
  private readonly ready: { readonly id: number; readonly run: () => void }[] = [];
  private turning = false;
  private readonly turn: (next: () => void) => void;

  /** `turn` runs its callback once, after whatever else waits to run (a message come in meanwhile). */
  constructor(turn: (next: () => void) => void) {
    this.turn = turn;
  }

  /** Frame `id`, wanted with `haste`, to `run` once its strips have `arrived`, or failed to, which it then says. */
  add(id: number, haste: Haste, arrived: Promise<unknown>, run: () => void): void {
    this.wanted.set(id, haste);
    const queue = () => {
      this.ready.push({ id, run });
      this.schedule();
    };
    arrived.then(queue, queue);
  }

  /** A frame not composed yet that is now shown. */
  hurry(id: number): void {
    if (this.wanted.has(id)) this.wanted.set(id, 'now');
  }

  private schedule(): void {
    if (this.turning || this.ready.length === 0) return;
    this.turning = true;
    this.turn(() => {
      this.turning = false;
      this.next();
      this.schedule();
    });
  }

  private next(): void {
    const order = (index: number) => ORDER[this.wanted.get(this.ready[index]?.id ?? -1) ?? 'later'];
    let best = 0;
    for (let index = 1; index < this.ready.length; index++) if (order(index) < order(best)) best = index;
    const [chosen] = this.ready.splice(best, 1);
    if (!chosen) return;
    this.wanted.delete(chosen.id);
    chosen.run();
  }
}
