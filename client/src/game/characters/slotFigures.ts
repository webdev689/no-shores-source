// Each slot's character drawn by the forge, as Inspect draws another player from what their room kept: in its look and
// the pieces it wears, standing idle; and an empty slot's dim silhouette, the first look's figure in shadow. One
// picture is drawn at a time, the forge's own way, each kept for its slot until what it shows changes.
import type { Details } from '../../network/accounts.ts';
import type { Slot } from '../../network/characters.ts';
import type { Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import { gearOutfit } from '../../player/gearLooks.ts';
import type { Picture } from '../../player/picture.ts';
import { FIRST_LOOK, plainDressOf } from '../prologue/look.ts';
import { inspectedGear } from '../social/inspectGear.ts';
import { lookOf } from './characterMark.ts';

/** The shadow an empty slot's figure is cast in. */
const SHADOW = [26, 29, 36] as const;

/** A slot's character's dress: its look (the first look where none is kept), and the pieces it wears. */
export function slotDress(forge: Pick<Cards, 'wardrobe'>, slot: Slot): Dress {
  const plain = plainDressOf(lookOf(slot.look) ?? FIRST_LOOK);
  const gear = slot.shown ? inspectedGear({ shown: slot.shown } as Details) : null;
  const wardrobe = gear ? forge.wardrobe(plain.body) : null;
  return gear && wardrobe ? { ...plain, outfit: gearOutfit(gear, wardrobe, plain.outfit) } : plain;
}

/** A figure in shadow: every pixel drawn the one dark colour, as it was clear or not. */
export function silhouetteOf(picture: Picture): Picture {
  const pixels = new Uint8ClampedArray(picture.pixels);
  for (let place = 0; place < pixels.length; place += 4) [pixels[place], pixels[place + 1], pixels[place + 2]] = SHADOW;
  return { ...picture, pixels };
}

export class SlotFigures {
  private readonly forge: () => Pick<Cards, 'picture' | 'wardrobe'> | null;
  /** Each slot's picture by what it was drawn for, and the empty slot's shadow. */
  private readonly drawn = new Map<number, { readonly key: string; picture: Picture | null }>();
  private shadow: Picture | null = null;
  private drawing: Promise<unknown> = Promise.resolve();
  private asked = false;

  constructor(forge: () => Pick<Cards, 'picture' | 'wardrobe'> | null) {
    this.forge = forge;
  }

  /** The picture of `slot`'s character (an empty slot's shadow), once drawn; null until then. */
  figureOf(place: number, slot: Slot | null): Picture | null {
    const forge = this.forge();
    if (!forge) return null;
    if (!slot) {
      if (!this.asked) {
        this.asked = true;
        this.draw(forge, plainDressOf(FIRST_LOOK), (picture) => (this.shadow = silhouetteOf(picture)));
      }
      return this.shadow;
    }
    const dress = slotDress(forge, slot);
    const key = JSON.stringify(dress);
    const known = this.drawn.get(place);
    if (known?.key === key) return known.picture;
    const fresh: { readonly key: string; picture: Picture | null } = { key, picture: null };
    this.drawn.set(place, fresh);
    this.draw(forge, dress, (picture) => (fresh.picture = picture));
    return known?.picture ?? null;
  }

  /** Draws `dress` after whatever is drawing, one at a time. */
  private draw(forge: Pick<Cards, 'picture'>, dress: Dress, done: (picture: Picture) => void): void {
    this.drawing = this.drawing
      .then(() => forge.picture(dress, 'idle', 0))
      .then(
        (picture) => picture && done(picture),
        (error: unknown) => console.error('a character could not be drawn:', error),
      );
  }
}
