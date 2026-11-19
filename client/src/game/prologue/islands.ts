// The islands the intro flies over, opened one at a time in the land's worker while the camera passes through cloud,
// and drawn in place of the one before; at the end Saltmere comes back as the game opened it, its drawers kept.
import type { LandWorker } from '../../terrain/landClient.ts';
import type { LandDrawers } from '../landDrawers.ts';
import { type Landmass, openLandmass } from '../landmass.ts';
import type { GameScene } from '../scene.ts';
import type { TerrainData } from '../../terrain/terrainView.ts';
import type { WorldData } from '../worldData.ts';

export interface IslandParts {
  readonly land: LandWorker;
  readonly world: WorldData;
  readonly rmbText: string | null;
  readonly scene: GameScene;
  readonly drawersOn: (landmass: Landmass) => LandDrawers;
  readonly terrainFor: (landmass: Landmass) => TerrainData;
  /** Saltmere as the game opened it, with its drawers: never let go here. */
  readonly home: { readonly landmass: Landmass; readonly drawers: LandDrawers };
}

export class Islands {
  private readonly parts: IslandParts;
  private shown: { landmass: Landmass; drawers: LandDrawers; own: boolean };
  private opening: Promise<Landmass> | null = null;
  /** Whether the worker holds Saltmere, as the game's later ground queries need. */
  private workerHome = true;

  constructor(parts: IslandParts) {
    this.parts = parts;
    this.shown = { ...parts.home, own: false };
  }

  get landmass(): Landmass {
    return this.shown.landmass;
  }

  get drawers(): LandDrawers {
    return this.shown.drawers;
  }

  /** Starts opening a continent in the worker; the one shown stays drawn meanwhile. */
  open(id: string): Promise<Landmass> {
    const { land, world, rmbText } = this.parts;
    this.workerHome = false;
    this.opening = openLandmass(land, world, rmbText, id);
    return this.opening;
  }

  /** Whether the continent last asked for has opened. */
  async ready(): Promise<Landmass | null> {
    return this.opening ? await this.opening.catch(() => null) : null;
  }

  /** Draws the continent last opened in place of the one shown. */
  async show(): Promise<Landmass | null> {
    const opened = await this.ready();
    if (!opened) return null;
    this.swap({ landmass: opened, drawers: this.parts.drawersOn(opened), own: true });
    return opened;
  }

  /** Saltmere back, drawn with the game's own drawers, and open in the worker again for the ground round the player. */
  async home(): Promise<void> {
    const { home } = this.parts;
    if (!this.workerHome) {
      await openLandmass(this.parts.land, this.parts.world, this.parts.rmbText, home.landmass.id);
      this.workerHome = true;
    }
    if (this.shown.landmass !== home.landmass) this.swap({ ...home, own: false });
  }

  private swap(next: { landmass: Landmass; drawers: LandDrawers; own: boolean }): void {
    if (this.shown.own) this.shown.drawers.release();
    this.shown = next;
    this.parts.scene.setLand(next.landmass.view, this.parts.terrainFor(next.landmass));
  }
}
