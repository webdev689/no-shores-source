// The composer's live preview: the bot's message drawn the way Discord draws it, from what Discord would be sent (the
// message law's messagePayload). Discord's markdown is read in full: headings, subtext, lists, quotes, code blocks,
// spoilers, masked links, mentions, server emoji and live times, and every word is set as text. A link is followed
// only when it is https, and a picture comes only from an https address.
import type { BuiltEmbed, ButtonRow, EmbedField, Payload } from '../../../server/bot/law/message.ts';
import type { FormContext } from './context.ts';
import { element } from './dom.ts';

/** What the preview's message is signed with, as the bot's name shows in Discord. */
export const BOT_NAME = 'No Shores bot';

/** The samples the preview fills placeholders with: this server and the person signed in. */
export function previewVars(context: FormContext): Record<string, string> {
  const preview = context.preview ?? {};
  return {
    user: '<@0>',
    name: preview.me?.name || 'Member',
    server: preview.guildName || 'Your server',
    count: (preview.memberCount ?? 1287).toLocaleString('en'),
    level: '5',
    avatar: preview.me?.avatar ?? '',
    server_icon: preview.guildIcon ?? '',
    welcome_card: preview.cardUrl ?? '',
  };
}

/** Discord's inline marks, each a named group. */
const INLINE =
  /\\(?<esc>[^\sA-Za-z0-9])|`(?<code>[^`\n]+?)`|\|\|(?<spoiler>[\s\S]+?)\|\||\*\*(?<bold>[\s\S]+?)\*\*|__(?<under>[\s\S]+?)__|~~(?<strike>[\s\S]+?)~~|\*(?<em1>[^*\s](?:[^*\n]*?[^*\s])?)\*|\b_(?<em2>[^_\n]+?)_\b|\[(?<label>[^\]\n]+)\]\(<?(?<href>https?:\/\/[^)\s>]+)>?\)|<(?<angle>https:\/\/[^>\s]+)>|(?<bare>https:\/\/[^\s<]*[^\s<.,:;"')\]])|<@!?(?<user>\d+)>|<@&(?<role>\d+)>|<#(?<channel>\d+)>|<(?<anim>a?):(?<ename>\w{2,32}):(?<eid>\d{5,25})>|<t:(?<stamp>-?\d{1,13})(?::(?<style>[tTdDfFR]))?>|(?<all>@everyone|@here)|(?<br>\n)/g;

/** A link that opens in a new tab and tells the page nothing. */
const outLink = (href: string, children: ReadonlyArray<Node | string>): HTMLAnchorElement =>
  element('a', { href, target: '_blank', rel: 'noopener noreferrer' }, children);

const emojiPicture = (id: string, animated: boolean, name: string): HTMLImageElement =>
  element('img', {
    class: 'demoji',
    src: `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'webp'}?size=48`,
    alt: `:${name}:`,
    title: `:${name}:`,
    referrerpolicy: 'no-referrer',
  });

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const STAMP_SHAPES: Readonly<Record<string, Intl.DateTimeFormatOptions>> = {
  t: TIME,
  T: { ...TIME, second: '2-digit' },
  d: { year: 'numeric', month: '2-digit', day: '2-digit' },
  D: { year: 'numeric', month: 'long', day: 'numeric' },
  f: { year: 'numeric', month: 'long', day: 'numeric', ...TIME },
  F: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', ...TIME },
};
const RELATIVE_STEPS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/** A live time as Discord writes it for the person reading: `unix` in seconds, `style` one of t T d D f F R. */
export function stampWords(unix: number, style: string, nowMs: number): string {
  const moment = new Date(unix * 1000);
  if (Number.isNaN(moment.getTime())) return String(unix);
  if (style !== 'R') return moment.toLocaleString(undefined, STAMP_SHAPES[style] ?? STAMP_SHAPES.f);
  const seconds = Math.round((moment.getTime() - nowMs) / 1000);
  const [unit, size] = RELATIVE_STEPS.find(([, step]) => Math.abs(seconds) >= step) ?? ['second', 1];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(seconds / size), unit);
}

/** The one inline mark a match found, put into `into` as nodes. */
function markInto(into: HTMLElement, found: Readonly<Record<string, string | undefined>>, context: FormContext): void {
  const wrapped = (tag: 'span' | 'strong' | 'u' | 's' | 'em', inner: string, attributes = {}): HTMLElement => {
    const node = element(tag, attributes);
    inlineInto(node, inner, context);
    into.append(node);
    return node;
  };
  if (found.esc !== undefined) into.append(found.esc);
  else if (found.code !== undefined) into.append(element('code', { class: 'dmd-code' }, [found.code]));
  else if (found.spoiler !== undefined) {
    const hidden = wrapped('span', found.spoiler, { class: 'dspoiler', title: 'Spoiler' });
    hidden.addEventListener('click', () => hidden.classList.toggle('shown', true));
  } else if (found.bold !== undefined) wrapped('strong', found.bold);
  else if (found.under !== undefined) wrapped('u', found.under);
  else if (found.strike !== undefined) wrapped('s', found.strike);
  else if (found.em1 !== undefined) wrapped('em', found.em1);
  else if (found.em2 !== undefined) wrapped('em', found.em2);
  else if (found.label !== undefined) {
    const label = element('span');
    inlineInto(label, found.label, context);
    const href = found.href ?? '';
    into.append(href.startsWith('https://') ? outLink(href, [label]) : label);
  } else if (found.angle !== undefined) into.append(outLink(found.angle, [found.angle]));
  else if (found.bare !== undefined) into.append(outLink(found.bare, [found.bare]));
  else if (found.user !== undefined) {
    const name = found.user === '0' ? previewVars(context).name : 'member';
    into.append(element('span', { class: 'dmention' }, [`@${name}`]));
  } else if (found.role !== undefined) {
    const role = context.roles.find((known) => known.id === found.role);
    into.append(element('span', { class: 'dmention' }, [`@${role?.name ?? 'role'}`]));
  } else if (found.channel !== undefined) {
    const channel = context.channels.find((known) => known.id === found.channel);
    into.append(element('span', { class: 'dmention' }, [`#${channel?.name ?? 'channel'}`]));
  } else if (found.eid !== undefined) into.append(emojiPicture(found.eid, !!found.anim, found.ename ?? ''));
  else if (found.stamp !== undefined) {
    const words = stampWords(Number(found.stamp), found.style ?? 'f', Date.now());
    into.append(element('span', { class: 'dts' }, [words]));
  } else if (found.all !== undefined) into.append(element('span', { class: 'dmention' }, [found.all]));
  else into.append(element('br'));
}

