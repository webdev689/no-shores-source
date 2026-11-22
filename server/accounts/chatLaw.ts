// The chat's law, which the page and the accounts' hall both keep: DFO's chat cut to three channels. Local is heard by
// the players near enough, World by everyone online, and a Whisper by one player alone. A line is cleaned the same at
// both ends, and a slash command names a channel or a player; anything else is said on the channel the field is set
// to.

/** The three channels. */
export const CHANNELS = ['local', 'world', 'whisper'] as const;
export type Channel = (typeof CHANNELS)[number];

/** The longest line, in UTF-16 units, as DFO's. */
export const LINE_MOST = 240;
/** How far a Local line is heard, across the ground, in metres: as far as a name over a head reads (DFO's law). */
export const EARSHOT_M = 60;
/** How many lines a player may send a second, and in a burst. */
export const LINES_A_SECOND = 2;
/** How many lines are kept to read back, and how many the closed chat shows, each for how long, in milliseconds. */
export const LINES_KEPT = 200;
export const PEEK_LINES = 5;
export const PEEK_MS = 20_000;
/** A Whisper's longest name: a username's most. */
export const NAME_MOST = 20;

/** Control characters, the marks that turn text's direction, and other format marks, which could hide or reorder what
 *  others read; a joiner is kept, for emoji. */
const HIDDEN = /[\p{Cc}\p{Cf}]/gu;
const KEPT_FORMAT = /‍/u;

/** A line as others may read it: hidden marks taken out, runs of space made one, trimmed and cut to `LINE_MOST`,
 *  never through a pair's halves. Empty when nothing is left to say. */
export function cleanLine(text: string): string {
  const shown = text
    .replace(HIDDEN, (mark) => (KEPT_FORMAT.test(mark) ? mark : mark === '\t' || mark === '\n' ? ' ' : ''))
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, LINE_MOST);
  return shown.replace(/[\ud800-\udbff]$/u, '').trim();
}

/** What a line typed in the field asks: to say words on a channel (to a player, for a Whisper; `again` for a reply
 *  to the last who whispered), to show the commands, or a command that is none, or one with nothing to say. */
export type Typed =
  | { readonly kind: 'say'; readonly channel: Channel; readonly words: string; readonly to?: string }
  | { readonly kind: 'reply'; readonly words: string }
  | { readonly kind: 'switch'; readonly channel: Channel; readonly to?: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly name: string }
  | { readonly kind: 'empty'; readonly name: string };

/** Each command's names, as DFO spelled them for Local and World; a Whisper's are new, and `/r` replies, where DFO's
 *  named its regions, of which Overlook has none. */
const COMMANDS: Readonly<Record<string, Channel | 'reply' | 'help'>> = {
  l: 'local',
  local: 'local',
  s: 'local',
  say: 'local',
  g: 'world',
  world: 'world',
  w: 'whisper',
  whisper: 'whisper',
  tell: 'whisper',
  r: 'reply',
  reply: 'reply',
  help: 'help',
  '?': 'help',
};

/** The commands as `/help` lists them. */
export const HELP = [
  '/l words: say it to those near you (Local).',
  '/g words: say it to everyone online (World).',
  '/w Name words: whisper it to one player.',
  '/r words: whisper back to the last who whispered to you.',
  'Tab changes the channel. //words says them as typed.',
] as const;

/** What `typed` asks, the field set to `channel` (to `to`, for a Whisper). A line not starting with a slash is said
 *  there; `//` says the rest as typed; a channel's command with nothing after it sets the field to that channel. */
export function readTyped(typed: string, channel: Channel, to?: string): Typed {
  const trimmed = typed.trim();
  const plain = (words: string): Typed =>
    channel === 'whisper' && to ? { kind: 'say', channel, words, to } : { kind: 'say', channel, words };
  if (!trimmed.startsWith('/')) return plain(trimmed);
  if (trimmed.startsWith('//')) return plain(trimmed.slice(1));
  const found = /^\/([A-Za-z?][\w-]*)(?:\s+([\s\S]*))?$/u.exec(trimmed);
  const name = (found?.[1] ?? trimmed.slice(1)).toLowerCase();
  const rest = (found?.[2] ?? '').trim();
  const command = found ? COMMANDS[name] : undefined;
  if (command === undefined) return { kind: 'unknown', name };
  if (command === 'help') return { kind: 'help' };
  if (command === 'reply') return rest === '' ? { kind: 'empty', name } : { kind: 'reply', words: rest };
  if (command !== 'whisper')
    return rest === '' ? { kind: 'switch', channel: command } : { kind: 'say', channel: command, words: rest };
  const [whom = '', ...words] = rest.split(' ');
  const said = words.join(' ').trim();
  if (whom === '') return { kind: 'empty', name };
  return said === ''
    ? { kind: 'switch', channel: 'whisper', to: whom }
    : { kind: 'say', channel: 'whisper', words: said, to: whom };
}

/** What a refused command tells the player. */
export function refusedWords(typed: Extract<Typed, { kind: 'unknown' | 'empty' }>): string {
  return typed.kind === 'unknown'
    ? `There is no /${typed.name} command. /help lists them.`
    : `/${typed.name} needs something to say.`;
}

/** A line as it crosses between the page and the hall: its channel, who said it, to whom for a Whisper, and its
 *  words. */
export interface ChatLine {
  readonly channel: Channel;
  readonly from: string;
  readonly to?: string;
  readonly text: string;
}

/** What the hall tells a page: a line, a notice for that player alone, or who they are once signed in (null for a
 *  guest, who has no name to speak with). */
export type FromHall =
  { readonly line: ChatLine } | { readonly told: string } | { readonly welcome: { readonly name: string | null } };

/** What the page asks the hall: to say words on a channel, to a player for a Whisper. */
export interface Said {
  readonly say: string;
  readonly channel: Channel;
  readonly to?: string;
}

/** A page's ask as the hall reads it, or null for one that is none. */
export function saidOf(text: string): Said | null {
  let read: unknown;
  try {
    read = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof read !== 'object' || read === null) return null;
  const { say, channel, to } = read as Record<string, unknown>;
  if (typeof say !== 'string' || !CHANNELS.includes(channel as Channel)) return null;
  if (channel === 'whisper' && (typeof to !== 'string' || to.length > NAME_MOST)) return null;
  return channel === 'whisper' ? { say, channel, to: to as string } : { say, channel: channel as Channel };
}

/** A hall's message as the page reads it, or null for one that is none. */
export function fromHallOf(text: string): FromHall | null {
  let read: unknown;
  try {
    read = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof read !== 'object' || read === null) return null;
  const { line, told, welcome } = read as Record<string, unknown>;
  if (typeof told === 'string') return { told };
  if (typeof welcome === 'object' && welcome !== null) {
    const name = (welcome as Record<string, unknown>).name;
    return { welcome: { name: typeof name === 'string' ? name : null } };
  }
  if (typeof line !== 'object' || line === null) return null;
  const { channel, from, to, text: words } = line as Record<string, unknown>;
  if (!CHANNELS.includes(channel as Channel) || typeof from !== 'string' || typeof words !== 'string') return null;
  const base = { channel: channel as Channel, from, text: cleanLine(words) };
  return { line: typeof to === 'string' ? { ...base, to } : base };
}
