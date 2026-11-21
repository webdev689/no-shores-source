// A sea fight as the player reads it: her own ship in a compact window at the bottom left (hull, sails and crew as
// bars, each side's guns, the shot loaded, the brace, and the warning of a broadside run out at her), and the fight's
// task, which counts the ships still afloat and their men. Each captain's hull stands on her plate over her, and DFO's
// messages are the HUD's toasts.
import { TONES } from '../plus/tones.ts';
import { announce } from '../ui/announce.ts';
import { easeOut } from '../ui/ease.ts';
import type { Node } from '../ui/node.ts';
import { drawings, edges, header, keycap, ruleOver, strip, Tween } from './hudParts.ts';
import type { FightView } from '../rules/fightRules.ts';
import type { Quest } from './tasks.ts';

/** Her ship as the panel shows her: her kind, hull, sails and crew (each what she has and her most), each side's
 *  guns (port, then starboard), the shot loaded, whether she is braced, and whether a broadside is run out at her. */
export interface ShipReadout {
  readonly name: string;
  readonly hull: readonly [number, number];
  readonly sails: readonly [number, number];
  readonly crew: readonly [number, number];
  readonly guns: readonly [string, string];
  readonly shot: string;
  readonly braced: boolean;
  readonly broadside: boolean;
}

/** A fight's frame as the HUD shows it: her ship, DFO's messages now, how many captains are still afloat, and how
 *  many men they have between them. */
export interface FightReadout {
  readonly ship: ShipReadout;
  readonly said: readonly string[];
  readonly left: number;
  readonly men: number;
}

/** What the HUD shows of fight `view`, her ship being a `own`, with the messages `said` now. */
export function readoutOf(view: FightView, own: string, said: readonly string[]): FightReadout {
  const { player, lay } = view;
  const captains = [view.captain, ...(view.others ?? [])];
  // Only those fighting her are hers to beat: a rival's ship in a clash she joined is not.
  const afloat = captains.filter((each) => each.state === 'afloat' && each.hostile);
  const side = (index: 0 | 1): string => {
    if (lay && lay.side === (index === 0 ? 'port' : 'starboard')) return lay.on_target ? 'On target' : 'Laying';
    const left = player.guns.left[index];
    return left > 0 ? `${left.toFixed(1)} s` : 'Ready';
  };
  const { load } = player.guns;
  return {
    ship: {
      name: `Your ${own}`,
      hull: [Math.ceil(player.hull), player.max_hull],
      sails: [Math.ceil(player.sail), player.max_sail],
      crew: [Math.ceil(player.crew), player.max_crew],
      guns: [side(0), side(1)],
      shot: `${load.charAt(0).toUpperCase()}${load.slice(1)} shot`,
      braced: player.guns.braced,
      broadside: afloat.some((each) => each.run_out.length > 0),
    },
    said,
    left: afloat.length,
    men: afloat.reduce((sum, each) => sum + Math.ceil(each.crew), 0),
  };
}

/** The task of a sea fight, under quest `name`, with `left` ships afloat and their `men`: by the naval rules a
 *  captain strikes once her men are gone (or her hull is beaten low), and a struck ship is beaten without sinking. */
export function seaFightQuest(name: string, left: number, men: number): Quest {
  return {
    name,
    task: 'Defeat their crews',
    steps: [{ text: 'Ships left', count: left }, { text: 'Their men', count: men }, { text: 'No need to sink them' }],
  };
}

/** How long a bar's fill takes to reach a new share, seconds, easing out as CSS's `ease-out` does. */
const FILL_S = 0.25;
const BAR_KINDS = [
  ['hull', 'Hull', '#b53a2e'],
  ['sails', 'Sails', '#c2b79a'],
  ['crew', 'Crew', '#2f9152'],
] as const;
/** The broadside warning's edge: stone gone to blood. */
const BLOOD = { top: [2, '#e0584a'], right: [2, '#5a130f'], bottom: [2, '#3d0d0a'], left: [2, '#b83a2e'] } as const;

export class FightPanel {
  private ship: ShipReadout | null = null;
  private readonly fills = BAR_KINDS.map(() => new Tween(0, FILL_S, easeOut));

  /** Whether the panel shows. */
  get shown(): boolean {
    return this.ship !== null;
  }

