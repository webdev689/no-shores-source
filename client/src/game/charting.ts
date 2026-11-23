// The sea's charting: once a second while the ship sails, the continent whose coast it nears is opened in the land's
// worker, one at a time; a continent that will not open is not tried again this visit. Farther out, the continent it
// sails toward is warmed first: its files fetched into the browser's storage, so its opening reads them from the disk.
import type { Point2 } from '../overworld/ground.ts';
import { CHART_REACH_M, continentToOpen } from './seaLaw.ts';

/** How often the sea looks for a nearer continent to open, seconds. */
const CHART_EVERY_S = 1;
/** How far off a coast its continent is warmed: twice as far as it is opened. */
export const WARM_REACH_M = CHART_REACH_M * 2;

type Continents = Parameters<typeof continentToOpen>[1];

export class Charting<Opened> {
  private readonly continents: Continents;
  private readonly open: (id: string) => Promise<Opened>;
  private readonly opened: (landmass: Opened) => void;
  private opening: string | null = null;
  private since = 0;
  private readonly refused = new Set<string>();
  private readonly warmed = new Set<string>();
  private readonly warm: (id: string) => void;

  /** `open` opens a continent by its id; `opened` takes it once open, to draw it in place of the one left; `warm`
   *  fetches a continent's files ahead, once a visit, as the ship comes within WARM_REACH_M of its coast. */
  constructor(
    continents: Continents,
    open: (id: string) => Promise<Opened>,
    opened: (landmass: Opened) => void,
    warm: (id: string) => void = () => undefined,
  ) {
    this.continents = continents;
    this.open = open;
    this.opened = opened;
    this.warm = warm;
  }

  /** Whether a continent is being opened now. */
  get busy(): boolean {
    return this.opening !== null;
  }

  /** Whether a continent near `position` is still to open, `openId` open: a travel's arrival waits on it. */
  waiting(position: Point2, openId: string): boolean {
    const other = continentToOpen(position, this.continents, openId);
    return this.busy || (other !== null && !this.refused.has(other));
  }

  /** `seconds` more on the sea's view with the ship at `position` and `openId` open; charts only while `sailing`. */
  tick(position: Point2, openId: string, seconds: number, sailing: boolean): void {
    this.since += seconds;
    if (this.opening || !sailing || this.since < CHART_EVERY_S) return;
    this.since = 0;
    const toward = continentToOpen(position, this.continents, openId, WARM_REACH_M);
    if (toward && !this.warmed.has(toward)) {
      this.warmed.add(toward);
      this.warm(toward);
    }
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
