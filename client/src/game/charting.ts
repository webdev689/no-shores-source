// The sea's charting: once a second while the ship sails, the continent whose coast she nears is opened in the land's
// worker, one at a time; a continent that will not open is not tried again this visit.
import type { Point2 } from '../overworld/ground.ts';
import { continentToOpen } from './seaLaw.ts';

/** How often the sea looks for a nearer continent to open, seconds. */
const CHART_EVERY_S = 1;

type Continents = Parameters<typeof continentToOpen>[1];

export class Charting<Opened> {
  private readonly continents: Continents;
  private readonly open: (id: string) => Promise<Opened>;
  private readonly opened: (landmass: Opened) => void;
  private opening: string | null = null;
  private since = 0;
  private readonly refused = new Set<string>();

  /** `open` opens a continent by its id; `opened` takes it once open, to draw it in place of the one left. */
  constructor(continents: Continents, open: (id: string) => Promise<Opened>, opened: (landmass: Opened) => void) {
    this.continents = continents;
    this.open = open;
    this.opened = opened;
  }

  /** Whether a continent is being opened now. */
  get busy(): boolean {
    return this.opening !== null;
  }

  /** `seconds` more on the sea's view with the ship at `position` and `openId` open; charts only while `sailing`. */
  tick(position: Point2, openId: string, seconds: number, sailing: boolean): void {
    this.since += seconds;
    if (this.opening || !sailing || this.since < CHART_EVERY_S) return;
    this.since = 0;
    const other = continentToOpen(position, this.continents, openId);
    if (!other || this.refused.has(other)) return;
    this.opening = other;
    this.open(other)
      .then(this.opened)
      .catch((error: unknown) => {
        this.refused.add(other);
        console.error(`${other} could not be opened:`, error);
      })
      .finally(() => {
        this.opening = null;
      });
  }
}
