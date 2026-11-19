// Every hull's model on the GPU, fetched from R2 the first time a ship of that hull is drawn and kept, and a frame's
// ships drawn by them: each in her own hull, her side's colours and her rig, a slot of her model each.
import type { Gpu } from '../gpu.ts';
import type { ShipLook } from './dress.ts';
import { type HullName, hullName, hullPaint, hullSails } from './hulls.ts';
import type { SailRig } from './sails.ts';
import { loadShip } from './shipMesh.ts';
import { type ShipCamera, type ShipPlace, SHIP_SLOTS, ShipView } from './shipView.ts';

/** A ship as a frame draws her: her hull's number, her place, her rig (none for no canvas or flag) and her look. */
export interface DrawnShip {
  readonly hull: number;
  readonly place: ShipPlace;
  readonly rig: SailRig | null;
  readonly look: ShipLook;
}

/** The hulls' models, each fetched once, by hull number. */
export class ShipModels {
  private readonly gpu: Gpu;
  private readonly slots: number;
  private readonly fetched = new Map<HullName, Promise<ShipView>>();
  private readonly ready = new Map<HullName, ShipView>();
  private readonly fail: (error: unknown) => void;

  constructor(gpu: Gpu, slots = SHIP_SLOTS, fail: (error: unknown) => void = console.error) {
    [this.gpu, this.slots, this.fail] = [gpu, slots, fail];
  }

  /** A hull's model once it has come; asking for it first fetches it. */
  model(hull: number): ShipView | null {
    void this.load(hull);
    return this.ready.get(hullName(hull)) ?? null;
  }

  /** A hull's model, fetched once (a number with no model of its own is the Sloop's): a fetch that fails is said
   *  once, and not tried again. */
  load(hull: number): Promise<ShipView> {
    const name = hullName(hull);
    let fetching = this.fetched.get(name);
    if (!fetching) {
      fetching = loadShip(name).then((mesh) => {
        const view = new ShipView(this.gpu, mesh, hullSails(hull), this.slots, hullPaint(hull));
        this.ready.set(name, view);
        return view;
      });
      fetching.catch(this.fail);
      this.fetched.set(name, fetching);
    }
    return fetching;
  }

  /** Draws a frame's ships, each by her hull's model once it has come, the ships of one hull in its slots in turn. */
  draw(pass: GPURenderPassEncoder, ships: readonly DrawnShip[], camera: ShipCamera): void {
    const used = new Map<HullName, number>();
    for (const ship of ships) {
      const model = this.model(ship.hull);
      if (!model) continue;
      const name = hullName(ship.hull);
      const slot = used.get(name) ?? 0;
      used.set(name, slot + 1);
      model.drawInto(pass, ship.place, camera, slot, ship.look, ship.rig);
    }
  }
}
