// The Test Ground's statuses, to see and tune them: each one given to the player or to every foe, for its own time or
// for as many seconds as asked. The room gives them through the same door a spell or a perk will.
import { button, make } from '../editor/dom.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import { STATUSES } from '../rules/fighters.ts';
import { labelled } from './dressPanel.ts';

/** The words on each status's button. */
const NAMES = {
  crit: 'Crit',
  expose: 'Expose',
  charge: 'Charge',
  haste: 'Haste',
  linked: 'Linked',
  veiled: 'Veiled',
} as const;
/** The longest a status may be asked for, in seconds. */
const LONGEST_SECONDS = 600;

/** The ask that gives a status, by its number, to the player or to every foe, for `seconds` (0 for its own time). */
export function statusAsk(status: number, onFoes: boolean, seconds: number): GearAsk {
  const held = Math.min(LONGEST_SECONDS, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  return { kind: ASKS.grantStatus, slot: status, node: onFoes ? 1 : 0, count: Math.round(held * 60) };
}

/** Adds the statuses' panel to `root`: how long, then a button for each status on the player and on every foe. */
export function startStatusPanel(root: HTMLElement, ask: (asked: GearAsk) => void): void {
  const seconds = make('input');
  Object.assign(seconds, { type: 'number', min: '0', max: String(LONGEST_SECONDS), step: '0.5', value: '0' });
  const row = (onFoes: boolean) =>
    STATUSES.map((name, number) => button(NAMES[name], () => ask(statusAsk(number, onFoes, Number(seconds.value)))));
  root.append(
    make('h2', 'Statuses'),
    labelled('Seconds, 0 for its own', seconds),
    make('p', 'On you', 'hint'),
    ...row(false),
    make('p', 'On every foe', 'hint'),
    ...row(true),
  );
}
