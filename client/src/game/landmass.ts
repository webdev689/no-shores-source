import type { Gpu } from '../gpu.ts';
import { type HeightAt, landHeightAt, type Point2 } from '../overworld/ground.ts';
import { maskFromGrid, type SeaMask } from '../overworld/seaRoute.ts';
import type { LandView } from '../rules/landRules.ts';
import type { LandWorker } from '../terrain/landClient.ts';
import type { TerrainData } from '../terrain/terrainView.ts';
import { type CityPlan, clearedBy, socialNode } from './nodes.ts';
import type { Drawer } from './scene.ts';
import type { NodeInfo, WorldData } from './worldData.ts';

/** The landmass open in the land's worker, and what the game reads off it: its city's plan, its nodes (its city's
 *  social space first), its coast, its ground at a glance and its sea mask for voyages. */
export interface Landmass {
  readonly id: string;
  readonly view: LandView;
  readonly plan: CityPlan | null;
  readonly nodes: readonly NodeInfo[];
  readonly outline: readonly Point2[];
  readonly heightAt: HeightAt;
  readonly mask: SeaMask;
  /** Whether a point stands on ground the city has set (its pads): nature leaves it bare. */
  readonly cleared: (x: number, y: number) => boolean;
}

/** Opens a continent in the land's worker, kept, so its city is settled on it as the bake settles it (with the RMB
 *  index's blocks), and reads its plan. */
export async function openLandmass(
  land: LandWorker,
  world: WorldData,
  rmbText: string | null,
  id: string,
): Promise<Landmass> {
  const continent = world.continents.find((each) => each.id === id);
  if (!continent) throw new Error(`the layout has no continent ${id}`);
  const view = await land.open(world.layoutText, id, continent.editsText, true, rmbText);
  const planText = await land.cityPlan();
  const plan = planText === null ? null : (JSON.parse(planText) as CityPlan);
  const drawn = world.nodes.filter((node) => node.continent === id);
  return {
    id,
    view,
    plan,
    nodes: plan ? [socialNode(plan, id), ...drawn] : drawn,
    outline: continent.outline,
    heightAt: landHeightAt([view]),
    mask: maskFromGrid(view),
    cleared: clearedBy(plan?.pads ?? []),
  };
}

/** The terrain's data for a landmass: its cells as the land worker gave them, with no places marked on them. */
export function terrainOf(view: LandView): TerrainData {
  return { ...view, marks: new Uint8Array(view.width * view.height) };
}

/**
 * The drawers that stand on a landmass besides the land itself: its city, from the city layer, and its nature, from
 * the nature layer, which grows only where `landmass.cleared` is false. Each is made here once the layer is merged,
 * and the game adds both to the scene every frame. Until the city's arrives, the city's walls a body runs into are
 * drawn as plain boxes in its place.
 */
export function landDrawers(_gpu: Gpu, _landmass: Landmass): { city: Drawer | null; nature: Drawer | null } {
  return { city: null, nature: null };
}
