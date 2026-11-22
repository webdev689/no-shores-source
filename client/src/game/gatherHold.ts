// A resource node gathered by holding E (the room's `Gathering`): begun on E, let go of when E is released, the body
// stirs or is hurt, or E can do nothing; done once the room no longer stands the node for the player, or refuses it.
// The room judges it all; this only shows how far it has been held, and sounds the hold's build-up as the menus' holds
// do.
import type { GearState } from '../network/gearMessages.ts';
import { GATHER_S, GATHER_STIR_M } from './footGear.ts';
import { charge } from './uiSounds.ts';

/** Where the body stands and its health, as a gather reads them each frame. */
export interface Holder {
  readonly at: readonly [number, number];
  readonly health: number;
}

/** A gather under way: its node, when on the frames' clock it began, where the body stood, its health last frame, and
 *  how many asks the room had answered as it began. */
interface Held {
  readonly node: number;
  readonly since: number;
  readonly at: readonly [number, number];
  health: number;
  readonly answered: number;
}

export class GatherHold {
  private held: Held | null = null;
  /** The frames' clock as last read, and what stops the hold's sound. */
  private now = 0;
  private quiet: () => void = () => undefined;
  private readonly letGo: () => void;
  private readonly holder: () => Holder;

  /** `letGo` tells the room a gather is let go of; `holder` reads the body now. */
  constructor(letGo: () => void, holder: () => Holder) {
    this.letGo = letGo;
    this.holder = holder;
  }

  /** E pressed where it gathers `node`, if it does, with the gear as it stands. */
  begin(node: number | undefined, gear: GearState | null): void {
    if (node === undefined) return;
    this.quiet();
    const { at, health } = this.holder();
    this.held = { node, since: this.now, at, health, answered: gear?.answered ?? 0 };
    this.quiet = charge(GATHER_S * 1000);
  }

  /** E released: a gather under way is let go of, and the room told, unless its time was full: the room, counting from
   *  its answer, may still be counting to it. */
  release(): void {
    const held = this.held;
    if (!held) return;
    this.held = null;
    this.quiet();
    if (this.now - held.since < GATHER_S) this.letGo();
  }

  /** How far the gather under way has been held at `now` (0 to 1), or null with none. One whose body stirred or was
   *  hurt since the frame before, or that E can no longer do (`able`), is let go of; one the room refused, or whose
   *  node it no longer stands for the player, is done (or was let go there), as is one held well past its time. */
  share(now: number, able: boolean, gear: GearState | null): number | null {
    this.now = now;
    const held = this.held;
    if (!held) return null;
    const share = (now - held.since) / GATHER_S;
    const { at, health } = this.holder();
    const stirred = Math.hypot(at[0] - held.at[0], at[1] - held.at[1]) > GATHER_STIR_M;
    const refused = gear !== null && gear.answered !== held.answered && gear.answer !== 0;
    if (refused || !(gear?.nodes.some((node) => node.index === held.node) ?? false) || share > 1.5) {
      this.held = null;
      this.quiet();
    } else if (!able || stirred || health < held.health) this.release();
    else held.health = health;
    return this.held ? Math.min(1, share) : null;
  }
}
