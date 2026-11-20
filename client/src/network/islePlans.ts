import { startRoomDoor } from '../../../server/roomDoor.ts';

/** An island as the page builds it: its plan's JSON in its own frame (crates/room-wasm/src/isle_door.rs) and its
 *  ground's numbers with its middle where the sea rolled it, as `movement::Heights` gives them. */
export interface IsleBuilt {
  readonly json: string;
  readonly heights: Float64Array;
}

/** Builds islands through the room module, the same rules the island's room stands on, so the page predicts the
 *  player on the room's own ground: null for a climate the islands' contract does not dress. */
export function islePlanner(
  module: WebAssembly.Module,
): (seed: string, climate: string, at: readonly [number, number]) => IsleBuilt | null {
  const door = startRoomDoor(module);
  return (seed, climate, middle) => {
    const json = door.islePlan(seed, climate);
    if (!json) return null;
    return { json, heights: door.isleHeights(seed, climate, middle) };
  };
}
