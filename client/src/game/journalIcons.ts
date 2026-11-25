// The Journal's icons, drawn pixel by pixel in the gear glyphs' style (`gearGlyphs.ts`): twelve square, a dark outline,
// lit from the top left. They mark where a bounty counts, and lead the timers: each reset, the dungeons on, the seas
// of each tier and how a character stands with them, what a run pays, the Abyss's rules, and each modifier.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { ELEMENTS } from '../player/gear.ts';
import { type Pixels, svgOf } from '../plus/emblems.ts';
import type { Node } from '../ui/node.ts';
import { TONES } from '../plus/tones.ts';
import { ICONS } from './journalIconMaps.ts';

export type IconName = keyof typeof ICONS;

/** The pixels a side of an icon. */
export const ICON_PIXELS = 12;

/** An icon as SVG markup, some of its colours swapped where `tones` gives them. */
export function iconSvg(name: IconName, tones: Readonly<Record<string, string>> = {}): string {
  const icon: Pixels = ICONS[name];
  return svgOf({ rows: icon.rows, tones: { ...icon.tones, ...tones } });
}

/** A pixel picture laid `width` by `height` (a whole multiple of its pixels), each of its pixels a whole block. */
export function pixelNode(
  key: string,
  svg: string,
  pixels: readonly [number, number],
  width: number,
  height = width,
): Node {
  return { width, height, picture: { key, source: { svg }, pixel: { width: pixels[0], height: pixels[1] } } };
}

/** An icon laid `size` pixels square (a whole multiple of its twelve), some of its colours swapped where `tones`
 *  gives them. */
export function iconNode(name: IconName, size: number, tones?: Readonly<Record<string, string>>): Node {
  const key = `journal icon ${name} ${tones ? Object.values(tones).join(' ') : ''}`;
  return pixelNode(key, iconSvg(name, tones), [ICON_PIXELS, ICON_PIXELS], size);
}

/** Each pool's mark, by the board's numbers: 0 land, 1 the sea, 2 dungeons, 3 the passages. */
const POOLS: readonly IconName[] = ['land', 'sea', 'dungeon', 'lamp'];

/** The mark of where a bounty counts: a peak on land, a wave at sea, an arched door in a dungeon; null for a pool the
 *  board does not have. */
export function poolMarkSvg(pool: number): string | null {
  const name = POOLS[pool];
  return name ? iconSvg(name) : null;
}

/** The ground each pool's tiles stand on: stone for land, deep water for the sea, blood for dungeons, a lamp's
 *  dark brass for the passages. */
export const POOL_GROUNDS: readonly string[] = [TONES.stoneDim, TONES.sea, TONES.bloodDeep, TONES.brassDark];

/** The modifiers drawn under their own keys. */
const MODIFIERS: readonly IconName[] = [
  'brawler',
  'marksman',
  'lightswitch',
  'ironclad',
  'trickle',
  'juggler',
  'exposure',
];

const ART_ELEMENTS: ReadonlyMap<string, number> = new Map(arts.arts.map((art) => [art.key, art.element]));

/** A modifier's icon by its key ("burn-shadow", "brawler", ...), Burn's flame in its Art's element's colours; none
 *  for a key it does not know. */
export function modifierIcon(key: string): { readonly name: IconName; readonly tones?: Record<string, string> } | null {
  if (key.startsWith('burn-')) {
    const element = ELEMENTS[ART_ELEMENTS.get(key.slice('burn-'.length)) ?? 0];
    if (!element) return { name: 'burn' };
    const [dark, body, light] = element.palette;
    return { name: 'burn', tones: { b: body, c: light, d: dark } };
  }
  const name = MODIFIERS.find((modifier) => modifier === key);
  return name ? { name } : null;
}
