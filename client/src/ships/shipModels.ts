// Every hull's model on the GPU, fetched from R2 the first time a ship of that hull is drawn and kept, and a frame's
// ships drawn by them: each in its own hull, its side's colours and its rig, a slot of its model each. A hull still
// coming is drawn as the Sloop, so a ship is never a footprint with nothing over it.
import type { ShadowMap } from '../shadow.ts';
import { sphereSeen, viewPlanes } from '../frustum.ts';
import type { Gpu } from '../gpu.ts';
import type { ShipLook } from './dress.ts';
import { type HullName, hullName, hullPaint, hullSails, SLOOP_HULL } from './hulls.ts';
import type { SailRig } from './sails.ts';
import type { ShipCrew } from './shipCrew.ts';
import { loadShip } from './shipMesh.ts';
import { standIn } from '../standIns.ts';
import { type ShipCamera, type ShipPlace, SHIP_SLOTS, ShipView } from './shipView.ts';

/** A ship as a frame draws it: its hull's number, its place, its rig (none for no canvas or flag) and its look; and
 *  who is seen aboard it, for every ship but the player's own (whose people are drawn as its own). */
export interface DrawnShip {
  readonly hull: number;
  readonly place: ShipPlace;
  readonly rig: SailRig | null;
  readonly look: ShipLook;
  readonly crew?: ShipCrew;
}

/** Opens a hull's model by its number. */
export type OpenHull = (hull: number) => Promise<ShipView>;

/** A hull's model from R2 by its manifest entry, on the device, `slots` ships of it a frame. */
export function openHull(gpu: Gpu, slots = SHIP_SLOTS): OpenHull {
  return async (hull) => ShipView.open(gpu, await loadShip(hullName(hull)), hullSails(hull), hullPaint(hull), slots);
}

/** A failed fetch is tried again from a frame this long after it failed, milliseconds, doubling each time to the
 *  most. */
export const RETRY_MS = { first: 5_000, most: 60_000 } as const;

/** The hulls' models, each fetched once, by hull number. */
export class ShipModels {
  private readonly open: OpenHull;
  private readonly fail: (error: unknown) => void;
  private readonly now: () => number;
  private readonly ready = new Map<HullName, ShipView>();
  private readonly fetching = new Map<HullName, Promise<ShipView>>();
  /** A hull whose fetch failed: when a frame may try again, how long it waited, and whether it has been said. */
  private readonly failed = new Map<HullName, { at: number; waitMs: number; said: boolean }>();
  /** Hulls a caller of `load` waits on. */
  private readonly loading = new Set<HullName>();

  constructor(open: OpenHull, fail: (error: unknown) => void = console.error, now = () => performance.now()) {
    [this.open, this.fail, this.now] = [open, fail, now];
  }

  /** A hull's model once it has come; asking for it first fetches it, and again after a failure once its wait is
   *  over. A frame's failure is said once. */
  model(hull: number): ShipView | null {
    const name = hullName(hull);
    const ready = this.ready.get(name);
    if (ready) return ready;
    const failed = this.failed.get(name);
    if (!this.fetching.has(name) && (!failed || this.now() >= failed.at))
      this.fetch(hull).catch((error: unknown) => {
        const said = this.failed.get(name);
        if (!said || said.said) return;
        said.said = true;
        // A caller of `load` who waited on the same fetch says it.
        if (!this.loading.has(name)) this.fail(error);
      });
    return null;
  }

  /** The hull a ship is drawn as: its own once it has come, the Sloop while it is coming. */
  shown(hull: number): number {
    if (this.model(hull)) return hull;
    if (this.fetching.has(hullName(hull))) standIn('hulls');
    return SLOOP_HULL;
  }

  /** A hull's model, fetched now if it has not come (a number with no model of its own is the Sloop's); its failure
   *  is the caller's to say. */
  load(hull: number): Promise<ShipView> {
    const name = hullName(hull);
    const ready = this.ready.get(name);
    if (ready) return Promise.resolve(ready);
    const fetching = this.fetching.get(name) ?? this.fetch(hull);
    this.loading.add(name);
    // Its failure is said by the caller, so no frame says it again.
    fetching.then(
      () => this.loading.delete(name),
      () => {
        this.loading.delete(name);
        const said = this.failed.get(name);
        if (said) said.said = true;
      },
    );
    return fetching;
  }

  private fetch(hull: number): Promise<ShipView> {
    const name = hullName(hull);
    const fetching = this.open(hull).then(
      (view) => {
        [this.fetching, this.failed].forEach((each) => each.delete(name));
        this.ready.set(name, view);
        return view;
      },
      (error: unknown) => {
        this.fetching.delete(name);
        const last = this.failed.get(name);
        const waitMs = last ? Math.min(RETRY_MS.most, last.waitMs * 2) : RETRY_MS.first;
        this.failed.set(name, { at: this.now() + waitMs, waitMs, said: last?.said ?? false });
        throw error;
      },
    );
    this.fetching.set(name, fetching);
    return fetching;
  }

  /** Draws a frame's ships, each by its hull's model once it has come, the ships of one hull in its slots in turn, in
   *  the sun's shadows when a map is given. A ship out of view is not drawn but keeps its slot, so every other ship
   *  stays in the slot its shadow was cast from. */
  draw(pass: GPURenderPassEncoder, ships: readonly DrawnShip[], camera: ShipCamera, shadow?: ShadowMap): void {
    const planes = viewPlanes(camera.fromEye);
    this.each(ships, (model, ship, slot) => {
      const bounds = model.boundsAt(ship.place, camera.eye, ship.rig);
      if (!bounds || sphereSeen(planes, ...bounds))
        model.drawInto(pass, ship.place, camera, slot, ship.look, ship.rig, shadow);
    });
  }

  /** Draws a frame's ships' shadows into the cascade of the sun's map being drawn, each in the slot `draw` gives it. */
  castInto(pass: GPURenderPassEncoder, ships: readonly DrawnShip[], camera: ShipCamera, shadow: ShadowMap): void {
    this.each(ships, (model, ship, slot) =>
      model.castInto(pass, ship.place, camera, slot, ship.rig, shadow, ship.look),
    );
  }

  private each(ships: readonly DrawnShip[], drawn: (model: ShipView, ship: DrawnShip, slot: number) => void): void {
    const used = new Map<HullName, number>();
    for (const ship of ships) {
      const model = this.model(ship.hull);
      if (!model) continue;
      const name = hullName(ship.hull);
      const slot = used.get(name) ?? 0;
      used.set(name, slot + 1);
      drawn(model, ship, slot);
    }
  }
}
