// A resource node gathered by holding E (the room's `Gathering`): begun on E, let go of when E is released, the body
// stirs or is hurt, or E can do nothing; done once the room no longer stands the node for the player. The room judges
// it all; this only shows how far it has been held, and sounds the hold's build-up as the menus' holds do.
import type { GearState } from '../network/gearMessages.ts';
import { GATHER_S, GATHER_STIR_M } from './footGear.ts';
import { charge } from './uiSounds.ts';

/** Where the body stands and its health, as a gather reads them each frame. */
export interface Holder {
  readonly at: readonly [number, number];
  readonly health: number;
}

export class GatherHold {
  /** The node being gathered, when on the frames' clock it began, and where the body stood and its health then. */
  private held: { readonly node: number; readonly since: number; readonly from: Holder } | null = null;
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

  /** E pressed where it gathers `node`, if it does. */
  begin(node: number | undefined): void {
    if (node === undefined) return;
    this.quiet();
    this.held = { node, since: this.now, from: this.holder() };
    this.quiet = charge(GATHER_S * 1000);
  }

  /** E released: a gather under way is let go of, and the room told. */
  release(): void {
    if (!this.held) return;
    this.held = null;
    this.quiet();
    this.letGo();
  }

  /** What the gather under way works, as the figure shows it: what its node's place holds (`places`, matched to the
   *  room's node where it stands), and how long it has been held; null with none. */
  worked(
    gear: GearState | null,
    places: readonly { readonly at: readonly [number, number]; readonly holds?: string }[],
  ): { readonly holds: string; readonly seconds: number } | null {
    const held = this.held;
    const node = held && gear?.nodes.find((each) => each.index === held.node);
    const place = node && places.find(({ at: [east, south] }) => Math.hypot(east - node.x, south - node.y) < 0.5);
    return held && place?.holds ? { holds: place.holds, seconds: this.now - held.since } : null;
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
    if (!(gear?.nodes.some((node) => node.index === held.node) ?? false) || share > 1.5) {
      this.held = null;
      this.quiet();
    } else if (!able || stirred || health < held.from.health) this.release();
    return this.held ? Math.min(1, share) : null;
  }
}
