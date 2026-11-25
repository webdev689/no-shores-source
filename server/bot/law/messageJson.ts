// A message setting to and from the JSON Discord takes, so a design moves between the panel and other tools: a
// Discord message (`content`, `embeds`, `components`), another message tool's backup (`messages[].data`), a list of
// embeds, or one embed. Placeholders travel as written. What the settings cannot hold is left out and named.

import { DEFAULT_COLOUR, LIMITS, type LinkButton, blankEmbed, emojiOf, rowsOf } from './message.ts';
import { type SavedMessage, type Settings, recordOf } from './settings.ts';

/** A colour number as `#rrggbb`. */
const hexOf = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff
    ? `#${value.toString(16).padStart(6, '0')}`
    : DEFAULT_COLOUR;

const textOf = (text: unknown): string => (typeof text === 'string' ? text : '');
const listOf = (held: unknown): Settings[] => (Array.isArray(held) ? held : []).map(recordOf);

/** An emoji as the settings write it. */
const emojiText = (emoji: unknown) => {
  const held = recordOf(emoji);
  return held.id
    ? `<${held.animated ? 'a' : ''}:${textOf(held.name) || 'emoji'}:${String(held.id)}>`
    : textOf(held.name);
};

/** One Discord embed as the settings hold it. */
const embedFrom = (given: unknown): Settings => {
  const embed = recordOf(given);
  const author = recordOf(embed.author);
  const footer = recordOf(embed.footer);
  return blankEmbed({
    color: hexOf(embed.color),
    authorName: textOf(author.name),
    authorUrl: textOf(author.url),
    authorIcon: textOf(author.icon_url),
    title: textOf(embed.title),
    url: textOf(embed.url),
    description: textOf(embed.description),
    thumbnail: textOf(recordOf(embed.thumbnail).url),
    image: textOf(recordOf(embed.image).url),
    fields: listOf(embed.fields).map((field) => ({
      name: textOf(field.name),
      value: textOf(field.value),
      inline: field.inline === true,
    })),
    footer: textOf(footer.text),
    footerIcon: textOf(footer.icon_url),
    timestamp: !!embed.timestamp,
  });
};

/** Whether an object reads as one embed rather than a message. */
const looksLikeEmbed = (held: Settings) =>
  !('content' in held) &&
  !('embeds' in held) &&
  ['title', 'description', 'fields', 'author', 'image'].some((key) => key in held);

/** A message setting from Discord's JSON, with what was left out. Null when the text is not JSON of any known shape. */
export function messageFromJson(text: string): { message: SavedMessage; left: string[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) parsed = { embeds: parsed };
  if (!parsed || typeof parsed !== 'object') return null;
  let held = recordOf(parsed);
  if (Array.isArray(held.messages)) {
    const first = recordOf(held.messages[0]);
    held = 'data' in first ? recordOf(first.data) : first;
  }
  if (looksLikeEmbed(held)) held = { embeds: [held] };
  if (!('content' in held) && !Array.isArray(held.embeds) && !Array.isArray(held.components)) return null;
  const left: string[] = [];
  const embeds = Array.isArray(held.embeds) ? held.embeds : [];
  if (embeds.length > LIMITS.embeds) left.push(`${embeds.length - LIMITS.embeds} embeds past ten`);
  const buttons: Settings[] = [];
  let others = 0;
  for (const row of listOf(held.components)) {
    for (const part of listOf(row.components)) {
      if (part.type === 2 && part.style === 5 && typeof part.url === 'string')
        buttons.push({ label: textOf(part.label), emoji: emojiText(part.emoji), url: part.url });
      else others++;
    }
  }
  if (others) left.push(`${others} parts that are not link buttons`);
  if (Array.isArray(held.attachments) && held.attachments.length) left.push('attached files');
  return {
    message: {
      content: textOf(held.content),
      embeds: embeds.slice(0, LIMITS.embeds).map(embedFrom),
      buttons: buttons.slice(0, LIMITS.buttons),
    },
    left,
  };
}

/** Parts with no value left out. */
const kept = (parts: Settings): Settings =>
  Object.fromEntries(Object.entries(parts).filter(([, value]) => value !== '' && value !== undefined));

/**
 * A message setting as Discord's JSON, placeholders as written, ready for another tool. Empty parts are left out;
 * an embed that shows the time carries `nowMs`.
 */
export function messageToJson(message: unknown, nowMs = Date.now()): Settings {
  const saved = recordOf(message);
  const embeds = listOf(saved.embeds).map((embed) => {
    const colour = textOf(embed.color);
    const fields = listOf(embed.fields);
    return kept({
      color: /^#[0-9a-fA-F]{6}$/.test(colour) ? parseInt(colour.slice(1), 16) : undefined,
      author: embed.authorName
        ? kept({ name: embed.authorName, url: textOf(embed.authorUrl), icon_url: textOf(embed.authorIcon) })
        : undefined,
      title: textOf(embed.title),
      url: textOf(embed.url),
      description: textOf(embed.description),
      thumbnail: embed.thumbnail ? { url: embed.thumbnail } : undefined,
      image: embed.image ? { url: embed.image } : undefined,
      fields: fields.length
        ? fields.map((field) => ({
            name: textOf(field.name),
            value: textOf(field.value),
            inline: field.inline !== false,
          }))
        : undefined,
      footer: embed.footer ? kept({ text: embed.footer, icon_url: textOf(embed.footerIcon) }) : undefined,
      timestamp: embed.timestamp === true ? new Date(nowMs).toISOString() : undefined,
    });
  });
  const buttons = listOf(saved.buttons).map(
    (button) =>
      kept({
        type: 2,
        style: 5,
        label: textOf(button.label),
        url: textOf(button.url),
        emoji: emojiOf(button.emoji) ?? undefined,
      }) as unknown as LinkButton,
  );
  const components = rowsOf(buttons);
  return { content: textOf(saved.content), embeds, ...(components.length ? { components } : {}) };
}
