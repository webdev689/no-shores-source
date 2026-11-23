// The wrecks in a ruined harbour: the ships layer's own Sloop and Schooner, their masts and spars gone, heeled over
// and settled in the water to their decks, drawn plain, in no side's colours.
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import type { CityPlan, Wreck } from '../city/plan.ts';
import type { Gpu } from '../gpu.ts';
import type { ShadowMap } from '../shadow.ts';
import { loadShip, type ShipMesh, VERTEX_BYTES } from '../ships/shipMesh.ts';
import type { ShipLook } from '../ships/dress.ts';
import { HULL_NAMES, hullPaint } from '../ships/hulls.ts';
import { type ShipCamera, ShipView } from '../ships/shipView.ts';
import type { Drawer } from './scene.ts';
import { standIn } from '../standIns.ts';

/** How far over its highest deck a wreck keeps anything: its masts broke off below this, metres. */
const STUMP_OVER_DECK_M = 2;
/** How a wreck is drawn: in its own paint, no side's colours, weathered and waterlogged darker than a ship afloat. */
const WRECK_LOOK: ShipLook = { side: 'player', shade: 0.6 };

type Hull = Wreck['ship'];

/** A ship's deck heights over its waterline, metres, from the manifest. */
function deckHeights(ship: Hull): number[] {
  const deck = ships.ships[ship].deck;
  return deck.heights_cm.flat().flatMap((centimetres) => (centimetres === null ? [] : [centimetres / 100]));
}

/** How deep a wreck sits: its deck's middle height, so it is settled to its deck. */
export function settledDepth(ship: Hull): number {
  const heights = deckHeights(ship).sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)] ?? 0;
}

/** Its mesh with every face that reaches over `stump` metres above its waterline left out: its masts and spars. */
export function brokenMesh(mesh: ShipMesh, stump: number): ShipMesh {
  const view = new DataView(mesh.vertices);
  const heightOf = (vertex: number): number => view.getFloat32(vertex * VERTEX_BYTES + 8, true);
  const kept: number[] = [];
  for (let face = 0; face + 2 < mesh.indices.length; face += 3) {
    const corners = [mesh.indices[face], mesh.indices[face + 1], mesh.indices[face + 2]];
    if (corners.every((corner) => heightOf(corner) <= stump)) kept.push(...corners);
  }
  return { ...mesh, indices: new Uint32Array(kept) };
}

/** A wreck's view of its ship, made once a page for every ruin. */
// shortcut: one view a hull with one slot, so two ruins drawn in one frame would share its place; give each wreck a
// slot if more than one landmass is ever drawn at once.
const views = new Map<Hull, Promise<ShipView>>();

function viewOf(gpu: Gpu, ship: Hull): Promise<ShipView> {
  let view = views.get(ship);
  if (!view) {
    const stump = Math.max(...deckHeights(ship)) + STUMP_OVER_DECK_M;
    view = loadShip(ship).then((mesh) =>
      ShipView.open(gpu, brokenMesh(mesh, stump), [], hullPaint(HULL_NAMES.indexOf(ship)), 1),
    );
    views.set(ship, view);
  }
  return view;
}

/** A ruin's wrecks: each drawn once its ship's mesh has come, standing in as nothing while it comes. */
export class Wrecks {
  private readonly drawn: { readonly wreck: Wreck; view: ShipView | null; coming: boolean }[];

  constructor(gpu: Gpu, wrecks: readonly Wreck[]) {
    this.drawn = wrecks.map((wreck) => ({ wreck, view: null, coming: true }));
    for (const each of this.drawn)
      viewOf(gpu, each.wreck.ship)
        .then((view) => {
          each.view = view;
        })
        .catch(() => {
          // a mesh that does not come leaves it undrawn; the ruin stands without it
        })
        .finally(() => (each.coming = false));
  }

  /** Draws every wreck whose ship has come into the pass, seen as `camera` sees the world, `scale` times its size, in
   *  the sun's shadows. */
  drawInto(pass: GPURenderPassEncoder, camera: ShipCamera, scale: number, shadow: ShadowMap): void {
    if (this.drawn.some((each) => each.coming)) standIn('wrecks');
    for (const { wreck, view } of this.drawn)
      if (view) view.drawInto(pass, placeOf(wreck, scale), camera, 0, WRECK_LOOK, null, shadow);
  }

  /** Draws every wreck's shadow, `scale` times its size, into the cascade of the sun's map being drawn. */
  castInto(pass: GPURenderPassEncoder, camera: ShipCamera, scale: number, shadow: ShadowMap): void {
    for (const { wreck, view } of this.drawn)
      if (view) view.castInto(pass, placeOf(wreck, scale), camera, 0, null, shadow);
  }
}

/** Where a wreck lies, drawn `scale` times its size: settled to its deck, heeled over. */
function placeOf(wreck: Wreck, scale: number) {
  return {
    x: wreck.at[0],
    y: wreck.at[1],
    z: -settledDepth(wreck.ship) * scale,
    heading: wreck.heading,
    pitch: 0,
    roll: wreck.heel,
    scale,
  };
}

/** A city's drawer with its wrecks drawn after it, in the same pass, at the size ships are drawn at now (`shipScale`,
 *  as the sea draws every ship, true size on foot): the city itself where it has none. */
export function withWrecks(gpu: Gpu, city: Drawer, plan: CityPlan, shipScale: () => number): Drawer {
  if (!plan.wrecks?.length) return city;
  const wrecks = new Wrecks(gpu, plan.wrecks);
  return {
    prepare: (shot) => city.prepare?.(shot),
    castInto: (pass, fromEye, shot, time, shadow) => {
      city.castInto?.(pass, fromEye, shot, time, shadow);
      wrecks.castInto(pass, { fromEye, eye: shot.eye }, shipScale(), shadow);
    },
    drawInto: (pass, fromEye, shot, time, shadow) => {
      city.drawInto(pass, fromEye, shot, time, shadow);
      wrecks.drawInto(pass, { fromEye, eye: shot.eye }, shipScale(), shadow);
    },
  };
}
