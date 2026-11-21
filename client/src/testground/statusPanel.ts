// The Test Ground's statuses, to see and tune them: each one given to the player or to every foe, for its own time or
// for as many seconds as asked. The room gives them through the same door a spell or a perk will.
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import { STATUSES } from '../rules/fighters.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { field, heading, presses, hint, labelled, numberIn, press } from './panelKit.ts';

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

/** The statuses' panel: how long, then a press for each status on the player and on every foe. */
export function statusNodes(ui: Interface, ask: (asked: GearAsk) => void): Node[] {
  const seconds = numberIn(ui, 'tg:status:seconds', 0, 0, LONGEST_SECONDS, 0);
  const row = (onFoes: boolean): Node =>
    presses(
      STATUSES.map((name, number) =>
        press(ui, `tg:status:${onFoes ? 'foes' : 'you'}:${name}`, NAMES[name], () =>
          ask(statusAsk(number, onFoes, seconds)),
        ),
      ),
    );
  return [
    heading('Statuses'),
    labelled('Seconds, 0 for its own', field('tg:status:seconds', 'Seconds, 0 for its own', { width: 60 })),
    hint('On you'),
    row(false),
    hint('On every foe'),
    row(true),
  ];
}
