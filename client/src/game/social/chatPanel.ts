// The chat as the owner's picture of Destiny's shows names: a dark band between two thin rules at the bottom left, each
// line its speaker's name in brackets and their words. Shut, it shows the newest five lines, each fading after a
// while; open (Enter), the newest that fit and a field to type in, its channel before it. Tab changes the channel,
// the up and down arrows read back, Enter says the line, and Escape shuts it. Colours are DFO's: each channel's words
// its own, each name by who it is to the player.
import type { Child, Node, Span } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { TONES } from '../../plus/tones.ts';
import { type Channel, LINE_MOST } from '../../../../server/accounts/chatLaw.ts';
import type { ChatLog, Logged } from './chatLog.ts';

/** The chat's field, which takes the keys while it is open. */
export const CHAT_FIELD = 'chat-field';
/** The band's width at most, and its gap from the screen's left and bottom, in CSS pixels; and how many lines it shows
 *  open at most, as many as an arrow reads back. */
const WIDTH = 440;
const LEFT = 16;
const BOTTOM = { base: 250, wide: 340 } as const;
const OPEN_LINES = 12;
/** How much of the view's top the open band keeps clear, for the vitals and the company, in CSS pixels; a line's
 *  height; and the fewest lines it shows open. */
const TOP_CLEAR = 200;
const LINE_PX = 16;
const FEWEST_LINES = 3;
/** What each channel is called before the field, and the colour of its words. */
const CHANNEL = {
  local: { words: 'Local', colour: '#c4beb2' },
  world: { words: 'World', colour: '#f6f2ea' },
  whisper: { words: 'Whisper', colour: '#ffaad4' },
} as const;
/** A notice's colour, and each name's by who it is to the player. */
const TOLD = '#8fb8d8';
const NAMES = { mine: '#e8cf86', company: TONES.company, friend: '#8fd0ff', other: '#f4b86c' } as const;
export type Relation = keyof typeof NAMES;
/** The band, and its rules. */
const BAND = 'rgba(8,10,14,0.62)';
const RULE = 'rgba(242,239,230,0.55)';

/** A kept line's words as the band shows it: a notice plain, a World line marked so, a Whisper said to or from. */
export function lineSpans(logged: Logged, relation: (name: string) => Relation): Span[] {
  const line = logged.line;
  if (!line) return [{ words: logged.told, colour: TOLD }];
  const colour = CHANNEL[line.channel].colour;
  const name = (who: string): Span => ({ words: `[${who}]`, colour: NAMES[relation(who)] });
  if (line.channel === 'whisper' && line.to !== undefined && relation(line.from) === 'mine')
    return [{ words: 'To ', colour }, name(line.to), { words: `: ${line.text}`, colour }];
  const lead: Span[] = line.channel === 'world' ? [{ words: '[World] ', colour }] : [];
  const says = line.channel === 'whisper' ? ' whispers' : '';
  return [...lead, name(line.from), { words: `${says}: ${line.text}`, colour }];
}

export class ChatPanel {
  /** Whether the field is up, the channel it says to, and to whom for a Whisper. */
  open = false;
  channel: Channel = 'local';
  to: string | null = null;
  /** How many lines back from the newest the open band reads, and how many it shows, as the view last had room. */
  private back = 0;
  private fits = OPEN_LINES;
  /** Whether it opened this frame: the Enter that opened it is not a line said. */
  private fresh = false;

  /** Opens the field, on `channel` (to `to` for a Whisper) where given. */
  show(channel?: Channel, to?: string): void {
    [this.open, this.fresh, this.back] = [true, true, 0];
    if (channel) [this.channel, this.to] = [channel, to ?? null];
  }

  shut(ui: Interface): void {
    this.open = false;
    if (ui.focused(CHAT_FIELD)) ui.focusOn(null);
  }

