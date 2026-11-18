// A bar of the fight's display: its trough and fill in the kit's roles, and behind the fill what it last lost. As DFO's
// Enhanced HUD did, a strip holds where the bar stood for a moment after a loss and then drains to it, so a blow reads
// as how much it took and not only where it left the bar.
import { ROLES } from '../plus/kit.ts';

/** How long the lost strip stands after a loss before it drains, in seconds; the longest it stands however the losses
 *  keep coming, so a bar losing a little every frame still drains; and how fast it drains, in shares a second. */
export const LOSS_HOLD = 0.55;
export const LOSS_HOLD_MOST = 1.2;
export const LOSS_DRAIN = 0.7;

/** The lost strip: where it stands, the bar's share under it, its hold left and how long it has stood. */
export interface Loss {
  readonly at: number;
  readonly share: number;
  readonly hold: number;
  readonly stood: number;
}

/** One frame of the lost strip, `seconds` after `was` (null on a bar's first frame), the bar now at `share`. A gain
 *  sets it on the bar; a fresh loss holds it again where it stands, so a flurry reads as one run of harm. */
export function stepLoss(was: Loss | null, share: number, seconds: number): Loss {
  const now = Math.max(0, Math.min(1, share));
  if (!was || now >= was.at) return { at: now, share: now, hold: LOSS_HOLD, stood: 0 };
  const stood = was.stood + seconds;
  if (stood < LOSS_HOLD_MOST) {
    if (now < was.share) return { at: was.at, share: now, hold: LOSS_HOLD, stood };
    if (was.hold > 0) return { at: was.at, share: now, hold: was.hold - seconds, stood };
  }
  return { at: Math.max(now, was.at - LOSS_DRAIN * seconds), share: now, hold: 0, stood };
}

const percent = (share: number) => `${Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10}%`;

export function element(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const made = document.createElement(tag);
  made.className = className;
  made.textContent = text;
  parent.append(made);
  return made;
}

/** A bar: a trough, the strip of what it lost and its fill; `lossShown` false for a bar that drains of itself. */
export class Meter {
  readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly lost: HTMLElement | null;
  private loss: Loss | null = null;

  constructor(parent: HTMLElement, className: string, lossShown = true) {
    this.root = element('div', `meter ${className} ${ROLES.track}`, parent);
    this.lost = lossShown ? element('i', 'lost', this.root) : null;
    this.fill = element('i', `fill ${ROLES.meter}`, this.root);
  }

  /** Shows the bar at `share`, `seconds` after the last frame. */
  set(share: number, seconds: number): void {
    this.loss = stepLoss(this.loss, share, seconds);
    this.fill.style.width = percent(this.loss.share);
    if (this.lost) this.lost.style.width = percent(this.loss.at);
  }

  /** Forgets what the bar lost: it shows another figure from now. */
  forget(): void {
    this.loss = null;
  }
}
