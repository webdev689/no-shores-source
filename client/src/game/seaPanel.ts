// A sea fight as the player reads it: her own ship in a compact window at the bottom left (hull, sails and crew as
// bars, each side's guns, the shot loaded, the brace, and the warning of a broadside run out at her), and the fight's
// task, which counts the ships still afloat and their men. Each captain's hull stands on her plate over her, and DFO's
// messages are the HUD's toasts.
import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';
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

/** One bar of the panel: its label, its trough and fill, and its numbers. */
interface Bar {
  readonly fill: HTMLElement;
  readonly value: HTMLElement;
}

export class FightPanel {
  private readonly root = make('section', '', `fight-ship ${ROLES.window}`);
  private readonly name = make('div', '', `fight-ship-name ${ROLES.header}`);
  private readonly warning = make('div', 'Broadside! Brace', `fight-ship-warning ${ROLES.chip}`);
  private readonly bars: Record<'hull' | 'sails' | 'crew', Bar>;
  private readonly guns = [make('span', '', 'fight-ship-gun'), make('span', '', 'fight-ship-gun')] as const;
  private readonly shot = make('span', '', `fight-ship-shot ${ROLES.chip}`);
  private readonly braced = make('span', 'Braced', `fight-ship-braced ${ROLES.chip}`);
  private written = '';

  constructor(parent: HTMLElement) {
    this.root.setAttribute('aria-label', 'Your ship');
    this.warning.append(make('kbd', 'C', 'gear-key'));
    this.warning.setAttribute('role', 'alert');
    const bar = (label: string, key: string): [HTMLElement, Bar] => {
      const row = make('div', '', `fight-ship-row ${key}`);
      const track = make('span', '', `fight-ship-track ${ROLES.track}`);
      const fill = make('i', '', `fight-ship-fill ${ROLES.meter}`);
      const value = make('span', '', 'fight-ship-value');
      track.append(fill);
      row.append(make('span', label, 'fight-ship-label'), track, value);
      return [row, { fill, value }];
    };
    const [hull, sails, crew] = [bar('Hull', 'hull'), bar('Sails', 'sails'), bar('Crew', 'crew')];
    this.bars = { hull: hull[1], sails: sails[1], crew: crew[1] };
    const guns = make('div', '', `fight-ship-guns ${ROLES.rule}`);
    guns.append(
      make('span', 'Port', 'fight-ship-label'),
      this.guns[0],
      make('span', 'Starboard', 'fight-ship-label'),
      this.guns[1],
    );
    const load = make('div', '', 'fight-ship-load');
    load.append(this.shot, this.braced);
    this.root.append(this.name, this.warning, hull[0], sails[0], crew[0], guns, load);
    this.root.hidden = true;
    parent.append(this.root);
  }

  /** Shows her ship as `ship` reads, or hides the panel for none; it writes the page only when what it says changes. */
  show(ship: ShipReadout | null): void {
    const written = JSON.stringify(ship);
    if (written === this.written) return;
    this.written = written;
    this.root.hidden = ship === null;
    if (!ship) return;
    this.name.textContent = ship.name;
    this.warning.hidden = !ship.broadside;
    for (const key of ['hull', 'sails', 'crew'] as const) {
      const [have, most] = ship[key];
      this.bars[key].fill.style.width = `${(100 * Math.max(0, Math.min(1, have / Math.max(1, most)))).toFixed(1)}%`;
      this.bars[key].value.textContent = `${have}/${most}`;
    }
    ship.guns.forEach((words, index) => {
      const gun = this.guns[index];
      if (!gun) return;
      gun.textContent = words;
      // A side still reloading reads dim; one ready or laid stands bright.
      gun.classList.toggle('loading', words.endsWith(' s'));
    });
    this.shot.textContent = ship.shot;
    this.braced.hidden = !ship.braced;
  }

  remove(): void {
    this.root.remove();
  }
}
