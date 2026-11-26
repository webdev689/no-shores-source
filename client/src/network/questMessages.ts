// The houses' roads as the gear message carries them (crates/protocol quest_wire): where the player stands on them and
// what the task's varied steps stand in the player's room.
import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';

/** Where a player stands on the houses' roads (content/quests/quests.json): the quest walked by its place counted
 *  from 1 (0 for none), its task, that task's goals' counts in its order, each quest done (1) or not by place, each
 *  Art's fragment choices waiting in the Arts' order, and where the task's first unmet goal with a place stands in the
 *  player's room (x, y and its reach), null where none is here. Then the task's varied steps in the player's room:
 *  its running goal's clock in seconds (null for none), each goal's failures this task, a puzzle's points, the
 *  figures walking for it and a defended ward. */
export interface QuestState {
  readonly quest: number;
  readonly task: number;
  readonly counts: readonly number[];
  readonly done: readonly number[];
  readonly choices: readonly number[];
  readonly at: readonly [number, number, number] | null;
  readonly clock?: number | null;
  readonly fails?: readonly number[];
  readonly points?: readonly QuestPoint[];
  readonly figures?: readonly QuestFigure[];
  readonly ward?: QuestWard | null;
  /** Whether the word is on the player's own character: a room holds a starting character until the account's is
   *  given, and the page shows nothing of it. Left out, as a test's own word leaves it, it is. */
  readonly claimed?: boolean;
}

/** A puzzle's point where it stands, and whether it is lit. */
export interface QuestPoint {
  readonly x: number;
  readonly y: number;
  readonly lit: boolean;
}

/** A figure a step walks (an escort, a tail's quarry): its look (1 and up a speaker's place among
 *  content/story/cast.json's speakers, 101 and up a roster type's number plus 100), where it stands and faces, and its
 *  state (`FIGURE_STATES`). */
export interface QuestFigure {
  readonly look: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
  readonly state: number;
}

/** A figure's states by their number on the wire (`mounting`: an escort waiting, its player near, for them to get on
 *  their horse). */
export const FIGURE_STATES = { waiting: 0, walking: 1, noticed: 2, arrived: 3, ambushed: 4, mounting: 5 } as const;

/** A defended ward: where it stands and its health's share, 0 to 1. */
export interface QuestWard {
  readonly x: number;
  readonly y: number;
  readonly health: number;
}

/** The roads as a message holds them. */
export function questOf(gear: Gear): QuestState {
  const [x, y, reach] = Array.from(gear.questAtArray() ?? []);
  return {
    quest: gear.quest(),
    task: gear.questTask(),
    counts: Array.from(gear.questCountsArray() ?? []),
    done: Array.from(gear.questsDoneArray() ?? []),
    choices: Array.from(gear.fragmentChoicesArray() ?? []),
    at: x === undefined || y === undefined || reach === undefined ? null : [x, y, reach],
    clock: gear.questClock() < 0 ? null : gear.questClock(),
    fails: Array.from(gear.questFailsArray() ?? []),
    points: chunked(Array.from(gear.questPointsArray() ?? []), 3).map(([east = 0, south = 0, lit = 0]) => ({
      x: east,
      y: south,
      lit: lit === 1,
    })),
    figures: chunked(Array.from(gear.questFiguresArray() ?? []), 6).map(
      ([look = 0, east = 0, south = 0, up = 0, facing = 0, state = 0]) => ({
        look,
        x: east,
        y: south,
        z: up,
        facing,
        state,
      }),
    ),
    ward: wardOf(Array.from(gear.questWardArray() ?? [])),
    claimed: gear.claimed(),
  };
}

/** A list of numbers in whole runs of `size`, any part run left over dropped. */
function chunked(numbers: readonly number[], size: number): number[][] {
  return Array.from({ length: Math.floor(numbers.length / size) }, (_unused, run) =>
    numbers.slice(run * size, run * size + size),
  );
}

/** A ward as its three numbers hold it; none for none. */
function wardOf([east, south, health]: readonly number[]): QuestWard | null {
  return east === undefined || south === undefined || health === undefined ? null : { x: east, y: south, health };
}
