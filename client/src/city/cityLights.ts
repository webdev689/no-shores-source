// The light a city's glowing solids give, and a layout's (its solids are among the city's works), as the land's fires
// and lamps (../sky/lamps.ts): a brazier's, a hoop's, a camp's or a watchtower's fire burning on its coals; a
// lantern's glass glowing, no flame seen, its light at the lantern; the Beacon's great fire burning round the foot of
// its glass; a sunstone breathing. A ruin has none: its glow is put out (the city crate's `ruins`).
import { coalsFire, type FirePlace, glowLamp, type LampPlace, lanternLamp, seedAt } from '../sky/lamps.ts';
import { moduleLights } from './moduleLights.ts';
import { moduleHeight } from './modules.ts';
import type { CityPlan, Solid } from './plan.ts';
import { solidTurn } from './solidMesh.ts';

type Point = readonly [number, number, number];

/** What a city's glowing solids light and burn. */
export interface CityLights {
  readonly lamps: LampPlace[];
  readonly fires: FirePlace[];
}

/** How wide, metres, a glowing solid that is no lantern stands at the least: coals a fire burns on (a brazier's, a
 *  hoop's, a watchtower's). A pyramid is always a camp fire's. */
const COALS_LEAST_M = 0.65;
/** How wide a glowing solid stands at the least to be a lantern room's glass (the lighthouse's), not coals. */
const LANTERN_ROOM_LEAST_M = 2;
/** How wide a glowing column stands at the least to be the Beacon's glass, its fire burning round its foot. */
const BEACON_LEAST_M = 8;
/** The Beacon's fires round its foot, each along one side of the ring, how tall they burn and how far out. */
const BEACON = { fires: 8, sizeM: 4, outM: 0.6 } as const;
/** How wide a module's lantern glass (a lamp post's, a sconce's) is taken to be, metres. */
const MODULE_GLASS_M = 0.3;

/** A lantern into `into`: its lamp alone, as an enclosed light shows no flame. */
function lantern(into: CityLights, middle: Point, largest: number): void {
  into.lamps.push(lanternLamp(middle, largest));
}

/** A module's lanterns, one at each of its flames (`moduleLights`), stretched and turned as its solid is; before its
 *  mesh has come, one at its middle. */
function moduleLanterns(solid: Solid & { readonly shape: 'module' }, into: CityLights, middle: Point): void {
  const stretch = solid.size[2] / moduleHeight(solid.module);
  const flames = (moduleLights(solid.module) ?? []).filter((light) => light.kind === 'fire');
  if (flames.length === 0) return lantern(into, middle, MODULE_GLASS_M);
  for (const flame of flames) {
    const turned = solidTurn(solid, [flame.at[0], flame.at[1], flame.at[2] * stretch]);
    lantern(into, [solid.at[0] + turned[0], solid.at[1] + turned[1], solid.at[2] + turned[2]], MODULE_GLASS_M);
  }
}

/** The Beacon's great fire round the foot of its glass, a fire along each side of a ring, the first side's seeded as
 *  its one great lamp at the glass's middle. */
function beacon(solid: Solid, into: CityLights, middle: Point, largest: number): void {
  const seed = seedAt(middle);
  const radius = Math.max(solid.size[0], solid.size[1]) / 2 + BEACON.outM;
  const corner = (side: number): Point => {
    const turn = (side / BEACON.fires) * Math.PI * 2;
    return [solid.at[0] + radius * Math.cos(turn), solid.at[1] + radius * Math.sin(turn), solid.at[2]];
  };
  for (let side = 0; side < BEACON.fires; side++) {
    const [from, to] = [corner(side), corner(side + 1)];
    const along: Point = [to[0] - from[0], to[1] - from[1], 0];
    into.fires.push({ at: from, sizeM: BEACON.sizeM, seed: seed + side, along, casts: false });
  }
  into.lamps.push(glowLamp(middle, largest, seed, 'fire'));
}

/** One glowing solid's light into `into`; a module's lanterns once for each module stood (`modules`). */
function lightOf(solid: Solid, into: CityLights, modules: Set<string>): void {
  const [width, depth, height] = solid.size;
  const [wide, largest] = [Math.max(width, depth), Math.max(...solid.size)];
  const middle: Point = [solid.at[0], solid.at[1], solid.at[2] + height / 2];
  if (solid.shape === 'module') {
    const stood = `${solid.module}@${solid.at.join(',')}`;
    if (modules.has(stood)) return;
    modules.add(stood);
    return moduleLanterns(solid, into, middle);
  }
  if (solid.shape === 'dome') into.lamps.push(glowLamp(middle, largest, seedAt(middle), 'stone'));
  else if (solid.shape === 'column' && wide >= BEACON_LEAST_M) beacon(solid, into, middle, largest);
  else if (solid.shape === 'pyramid' || (wide >= COALS_LEAST_M && wide < LANTERN_ROOM_LEAST_M))
    into.fires.push(coalsFire([solid.at[0], solid.at[1], solid.at[2] + height], wide, height));
  else lantern(into, middle, largest);
}

/** Every glowing solid of a city or a layout (its Beacon, its braziers, its stations' and courtyards' lanterns, its
 *  camp fires and sunstones) as the fires it burns and the lamps it lights. */
export function glowLights(plan: CityPlan): CityLights {
  const lights: CityLights = { lamps: [], fires: [] };
  const modules = new Set<string>();
  for (const solid of [...plan.landmark, ...plan.works, ...plan.social.solids])
    if (solid.material === 'glow') lightOf(solid, lights, modules);
  return lights;
}
