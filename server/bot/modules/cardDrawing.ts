// The welcome card drawn pixel by pixel in the Worker: a night sea in the server's background colour, waves along its
// foot, a double frame and corner marks in the accent (lantern gold unless the server picks another), the member's
// avatar in a ring with a glow behind it, and three lines of words in our own pixel letters.

import { LETTER_GAP, LETTER_TALL, LETTER_WIDE, drawable, letterRows, wordsWide } from './cardLetters.ts';
import { type Picture, decodePng, encodePng } from './png.ts';

/** A card's size: wide, as Discord draws a message's large picture. */
export const CARD_WIDE = 960;
export const CARD_TALL = 320;
/** The largest avatar file the card reads. */
export const AVATAR_BYTES_MAX = 2_000_000;
/** The colours the card falls back to: lantern gold on a night sea. */
export const CARD_ACCENT = '#d9a33c';
export const CARD_BACKGROUND = '#0e1a2e';
const INK = 0xe4e9f1;
const INK_SOFT = 0xb4c1d6;

/** The words a card carries: its top line, the member's name, its bottom line, the avatar's address and colours. */
export interface CardWords {
  readonly title: string;
  readonly name: string;
  readonly under: string;
  readonly avatar: string;
  readonly accent: string;
  readonly background: string;
}

type Canvas = { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray };
type FetchPicture = (url: string, init?: RequestInit) => Promise<Response>;

const colourOf = (hex: string, fallback: string) =>
  parseInt((/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback).slice(1), 16);
/** A colour darkened or lightened by `factor`. */
const shade = (colour: number, factor: number) => {
  const part = (shift: number) => Math.max(0, Math.min(255, Math.round(((colour >> shift) & 255) * factor)));
  return (part(16) << 16) | (part(8) << 8) | part(0);
};

/** Lay `colour` over one pixel at `alpha`; a pixel off the card is skipped. */
function blend(card: Canvas, x: number, y: number, colour: number, alpha: number) {
  if (x < 0 || y < 0 || x >= card.width || y >= card.height || alpha <= 0) return;
  const spot = (y * card.width + x) * 4;
  const keep = 1 - Math.min(1, alpha);
  for (const [offset, shift] of [
    [0, 16],
    [1, 8],
    [2, 0],
  ] as const)
    card.data[spot + offset] = (card.data[spot + offset] ?? 0) * keep + ((colour >> shift) & 255) * (1 - keep);
  card.data[spot + 3] = 255;
}

/** How much of a pixel a circle of `radius` covers, its edge softened over one pixel. */
const coverOf = (x: number, y: number, centreX: number, centreY: number, radius: number) =>
  Math.min(1, Math.max(0, radius - Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY) + 0.5));

function disc(card: Canvas, centreX: number, centreY: number, radius: number, colour: number, alpha = 1) {
  for (let y = Math.floor(centreY - radius); y <= Math.ceil(centreY + radius); y++)
    for (let x = Math.floor(centreX - radius); x <= Math.ceil(centreX + radius); x++)
      blend(card, x, y, colour, alpha * coverOf(x, y, centreX, centreY, radius));
}

function ring(card: Canvas, centreX: number, centreY: number, radius: number, wide: number, colour: number) {
  const outer = radius + wide / 2;
  for (let y = Math.floor(centreY - outer); y <= Math.ceil(centreY + outer); y++)
    for (let x = Math.floor(centreX - outer); x <= Math.ceil(centreX + outer); x++) {
      const cover = coverOf(x, y, centreX, centreY, outer) - coverOf(x, y, centreX, centreY, radius - wide / 2);
      blend(card, x, y, colour, cover);
    }
}

