import { HULL_NAMES, type HullName, SLOOP_HULL } from '../ships/hulls.ts';
import { Sailing, type SailSource } from './sailing.ts';

/** The hull the editor's address asks it to sail (`?hull=brig`), by its number; the Sloop unless it names one. */
export function askedHull(search: string): number {
  const asked = new URLSearchParams(search).get('hull')?.toLowerCase() ?? '';
  return Math.max(SLOOP_HULL, HULL_NAMES.indexOf(asked as HullName));
}

/** The comings and goings of the World Editor's ship of `hull`: its model fetched once, the rules asked once to put
 *  it to sea, and both forgotten when it is brought in. `View` is what its model becomes once fetched. */
export class Harbour<View> {
  private readonly load: () => Promise<View>;
  private readonly hull: number;
  private readonly fail: (error: unknown) => void;
  private model: View | null = null;
  /** Its model is being fetched, or failed: a failed one is fetched again only once it is brought in. */
  private fetching: 'no' | 'fetching' | 'failed' = 'no';
  private afloat: Sailing | null = null;
  /** The rules are asked to put it to sea, or refused: no more is asked until it is brought in. */
  private asked: 'no' | 'asking' | 'refused' = 'no';
  /** Each Sail's own number: an answer for one since brought in is dropped. */
  private voyage = 0;

  constructor(load: () => Promise<View>, fail: (error: unknown) => void, hull = SLOOP_HULL) {
    this.load = load;
    this.fail = fail;
    this.hull = hull;
  }

  get sailing(): Sailing | null {
    return this.afloat;
  }

  get view(): View | null {
    return this.model;
  }

  /** Each frame Sail is on: fetches its model and puts it to sea at world (x, y), each once. Answers whether it
   *  may sail: false once the rules have refused it. */
  board(source: SailSource | null, id: string, x: number, y: number, heading: number, time: number): boolean {
    this.fetchModel();
    if (!this.afloat && source && this.asked === 'no') {
      this.asked = 'asking';
      const voyage = this.voyage;
      Sailing.putToSea(source, id, x, y, heading, time, this.hull)
        .then((answer) => {
          if (voyage !== this.voyage) return;
          if (typeof answer !== 'string') [this.afloat, this.asked] = [answer, 'no'];
          else {
            this.asked = 'refused';
            this.fail(new Error(answer));
          }
        })
        .catch((error: unknown) => {
          if (voyage !== this.voyage) return;
          this.asked = 'refused';
          this.fail(error);
        });
    }
    return this.asked !== 'refused';
  }

  /** Fetches its model, once, for a Sloop sailed elsewhere (a fleet room's) to be drawn by. */
  fetchModel(): void {
    if (this.model || this.fetching !== 'no') return;
    this.fetching = 'fetching';
    this.load()
      .then((model) => {
        this.model = model;
        this.fetching = 'no';
      })
      .catch((error: unknown) => {
        this.fetching = 'failed';
        this.fail(error);
      });
  }

  /** Brings it in: the next Sail puts it to sea afresh, and fetches again a model that failed. */
  leave(): void {
    [this.afloat, this.asked] = [null, 'no'];
    this.voyage++;
    if (this.fetching === 'failed') this.fetching = 'no';
  }
}
