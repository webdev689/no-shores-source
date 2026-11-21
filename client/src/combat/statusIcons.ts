// The statuses' icons, drawn pixel by pixel as the elements' and the gear's glyphs are, each in its element's colours:
// Crit and Linked in Blaze, Expose and Veiled in Cosmic, Charge and Haste in Volt. A row of them stands beside a foe's
// plate for its debuffs and under the player's vitals for their buffs, each over a thin line that shrinks as its time
// runs out, each with words for a screen reader.
import type { FoeStatuses } from '../network/messages.ts';
import { ELEMENTS } from '../player/gear.ts';
import { TONES } from '../plus/tones.ts';
import type { StatusName, Statuses } from '../rules/fighters.ts';
import type { Child, Node, Picture } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';
import { paintBox, ring } from './barDraw.ts';

/** A glyph's side, in its own pixels. */
const GLYPH = 12;

/** Each status's glyph as rows of letters (a the outline, b the body, c its light, a dot none), 12 × 12. */
const MAPS: Readonly<Record<StatusName, readonly string[]>> = {
  crit: [
    '.....aa.....',
    '.a..abba..a.',
    'aba.abba.aba',
    '.abaabbaaba.',
    '.aabbbbbbaa.',
    'abbbbccbbbba',
    'abbbbccbbbba',
    '.aabbbbbbaa.',
    '.abaabbaaba.',
    'aba.abba.aba',
    '.a..abba..a.',
    '.....aa.....',
  ],
  // A diamond cracked through, the mark the Arts' fragments give Expose.
  expose: [
    '.....aa.....',
    '....abba....',
    '...abcaba...',
    '..abcbabba..',
    '.abcbbbabba.',
    'abcbbbbabbba',
    'abbbbbabbbba',
    '.abbbabbbba.',
    '..abbbabba..',
    '...abbaba...',
    '....abaa....',
    '.....aa.....',
  ],
  charge: [
    '.......aa...',
    '......acba..',
    '.a...acba.a.',
    'aba.acba.aba',
    '.abacbaaaba.',
    '..acbbbbaa..',
    '..aabbbbca..',
    '.abaaabcaba.',
    'aba.abca.aba',
    '.a.abca...a.',
    '..abca......',
    '...aa.......',
  ],
  haste: [
    '.aa...aa....',
    'acca.acca...',
    '.acca.acca..',
    '..abba.abba.',
    '...abba.abba',
    '....abba.abb',
    '....abba.abb',
    '...abba.abba',
    '..abba.abba.',
    '.abba.abba..',
    'abba.abba...',
    '.aa...aa....',
  ],
  linked: [
    '..aaaa......',
    '.acccca.....',
    'abaaaaba....',
    'aba..aba....',
    'aba..abaaa..',
    'abaaaacccca.',
    '.abbbbaaaaba',
    '..aaaba..aba',
    '....aba..aba',
    '....abaaaaba',
    '.....abbbba.',
    '......aaaa..',
  ],
  veiled: [
    '.....aaaa...',
    '...aabbbba..',
    '..accbaaa...',
    '.accba......',
    'accbba......',
    'accba.......',
    'accba.......',
    'accbba......',
    '.accba......',
    '..accbaaa...',
    '...aabbbba..',
    '.....aaaa...',
  ],
};

/** Each status's element, by the gear crate's numbers, and what it is called. */
const LOOKS: Readonly<Record<StatusName, { readonly element: number; readonly word: string }>> = {
  crit: { element: 1, word: 'Crit' },
  expose: { element: 3, word: 'Exposed' },
  charge: { element: 2, word: 'Charged' },
  haste: { element: 2, word: 'Hasted' },
  linked: { element: 1, word: 'Linked' },
  veiled: { element: 3, word: 'Veiled' },
};

/** A status as a row shows it: which, its ticks left, and whether it is faded (the immunity a Charge leaves). */
export interface ShownStatus {
  readonly name: StatusName;
  readonly left: number;
  readonly faded: boolean;
}

/** A foe's debuffs, in order: its Expose, and its Charge or, once that ends, the Charge's immunity, faded. */
export function foeDebuffs(statuses: FoeStatuses | undefined): ShownStatus[] {
  if (!statuses) return [];
  const shown: ShownStatus[] = [];
  if (statuses.expose > 0) shown.push({ name: 'expose', left: statuses.expose, faded: false });
  if (statuses.charge > 0) shown.push({ name: 'charge', left: statuses.charge, faded: false });
  else if (statuses.chargeImmune > 0) shown.push({ name: 'charge', left: statuses.chargeImmune, faded: true });
  return shown;
}