  /** The band this frame for `log` at `now` in a view `view` CSS pixels big; a line typed and said goes to `say`,
   *  which answers whether the field stays open. */
  node(
    ui: Interface,
    log: ChatLog,
    now: number,
    view: { readonly width: number; readonly height: number },
    relation: (name: string) => Relation,
    say: (typed: string) => 'shut' | 'keep' | 'clear',
  ): Child {
    const width = Math.min(WIDTH, view.width - LEFT * 2);
    const bottom = view.width >= 1500 && view.height >= 900 ? BOTTOM.wide : BOTTOM.base;
    // A short view shows fewer lines open, so the band stays clear of the vitals and the company at the top.
    const room = Math.floor((view.height - bottom - TOP_CLEAR - 2 * LINE_PX) / LINE_PX);
    this.fits = Math.max(FEWEST_LINES, Math.min(OPEN_LINES, room));
    if (this.open) this.hear(ui, log, say);
    const shown = this.open
      ? log.lines.slice(Math.max(0, log.lines.length - this.fits - this.back), log.lines.length - this.back)
      : log.peek(now);
    if (!this.open && shown.length === 0) return null;
    // Shut, the band fades with its newest line, and each older line by as much more as it has faded beyond it.
    const shareOf = (logged: Logged) => ('share' in logged && typeof logged.share === 'number' ? logged.share : 1);
    const fade = this.open ? 1 : Math.max(...shown.map(shareOf));
    const lines = shown.map((logged): Node => ({
      width: 'grow',
      text: { words: lineSpans(logged, relation), edge: 'shadow', edgeColour: '#000' },
      ...(shareOf(logged) < fade ? { opacity: shareOf(logged) / fade } : {}),
    }));
    const rule: Node = { width: 'grow', height: 1, fill: RULE };
    return {
      id: 'chat',
      width,
      direction: 'column',
      fill: BAND,
      opacity: fade,
      through: !this.open,
      float: { to: 'screen', anchor: [0, 1], at: [0, 1], x: LEFT, y: -bottom },
      children: [
        rule,
        { width: 'grow', direction: 'column', gap: 2, padding: [6, 10], children: lines },
        this.open && this.fieldRow(),
        rule,
      ],
    };
  }

  /** The field, its channel before it. */
  private fieldRow(): Node {
    const { words, colour } = CHANNEL[this.channel];
    const label = this.channel === 'whisper' && this.to ? `To ${this.to}:` : `${words}:`;
    return {
      width: 'grow',
      gap: 8,
      alignY: 'center',
      padding: [0, 10, 6, 10],
      children: [
        { text: { words: label, colour, wrap: false } },
        {
          id: CHAT_FIELD,
          width: 'grow',
          height: 24,
          padding: [0, 6],
          alignY: 'center',
          fill: 'rgba(0,0,0,0.35)',
          label: `Say something - ${words}`,
          field: { most: LINE_MOST, placeholder: `Say something - ${words}` },
          keys: ['tab', 'arrowup', 'arrowdown'],
        },
      ],
    };
  }

  /** What the open field heard this frame: a line said, a key that changes the channel or reads back, or Escape. */
  private hear(ui: Interface, log: ChatLog, say: (typed: string) => 'shut' | 'keep' | 'clear'): void {
    if (this.fresh) {
      this.fresh = false;
      ui.focusOn(CHAT_FIELD);
      return;
    }
    if (!ui.focused(CHAT_FIELD)) return this.shut(ui);
    for (const key of ui.keysOn(CHAT_FIELD)) {
      if (key === 'tab') [this.channel, this.to] = [this.channel === 'local' ? 'world' : 'local', null];
      if (key === 'arrowup') this.back = Math.min(Math.max(0, log.lines.length - this.fits), this.back + this.fits);
      if (key === 'arrowdown') this.back = Math.max(0, this.back - this.fits);
    }
    if (!ui.submitted(CHAT_FIELD)) return;
    const typed = ui.fieldText(CHAT_FIELD);
    if (typed.trim() === '') return this.shut(ui);
    const after = say(typed);
    this.back = 0;
    if (after !== 'keep') ui.setFieldText(CHAT_FIELD, '');
    if (after === 'shut') this.shut(ui);
  }
}