/** A picture laid in a disc: sampled smoothly from its square middle, its edge soft. */
function pictureDisc(card: Canvas, picture: Picture, centreX: number, centreY: number, radius: number) {
  const side = Math.min(picture.width, picture.height);
  const left = (picture.width - side) / 2;
  const top = (picture.height - side) / 2;
  const scale = side / (radius * 2);
  const sample = (x: number, y: number, channel: number) => {
    const column = Math.max(0, Math.min(picture.width - 1, x));
    const line = Math.max(0, Math.min(picture.height - 1, y));
    return picture.data[(line * picture.width + column) * 4 + channel] ?? 0;
  };
  for (let y = Math.floor(centreY - radius); y <= Math.ceil(centreY + radius); y++)
    for (let x = Math.floor(centreX - radius); x <= Math.ceil(centreX + radius); x++) {
      const cover = coverOf(x, y, centreX, centreY, radius);
      if (cover <= 0) continue;
      const sourceX = left + (x + 0.5 - (centreX - radius)) * scale - 0.5;
      const sourceY = top + (y + 0.5 - (centreY - radius)) * scale - 0.5;
      const cellX = Math.floor(sourceX);
      const cellY = Math.floor(sourceY);
      const partX = sourceX - cellX;
      const partY = sourceY - cellY;
      const mix = (channel: number) =>
        (sample(cellX, cellY, channel) * (1 - partX) + sample(cellX + 1, cellY, channel) * partX) * (1 - partY) +
        (sample(cellX, cellY + 1, channel) * (1 - partX) + sample(cellX + 1, cellY + 1, channel) * partX) * partY;
      const colour = (Math.round(mix(0)) << 16) | (Math.round(mix(1)) << 8) | Math.round(mix(2));
      blend(card, x, y, colour, (cover * mix(3)) / 255);
    }
}

/** Words in the pixel letters, their top-left at (`left`, `top`), each dot `scale` pixels. */
function letters(card: Canvas, text: string, left: number, top: number, scale: number, colour: number) {
  [...text].forEach((letter, index) => {
    const rows = letterRows(letter) ?? [];
    const start = left + index * (LETTER_WIDE + LETTER_GAP) * scale;
    rows.forEach((bits, row) => {
      for (let column = 0; column < LETTER_WIDE; column++) {
        if (!((bits >> (LETTER_WIDE - 1 - column)) & 1)) continue;
        for (let down = 0; down < scale; down++)
          for (let across = 0; across < scale; across++)
            blend(card, start + column * scale + across, top + row * scale + down, colour, 1);
      }
    });
  });
}

/**
 * Words fitted to `room` pixels: at the largest of `scales` they fit, or at the smallest cut short with dots.
 * Answers the words and their scale.
 */
export function fitted(text: string, scales: readonly number[], room: number): { text: string; scale: number } {
  for (const scale of scales) if (wordsWide(text, scale) <= room) return { text, scale };
  const scale = scales.at(-1) ?? 1;
  let cut = [...text];
  while (cut.length && wordsWide(`${cut.join('').trimEnd()}...`, scale) > room) cut = cut.slice(0, -1);
  return { text: `${cut.join('').trimEnd()}...`, scale };
}

/** The member's avatar, read from Discord's own address as a PNG, or null when it cannot be read. */
async function avatarOf(url: string, fetchPicture: FetchPicture): Promise<Picture | null> {
  if (!url) return null;
  try {
    // Cloudflare keeps the avatar a day at its edge; the option is Cloudflare's own, so RequestInit does not name it
    const init = { cf: { cacheTtl: 86_400 } } as RequestInit;
    const answer = await fetchPicture(url.replace(/\.(webp|gif|jpg)\b/, '.png'), init);
    if (!answer.ok) return null;
    const bytes = new Uint8Array(await answer.arrayBuffer());
    return bytes.length > AVATAR_BYTES_MAX ? null : await decodePng(bytes);
  } catch {
    return null;
  }
}

