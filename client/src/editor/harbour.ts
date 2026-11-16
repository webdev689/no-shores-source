import { Sailing, type SailSource } from './sailing.ts';

/** The Sloop's comings and goings in the World Editor: her model fetched once, the rules asked once to put her to
 *  sea, and both forgotten when she is brought in. `View` is what her model becomes once fetched. */
export class Harbour<View> {
  private readonly load: () => Promise<View>;
  private readonly fail: (error: unknown) => void;
  private model: View | null = null;
  /** Her model is being fetched, or failed: a failed one is fetched again only once she is brought in. */
  private fetching: 'no' | 'fetching' | 'failed' = 'no';
  private afloat: Sailing | null = null;
  /** The rules are asked to put her to sea, or refused: no more is asked until she is brought in. */
  private asked: 'no' | 'asking' | 'refused' = 'no';

  constructor(load: () => Promise<View>, fail: (error: unknown) => void) {
    this.load = load;
    this.fail = fail;
  }

  get sailing(): Sailing | null {
    return this.afloat;
  }

  get view(): View | null {
    return this.model;
  }

  /** Each frame Sail is on: fetches her model and puts her to sea at world (x, y), each once. Answers whether she
   *  may sail: false once the rules have refused her. */
  board(source: SailSource | null, id: string, x: number, y: number, heading: number, time: number): boolean {
    if (!this.model && this.fetching === 'no') {
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
    if (!this.afloat && source && this.asked === 'no') {
      this.asked = 'asking';
      Sailing.putToSea(source, id, x, y, heading, time)
        .then((answer) => {
          if (this.asked !== 'asking') return;
          if (typeof answer !== 'string') [this.afloat, this.asked] = [answer, 'no'];
          else {
            this.asked = 'refused';
            this.fail(new Error(answer));
          }
        })
        .catch((error: unknown) => {
          this.asked = 'refused';
          this.fail(error);
        });
    }
    return this.asked !== 'refused';
  }

  /** Brings her in: the next Sail puts her to sea afresh, and fetches again a model that failed. */
  leave(): void {
    [this.afloat, this.asked] = [null, 'no'];
    if (this.fetching === 'failed') this.fetching = 'no';
  }
}
