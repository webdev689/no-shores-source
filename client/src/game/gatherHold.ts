// A resource node gathered by holding E (the room's `Gathering`): begun on E, let go of when E is released, the body
// stirs or is hurt, or E can do nothing; done once the room no longer stands the node for the player. The room judges
// it all; this only shows how far it has been held.
import type { GearState } from '../network/gearMessages.ts';
import { GATHER_S, GATHER_STIR_M } from './footGear.ts';

/** Where the body stands and its health, as a gather reads them each frame. */
export interface Holder {
  readonly at: readonly [number, number];
  readonly health: number;
}

export class GatherHold {
  /** The node being gathered, when on the frames' clock it began, and where the body stood and its health then. */
  private held: { readonly node: number; readonly since: number; readonly from: Holder } | null = null;
  /** The frames' clock as last read. */
  private now = 0;
  private readonly letGo: () => void;
  private readonly holder: () => Holder;

  /** `letGo` tells the room a gather is let go of; `holder` reads the body now. */
  constructor(letGo: () => void, holder: () => Holder) {
    this.letGo = letGo;
    this.holder = holder;
  }

  /** E pressed where it gathers `node`, if it does. */
  begin(node: number | undefined): void {
    if (node !== undefined) this.held = { node, since: this.now, from: this.holder() };
  }

  /** E released: a gather under way is let go of, and the room told. */
  release(): void {
    if (!this.held) return;
    this.held = null;
    this.letGo();
  }

  /** How far the gather under way has been held at `now` (0 to 1), or null with none. One whose body stirred or was
   *  hurt, or that E can no longer do (`able`), is let go of; one whose node the room no longer stands for the player
   *  is done (or was let go there), as is one held well past its time. */
  share(now: number, able: boolean, gear: GearState | null): number | null {
    this.now = now;
    const held = this.held;
    if (!held) return null;
    const share = (now - held.since) / GATHER_S;
    const { at, health } = this.holder();
    const stirred = Math.hypot(at[0] - held.from.at[0], at[1] - held.from.at[1]) > GATHER_STIR_M;
    if (!(gear?.nodes.some((node) => node.index === held.node) ?? false) || share > 1.5) this.held = null;
    else if (!able || stirred || health < held.from.health) this.release();
    return this.held ? Math.min(1, share) : null;
  }
}
