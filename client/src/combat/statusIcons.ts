// The statuses' icons, drawn pixel by pixel as the elements' and the gear's glyphs are, each in its element's colours:
// Crit and Linked in Blaze, Expose and Veiled in Cosmic, Charge and Haste in Volt. A row of them stands beside a foe's
// plate for its debuffs and by the player's health for their buffs, each over a thin line that shrinks as its time
// runs out, each with words for a screen reader.
import type { FoeStatuses } from '../network/messages.ts';
import { ELEMENTS } from '../player/gear.ts';
import { TONES } from '../plus/tones.ts';
import type { StatusName, Statuses } from '../rules/fighters.ts';
import { element, setStyle, showNode } from '../plus/meter.ts';

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

/** A status's glyph as an SVG picture, crisp at any size. */
export function statusSvg(name: StatusName): string {
  const colours = ELEMENTS[LOOKS[name].element]?.palette ?? [];
  const squares = MAPS[name].flatMap((row, line) =>
    [...row].flatMap((letter, column) => {
      const fill = colours['abc'.indexOf(letter)];
      return fill ? [`<rect x="${column}" y="${line}" width="1" height="1" fill="${fill}"/>`] : [];
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${squares.join('')}</svg>`;
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

/** A row of status icons for one fighter at a time, its words naming what it holds. */
export class StatusRow {
  readonly root: HTMLElement;
  private readonly icons: { root: HTMLElement; time: HTMLElement }[] = [];
  private readonly clock = new StatusClock();

  constructor(parent: HTMLElement, label: string) {
    this.root = element('div', 'statuses', parent);
    this.root.role = 'group';
    this.root.ariaLabel = label;
  }

  /** Shows `shown` for the fighter numbered `owner`. */
  show(owner: number, shown: readonly ShownStatus[]): void {
    shown.forEach((status, index) => {
      const icon = this.icons[index] ?? this.icon();
      const share = this.clock.share(`${owner}:${status.name}:${status.faded}`, status.left);
      if (icon.root.dataset['status'] !== status.name) icon.root.dataset['status'] = status.name;
      icon.root.classList.toggle('faded', status.faded);
      showNode(icon.root, true);
      const words = statusWords(status);
      if (icon.root.ariaLabel !== words) icon.root.ariaLabel = words;
      setStyle(icon.time, 'width', `${Math.round(share * 1000) / 10}%`);
    });
    for (let index = shown.length; index < this.icons.length; index++) showNode(this.icons[index]!.root, false);
  }

  /** Forgets the fighters not in `present`, whose numbers may come again for others. */
  keep(present: ReadonlySet<number>): void {
    this.clock.keep((key) => present.has(Number(key.split(':')[0])));
  }

  private icon(): { root: HTMLElement; time: HTMLElement } {
    const root = element('span', 'status', this.root);
    root.role = 'img';
    element('i', 'glyph', root);
    const made = { root, time: element('i', 'time', root) };
    this.icons.push(made);
    return made;
  }
}

/** The icons' sheet: each a square of its glyph over its time's line in its element's colour, 24 px wherever it
 *  stands, over a figure too, where the row is scaled back up as the plate shrinks with distance; a Charge's immunity
 *  faded; a plate's row beside its bar and the player's over their health, 6 px apart. */
export function statusCss(): string {
  const looks = (Object.keys(LOOKS) as StatusName[]).map((name) => {
    const colour = ELEMENTS[LOOKS[name].element]?.colour ?? '#fff';
    const picture = `url("data:image/svg+xml,${encodeURIComponent(statusSvg(name))}")`;
    return `.fight-hud .status[data-status='${name}'] { --status: ${colour}; }
.fight-hud .status[data-status='${name}'] .glyph { background-image: ${picture}; }`;
  });
  return `
.fight-hud .statuses { display: flex; gap: 3px; align-items: flex-end; }
.fight-hud .status { --size: 24px; display: flex; flex-direction: column; gap: 2px; width: var(--size); }
.fight-hud .status .glyph { display: block; width: var(--size); height: var(--size); background-size: 100% 100%;
  image-rendering: pixelated; filter: drop-shadow(1px 1px 0 ${TONES.outline}); }
.fight-hud .status .time { display: block; height: 2px; background: var(--status); box-shadow: 0 0 0 1px ${TONES.outline}; }
.fight-hud .status.faded { opacity: 0.4; }
${looks.join('\n')}
.fight-hud .target, .fight-hud .boss { position: relative; }
.fight-hud .plate .statuses { position: absolute; left: calc(100% + 5px); bottom: 0; }
.fight-hud .overhead .statuses { transform-origin: left bottom; }
`;
}
