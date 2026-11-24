// The chests and containers to search a player finds on foot, as the room stands them for them (crates/room
// finds.rs, find_holds.rs): what E held does within reach of one, in words, and how long; and the chests as drawn, one
// the player opened kept standing a while with its lid swung back, so it is seen to open before it goes.
import { type EventProp, foundChestProps } from '../city/eventProps.ts';
import { type Marked, OVER_HEAD_M } from '../combat/marksOver.ts';
import type { GearChest } from '../network/findMessages.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { PROP_ROLES } from '../models/propRoles.ts';
import type { Use } from './footGear.ts';
import { CHEST_PICTURE, SEARCH_PICTURE } from './overheadMarks.ts';
import { play } from './uiSounds.ts';

/** How near a chest's middle a player opens it, how near a container's sides they search it, how far above or below
 *  its foot, and how long E is held for each: as the room has them (`find_holds.rs`). */
export const CHEST_REACH_M = 2.5;
export const SEARCH_REACH_M = 1.5;
export const FIND_HEIGHT_M = 2;
export const OPEN_S = 1;
export const SEARCH_S = 1.5;
/** How long a chest the player opened stays drawn, open, before it goes, seconds. */
export const OPENED_KEPT_S = 4;

/** A container's name by its family (models/propRoles.ts), as the words that search it say it. */
const NAMES: Readonly<Record<string, string>> = {
  cabinet: 'cabinet',
  crate: 'crate',
  cupboard: 'cupboard',
  dresser: 'dresser',
  sarcophagus: 'sarcophagus',
  shelf: 'shelves',
  stepShelf: 'shelves',
  tomb: 'tomb',
  wardrobe: 'wardrobe',
};

/** What a container is called by its model: its family's name, else a container. */
export function holderName(model: number): string {
  return NAMES[PROP_ROLES.get(model) ?? ''] ?? 'container';
}

/** How far a point lies from a box across, 0 inside it. */
export function offBox([west, north, east, south]: readonly number[], x: number, y: number): number {
  const across = Math.max((west ?? 0) - x, x - (east ?? 0), 0);
  const down = Math.max((north ?? 0) - y, y - (south ?? 0), 0);
  return Math.hypot(across, down);
}

/** The use of the nearest chest within reach of a player at (x, y, z), else the nearest container: none on horseback,
 *  where the room opens none. With no height (`z` null) any level is taken as theirs. */
export function findUse(
  feet: readonly [number, number, number | null],
  gear: GearState | null,
  ask: (asked: GearAsk) => void,
  mounted: boolean,
): Use | null {
  if (!gear || mounted) return null;
  const [x, y, z] = feet;
  const chest = nearest(gear.chests ?? [], (each) => Math.hypot(each.at[0] - x, each.at[1] - y));
  const within = (off: number, foot: number, reach: number) =>
    off <= reach && (z === null || Math.abs(z - foot) <= FIND_HEIGHT_M);
  if (chest && within(chest.off, chest.find.at[2], CHEST_REACH_M)) {
    const { number } = chest.find;
    const run = () => ask({ kind: ASKS.openFind, item: number });
    return { words: 'Hold to open the chest', run, held: { kind: 'find', index: number, seconds: OPEN_S } };
  }
  const held = nearest(gear.searchables ?? [], (each) => offBox(each.box, x, y));
  if (!held || !within(held.off, held.find.foot, SEARCH_REACH_M)) return null;
  const { number, model } = held.find;
  const run = () => ask({ kind: ASKS.openFind, item: number });
  return {
    words: `Hold to search the ${holderName(model)}`,
    run,
    held: { kind: 'find', index: number, seconds: SEARCH_S },
  };
}

/** The nearest of some finds by `off`, with how far it lies. */
function nearest<Find>(finds: readonly Find[], off: (find: Find) => number): { find: Find; off: number } | null {
  let best: { find: Find; off: number } | null = null;
  for (const find of finds) {
    const far = off(find);
    if (!best || far < best.off) best = { find, off: far };
  }
  return best;
}

