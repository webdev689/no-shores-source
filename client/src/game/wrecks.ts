// The wrecks in a ruined harbour: the ships layer's own Sloop and Schooner, their masts and spars gone, heeled over
// and settled in the water to their decks, drawn plain, in no side's colours.
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import type { CityPlan, Wreck } from '../city/plan.ts';
import type { Gpu } from '../gpu.ts';
import { loadShip, type ShipMesh, VERTEX_BYTES } from '../ships/shipMesh.ts';
import { type ShipCamera, ShipView } from '../ships/shipView.ts';
import type { Drawer } from './scene.ts';

/** How far over her highest deck a wreck keeps anything: her masts broke off below this, metres. */
const STUMP_OVER_DECK_M = 2;
/** How light a wreck is drawn: weathered and waterlogged, darker than a ship afloat. */
const WRECK_SHADE = 0.6;

type Hull = Wreck['ship'];

/** A ship's deck heights over her waterline, metres, from the manifest. */
function deckHeights(ship: Hull): number[] {
  const deck = ships.ships[ship].deck;
  return deck.heights_cm.flat().flatMap((centimetres) => (centimetres === null ? [] : [centimetres / 100]));
}

/** How deep a wreck sits: her deck's middle height, so she is settled to her deck. */
export function settledDepth(ship: Hull): number {
  const heights = deckHeights(ship).sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)] ?? 0;
}

/** Her mesh with every face that reaches over `stump` metres above her waterline left out: her masts and spars. */
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

/** A wreck's view of her ship, made once a page for every ruin. */
const views = new Map<Hull, Promise<ShipView>>();

function viewOf(gpu: Gpu, ship: Hull): Promise<ShipView> {
  let view = views.get(ship);
  if (!view) {
    const stump = Math.max(...deckHeights(ship)) + STUMP_OVER_DECK_M;
    view = loadShip(ship).then((mesh) => new ShipView(gpu, brokenMesh(mesh, stump), [], 1));
    views.set(ship, view);
  }
  return view;
}

/** A ruin's wrecks: each drawn once her ship's mesh has come. */
export class Wrecks {
  private readonly drawn: { readonly wreck: Wreck; view: ShipView | null }[];

  constructor(gpu: Gpu, wrecks: readonly Wreck[]) {
    this.drawn = wrecks.map((wreck) => ({ wreck, view: null }));
    for (const each of this.drawn)
      viewOf(gpu, each.wreck.ship)
        .then((view) => {
          each.view = view;
        })
        .catch(() => {
          // a mesh that does not come leaves her undrawn; the ruin stands without her
        });
  }

  /** Draws every wreck whose ship has come into the pass, seen as `camera` sees the world. */
  drawInto(pass: GPURenderPassEncoder, camera: ShipCamera): void {
    for (const { wreck, view } of this.drawn) {
      if (!view) continue;
      const place = {
        x: wreck.at[0],
        y: wreck.at[1],
        z: -settledDepth(wreck.ship),
        heading: wreck.heading,
        pitch: 0,
        roll: wreck.heel,
      };
      view.drawInto(pass, place, camera, 0, WRECK_SHADE);
    }
  }
}

/** A city's drawer with its wrecks drawn after it, in the same pass: the city itself where it has none. */
export function withWrecks(gpu: Gpu, city: Drawer, plan: CityPlan): Drawer {
  if (!plan.wrecks?.length) return city;
  const wrecks = new Wrecks(gpu, plan.wrecks);
  return {
    castInto: city.castInto?.bind(city),
    drawInto: (pass, fromEye, shot, time, shadow) => {
      city.drawInto(pass, fromEye, shot, time, shadow);
      wrecks.drawInto(pass, { fromEye, eye: shot.eye });
    },
  };
}