/** Discord's inline markdown put into `into` as nodes. Nothing is read as markup. */
export function inlineInto(into: HTMLElement, text: string, context: FormContext): void {
  let offset = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > offset) into.append(text.slice(offset, index));
    offset = index + match[0].length;
    markInto(into, match.groups ?? {}, context);
  }
  if (offset < text.length) into.append(text.slice(offset));
}

interface ListItem {
  readonly depth: number;
  readonly ordered: boolean;
  readonly start: number;
  readonly text: string;
}

/** A run of list lines as nested lists, two spaces a level, as Discord nests them. */
function listNode(items: readonly ListItem[], context: FormContext): HTMLElement {
  const listFor = (item: ListItem): HTMLElement => {
    const list = element(item.ordered ? 'ol' : 'ul', { class: 'dmd-list' });
    if (item.ordered && item.start !== 1) list.setAttribute('start', String(item.start));
    return list;
  };
  const [first] = items;
  const root = listFor(first ?? { depth: 0, ordered: false, start: 1, text: '' });
  const stack: Array<{ list: HTMLElement; last: HTMLElement | null }> = [{ list: root, last: null }];
  for (const item of items) {
    while (stack.length > 1 && item.depth < stack.length - 1) stack.pop();
    let top = stack[stack.length - 1] ?? { list: root, last: null };
    if (item.depth > stack.length - 1 && top.last) {
      const inner = listFor(item);
      top.last.append(inner);
      top = { list: inner, last: null };
      stack.push(top);
    }
    const entry = element('li');
    inlineInto(entry, item.text, context);
    top.list.append(entry);
    top.last = entry;
  }
  return root;
}

/** A block of one class holding a line's inline marks. */
function lineBlock(className: string, text: string, context: FormContext): HTMLElement {
  const block = element('div', { class: className });
  inlineInto(block, text, context);
  return block;
}

