// The islands the intro flies over, opened one at a time in the land's worker while the camera passes through cloud,
// and drawn in place of the one before; at the end Saltmere comes back as the game opened it, its drawers kept.
import type { LandDrawers } from '../landDrawers.ts';
import type { Landmass } from '../landmass.ts';
import type { GameScene } from '../scene.ts';
import type { TerrainData } from '../../terrain/terrainView.ts';

export interface IslandParts {
  /** Opens a continent in the land's worker, which then holds it for every ground query after. */
  readonly open: (id: string) => Promise<Landmass>;
  readonly scene: Pick<GameScene, 'setLand'>;
  readonly drawersOn: (landmass: Landmass) => LandDrawers;
  readonly terrainFor: (landmass: Landmass) => TerrainData;
  /** Saltmere as the game opened it, with its drawers: never let go here. */
  readonly home: { readonly landmass: Landmass; readonly drawers: LandDrawers };
}

export class Islands {
  private readonly parts: IslandParts;
  private shown: { landmass: Landmass; drawers: LandDrawers; own: boolean };
  private opening: Promise<Landmass> | null = null;
  /** The worker's openings, one after another: an opening's steps (the land, then its city) must not interleave with
   *  another's, and the last asked must be the one the worker holds. */
  private turns: Promise<unknown> = Promise.resolve();
  /** The continent the worker holds once its openings have run, or null while one is under way or failed. */
  private held: string | null;
  /** Counts the asks (an island, or Saltmere): an island is drawn only if nothing was asked after it. */
  private asked = 0;

  constructor(parts: IslandParts) {
    this.parts = parts;
    this.shown = { ...parts.home, own: false };
    this.held = parts.home.landmass.id;
  }

  get landmass(): Landmass {
    return this.shown.landmass;
  }

  get drawers(): LandDrawers {
    return this.shown.drawers;
  }

  /** `work` on the worker, once the openings asked before it have run, failed or not. */
  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const run = this.turns.then(work);
    this.turns = run.catch(() => undefined);
    return run;
  }

  private async openNow(id: string): Promise<Landmass> {
    this.held = null;
    const opened = await this.parts.open(id);
    this.held = id;
    return opened;
  }

  /** Starts opening a continent in the worker; the one shown stays drawn meanwhile. */
  open(id: string): Promise<Landmass> {
    this.asked += 1;
    this.opening = this.inTurn(() => this.openNow(id));
    return this.opening;
  }

  /** Draws the continent last opened in place of the one shown, unless something was asked for since. */
  async show(): Promise<Landmass | null> {
    const asked = this.asked;
    const opened = this.opening ? await this.opening.catch(() => null) : null;
    if (!opened || asked !== this.asked) return null;
    this.swap({ landmass: opened, drawers: this.parts.drawersOn(opened), own: true });
    return opened;
  }

  /** Saltmere back, drawn with the game's own drawers, and open in the worker again for the ground round the player;
   *  it rejects if the worker cannot open it, Saltmere drawn all the same. */
  async home(): Promise<void> {
    this.asked += 1;
    const { home } = this.parts;
    const { id } = home.landmass;
    try {
      await this.inTurn(async () => {
        if (this.held !== id) await this.openNow(id);
      });
    } finally {
      // Saltmere is drawn again even when the worker cannot open it, so no island the flight passed stays drawn.
      if (this.shown.landmass !== home.landmass) this.swap({ ...home, own: false });
    }
  }

  private swap(next: { landmass: Landmass; drawers: LandDrawers; own: boolean }): void {
    if (this.shown.own) this.shown.drawers.release();
    this.shown = next;
    this.parts.scene.setLand(next.landmass.view, this.parts.terrainFor(next.landmass));
  }
}
