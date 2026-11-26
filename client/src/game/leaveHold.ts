// Leaving where the player stands on foot by holding a key, as Destiny's Ghost returns to orbit: the leave control (M,
// or the pad's View held) held for `LEAVE_S` traces a ring round its key beside the deed, low in the middle of the
// view, as holding E does; let go sooner, the ring drains away and nothing happens. Held through, the game asks the
// room to return the player to their ship (`toShip.ts`). Where it cannot be done (fallen) the prompt says why while
// the key is held, and fills nothing.
import type { Node } from '../ui/node.ts';
import { boundCap } from './controls.ts';
import { charge, play } from './uiSounds.ts';
import { PROMPT_ID, promptChip } from './usePrompt.ts';

/** How long the leave is held to act, and how long a hold let go takes to drain from full, seconds. */
export const LEAVE_S = 1.5;
const DRAIN_S = 0.3;

/** What stands over the play on foot that the leave waits under: a window (`paused`), the sheet of every control, the
 *  held map, the chat, or the stranger's welcome while she speaks. */
export interface Over {
  readonly paused: boolean;
  readonly sheet: boolean;
  readonly map: boolean;
  readonly chat: boolean;
  readonly speaking: boolean;
}

/** Whether the leave is offered on foot: with nothing over the play. */
export const leaveOffered = (over: Over): boolean =>
  !over.paused && !over.sheet && !over.map && !over.chat && !over.speaking;

export class LeaveHold {
  /** How far it is held, 0 to 1. */
  private share = 0;
  /** Held through and acted on: it waits to be let go before it fills again. */
  private spent = false;
  /** Why it cannot be done here, said while the key is held; null where it can. */
  private refusal: string | null = null;
  private quiet: (() => void) | null = null;

  /** Whether its prompt shows: while it is held or draining, or while a refusal is said. */
  get shown(): boolean {
    return this.share > 0 || this.refusal !== null;
  }

  /** How far it is held now, 0 to 1. */
  get held(): number {
    return this.share;
  }

  /** One frame `seconds` long: whether the key is `held`, whether leaving is `offered` here at all (on foot, no window
   *  up), and why it is `refused` where it is offered but cannot be done, else null. Answers true the one frame it is
   *  held through. */
  frame(held: boolean, offered: boolean, refused: string | null, seconds: number): boolean {
    this.refusal = offered && held ? refused : null;
    if (!offered || !held) this.spent = false;
    // Held through and still held, it stands full while the room answers.
    if (this.spent) return false;
    if (!offered || !held || refused !== null) {
      this.hush();
      this.share = offered ? Math.max(0, this.share - seconds / DRAIN_S) : 0;
      return false;
    }
    this.quiet ??= charge((1 - this.share) * LEAVE_S * 1000);
    this.share = Math.min(1, this.share + seconds / LEAVE_S);
    // Frames' seconds summed in floats fall a hair short of their whole.
    if (this.share < 1 - 1e-9) return false;
    this.share = 1;
    this.spent = true;
    this.hush();
    play('press');
    return true;
  }

  /** The prompt in a view `width` by `height` CSS pixels, naming the `place` left, where the use prompt stands, and
   *  what leaving costs (`warning`: a passage's haul lost); none while it does not show. */
  node(
    view: { readonly width: number; readonly height: number },
    place: string,
    warning: string | null = null,
  ): Node | null {
    if (!this.shown) return null;
    const big = view.width >= 1500 && view.height >= 900;
    const refusal = this.refusal;
    // A place's article small inside the sentence: "Leave a chalk cut".
    const named = place.replace(/^(A|An|The) /, (article) => article.toLowerCase());
    const under = [place === '' ? null : `Leave ${named}`, warning].filter((said) => said !== null).join('. ');
    const chip = refusal
      ? promptChip(refusal, null, boundCap('leave'))
      : promptChip('Return to ship', this.share, boundCap('leave'), under === '' ? null : under);
    return { ...chip, id: PROMPT_ID, float: { to: 'screen', at: [0.5, 1], anchor: [0.5, 1], y: big ? -154 : -110 } };
  }

  private hush(): void {
    this.quiet?.();
    this.quiet = null;
  }
}