/** The sea behind the card: the background lit from above, darker toward its edges, with waves along its foot. */
function sea(card: Canvas, base: number) {
  for (let y = 0; y < CARD_TALL; y++)
    for (let x = 0; x < CARD_WIDE; x++) {
      const across = x / CARD_WIDE - 0.5;
      const down = y / CARD_TALL;
      const light = (1.25 - 0.5 * down) * (1 - 0.6 * across * across);
      blend(card, x, y, shade(base, light), 1);
    }
  // three swells below the words, the nearest the brightest
  const crest = shade(base, 3);
  for (let wave = 0; wave < 3; wave++) {
    const line = CARD_TALL - 30 - wave * 11;
    for (let x = 0; x < CARD_WIDE; x++) {
      const y = Math.round(line + 3 * Math.sin(x / (34 + wave * 11) + wave * 1.7));
      for (const thick of [0, 1]) blend(card, x, y + thick, crest, 0.5 - wave * 0.13);
    }
  }
}

/** The double frame in the accent, with a small diamond at each corner. */
function frame(card: Canvas, accent: number) {
  for (const [inset, wide] of [
    [12, 2],
    [18, 1],
  ] as const)
    for (let step = 0; step < wide; step++) {
      for (let x = inset; x < CARD_WIDE - inset; x++) {
        blend(card, x, inset + step, accent, 0.85);
        blend(card, x, CARD_TALL - inset - 1 - step, accent, 0.85);
      }
      for (let y = inset; y < CARD_TALL - inset; y++) {
        blend(card, inset + step, y, accent, 0.85);
        blend(card, CARD_WIDE - inset - 1 - step, y, accent, 0.85);
      }
    }
  for (const [cornerX, cornerY] of [
    [15, 15],
    [CARD_WIDE - 16, 15],
    [15, CARD_TALL - 16],
    [CARD_WIDE - 16, CARD_TALL - 16],
  ] as const)
    for (let y = -6; y <= 6; y++)
      for (let x = -6; x <= 6; x++)
        if (Math.abs(x) + Math.abs(y) <= 6) blend(card, cornerX + x, cornerY + y, accent, 1);
}

/** A card's picture, as PNG bytes. */
export async function drawCard(words: CardWords, fetchPicture: FetchPicture): Promise<Uint8Array<ArrayBuffer>> {
  const card: Canvas = { width: CARD_WIDE, height: CARD_TALL, data: new Uint8ClampedArray(CARD_WIDE * CARD_TALL * 4) };
  const base = colourOf(words.background, CARD_BACKGROUND);
  const accent = colourOf(words.accent, CARD_ACCENT);
  sea(card, base);
  frame(card, accent);
  const centreX = 168;
  const centreY = CARD_TALL / 2;
  const radius = 104;
  for (let glow = 40; glow > 0; glow -= 4) disc(card, centreX, centreY, radius + glow, accent, 0.025);
  disc(card, centreX, centreY, radius + 10, shade(base, 0.55));
  const name = drawable(words.name) || 'New member';
  const avatar = await avatarOf(words.avatar, fetchPicture);
  if (avatar) pictureDisc(card, avatar, centreX, centreY, radius);
  else {
    disc(card, centreX, centreY, radius, shade(accent, 0.45));
    const initial = name.slice(0, 1).toUpperCase();
    const scale = 14;
    letters(card, initial, centreX - (LETTER_WIDE * scale) / 2, centreY - (7 * scale) / 2, scale, INK);
  }
  ring(card, centreX, centreY, radius + 5, 6, accent);
  const left = 312;
  const room = CARD_WIDE - left - 48;
  const lines = [
    { text: drawable(words.title), scales: [5, 4], top: 58, colour: accent },
    { text: name, scales: [8, 7, 6, 5, 4], top: 122, colour: INK },
    { text: drawable(words.under), scales: [4, 3], top: 226, colour: INK_SOFT },
  ];
  for (const line of lines) {
    if (!line.text) continue;
    const fit = fitted(line.text, line.scales, room);
    // a smaller line sits lower in its band, so every line keeps its baseline (the two bottom rows hang below it)
    const lower = (Math.max(...line.scales) - fit.scale) * (LETTER_TALL - 2);
    letters(card, fit.text, left, line.top + lower, fit.scale, line.colour);
  }
  return encodePng(card);
}
