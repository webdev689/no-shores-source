// The heads-up display's pieces as nodes, each set against the view as the page's sheet stood it: the place's name,
// the warning and its count, death's words, the key strip, the status line, the sea bar and the offers over it, her
// ship's panel and the menu. Each answers its node for a frame, or nothing while it does not show; presses run what
// they are handed.
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import type { Hint } from './gearDom.ts';
import { footer, header, hintRow, hudPress, rail, ruleUnder, said } from './hudParts.ts';
import type { ShipPanel } from './shipPanel.ts';

/** The view as the display lays itself against it: its size, whether its words take their larger step (1500 by 900
 *  or more) and stand doubled (2400 by 1300 or more), and what else holds the screen: the fight's display on foot and
 *  its boss's bar, the ships' plates in a sea fight, and the dialogue box while someone speaks. */
export interface HudView {
  readonly width: number;
  readonly height: number;
  readonly big: boolean;
  readonly doubled: boolean;
  readonly fight: boolean;
  readonly bossed: boolean;
  readonly plates: boolean;
  readonly speaking: boolean;
}

export const DIM = 'rgba(242,239,230,0.68)';
const WARN = '#f0b545';
const DEAD = '#d8574a';

/** One choice of a menu. */
export interface Choice {
  readonly label: string;
  readonly run: () => void;
}

/** The place's name and kind at the top left, clear of the compass; at the top right while the fight's display holds
 *  the left, and gone while a boss's bar or the ships' plates hold the top. */
export function placeNode(view: HudView, title: string, kind: string): Node | null {
  if (view.bossed || view.plates || (title === '' && kind === '')) return null;
  const zoom = view.doubled ? 2 : 1;
  const right = view.fight;
  const align = right ? 'end' : 'start';
  return {
    direction: 'column',
    gap: 2 * zoom,
    through: true,
    alignX: align,
    maxWidth: Math.max(0, view.width / 2 - Math.min(260 * zoom, 0.3 * view.width) - 40 * zoom),
    float: {
      to: 'screen',
      at: [right ? 1 : 0, 0],
      anchor: [right ? 1 : 0, 0],
      x: (right ? -28 : 28) * zoom,
      y: 22 * zoom,
    },
    children: [
      { text: { words: title, size: 2 * zoom, colour: TONES.ink, edge: 'halo', align } },
      { text: { words: kind.toUpperCase(), size: zoom, colour: TONES.ink, edge: 'halo', align, tracking: 3 } },
    ],
  };
}

/** The warning to return to the area and its count, under the compass's column. */
export function warningNode(view: HudView, count: string): Node {
  return {
    direction: 'column',
    alignX: 'center',
    width: 'grow',
    through: true,
    float: { to: 'screen', y: Math.round(Math.max(0.18 * view.height, 180)) },
    children: [
      said('RETURN TO THE AREA', { size: 2, colour: WARN, tracking: 5 }),
      said(count, { size: 6, colour: WARN }),
    ],
  };
}

/** Death's words over the middle of the view and the press to rise again, waiting while it may not yet. */
export function deathNode(ui: Interface, canRespawn: boolean, respawn: () => void): Node {
  return {
    width: 'grow',
    height: 'grow',
    direction: 'column',
    alignX: 'center',
    alignY: 'center',
    gap: 10,
    float: { to: 'screen' },
    children: [
      { through: true, children: [said('YOU DIED', { size: 4, colour: DEAD, tracking: 5 })] },
      {
        padding: [0, 0, 10, 0],
        through: true,
        children: [said('You strayed too far from the area.', { colour: DIM })],
      },
      hudPress(ui, 'hud:respawn', canRespawn ? 'Respawn' : 'Respawn…', respawn, {
        role: 'primary',
        disabled: !canRespawn,
      }),
    ],
  };
}

/** The key strip at the bottom right, under the dialogue box's foot, wrapping short of the Arts and weapons; over the
 *  sea bar and the offer over it while they show; gone while someone speaks. */
export function hintsNode(view: HudView, hints: readonly Hint[], seaBar: boolean, offer: boolean): Node | null {
  if (hints.length === 0 || view.speaking) return null;
  const zoom = view.doubled ? 2 : 1;
  const size = view.big ? 2 : 1;
  const foot = seaBar ? (offer ? 148 : 96) : 22;
  return {
    id: 'hud:hints',
    through: true,
    gap: 14 * zoom,
    wrap: true,
    alignX: 'end',
    alignY: 'center',
    maxWidth: Math.max(0, view.width - 480 * zoom),
    float: { to: 'screen', at: [1, 1], anchor: [1, 1], x: -28 * zoom, y: -foot * zoom },
    children: hintRow(hints, size),
  };
}

/** The line of what is happening: under the compass at sea, under the place's name at the top right on foot. */
export function statusNode(view: HudView, text: string): Node | null {
  if (text === '') return null;
  if (view.fight) {
    const size = view.big ? 2 : 1;
    const top = view.doubled ? (view.bossed ? 232 : 140) : view.bossed ? 128 : 84;
    const most = view.width / 2 - Math.min(view.doubled ? 520 : 260, 0.3 * view.width) - 60;
    return {
      role: 'chip',
      through: true,
      padding: [7, 12],
      maxWidth: Math.max(0, most) + 24,
      float: { to: 'screen', at: [1, 0], anchor: [1, 0], x: -28, y: top },
      children: [said(text, { size, align: 'end' })],
    };
  }
  return {
    role: 'chip',
    through: true,
    padding: [8, 16],
    float: { to: 'screen', at: [0.5, 0], anchor: [0.5, 0], y: view.plates ? 114 : 56 },
    children: [said(text, { wrap: false })],
  };
}

