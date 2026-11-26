// Every hull's model on the GPU, fetched from R2 the first time a ship of that hull is drawn and kept, and a frame's
// ships drawn by them: each in its own hull, its side's colours and its rig, a slot of its model each. A hull still
// coming is drawn as the Sloop, so a ship is never a footprint with nothing over it. Each ship's lanterns light what
// stands round them, as the land's lamps do, and glow through a soft halo.
import type { ShadowMap } from '../shadow.ts';
import { sphereSeen, viewPlanes } from '../frustum.ts';
import type { Gpu } from '../gpu.ts';
import { CITY_LAMPS, type LampPlace, lampsLit } from '../sky/lamps.ts';
import { SKY_NOW } from '../sky/skyDriver.ts';
import type { Mark } from './effects.ts';
import { PuffView } from './puffView.ts';
import { shipAxes } from './shipAxes.ts';
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

/** A ship's lantern's light: as far as a carried lantern's reaches, its colour a shielded flame's. */
export const LANTERN_LIGHT = { reachM: 13, light: [1.0, 0.74, 0.44] } as const;
/** A ship settled this far into the sea, metres, is sinking: its lanterns are out. A storm's swell heaves a ship
 *  afloat less. */
const SINKING_M = 3;
/** The soft halo round a lantern's glass, metres across it, and how bright it is by day and at night. */
const HALO = { radiusM: 0.55, day: 0.25, night: 0.7 } as const;

/** A lamp place kept from frame to frame, moved as its source moves. */
interface Kept {
  at: [number, number, number];
  reachM: number;
  light: [number, number, number];
  seed: number;
}

/** Where a lantern (`lantern`, in its ship's frame) burns for a ship drawn at `place`, in the place's metres. */
export function lanternAt(
  place: ShipPlace,
  lantern: readonly [number, number, number],
  into: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const [ahead, starboard, up] = shipAxes(place.heading, place.pitch, place.roll);
  const scale = place.scale ?? 1;
  const middle = [place.x, place.y, place.z] as const;
  for (let axis = 0; axis < 3; axis++)
    into[axis] =
      (middle[axis] ?? 0) +
      scale * ((ahead[axis] ?? 0) * lantern[0] + (starboard[axis] ?? 0) * lantern[1] + (up[axis] ?? 0) * lantern[2]);
  return into;
}

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
  /** The lamps the last frame's lanterns lit, kept and moved; and what `shine` last lit with them. */
  private readonly lanterns: Kept[] = [];
  private lanternCount = 0;
  private lit: LampPlace[] = [];
  /** The lanterns' halos, made with the first model's device. */
  private halo: PuffView | null = null;
  private readonly halos: Mark[] = [];

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
  draw(
    pass: GPURenderPassEncoder,
    ships: readonly DrawnShip[],
    camera: ShipCamera,
    shadow?: ShadowMap,
    seconds: number | null = null,
  ): void {
    const planes = viewPlanes(camera.fromEye);
    this.lanternCount = 0;
    this.halos.length = 0;
    this.each(ships, (model, ship, slot) => {
      // Its lanterns light round them whether or not it is in view: a ship astern lights the water ahead. A ship
      // sinking has them out.
      const lit = seconds !== null && ship.place.z > -SINKING_M ? seconds : null;
      if (lit !== null) for (const lantern of model.lanterns) this.light(ship, lantern, slot);
      const bounds = model.boundsAt(ship.place, camera.eye, ship.rig);
      if (!bounds || sphereSeen(planes, ...bounds))
        model.drawInto(pass, ship.place, camera, slot, ship.look, ship.rig, shadow, lit);
      if (!this.halo && model.lanterns.length > 0) this.halo = new PuffView(model.gpu);
    });
    this.halo?.set(this.halos, camera);
  }

  /** Lights `lantern` of `ship` (in its `slot`) this frame: its lamp, moved to where it burns, and its halo. */
  private light(ship: DrawnShip, lantern: readonly [number, number, number], slot: number): void {
    const kept = (this.lanterns[this.lanternCount] ??= {
      at: [0, 0, 0],
      reachM: LANTERN_LIGHT.reachM,
      light: [...LANTERN_LIGHT.light],
      seed: 0,
    });
    this.lanternCount += 1;
    lanternAt(ship.place, lantern, kept.at);
    kept.reachM = LANTERN_LIGHT.reachM * (ship.place.scale ?? 1);
    kept.seed = slot + 1;
    const glow = HALO.day + (HALO.night - HALO.day) * lampsLit(SKY_NOW.current.look.daylight);
    this.halos.push({
      x: kept.at[0],
      y: kept.at[1],
      z: kept.at[2],
      radius: HALO.radiusM * (ship.place.scale ?? 1),
      colour: LANTERN_LIGHT.light,
      blend: 'glow',
      alpha: glow,
    });
  }

  /** Lights the sky's lamps with this frame's lanterns and `more` (a sea fight's flashes and fires, in the same
   *  metres), in place of the last frame's: the land's lamps are told only when the list itself changes, its places
   *  moved where they stand. */
  shine(more: readonly LampPlace[] = []): void {
    const count = this.lanternCount + more.length;
    const same =
      count === this.lit.length &&
      this.lit.every((lamp, index) =>
        index < this.lanternCount ? lamp === this.lanterns[index] : lamp === more[index - this.lanternCount],
      );
    if (same) return;
    this.lit = [...this.lanterns.slice(0, this.lanternCount), ...more];
    CITY_LAMPS.set(this, this.lit);
  }

  /** The lanterns' halos over the finished picture, after the water, hidden where `depth` stands nearer: soft round
   *  the glass, which stands in front of their middle. */
  overWater(encoder: GPUCommandEncoder, target: GPUTextureView, depth: GPUTexture): void {
    this.halo?.drawOver(encoder, target, depth);
  }

  /** The lanterns' glow into the light layer's pass. */
  lightInto(pass: GPURenderPassEncoder): void {
    this.halo?.drawLight(pass);
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