/** The player's own buffs, in order: Crit, Haste, Linked, Veiled. */
export function ownBuffs(statuses: Statuses | undefined): ShownStatus[] {
  if (!statuses) return [];
  const buffs = (['crit', 'haste', 'linked', 'veiled'] as const).filter((name) => statuses[name] > 0);
  return buffs.map((name) => ({ name, left: statuses[name], faded: false }));
}

/** What a screen reader says of a status: what it is, and the seconds it has left. */
export function statusWords(shown: ShownStatus): string {
  const seconds = Math.ceil(shown.left / 60);
  return `${shown.faded ? 'Immune to Charge' : LOOKS[shown.name].word}, ${seconds} s left`;
}

/** A status's glyph as RGBA pixels, 12 by 12, each a pixel of the picture drawn at whole multiples. */
export function statusPixels(name: StatusName): Uint8Array {
  const colours = ELEMENTS[LOOKS[name].element]?.palette ?? [];
  const pixels = new Uint8Array(GLYPH * GLYPH * 4);
  MAPS[name].forEach((row, line) =>
    [...row].forEach((letter, column) => {
      const fill = colours['abc'.indexOf(letter)];
      if (!fill) return;
      const [red, green, blue] = colourOf(fill);
      pixels.set([red * 255, green * 255, blue * 255, 255].map(Math.round), (line * GLYPH + column) * 4);
    }),
  );
  return pixels;
}

/** The share of its time each status shown has left: its ticks over the most it held since it last began or was
 *  refreshed, which the wire does not carry. Kept by a key for its fighter, its status and whether it is faded. */
export class StatusClock {
  private readonly held = new Map<string, { most: number; last: number }>();

  share(key: string, left: number): number {
    const was = this.held.get(key);
    const most = !was || left > was.last ? left : was.most;
    this.held.set(key, { most, last: left });
    return most > 0 ? Math.min(1, left / most) : 0;
  }

  /** Forgets every key `wanted` turns away. */
  keep(wanted: (key: string) => boolean): void {
    for (const key of this.held.keys()) if (!wanted(key)) this.held.delete(key);
  }
}

/** A row of status icons for one fighter at a time: each glyph over the line of its time left. */
export class StatusRow {
  private readonly clock = new StatusClock();
  private readonly label: string;
  private shown: readonly { readonly status: ShownStatus; readonly share: number }[] = [];

  constructor(label: string) {
    this.label = label;
  }

  /** Shows `shown` for the fighter numbered `owner`. */
  show(owner: number, shown: readonly ShownStatus[]): void {
    this.shown = shown.map((status) => ({
      status,
      share: this.clock.share(`${owner}:${status.name}:${status.faded}`, status.left),
    }));
  }

  /** Forgets the fighters not in `present`, whose numbers may come again for others. */
  keep(present: ReadonlySet<number>): void {
    this.clock.keep((key) => present.has(Number(key.split(':')[0])));
  }

  /** The row, each icon `size` CSS pixels square and `gap` apart; nothing while it holds none. */
  node(size: number, gap = 3): Child {
    if (this.shown.length === 0) return null;
    return {
      label: this.label,
      gap,
      alignY: 'end',
      children: this.shown.map(({ status, share }) => statusNode(status, share, size)),
    };
  }
}

/** One icon: its glyph with a hard shadow a pixel down and right, over the line of its time left in its element's
 *  colour; a Charge's immunity faded. */
export function statusNode(status: ShownStatus, share: number, size: number): Node {
  const colour = ELEMENTS[LOOKS[status.name].element]?.colour ?? '#ffffff';
  const glyph = (tint?: string): Picture => ({
    key: `status ${status.name}`,
    source: { pixels: () => statusPixels(status.name) },
    pixel: { width: GLYPH, height: GLYPH },
    ...(tint ? { tint } : {}),
  });
  return {
    direction: 'column',
    gap: 2,
    width: size,
    label: statusWords(status),
    ...(status.faded ? { opacity: 0.4 } : {}),
    children: [
      {
        width: size,
        height: size,
        children: [
          { width: size, height: size, picture: glyph(TONES.outline), float: { x: 1, y: 1, z: 1 } },
          { width: size, height: size, picture: glyph(), float: { z: 1 } },
        ],
      },
      {
        width: `${Math.round(share * 1000) / 10}%`,
        height: 2,
        draw: (ui, box, scale, clip, fade) => {
          const pen = { ui, box, scale, clip, fade };
          ring(pen, box, TONES.outline);
          paintBox(pen, box, colour);
        },
      },
    ],
  };
}
