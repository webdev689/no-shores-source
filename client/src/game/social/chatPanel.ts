// The chat as Destiny's chat shows names: a dark band between two thin rules at the bottom left, each
// line its speaker's name in brackets and their words. Shut, it shows the newest five lines, each fading after a
// while; open (T), the newest that fit and a field to type in, its channel before it. Tab changes the channel, the up
// and down arrows read back, Enter says the line, and Escape shuts it. Colours are DFO's: each channel's words its own,
// each name by who it is to the player.
import type { Child, Node, Span } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { TONES } from '../../plus/tones.ts';
import { type Channel, LINE_MOST } from '../../../../server/accounts/chatLaw.ts';
import type { ChatLog, Logged } from './chatLog.ts';

/** The chat's field, which takes the keys while it is open. */
const CHAT_FIELD = 'chat-field';
/** The band's width at most, and its gap from the screen's left and bottom, in CSS pixels; and how many lines it shows
 *  open at most, as many as an arrow reads back. */
const WIDTH = 440;
const LEFT = 16;
const BOTTOM = { base: 250, wide: 340 } as const;
const OPEN_LINES = 12;
/** How much of the view's top the band keeps clear, for the vitals and the company, in CSS pixels; a line's height;
 *  and the fewest lines it shows open. */
const TOP_CLEAR = 200;
const LINE_PX = 16;
const FEWEST_LINES = 3;
/** The longest run of letters drawn unbroken: a longer one is broken for the band's width, its words kept. */
const WORD_MOST = 24;
/** What each channel is called before the field, and the colour of its words. */
const CHANNEL = {
  local: { words: 'Local', colour: '#c4beb2' },
  region: { words: 'Region', colour: '#8fe28f' },
  world: { words: 'World', colour: '#f6f2ea' },
  whisper: { words: 'Whisper', colour: '#ffaad4' },
} as const;
/** A notice's colour, and each name's by who it is to the player. */
const TOLD = '#8fb8d8';
const NAMES = { mine: '#e8cf86', company: TONES.company, friend: '#8fd0ff', other: '#f4b86c' } as const;
export type Relation = keyof typeof NAMES;
/** The band, dark enough that its lightest words read over a white sky, and its rules. */
const BAND = 'rgba(8,10,14,0.76)';
const RULE = 'rgba(242,239,230,0.55)';

/** A water's name as a line is marked with it: "The Lantern Sea" as "Lantern Sea". */
const waterShort = (water: string): string => water.replace(/^The /, '');

/** Words with each run of letters too long for the band broken into pieces it can wrap. */
const breakable = (words: string): string =>
  words.replace(new RegExp(`\\S{${WORD_MOST + 1},}`, 'gu'), (long) =>
    (long.match(new RegExp(`.{1,${WORD_MOST}}`, 'gsu')) ?? [long]).join(' '),
  );

/** A kept line's words as the band shows it: a notice plain, a World or Region line marked so, a Whisper said to or
 *  from. */
export function lineSpans(logged: Logged, relation: (name: string) => Relation): Span[] {
  const line = logged.line;
  if (!line) return [{ words: breakable(logged.told), colour: TOLD }];
  const colour = CHANNEL[line.channel].colour;
  const name = (who: string): Span => ({ words: `[${who}]`, colour: NAMES[relation(who)] });
  const text = breakable(line.text);
  if (line.channel === 'whisper' && line.to !== undefined && relation(line.from) === 'mine')
    return [{ words: 'To ', colour }, name(line.to), { words: `: ${text}`, colour }];
  const mark =
    line.channel === 'world' ? 'World' : line.channel === 'region' ? waterShort(line.region ?? 'Region') : '';
  const lead: Span[] = mark ? [{ words: `[${mark}] `, colour }] : [];
  const says = line.channel === 'whisper' ? ' whispers' : '';
  return [...lead, name(line.from), { words: `${says}: ${text}`, colour }];
}

export class ChatPanel {
  /** Whether the field is up, the channel it says to, and to whom for a Whisper. */
  open = false;
  channel: Channel = 'local';
  to: string | null = null;
  /** Whether the player is at sea, where Region stands in Local's place, and the name of the water there. */
  private atSea = false;
  private water: string | null = null;
  /** The newest line shown while reading back, by its number (none follows the newest), and how many lines the open
   *  band shows, as the view last had room. */
  private anchor: number | null = null;
  private fits = OPEN_LINES;
  /** Whether it opened this frame: the key that opened it is not a line said. */
  private fresh = false;

