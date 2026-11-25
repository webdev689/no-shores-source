// The asks of the passages and the room's answers: one ask at a time, its yes seen once the dive has moved, a refusal
// said in the room's words, and no answer in ANSWER_WAIT_S said too.
import type { Foot } from '../foot.ts';
import { ASKS, type GearAsk, type GearItem, type GearState } from '../../network/gearMessages.ts';
import type { DiveState } from '../../network/passageMessages.ts';
import { answerText } from '../../player/gear.ts';
import { answerHeard } from './passageHeard.ts';

/** How long the page waits on the room's answer to an ask of the passages before saying it did not come. */
const ANSWER_WAIT_S = 10;
const UNANSWERED = 'Your room did not answer. Try again.';
/** The room's refusal of an ask that needs a lamp (crates/gear `Refusal::NoLamp`, plus one), and what it means for a
 *  begin at a lamp: the player has not lit it this week. */
const NO_LAMP = 174;
const LAMP_NOT_LIT = 'You have not lit that lamp this week.';

/** The player's gear as their room last said it, online or alone: a dive is played alone too. */
export function gearOf(foot: Foot | null): GearState | null {
  return foot ? (foot.held.gear ?? foot.held.alone) : null;
}

/** An ask of the passages awaiting the room's answer: the foot it was asked on (a room left drops it), how many asks
 *  the room had answered as it went, the dive as it stood, when it went, and what its yes does. */
export interface Asked {
  readonly foot: Foot;
  readonly kind: number;
  readonly answered: number;
  readonly dive: DiveState<GearItem> | null;
  readonly since: number;
  readonly yes: (dive: DiveState<GearItem> | null) => void;
}

export class PassageAsks {
  private asked: Asked | null = null;
  private readonly now: () => number;
  private readonly tell: (words: string) => void;

  /** `now` the rooms' clock in milliseconds, `tell` how a refusal or no answer is said. */
  constructor(now: () => number, tell: (words: string) => void) {
    [this.now, this.tell] = [now, tell];
  }

  /** Sends `asked`, its yes (a dive changed: begun, gone on, turned homeward or ended) doing `yes`; nothing while
   *  another ask awaits its answer. */
  ask(foot: Foot, asked: GearAsk, yes: Asked['yes'], send = (sent: GearAsk) => foot.fight.askGear(sent)): void {
    const gear = gearOf(foot);
    if (this.asked || !gear) return;
    const since = this.now() / 1000;
    this.asked = { foot, kind: asked.kind, answered: gear.answered, dive: gear.dive ?? null, since, yes };
    send(asked);
  }

  /** Each frame: the room's answer to the ask awaited, heard on `foot`'s gear; an ask of a room since left is no ask
   *  of the room stood in now. */
  frame(foot: Foot | null): void {
    if (this.asked && this.asked.foot !== foot) this.asked = null;
    const gear = gearOf(foot);
    const asked = this.asked;
    const late = asked !== null && this.now() / 1000 - asked.since > ANSWER_WAIT_S;
    const heard = asked && gear && answerHeard(asked, gear, late);
    if (!asked || !heard) return;
    this.asked = null;
    // After this frame, so the foot's own frame runs on the place it was begun in before the way leaves it.
    if (heard === 'yes') setTimeout(() => asked.yes(gear?.dive ?? null));
    else if (heard === 'unanswered') this.tell(UNANSWERED);
    else
      this.tell(asked.kind === ASKS.beginDive && heard.refused === NO_LAMP ? LAMP_NOT_LIT : answerText(heard.refused));
  }
}
