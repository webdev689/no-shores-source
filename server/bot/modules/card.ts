// The welcome card's address and route. The address carries the card's words and a signature, so the bot draws only
// the cards it handed out; Discord fetches each once and keeps it. The picture itself is drawn in `cardDrawing.ts`.

import { WELCOME_SHAPE } from '../law/communityShape.ts';
import { avatarUrl, fillSlots } from '../law/message.ts';
import { type GroupField, type Settings, defaults, recordOf } from '../law/settings.ts';
import { base64url } from '../crypto.ts';
import type { Vars } from '../kit.ts';
import type { SlotUser } from '../slots.ts';
import { CARD_ACCENT, CARD_BACKGROUND, type CardWords, drawCard } from './cardDrawing.ts';

/** Where cards are served. */
export const CARD_PATH = '/v1/card/welcome.png';
/** The longest words one line of a card carries. */
export const CARD_WORDS_MAX = 80;
/** Cards drawn in this isolate, kept by address: the newest few. */
export const CARDS_KEPT = 16;
/** The longest packed words an address may carry. */
const PACKED_MAX = 1600;

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/**
 * The key card addresses are signed with: the deploy's own CARD_SIGNING_KEY, kept for good so a rotated bot token
 * never breaks a card already posted; drawn from the bot's token only where that key is not set yet.
 */
function cardKey(vars: Vars): Promise<CryptoKey> | null {
  const own = String(vars.CARD_SIGNING_KEY ?? '');
  const root = own.length >= 32 ? `key\n${own}` : String(vars.DISCORD_BOT_TOKEN ?? '');
  if (!root) return null;
  let key = keys.get(root);
  if (!key) {
    key = crypto.subtle
      .digest('SHA-256', encoder.encode(`noshores-bot-card1\n${root}`))
      .then((bytes) => crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
    if (keys.size > 4) keys.clear();
    keys.set(root, key);
  }
  return key;
}

async function sign(vars: Vars, packed: string): Promise<string | null> {
  const key = cardKey(vars);
  if (!key) return null;
  const signature = await crypto.subtle.sign('HMAC', await key, encoder.encode(`welcome\n${packed}`));
  return base64url(new Uint8Array(signature).subarray(0, 16));
}

const fromBase64url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (letter) => letter.charCodeAt(0));
const colourOr = (hex: unknown, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(String(hex)) ? String(hex) : fallback);
const lineOf = (text: unknown) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CARD_WORDS_MAX);

/** The words held to what a card takes: short lines, an avatar from Discord's own address alone, real colours. */
export const cleanWords = (given: Partial<Record<keyof CardWords, unknown>>): CardWords => ({
  title: lineOf(given.title),
  name: lineOf(given.name),
  under: lineOf(given.under),
  avatar: /^https:\/\/cdn\.discordapp\.com\/\S+$/.test(String(given.avatar ?? '')) ? String(given.avatar) : '',
  accent: colourOr(given.accent, CARD_ACCENT),
  background: colourOr(given.background, CARD_BACKGROUND),
});

/** A card's address, its words signed, or '' with no key to sign or no https address of the bot's own. */
export async function cardUrl(vars: Vars, words: Partial<Record<keyof CardWords, unknown>>): Promise<string> {
  const base = String(vars.BOT_URL ?? '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+$/.test(base)) return '';
  const packed = base64url(encoder.encode(JSON.stringify(cleanWords(words))));
  const signature = await sign(vars, packed);
  return signature ? `${base}${CARD_PATH}?p=${packed}&s=${signature}` : '';
}

/** The words of a signed card address, or null for one the bot did not sign. */
export async function cardWords(vars: Vars, packed: string, signature: string): Promise<CardWords | null> {
  if (!packed || packed.length > PACKED_MAX) return null;
  const want = await sign(vars, packed);
  if (!want || want.length !== signature.length) return null;
  let differ = 0;
  for (let index = 0; index < want.length; index++) differ |= want.charCodeAt(index) ^ signature.charCodeAt(index);
  if (differ) return null;
  try {
    const words: unknown = JSON.parse(new TextDecoder().decode(fromBase64url(packed)));
    return words && typeof words === 'object' && !Array.isArray(words) ? cleanWords(recordOf(words)) : null;
  } catch {
    return null;
  }
}

/** The address of a member's welcome card, in the card part of `saved`, the welcome's settings. */
export async function welcomeCard(
  vars: Vars,
  saved: Settings | undefined,
  user: SlotUser,
  filled: Readonly<Record<string, string>>,
): Promise<string> {
  const shape = WELCOME_SHAPE.schema.card as GroupField;
  const card = { ...defaults(shape.fields), ...recordOf(saved?.card) };
  return cardUrl(vars, {
    title: fillSlots(card.title, filled),
    name: filled.name,
    under: fillSlots(card.subtitle, filled),
    avatar: avatarUrl(user),
    accent: card.accent,
    background: card.background,
  });
}

const drawn = new Map<string, Uint8Array<ArrayBuffer>>();

/** GET /v1/card/welcome.png?p=&s=: a card the bot signed, drawn once an isolate and kept by Discord and the edge. */
export async function cardRoute(
  vars: Vars,
  url: URL,
  fetchPicture: (to: string, init?: RequestInit) => Promise<Response>,
): Promise<Response> {
  const packed = url.searchParams.get('p') ?? '';
  const words = await cardWords(vars, packed, url.searchParams.get('s') ?? '');
  if (!words) return new Response('Not found', { status: 404 });
  let bytes = drawn.get(packed);
  if (!bytes) {
    bytes = await drawCard(words, fetchPicture);
    drawn.set(packed, bytes);
    while (drawn.size > CARDS_KEPT) drawn.delete(drawn.keys().next().value ?? '');
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      // the words are in the address, so the picture never changes under it
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}