  /** Opens the field, on `channel` (to `to` for a Whisper) where given. */
  show(channel?: Channel, to?: string): void {
    [this.open, this.fresh, this.anchor] = [true, true, null];
    if (channel) [this.channel, this.to] = [channel, to ?? null];
    this.place(this.atSea, this.water);
  }

  shut(ui: Interface): void {
    this.open = false;
    if (ui.focused(CHAT_FIELD)) ui.focusOn(null);
  }

  /** Where the player is: at sea in `water`, or on land. Region takes Local's place at sea, and Local Region's on
   *  land. */
  place(atSea: boolean, water: string | null): void {
    [this.atSea, this.water] = [atSea, water];
    if (atSea && this.channel === 'local') this.channel = 'region';
    if (!atSea && this.channel === 'region') this.channel = 'local';
  }

  /** The band this frame for `log` at `now` in a view `view` CSS pixels big; a line typed and said goes to `say`,
   *  which answers whether the field stays open, is cleared, or shuts. */
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
    // A short view shows fewer lines, and the band is cut at the room above it, so it stays clear of the top.
    const room = Math.max(FEWEST_LINES * LINE_PX + 3 * LINE_PX, view.height - bottom - TOP_CLEAR);
    this.fits = Math.max(FEWEST_LINES, Math.min(OPEN_LINES, Math.floor(room / LINE_PX) - 2));
    if (this.open) this.hear(ui, log, say);
    const shown = this.open ? this.reading(log) : log.peek(now);
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
      maxHeight: room,
      clip: true,
      direction: 'column',
      fill: BAND,
      opacity: fade,
      through: !this.open,
      solid: this.open,
      float: { to: 'screen', anchor: [0, 1], at: [0, 1], x: LEFT, y: -bottom },
      children: [
        rule,
        // The newest stand at the foot, so a band cut short loses its oldest rows first.
        {
          width: 'grow',
          height: 'grow',
          clip: true,
          direction: 'column',
          alignY: 'end',
          gap: 2,
          padding: [6, 10],
          children: lines,
        },
        this.open && this.fieldRow(),
        rule,
      ],
    };
  }

  /** The lines the open band reads: the newest that fit, or those up to the line read back to. */
  private reading(log: ChatLog): readonly Logged[] {
    const lines = log.lines;
    const found = this.anchor === null ? -1 : lines.findIndex((logged) => logged.key === this.anchor);
    if (found < 0) this.anchor = null;
    const end = found < 0 ? lines.length : found + 1;
    return lines.slice(Math.max(0, end - this.fits), end);
  }

  /** Reads back (`step` -1) or on (1) a band's worth of lines; reading on past the newest follows it again. */
  private readOn(log: ChatLog, step: -1 | 1): void {
    const lines = log.lines;
    const newest = this.anchor === null ? lines.length - 1 : lines.findIndex((logged) => logged.key === this.anchor);
    const next = Math.max(Math.min(this.fits, lines.length) - 1, newest + step * this.fits);
    this.anchor = next >= lines.length - 1 ? null : (lines[next]?.key ?? null);
  }

  /** The field, its channel before it: at sea Region by its water's name. */
  private fieldRow(): Node {
    const { words, colour } = CHANNEL[this.channel];
    const label =
      this.channel === 'whisper' && this.to
        ? `To ${this.to}:`
        : this.channel === 'region' && this.water
          ? `${waterShort(this.water)}:`
          : `${words}:`;
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
          label: `Say something - ${label.slice(0, -1)}`,
          field: { most: LINE_MOST, placeholder: `Say something - ${label.slice(0, -1)}` },
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
    const near: Channel = this.atSea ? 'region' : 'local';
    for (const key of ui.keysOn(CHAT_FIELD)) {
      if (key === 'tab') [this.channel, this.to] = [this.channel === near ? 'world' : near, null];
      if (key === 'arrowup') this.readOn(log, -1);
      if (key === 'arrowdown') this.readOn(log, 1);
    }
    if (!ui.submitted(CHAT_FIELD)) return;
    const typed = ui.fieldText(CHAT_FIELD);
    if (typed.trim() === '') return this.shut(ui);
    const after = say(typed);
    this.anchor = null;
    if (after !== 'keep') ui.setFieldText(CHAT_FIELD, '');
    if (after === 'shut') this.shut(ui);
  }
}