/** Lines of Discord's block markdown: headings, subtext, quotes (`>` a line, `>>>` the rest), lists and plain lines. */
function linesInto(into: HTMLElement, text: string, context: FormContext, quotes: boolean): void {
  const lines = text.split('\n');
  let plain: string[] = [];
  const flush = (): void => {
    if (!plain.length) return;
    const block = element('div', { class: 'dmd-p' });
    plain.forEach((line, i) => {
      if (i) block.append(element('br'));
      inlineInto(block, line, context);
    });
    into.append(block);
    plain = [];
  };
  for (let i = 0; i < lines.length;) {
    const line = lines[i] ?? '';
    if (quotes && line.startsWith('>>> ')) {
      flush();
      const quote = element('blockquote', { class: 'dmd-quote' });
      linesInto(quote, [line.slice(4), ...lines.slice(i + 1)].join('\n'), context, false);
      into.append(quote);
      return;
    }
    if (quotes && line.startsWith('> ')) {
      flush();
      const held: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('> ')) held.push((lines[i++] ?? '').slice(2));
      const quote = element('blockquote', { class: 'dmd-quote' });
      linesInto(quote, held.join('\n'), context, false);
      into.append(quote);
      continue;
    }
    const heading = /^(#{1,3}) (\S.*)$/.exec(line);
    const subtext = /^-# (\S.*)$/.exec(line);
    if (heading || subtext) {
      flush();
      if (heading) into.append(lineBlock(`dmd-h${heading[1]?.length ?? 1}`, heading[2] ?? '', context));
      else into.append(lineBlock('dmd-sub', subtext?.[1] ?? '', context));
      i++;
      continue;
    }
    if (/^ *(?:[-*]|\d{1,9}\.) \S/.test(line)) {
      flush();
      const items: ListItem[] = [];
      let found: RegExpExecArray | null;
      while (i < lines.length && (found = /^( *)([-*]|\d{1,9}\.) (\S.*)$/.exec(lines[i] ?? ''))) {
        const [, indent = '', mark = '', words = ''] = found;
        const ordered = /\d/.test(mark);
        // a top-level item of the other kind starts a list of its own
        if (items.length && !indent && ordered !== items[0]?.ordered) break;
        items.push({
          depth: Math.floor(indent.length / 2),
          ordered,
          start: ordered ? parseInt(mark, 10) : 1,
          text: words,
        });
        i++;
      }
      into.append(listNode(items, context));
      continue;
    }
    plain.push(line);
    i++;
  }
  flush();
}

/**
 * Discord's markdown put into `into` as nodes: code blocks first, then each run of lines between them.
 * `blocks: false` reads the inline marks alone, as Discord does in titles and field names.
 */
export function markdownInto(into: HTMLElement, text: string, context: FormContext, { blocks = true } = {}): void {
  if (!blocks) {
    inlineInto(into, text, context);
    return;
  }
  let offset = 0;
  for (const match of text.matchAll(/```(?:([\w+-]{1,20})\n)?([\s\S]*?)```/g)) {
    const index = match.index ?? 0;
    if (index > offset) linesInto(into, text.slice(offset, index).replace(/\n$/, ''), context, true);
    const code = (match[2] ?? '').replace(/^\n|\n$/g, '');
    into.append(element('pre', { class: 'dmd-pre' }, [element('code', {}, [code])]));
    offset = index + match[0].length;
  }
  if (offset < text.length) linesInto(into, text.slice(offset).replace(/^\n/, ''), context, true);
}

/** A picture the preview shows; the message law has already kept only https addresses. */
const picture = (url: string, className: string): HTMLImageElement =>
  element('img', { src: url, class: className, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });

/** Fields in rows as Discord lays them: inline ones side by side, three to a row (two beside a thumbnail). */
function fieldRows(fields: readonly EmbedField[], narrow: boolean): EmbedField[][] {
  const rows: EmbedField[][] = [];
  for (const field of fields) {
    const last = rows.at(-1);
    if (field.inline && last?.[0]?.inline && last.length < (narrow ? 2 : 3)) last.push(field);
    else rows.push([field]);
  }
  return rows;
}