/** A chest as drawn: where it stands, the way it faces, and the seconds since the player opened it (null shut). */
export interface ChestDrawn {
  readonly number: number;
  readonly at: readonly [number, number, number];
  readonly facing: number;
  readonly opened: number | null;
}

/** The chests a player sees, from each word on their gear: those standing, and each the room says it paid them for
 *  (`opened`), kept open OPENED_KEPT_S where it stood; one that went unpaid moved on, and goes at once. */
export class ChestsSeen {
  private standing: readonly GearChest[] = [];
  private told = 0;
  private readonly opened = new Map<number, { chest: GearChest; at: number }>();

  /** The chests to draw at `clock` seconds, with the gear as it stands now; and the number of one just opened. */
  frame(gear: GearState | null, clock: number): { drawn: ChestDrawn[]; justOpened: number[] } {
    const now = gear?.chests ?? [];
    const paid = gear?.opened ?? 0;
    const justOpened: number[] = [];
    const chest = paid !== this.told ? this.standing.find((each) => each.number === paid) : undefined;
    if (chest) {
      this.opened.set(chest.number, { chest, at: clock });
      justOpened.push(chest.number);
    }
    [this.standing, this.told] = [now, paid];
    for (const [number, { at }] of this.opened) if (clock - at > OPENED_KEPT_S) this.opened.delete(number);
    const shut = now.map((each) => ({ ...each, opened: null }));
    const open = [...this.opened.values()].map(({ chest: each, at }) => ({ ...each, opened: clock - at }));
    return { drawn: [...shut, ...open], justOpened };
  }
}

/** How high a chest's lid stands over its foot, metres (the event chest's, tools/modules/chest.py), its mark over it;
 *  and how far over a container's top its mark stands. */
const CHEST_TOP_M = 0.66;
const OVER_TOP_M = 0.15;

/** The marks over the finds standing for a player (overheadMarks.ts draws them): a chest over each chest's lid, on
 *  its own ground; a glass over each container's top, over its box's middle. */
export function findMarks(gear: GearState | null): Marked[] {
  const chests = (gear?.chests ?? []).map(({ at }): Marked => ({
    picture: CHEST_PICTURE,
    at: [at[0], at[1], at[2] + CHEST_TOP_M + OVER_HEAD_M],
  }));
  const held = (gear?.searchables ?? []).map(({ box, top }): Marked => {
    const middle = [((box[0] ?? 0) + (box[2] ?? 0)) / 2, ((box[1] ?? 0) + (box[3] ?? 0)) / 2] as const;
    return { picture: SEARCH_PICTURE, at: [middle[0], middle[1], top + OVER_TOP_M + OVER_HEAD_M] };
  });
  return [...chests, ...held];
}

/** What the finds give a frame on foot: the chests as a patrol's props, the marks over every find, and the sounds of
 *  one just opened, its lid's clunk heard where it stands as a public event's chest's is. */
export interface FindsShown {
  readonly props: EventProp[];
  readonly marks: Marked[];
  readonly sounds: readonly { readonly cue: string; readonly at: readonly [number, number, number] }[];
}

/** The finds as a frame on foot shows them: which chests are drawn (`drawn`, which a dungeon's view takes, its own
 *  chest drawn for each), each opened one's sound, and in a patrol each as a prop. */
export class FootFinds {
  private readonly seen = new ChestsSeen();
  drawn: ChestDrawn[] = [];

  /** One frame at `clock` seconds with the gear as it stands, in a dungeon or not; quiet while the game is paused. */
  frame(gear: GearState | null, clock: number, dungeon: boolean, quiet: boolean): FindsShown {
    const { drawn, justOpened } = this.seen.frame(gear, clock);
    this.drawn = drawn;
    const opened = drawn.filter((chest) => justOpened.includes(chest.number));
    if (opened.length > 0 && !quiet) play('open');
    const sounds = quiet ? [] : opened.map((chest) => ({ cue: 'ship.ready', at: chest.at }));
    return { props: dungeon ? [] : drawn.flatMap(foundChestProps), marks: findMarks(gear), sounds };
  }
}
