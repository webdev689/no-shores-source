// Following the company while fallen, as the owner asked for the Breach: while the player lies down or waits to stand
// again in a Breach's run, the camera stands over a living member of their company (every other player in a run is
// one), in third person, turned as the player turns it; Follow goes to the next. Standing again, it is the player's own.
import type { SeenPlayer } from '../network/messages.ts';
import { fighterView } from '../rules/fighters.ts';
import type { Player } from './player.ts';

type Point = readonly [number, number, number];

/** A member as the camera may follow them: their number, and where their figure stands while they live. */
export interface Followed {
  readonly id: number;
  readonly at: Point;
}

/** The member after `id` among `living`, by number, wrapping; the first where `id` is none of them. */
export function nextFollowed(living: readonly Followed[], id: number | null): Followed | null {
  const ordered = [...living].sort((one, other) => one.id - other.id);
  if (ordered.length === 0) return null;
  const after = ordered.find((each) => id !== null && each.id > id);
  return after ?? ordered[0] ?? null;
}

export class FollowCamera {
  private followed: Followed | null = null;

  /** The member the camera follows now, or null while it is the player's own. */
  get following(): number | null {
    return this.followed?.id ?? null;
  }

  /** One frame: while `active`, the member followed stays, or the next is taken on `next` or once they fall or go;
   *  the camera is the player's own again once it is not. */
  frame(active: boolean, living: readonly Followed[], next: boolean): void {
    if (!active) {
      this.followed = null;
      return;
    }
    const still = this.followed && living.find((each) => each.id === this.followed?.id);
    this.followed = next || !still ? nextFollowed(living, this.followed?.id ?? null) : still;
  }

  /** The player as the camera sees them this frame: their own, or with the followed member's body in their body's
   *  place, seen from behind in third person. */
  viewed(player: Player): Player {
    const followed = this.followed;
    if (!followed) return player;
    const [x, y, z] = followed.at;
    const body = { ...player.body, x, y, z };
    return { ...player, body, previous: body, blend: 1, view: { ...player.view, firstPerson: false } };
  }
}

/** Every other player living, where their figure stands: those whose fighter the room says has not fallen. */
export function livingAmong(
  others: ReadonlyMap<number, SeenPlayer>,
  placed: ReadonlyMap<number, { readonly x: number; readonly y: number; readonly z: number }>,
): Followed[] {
  return [...others].flatMap(([id, seen]) => {
    const figure = placed.get(id);
    const down = !seen.fighter || fighterView(seen.fighter).action.kind === 'dead';
    return figure && !down ? [{ id, at: [figure.x, figure.y, figure.z] as const }] : [];
  });
}