/** What the sea bar shows and does. */
export interface SeaBarState {
  readonly pace: number;
  readonly sailing: boolean;
  readonly resumable: boolean;
  readonly canLeave: boolean;
  readonly canManage: boolean;
}

/** What the presses of the sea bar and her ship's panel do. */
export interface SeaBarActions {
  readonly map: () => void;
  readonly voyage: () => void;
  readonly pace: (direction: number) => void;
  readonly manage: () => void;
  readonly leave: () => void;
}

/** The navigation panel at sea: the map, stopping or resuming the voyage, the pace dial, and her ship's presses, each
 *  group after the first behind an engraved rail. */
export function seaBarNode(ui: Interface, state: SeaBarState, act: SeaBarActions): Node {
  const label = (words: string): Node => said(words, { colour: DIM, wrap: false, tracking: 3 });
  const group = (first: boolean, ...children: Node[]): Node => ({
    gap: 8,
    alignY: 'center',
    padding: first ? 0 : [0, 0, 0, 18],
    draw: first ? undefined : rail(),
    children,
  });
  const voyage = state.sailing || state.resumable;
  return {
    role: 'window',
    gap: 18,
    alignY: 'center',
    padding: [10, 16],
    float: { to: 'screen', at: [0.5, 1], anchor: [0.5, 1], y: -28 },
    children: [
      group(
        true,
        label('NAVIGATION'),
        hudPress(ui, 'sea:map', 'Map  N', act.map),
        ...(voyage
          ? [hudPress(ui, 'sea:voyage', state.sailing ? 'Stop  Space' : 'Resume voyage  Space', act.voyage)]
          : []),
      ),
      group(
        false,
        label('PACE'),
        hudPress(ui, 'sea:slower', '−  [', () => act.pace(-1)),
        { minWidth: 44, alignX: 'center', children: [said(`×${state.pace}`, { size: 2, wrap: false })] },
        hudPress(ui, 'sea:faster', ']  +', () => act.pace(1)),
      ),
      group(
        false,
        label('SHIP'),
        hudPress(ui, 'sea:manage', 'Manage  B', act.manage, { disabled: !state.canManage }),
        hudPress(ui, 'sea:leave', 'Leave the helm  H', act.leave, { disabled: !state.canLeave }),
      ),
    ],
  };
}

/** An offer over the sea bar's place, in brass: to dock or go ashore, take the helm, or go through a gate. */
export function offerNode(ui: Interface, id: string, words: string, take: () => void): Node {
  return {
    float: { to: 'screen', at: [0.5, 1], anchor: [0.5, 1], y: -94 },
    children: [hudPress(ui, id, words, take, { role: 'primary', padding: [12, 20] })],
  };
}

/** Manage's panel over her deck at the right: her name, and each part of it, those still to come marked Later, with
 *  the way back at its foot. */
export function shipPanelNode(ui: Interface, panel: ShipPanel, back: () => void): Node {
  return {
    role: 'window',
    direction: 'column',
    // The page's 300 was its words' room, its padding and border besides.
    width: 340,
    padding: 2,
    solid: true,
    float: { to: 'screen', at: [1, 0], anchor: [1, 0], x: -28, y: 84 },
    children: [
      {
        width: 'grow',
        padding: [12, 18, 10, 18],
        ...header(),
        children: [said(panel.title, { size: 2 })],
      },
      { height: 4 },
      ...panel.parts.map((part): Node => ({
        width: 'grow',
        direction: 'column',
        padding: [8, 18, 4, 18],
        children: [
          {
            width: 'grow',
            padding: [0, 0, 5, 0],
            draw: ruleUnder(),
            children: [said(part.heading.toUpperCase(), { colour: DIM, tracking: 3 })],
          },
          { height: 6 },
          part.later && {
            role: 'chip',
            padding: [4, 12],
            children: [said('Later', { colour: DIM, wrap: false, tracking: 3 })],
          },
          ...part.rows.map(([label, value]): Node => ({
            width: 'grow',
            gap: 12,
            padding: [2, 0],
            children: [
              { width: 'grow', children: [said(label, { colour: DIM })] },
              said(value, { align: 'end', wrap: false }),
            ],
          })),
        ],
      })),
      { height: 10 },
      {
        width: 'grow',
        padding: [10, 18, 12, 18],
        ...footer(),
        children: [hudPress(ui, 'ship:back', 'Back to the sea  B', back, { width: 'grow', alignX: 'center' })],
      },
    ],
  };
}

/** A menu in the middle of the view: its title over its choices, each a press. */
export function menuNode(ui: Interface, title: string, choices: readonly Choice[]): Node {
  return {
    role: 'window',
    direction: 'column',
    minWidth: 288,
    padding: 2,
    solid: true,
    float: { to: 'screen', at: [0.5, 0.5], anchor: [0.5, 0.5] },
    children: [
      {
        width: 'grow',
        padding: [12, 22, 10, 22],
        ...header(),
        children: [said(title.toUpperCase(), { colour: DIM, tracking: 3 })],
      },
      {
        width: 'grow',
        direction: 'column',
        gap: 8,
        padding: [6, 22, 20, 22],
        children: choices.map((choice, index) =>
          hudPress(ui, `menu:${index}`, choice.label, choice.run, { width: 'grow' }),
        ),
      },
    ],
  };
}
