// The lines the chat keeps, as DFO's chat kept them: the newest two hundred to read back while it is open, and while it
// is shut the newest five, each shown twenty seconds, whole for three quarters of that and then fading out. A Local
// line is kept only from a player near enough to hear, and the player's own always.
import { type ChatLine, EARSHOT_M, LINES_KEPT, PEEK_LINES, PEEK_MS } from '../../../../server/accounts/chatLaw.ts';

/** One kept line: a player's line, or a notice for the player alone (null `line`), when it came, and its number. */
export interface Logged {
  readonly key: number;
  readonly at: number;
  readonly line: ChatLine | null;
  readonly told: string;
}

/** How much a line `age` milliseconds old shows while the chat is shut: whole for three quarters of its time, then
 *  fading to nothing, in steps of a twentieth. */
export function peekShare(age: number): number {
  if (age < 0 || age >= PEEK_MS) return age < 0 ? 1 : 0;
  const whole = PEEK_MS * 0.75;
  const share = age <= whole ? 1 : 1 - (age - whole) / (PEEK_MS - whole);
  return Math.round(share * 20) / 20;
}

export class ChatLog {
  private kept: Logged[] = [];
  private count = 0;
  /** The last player who whispered to this one, whom `/r` answers; null before any has. */
  lastWhisperer: string | null = null;

  /** A player's line heard `when`, as `mine` (null for a guest) reads it: a Local one only from one `near` enough, or
   *  their own. */
  heard(line: ChatLine, when: number, mine: string | null, near: (name: string) => boolean): void {
    const own = line.from === mine;
    if (line.channel === 'local' && !own && !near(line.from)) return;
    if (line.channel === 'whisper' && !own) this.lastWhisperer = line.from;
    this.keep({ key: this.count++, at: when, line, told: '' });
  }

  /** A notice for the player alone, told `when`. */
  told(words: string, when: number): void {
    this.keep({ key: this.count++, at: when, line: null, told: words });
  }

  /** Every line kept, oldest first. */
  get lines(): readonly Logged[] {
    return this.kept;
  }

  /** The lines the shut chat shows at `now`, oldest first, each with how much of it shows. */
  peek(now: number): readonly (Logged & { readonly share: number })[] {
    return this.kept
      .slice(-PEEK_LINES)
      .map((logged) => ({ ...logged, share: peekShare(now - logged.at) }))
      .filter((logged) => logged.share > 0);
  }

  private keep(logged: Logged): void {
    this.kept.push(logged);
    if (this.kept.length > LINES_KEPT) this.kept = this.kept.slice(-LINES_KEPT);
  }
}

/** Whether a Local line from a player standing at `there` is heard by one standing at `own`: within EARSHOT_M across
 *  the ground; in a Breach's run (`wholeRoom`) from anywhere in it, as its company calls across its spaces (the
 *  Steward's order to its taken, in shores far from its court). */
export function heardLocally(
  there: readonly number[] | undefined,
  own: readonly number[] | null,
  wholeRoom: boolean,
): boolean {
  if (!there || !own) return false;
  return wholeRoom || Math.hypot((there[0] ?? 0) - (own[0] ?? 0), (there[1] ?? 0) - (own[1] ?? 0)) <= EARSHOT_M;
}
