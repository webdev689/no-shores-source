// A Breach's plan as the page draws it, read once from the room module's own (`room_breach`,
// crates/room-wasm/src/breach_door.rs): its spaces, each a module stood at a point of the run's frame and turned whole
// quarters clockwise; its seals and the encounter whose win opens each; the Broken Stair's slabs and their measure;
// which space each encounter is fought in; its tiers' levels and revives. Quarter turns swap and sign as the rules'
// plan.rs `turned` does, so every block lies where the room stands it.
import { moduleNumber, moduleParts, moduleShape, moduleSocket, moduleSocketFacing } from '../city/modules.ts';
import type { Block } from '../rules/movementRules.ts';
import type { NodeInfo } from './worldData.ts';

type Point = readonly [number, number, number];

export interface BreachSpace {
  readonly key: string;
  readonly module: string;
  readonly at: Point;
  readonly turn: number;
}

/** A tier as the plan names it: its key and name, its foes' level, the level it opens at and the revives an attempt
 *  holds (null for none counted). */
export interface BreachTier {
  readonly key: string;
  readonly name: string;
  readonly level: number;
  readonly opens: number;
  readonly revives: number | null;
}

export interface BreachPlan {
  readonly id: string;
  readonly name: string;
  readonly zone: string;
  readonly spaces: readonly BreachSpace[];
  readonly seals: readonly { readonly opens: string; readonly at: Point | null; readonly turn: number }[];
  readonly slabs: readonly { readonly at: Point | null; readonly phase: number }[];
  readonly slabCycle: number;
  readonly slabStands: number;
  /** Each encounter in the Breach's order (the Waking, fought outside, first), and the space it is fought in. */
  readonly encounters: readonly {
    readonly key: string;
    readonly name: string;
    readonly outside: boolean;
    readonly space: string | null;
  }[];
  /** The spaces each encounter that takes players away takes them to: what was, then what is. */
  readonly shores: Readonly<Record<string, readonly string[]>>;
  readonly tiers: readonly BreachTier[];
  readonly banner: string;
  readonly dye: string;
  readonly horse: string;
}

interface PlanExports {
  readonly memory: WebAssembly.Memory;
  release(address: number, length: number): void;
  room_breach(): bigint;
}

const plans = new WeakMap<WebAssembly.Module, BreachPlan>();

/** The Breach's plan, by the room module's own rules, read once a module. */
export function breachPlanOf(module: WebAssembly.Module): BreachPlan {
  const known = plans.get(module);
  if (known) return known;
  const exports = new WebAssembly.Instance(module, {}).exports as unknown as PlanExports;
  const packed = exports.room_breach();
  const [address, length] = [Number(packed >> 32n), Number(packed & 0xffff_ffffn)];
  const text = new TextDecoder().decode(new Uint8Array(exports.memory.buffer, address, length).slice());
  exports.release(address, length);
  const plan = JSON.parse(text) as BreachPlan;
  plans.set(module, plan);
  return plan;
}

/** A point of a module's own frame (x east, y south, z up) turned `quarters` clockwise. */
export function turned([x, y, z]: Point, quarters: number): Point {
  switch (((quarters % 4) + 4) % 4) {
    case 0:
      return [x, y, z];
    case 1:
      return [-y, x, z];
    case 2:
      return [-x, -y, z];
    default:
      return [y, -x, z];
  }
}

/** A box of a module's frame (west, north, bottom, east, south, top) turned and stood at `at`, as a block. */
function placedBlock(part: readonly number[], where: Point, quarters: number): Block {
  const [west = 0, north = 0, bottom = 0, east = 0, south = 0, top = 0] = part;
  const [a, b] = [turned([west, north, bottom], quarters), turned([east, south, top], quarters)];
  return {
    minX: where[0] + Math.min(a[0], b[0]),
    minY: where[1] + Math.min(a[1], b[1]),
    maxX: where[0] + Math.max(a[0], b[0]),
    maxY: where[1] + Math.max(a[1], b[1]),
    bottom: where[2] + bottom,
    top: where[2] + top,
  };
}

/** Whether a slab stands at room tick `tick`: from the start of its cycle for `slabStands` ticks of every cycle. */
export function slabStands(plan: Pick<BreachPlan, 'slabCycle' | 'slabStands'>, phase: number, tick: number): boolean {
  return (tick + phase) % plan.slabCycle < plan.slabStands;
}

/** Whether seal `number` is open, a bit each as a snapshot carries them. */
export const sealOpen = (seals: number, number: number): boolean => (seals & (1 << number)) !== 0;

/** The blocks standing at `tick` with the seals `seals` open, as the run's room stands them (plan.rs `blocks_at`):
 *  every space's parts, each seal still shut, and each slab standing in its cycle. */
