// The story's arms on the wreck's deck: its sword and shield where the ram threw them, and the bow the boarder drops
// where it fell, each drawn lying there (`LyingArms`) until the player walks over it, when the room puts it in their
// pack (`Room::story_take`). Should one leave the pack (dismantled), it lies on the deck again to be taken up.
import type { GearState } from '../../network/gearMessages.ts';
import type { RoomThread } from '../../network/roomThread.ts';
import type { CardAt, Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import type { Arms, Bow } from './tutorial.ts';
import type { WreckLayout } from './wreckLayout.ts';
import { ARMS_ITEM, armsAt, armsOf, BOW, BOW_ITEM, LyingArms, type Point, SWORD_AND_SHIELD } from './wreckTeaching.ts';

export class StoryArms {
  private readonly forge: Cards;
  /** The player's gear as the room last sent it. */
  private readonly gear: { readonly value: GearState | null };
  private readonly sword: LyingArms;
  private bowLying: LyingArms | null = null;
  /** The kinds asked of the room that it has not yet sent word of in the pack: asked once. */
  private readonly asked = new Set<number>();

  constructor(layout: WreckLayout, forge: Cards, gear: { readonly value: GearState | null }) {
    [this.forge, this.gear] = [forge, gear];
    this.sword = new LyingArms(ARMS_ITEM, armsAt(layout), forge);
  }

  /** Where the player's sword and shield are. */
  get arms(): Arms {
    return armsOf(this.gear.value);
  }

  /** Where the boarder's bow is: none until it is dropped. */
  get bow(): Bow {
    return this.bowLying ? armsOf(this.gear.value, BOW) : 'none';
  }

  /** The boarder's bow drops where it fell, at `fell`, once. */
  dropBow(fell: Point): void {
    this.bowLying ??= new LyingArms(BOW_ITEM, fell, this.forge);
  }

  /** Each item lying on the deck now, by its kind: in no pack and not asked for. */
  private lying(): [number, LyingArms][] {
    const all: [number, LyingArms | null][] = [
      [SWORD_AND_SHIELD, this.sword],
      [BOW, this.bowLying],
    ];
    return all.flatMap(([kind, lying]) =>
      lying && !this.asked.has(kind) && armsOf(this.gear.value, kind) === 'lying' ? [[kind, lying] as const] : [],
    );
  }

  /** An item lying under `feet` is taken up: the room is asked once to put it in the pack, and refused (a pack with
   *  no room) it lies there to be asked for again. */
  take(feet: Point, room: RoomThread): void {
    for (const kind of [...this.asked]) if (armsOf(this.gear.value, kind) !== 'lying') this.asked.delete(kind);
    for (const [kind, lying] of this.lying()) {
      if (!lying.reached(feet)) continue;
      this.asked.add(kind);
      void room.story({ ask: 'take', kind }).then((given) => {
        if (given === 0) this.asked.delete(kind);
      });
    }
  }

  /** The items lying on the deck as cards among the figures, drawn on `body`, at `clock` on the page's clock. */
  figures(body: Dress, clock: number): CardAt[] {
    return this.lying().flatMap(([, lying]) => lying.figure(body, clock) ?? []);
  }

  /** `marks` with the line of light over each item lying laid after them. */
  marks(marks: number[], clock: number, eye: Point): number[] {
    for (const [, lying] of this.lying()) lying.mark(marks, clock, eye);
    return marks;
  }

  /** Lets the cards' textures go. */
  leave(): void {
    this.sword.leave();
    this.bowLying?.leave();
  }
}