const timeToday = (moment: Date): string =>
  `Today at ${moment.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

/** One embed as Discord draws it. */
function embedNode(embed: BuiltEmbed, context: FormContext): HTMLElement {
  const box = element('div', { class: 'dembed' });
  box.style.borderLeftColor = `#${embed.color.toString(16).padStart(6, '0')}`;
  const main = element('div', { class: 'dembed-main' });
  if (embed.author) {
    const author = element('div', { class: 'dembed-author' });
    if (embed.author.icon_url) author.append(picture(embed.author.icon_url, 'dembed-author-icon'));
    const name = embed.author.name;
    author.append(embed.author.url ? outLink(embed.author.url, [name]) : element('span', {}, [name]));
    main.append(author);
  }
  if (embed.title) {
    const title = element('div', { class: 'dembed-title' });
    const into = embed.url ? outLink(embed.url, []) : title;
    markdownInto(into, embed.title, context, { blocks: false });
    if (into !== title) title.append(into);
    main.append(title);
  }
  if (embed.description) {
    const description = element('div', { class: 'dembed-description' });
    markdownInto(description, embed.description, context);
    main.append(description);
  }
  if (embed.fields) {
    const fields = element('div', { class: 'dembed-fields' });
    for (const row of fieldRows(embed.fields, !!embed.thumbnail)) {
      const line = element('div', { class: 'dembed-row' });
      for (const field of row) {
        const name = element('div', { class: 'dembed-field-name' });
        const value = element('div', { class: 'dembed-field-value' });
        markdownInto(name, field.name, context, { blocks: false });
        markdownInto(value, field.value, context);
        line.append(element('div', { class: 'dembed-field' }, [name, value]));
      }
      fields.append(line);
    }
    main.append(fields);
  }
  if (embed.image) main.append(picture(embed.image.url, 'dembed-image'));
  if (embed.footer || embed.timestamp) {
    const footer = element('div', { class: 'dembed-footer' });
    if (embed.footer?.icon_url) footer.append(picture(embed.footer.icon_url, 'dembed-footer-icon'));
    const when = embed.timestamp ? timeToday(new Date(embed.timestamp)) : '';
    footer.append(element('span', {}, [[embed.footer?.text, when].filter(Boolean).join(' • ')]));
    main.append(footer);
  }
  box.append(main);
  if (embed.thumbnail) box.append(picture(embed.thumbnail.url, 'dembed-thumbnail'));
  return box;
}

/** A message's link buttons, in Discord's rows. */
function buttonsNode(rows: readonly ButtonRow[]): HTMLElement {
  const box = element('div', { class: 'dbuttons' });
  for (const row of rows) {
    const line = element('div', { class: 'dbutton-row' });
    for (const link of row.components) {
      const parts: Node[] = [];
      if (link.emoji?.id) parts.push(emojiPicture(link.emoji.id, !!link.emoji.animated, link.emoji.name));
      else if (link.emoji?.name) parts.push(element('span', {}, [link.emoji.name]));
      if (link.label) parts.push(element('span', {}, [link.label]));
      parts.push(element('span', { class: 'dbutton-out', 'aria-hidden': 'true' }, ['↗']));
      const attributes = { class: 'dbutton', href: link.url, target: '_blank', rel: 'noopener noreferrer' };
      line.append(element('a', attributes, parts));
    }
    box.append(line);
  }
  return box;
}

/** The preview: the bot's message as Discord draws it, from what Discord would be sent. */
export function previewNode(payload: Payload, context: FormContext): HTMLElement {
  const body = element('div', { class: 'dmsg-body' }, [
    element('div', { class: 'dmsg-head' }, [
      element('span', { class: 'dmsg-name' }, [BOT_NAME]),
      element('span', { class: 'dmsg-tag' }, ['APP']),
      element('span', { class: 'dmsg-time' }, [timeToday(new Date())]),
    ]),
  ]);
  if (payload.content) {
    const content = element('div', { class: 'dmsg-content' });
    markdownInto(content, payload.content, context);
    body.append(content);
  }
  for (const embed of payload.embeds) body.append(embedNode(embed, context));
  if (payload.components?.length) body.append(buttonsNode(payload.components));
  if (!payload.content && !payload.embeds.length && !payload.components?.length)
    body.append(element('p', { class: 'dmsg-empty' }, ['Nothing is posted while this is empty.']));
  return element('div', { class: 'dmsg' }, [
    element('div', { class: 'dmsg-avatar', 'aria-hidden': 'true' }, ['NS']),
    body,
  ]);
}
