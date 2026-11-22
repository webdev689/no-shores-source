// A brush stroke on the open landmass as it is drawn: a dab where it starts, then one every quarter of the brush's
// radius along the drag, each sent to the land's worker, and the stroke finished as the press ends.
import type { Brush } from '../rules/landRules.ts';
import type { CellRect } from './landMask.ts';
import type { LandSession } from './landSession.ts';

export class LandStroke {
  private stroke: { brush: Brush; last: readonly [number, number] } | null = null;
  private readonly session: () => LandSession | null;
  private readonly selected: () => string;
  private readonly refresh: (rect: CellRect | null) => void;
  private readonly fail: (error: unknown) => void;

  constructor(context: {
    readonly session: () => LandSession | null;
    readonly selected: () => string;
    readonly refresh: (rect: CellRect | null) => void;
    readonly fail: (error: unknown) => void;
  }) {
    ({ session: this.session, selected: this.selected, refresh: this.refresh, fail: this.fail } = context);
  }

  /** Whether a stroke is being drawn. */
  get drawing(): boolean {
    return this.stroke !== null;
  }

  /** Starts a stroke of `brush` at a world point with its first dab. */
  start(brush: Brush, x: number, y: number): void {
    this.stroke = { brush, last: [x, y] };
    this.dabAt(x, y, true);
  }

  /** Dabs along the drag to a world point every quarter of the brush's radius, so a fast stroke leaves no gaps. */
  continue(x: number, y: number): void {
    if (!this.stroke) return;
    const [lastX, lastY] = this.stroke.last;
    const spacing = this.stroke.brush.radius_m / 4;
    const along = Math.hypot(x - lastX, y - lastY);
    const steps = Math.floor(along / spacing);
    for (let step = 1; step <= steps; step++)
      this.dabAt(lastX + ((x - lastX) * step * spacing) / along, lastY + ((y - lastY) * step * spacing) / along, false);
  }

  /** Ends the stroke: the water settles over what it shaped. */
  end(): void {
    const session = this.session();
    if (!this.stroke || !session) return;
    this.stroke = null;
    session
      .finishStroke(this.selected())
      .then(() => this.refresh(null))
      .catch(this.fail);
  }

  /** One dab at a world point; the first of a stroke starts it, and a flatten takes its level there. */
  private dabAt(x: number, y: number, starts: boolean): void {
    const session = this.session();
    if (!session || !this.stroke) return;
    const point = [Math.round(x), Math.round(y)] as const;
    this.stroke = { ...this.stroke, last: point };
    const id = this.selected();
    session
      .dab(id, this.stroke.brush, point, starts)
      .then((patch) => {
        if (id === this.selected()) this.refresh(patch.rect);
      })
      .catch((error: unknown) => {
        // A stroke whose first dab is refused must not go on: its next dabs would join the stroke before it.
        if (starts) this.stroke = null;
        this.fail(error);
      });
  }
}