export function planBlocks(plan: BreachPlan, seals: number, tick: number): Block[] {
  const partsOf = (name: string) => moduleParts(moduleNumber(name));
  const blocks = plan.spaces.flatMap((space) =>
    partsOf(space.module).map((part) => placedBlock(part, space.at, space.turn)),
  );
  plan.seals.forEach((seal, number) => {
    if (seal.at && !sealOpen(seals, number))
      blocks.push(...partsOf('breach-seal').map((part) => placedBlock(part, seal.at as Point, seal.turn)));
  });
  for (const slab of plan.slabs) {
    const part = partsOf('breach-slab')[0];
    if (slab.at && part && slabStands(plan, slab.phase, tick)) blocks.push(placedBlock(part, slab.at, 0));
  }
  return blocks;
}

/** The run's blocks as they stand, in one array that whatever reads the run's ground keeps (the camera, the
 *  crosshair, the plates' sight, the marks): `keep` makes it anew in place once a snapshot's seals or its slabs stand
 *  otherwise than they last did, and tells `changed`, as the page's courses are made anew. */
export function standingBlocks(plan: BreachPlan, changed: (seals: number, tick: number) => void) {
  const blocks = planBlocks(plan, 0, 0);
  const keyOf = (seals: number, tick: number) =>
    `${seals}:${plan.slabs.map((slab) => Number(slabStands(plan, slab.phase, tick))).join('')}`;
  let kept = keyOf(0, 0);
  return {
    blocks: blocks as readonly Block[],
    keep(seals: number, tick: number): void {
      const key = keyOf(seals, tick);
      if (key === kept) return;
      kept = key;
      blocks.splice(0, blocks.length, ...planBlocks(plan, seals, tick));
      changed(seals, tick);
    },
  };
}

/** The space a point stands over, by its module's foot; null between spaces. */
export function spaceAt(plan: BreachPlan, x: number, y: number): BreachSpace | null {
  return (
    plan.spaces.find((space) => {
      const [wide = 1, deep = 1] = moduleShape(moduleNumber(space.module)).size;
      const half = turned([wide / 2, deep / 2, 0], space.turn);
      return Math.abs(x - space.at[0]) <= Math.abs(half[0]) && Math.abs(y - space.at[1]) <= Math.abs(half[1]);
    }) ?? null
  );
}

/** A socket of a module stood at `at`, turned `quarters` clockwise, in the frame it stands in. */
export function socketAt(module: string, socket: string, where: Point, quarters: number): Point {
  const placed = turned(moduleSocket(moduleNumber(module), socket), quarters);
  return [where[0] + placed[0], where[1] + placed[1], where[2] + placed[2]];
}

/** The bearing a socket of a module turned `quarters` clockwise faces out along, radians clockwise from north. */
export function socketBearing(module: string, socket: string, quarters: number): number {
  const [x, y] = moduleSocketFacing(moduleNumber(module), socket);
  const [east, south] = turned([x, y, 0], quarters);
  return Math.atan2(east, -south);
}

/** A socket of a space of the plan, in the run's frame; null for a space it lacks. */
export function spaceSocket(plan: BreachPlan, space: string, socket: string): Point | null {
  const found = plan.spaces.find((each) => each.key === space);
  return found ? socketAt(found.module, socket, found.at, found.turn) : null;
}

/** A Breach's run as a place on foot: named for the Breach and kept apart from its gate's zone by its id, its section
 *  round every space, its one spawn the Descent's arrival, in its gate's zone's climate. */
export function runPlace(into: { readonly plan: BreachPlan; readonly zone: NodeInfo }): NodeInfo {
  const blocks = planBlocks(into.plan, 0, 0);
  const [west, north] = [Math.min(...blocks.map((block) => block.minX)), Math.min(...blocks.map((one) => one.minY))];
  const [east, south] = [Math.max(...blocks.map((block) => block.maxX)), Math.max(...blocks.map((one) => one.maxY))];
  const [x, y] = spaceSocket(into.plan, 'descent', 'arrival') ?? [0, 0];
  return {
    id: `${into.zone.id}--breach`,
    kind: 'dungeon',
    name: into.plan.name,
    continent: into.zone.continent,
    ring: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    spawns: [[x, y]],
    centre: [x, y],
  };
}

/** The ground under a point among `blocks`: the top of the highest whose foot it stands over; none over the dark. */
export const blocksGround =
  (blocks: readonly Block[]) =>
  (x: number, y: number): number | null =>
    blocks.reduce<number | null>(
      (top, block) =>
        x >= block.minX && x <= block.maxX && y >= block.minY && y <= block.maxY
          ? Math.max(top ?? -Infinity, block.top)
          : top,
      null,
    );