  /** Shows her ship as `ship` reads, or hides the panel for none; a broadside newly run out at her is told aloud. */
  show(ship: ShipReadout | null, now = performance.now() / 1000): void {
    if (ship?.broadside && !this.ship?.broadside) announce('Broadside! Brace');
    if (ship && !this.ship)
      BAR_KINDS.forEach(([key], index) => this.fills[index]?.set(shareOf(ship[key]), Number.NEGATIVE_INFINITY));
    if (ship) BAR_KINDS.forEach(([key], index) => this.fills[index]?.set(shareOf(ship[key]), now));
    this.ship = ship;
  }

  /** The panel in a view `width` by `height` CSS pixels at `now` (seconds): at the bottom left, over the dialogue box
   *  where the view is narrow, its words a step larger where the view is 1500 by 900 or more; still when `still`. */
  node(view: { readonly width: number; readonly height: number }, now: number, still: boolean): Node | null {
    const ship = this.ship;
    if (!ship) return null;
    const big = view.width >= 1500 && view.height >= 900;
    const size = big ? 2 : 1;
    const [label, value] = big ? [80, 96] : [44, 56];
    const dim = (words: string): Node => ({
      text: { words: words.toUpperCase(), size, colour: '#9a9079', wrap: false, tracking: 3 },
    });
    const bar = ([key, words, colour]: (typeof BAR_KINDS)[number], index: number): Node => {
      const share = this.fills[index]?.value(now, still) ?? 0;
      return {
        width: 'grow',
        gap: 6,
        alignY: 'center',
        padding: [6, 11, 0, 11],
        children: [
          { width: label, children: [dim(words)] },
          {
            width: 'grow',
            height: big ? 14 : 10,
            role: 'track',
            bevel: 1,
            padding: 1,
            children: [
              {
                width: `${Math.round(1000 * share) / 10}%`,
                height: 'grow',
                fill: colour,
                draw: drawings(
                  strip(0, 1, 'rgba(255,255,255,0.34)'),
                  strip(-2, 2, 'rgba(0,0,0,0.36)'),
                  edges({ right: [2, 'rgba(255,255,255,0.42)'] }),
                ),
              },
            ],
          },
          {
            width: value,
            children: [
              {
                width: 'grow',
                text: { words: `${ship[key][0]}/${ship[key][1]}`, size, colour: '#fbf8f0', align: 'end', wrap: false },
              },
            ],
          },
        ],
      };
    };
    const gun = (words: string): Node => ({
      // A side still reloading reads dim; one ready or laid stands bright.
      text: { words, size, colour: words.endsWith(' s') ? '#e2dccd' : TONES.brassHi, wrap: false },
    });
    const chip = (words: string): Node => ({
      role: 'chip',
      bevel: 1,
      padding: [2, 7],
      children: [{ text: { words, size, colour: TONES.word, wrap: false } }],
    });
    return {
      role: 'window',
      direction: 'column',
      through: true,
      width: big ? 372 : 248,
      padding: 2,
      float: { to: 'screen', at: [0, 1], anchor: [0, 1], x: 28, y: view.width <= 890 ? -262 : -22 },
      children: [
        {
          width: 'grow',
          padding: [4, 11, 3, 11],
          ...header(),
          children: [{ text: { words: ship.name, size: 2, colour: TONES.brassHi } }],
        },
        ship.broadside && {
          width: 'grow',
          padding: [8, 11, 0, 11],
          children: [
            {
              width: 'grow',
              role: 'chip',
              padding: [5, 10],
              gap: 6,
              alignY: 'center',
              draw: edges(BLOOD),
              children: [
                { width: 'grow', text: { words: 'BROADSIDE! BRACE', size: 2, colour: '#ff8a76' } },
                keycap('C', size),
              ],
            },
          ],
        },
        ...BAR_KINDS.map(bar),
        {
          width: 'grow',
          padding: [0, 11],
          children: [
            {
              width: 'grow',
              gap: 6,
              alignY: 'center',
              padding: [14, 0, 0, 0],
              draw: (ui, box, scale, clip) => ruleOver()(ui, { ...box, y: box.y + 8 * scale }, scale, clip),
              children: [
                dim('Port'),
                { width: 'grow', children: [gun(ship.guns[0])] },
                dim('Starboard'),
                { width: 'grow', children: [gun(ship.guns[1])] },
              ],
            },
          ],
        },
        {
          gap: 6,
          padding: [6, 11, 11, 11],
          children: [chip(ship.shot), ship.braced && chip('Braced')],
        },
      ],
    };
  }
}

/** A bar's share filled, 0 to 1. */
const shareOf = ([have, most]: readonly [number, number]) => Math.max(0, Math.min(1, have / Math.max(1, most)));
