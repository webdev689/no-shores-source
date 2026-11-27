// The drops a development page of the Test Ground lays for its pictures (`__qaDrops`, never in a built game): each
// kind of drop the room lays, set where the player stands and faces, so every one can be pictured near, far off and
// landing without a foe to kill.

import { DROPPED, type GearDrop, type GearItem } from '../network/gearMessages.ts';
import { CARRIED, KINDS, slotOf } from '../player/gear.ts';

/** One drop to lay: a Vestige, an Ammo box or crate, or an item as itself by its kind's name (`sword`, `head`...),
 *  in a rarity, `ahead` and `aside` metres from the player (aside to their right), flying `flying` ticks from 1.5 m
 *  over where it lands (none: told of at rest). */
export interface QaDrop {
  readonly what: string;
  readonly rarity?: number;
  readonly ahead: number;
  readonly aside?: number;
  readonly flying?: number;
}

/** An item as the room makes one, carried, of level 1: its picture follows its kind and rarity alone. */
const PLAIN_ITEM: GearItem = {
  id: 0,
  kind: 0,
  rarity: 0,
  level: 1,
  named: null,
  name: 0,
  resource: null,
  breach: false,
  hard: false,
  xp: 0,
  xpMost: 0,
  bought: 0,
  chosen: [],
  bucket: 0,
  at: CARRIED,
  attack: 0,
  defense: 0,
  prestige: 0,
  columns: [],
  price: 0,
  element: 0,
  source: 0,
};
/** Drops numbered from here, far past any the room's own count reaches in a picture run. */
const FIRST_ID = 90_000;
/** How high over where it lands a flying drop is thrown from, metres. */
const THROWN_M = 1.5;
const LAID: Readonly<Record<string, number>> = {
  vestige: DROPPED.vestige,
  ammoBox: DROPPED.ammoBox,
  crate: DROPPED.crate,
};

/** `laid` as the room's drops, the player at `feet` facing `yaw` (0 north, its right east), on ground at `feet[2]`,
 *  numbered from `first`: a drop laid again under a new number is a new drop, which flies and lands again. */
export function qaDrops(
  laid: readonly QaDrop[],
  feet: readonly [number, number, number],
  yaw: number,
  first = FIRST_ID,
): GearDrop[] {
  const [forward, right] = [
    [Math.sin(yaw), -Math.cos(yaw)],
    [Math.cos(yaw), Math.sin(yaw)],
  ] as const;
  return laid.map(({ what, rarity = 0, ahead, aside = 0, flying = 0 }, index) => {
    const rests = [
      feet[0] + forward[0] * ahead + right[0] * aside,
      feet[1] + forward[1] * ahead + right[1] * aside,
      feet[2],
    ] as const;
    const kind = KINDS.indexOf(what as (typeof KINDS)[number]);
    const dropped = LAID[what] ?? (kind > 0 ? DROPPED.item : undefined);
    if (dropped === undefined) throw new Error(`no drop is called ${what}`);
    const id = first + index;
    // Its slot is its bucket, as the room's are: the gear screens draw a piece by the slot it goes in.
    const bucket = slotOf(kind);
    const item = dropped === DROPPED.item ? { ...PLAIN_ITEM, id, kind, rarity, bucket } : undefined;
    return {
      id,
      rarity,
      slot: item ? bucket : 0,
      at: rests,
      kind: dropped,
      from: flying > 0 ? [rests[0], rests[1], rests[2] + THROWN_M] : rests,
      flying,
      tier: 0,
      poured: false,
      item,
    };
  });
}
