// The ship's console at the foot of the sea's view: its name and class over a switch between the Oversea and the
// Sealevel views; a compass with its heading and the wind; its voyage (what it is doing, at what pace and speed, where
// bound, and how far along); its hull, canvas and crew; and the presses of the view switched to: in the Oversea view
// planning a voyage on the map and stopping or resuming it, at sea level the helm's own and the ship's.
import { CANVAS_FACE } from '../face.ts';
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { boundWord, withKey } from './controls.ts';
import { DIM } from './hudPieces.ts';
import { footer, header, hudPress, rail, said } from './hudParts.ts';
import type { SeaLevel } from './seaView.ts';
import { percentWords } from '../ui/percent.ts';

/** What the console shows of the ship and its voyage. */
export interface ConsoleState {
  readonly level: SeaLevel;
  /** Its own name, and its hull's class ("Sloop"). */
  readonly name: string;
  readonly hull: string;
  /** Its heading, and the way the wind blows toward, radians clockwise from north; the wind's speed, m/s. */
  readonly heading: number;
  readonly wind: { readonly toward: number; readonly speed: number } | null;
  readonly sailing: boolean;
  readonly resumable: boolean;
  /** The pace its voyage was set at, the pace it sails at now (eased down while watched close, or `held` lower by the
   *  room near a hostile ship), and its speed, m/s. */
  readonly pace: number;
  readonly paceNow: number;
  readonly held: boolean;
  readonly speed: number;
  /** Where it is bound, in words ("Overlook's harbour, to dock"); the voyage's share sailed, and its line. */
  readonly bound: string | null;
  readonly share: number | null;
  readonly line: string;
  /** The water it is in ("The Lantern Sea, Overlook's home waters"). */
  readonly water: string;
  /** Its hull, canvas and crew, shares of whole. */
  readonly kept: { readonly hull: number; readonly sail: number; readonly crew: number };
  readonly canLeave: boolean;
  readonly canManage: boolean;
}

/** What the console's presses do. */
export interface ConsoleActions {
  readonly level: (level: SeaLevel) => void;
  readonly map: () => void;
  readonly voyage: () => void;
  readonly sailOn: () => void;
  readonly heaveTo: () => void;
  readonly manage: () => void;
  readonly leave: () => void;
}

/** The console's width, CSS pixels, and the compass's side; narrower views lay its columns under each other. */
const WIDE = 760;
const COMPASS = 92;
const BRASS = '#f3cf86';
const BAR_GROUND = 'rgba(5,6,8,0.55)';

/** The sixteen winds, clockwise from north. */
const WINDS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** A bearing (radians clockwise from north) as whole degrees, 0 to 359. */
export const degreesOf = (bearing: number): number => {
  const degrees = Math.round((((bearing * 180) / Math.PI) % 360) + 360) % 360;
  return degrees === 360 ? 0 : degrees;
};

/** The wind of the sixteen nearest a bearing. */
export const windOf = (bearing: number): string => WINDS[Math.round(degreesOf(bearing) / 22.5) % 16] ?? 'N';

/** The console's words for its heading and the wind: "274° W", and "Wind 6 m/s from the ENE", or "Calm". */
export function bearingWords(heading: number, wind: ConsoleState['wind']): { heading: string; wind: string } {
  const from =
    wind && wind.speed >= 0.5 ? `Wind ${Math.round(wind.speed)} m/s from the ${windOf(wind.toward + Math.PI)}` : 'Calm';
  return { heading: `${degreesOf(heading)}° ${windOf(heading)}`, wind: from };
}

/** Draws the compass's card, `side` pixels square: a dark face, a brass rim ticked every 10 degrees, longer every
 *  30 and longest at the four winds, and their letters. */
function drawCard(context: OffscreenCanvasRenderingContext2D, side: number): void {
  const middle = side / 2;
  const unit = side / COMPASS;
  context.fillStyle = 'rgba(8,10,14,0.85)';
  context.beginPath();
  context.arc(middle, middle, middle - unit, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 2 * unit;
  context.strokeStyle = TONES.brass;
  context.stroke();
  context.lineWidth = unit;
  for (let tick = 0; tick < 36; tick += 1) {
    const turn = (tick * Math.PI) / 18;
    const inward = (tick % 9 === 0 ? 9 : tick % 3 === 0 ? 5 : 3) * unit;
    const [across, down] = [Math.sin(turn), -Math.cos(turn)];
    const edge = middle - 3 * unit;
    context.beginPath();
    context.moveTo(middle + across * edge, middle + down * edge);
    context.lineTo(middle + across * (edge - inward), middle + down * (edge - inward));
    context.stroke();
  }
  context.font = `${11 * unit}px ${CANVAS_FACE}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const [letter, turn] of [
    ['N', 0],
    ['E', 0.5],
    ['S', 1],
    ['W', 1.5],
  ] as const) {
    context.fillStyle = letter === 'N' ? '#e46b5c' : TONES.ink;
    const reach = middle - 20 * unit;
    context.fillText(letter, middle + Math.sin(turn * Math.PI) * reach, middle - Math.cos(turn * Math.PI) * reach);
  }
}

/** Draws the ship's needle pointing up, `side` pixels square: a brass hull's shape from the middle out to the rim. */
function drawNeedle(context: OffscreenCanvasRenderingContext2D, side: number): void {
  const [middle, unit] = [side / 2, side / COMPASS];
  context.fillStyle = BRASS;
  context.beginPath();
  context.moveTo(middle, middle - 30 * unit);
  context.quadraticCurveTo(middle + 7 * unit, middle - 8 * unit, middle + 5 * unit, middle + 14 * unit);
  context.lineTo(middle - 5 * unit, middle + 14 * unit);
  context.quadraticCurveTo(middle - 7 * unit, middle - 8 * unit, middle, middle - 30 * unit);
  context.fill();
  context.lineWidth = unit;
  context.strokeStyle = 'rgba(5,6,8,0.9)';
  context.stroke();
}

/** Draws the wind's arrow pointing up, `side` pixels square: a pale shaft along the rim's inside, its head at the top,
 *  so turned it points the way the wind blows. */
function drawWind(context: OffscreenCanvasRenderingContext2D, side: number): void {
  const [middle, unit] = [side / 2, side / COMPASS];
  context.strokeStyle = 'rgba(160,214,232,0.9)';
  context.fillStyle = 'rgba(160,214,232,0.9)';
  context.lineWidth = 2 * unit;
  context.beginPath();
  context.moveTo(middle, middle + 34 * unit);
  context.lineTo(middle, middle + 22 * unit);
  context.moveTo(middle, middle - 22 * unit);
  context.lineTo(middle, middle - 30 * unit);
  context.stroke();
  context.beginPath();
  context.moveTo(middle, middle - 37 * unit);
  context.lineTo(middle + 4 * unit, middle - 30 * unit);
  context.lineTo(middle - 4 * unit, middle - 30 * unit);
  context.closePath();
  context.fill();
}

const turned = (bearing: number) => (bearing * 180) / Math.PI;

/** The compass: its card, the wind's arrow and the ship's needle turned to their bearings. */
function compassNode(state: ConsoleState): Node {
  const layer = (key: string, draw: typeof drawCard, turn: number): Node => ({
    width: COMPASS,
    height: COMPASS,
    float: { to: 'parent', anchor: [0, 0], at: [0, 0] },
    picture: { key: `console ${key}`, source: { draw }, turn },
  });
  return {
    width: COMPASS,
    height: COMPASS,
    label: 'Compass',
    children: [
      layer('card', drawCard, 0),
      state.wind && state.wind.speed >= 0.5 && layer('wind', drawWind, turned(state.wind.toward)),
      layer('needle', drawNeedle, turned(state.heading)),
    ],
  };
}

/** A bar of a share of whole, labelled, its fill coloured by how much is left. */
function shareBar(label: string, share: number): Node {
  const whole = Math.max(0, Math.min(1, share));
  const colour = whole > 0.6 ? '#7fc27a' : whole > 0.3 ? '#f0b545' : '#d8574a';
  return {
    width: 'grow',
    direction: 'column',
    gap: 3,
    children: [
      {
        width: 'grow',
        children: [
          { width: 'grow', children: [said(label, { colour: DIM })] },
          said(percentWords(whole), { wrap: false }),
        ],
      },
      {
        width: 'grow',
        height: 6,
        fill: BAR_GROUND,
        outline: { width: 1, colour: 'rgba(163,152,128,0.35)' },
        children: [{ width: `${Math.round(whole * 1000) / 10}%`, height: 'grow', fill: colour }],
      },
    ],
  };
}

/** A small heading over a column, in capitals. */
const heading = (words: string): Node => said(words, { colour: DIM, tracking: 3, wrap: false });

/** How a voyage is set at rest in the view switched to: by a click or the map in the Oversea view, by the helm's keys
 *  at sea level, where a click sets no course. */
const restWords = (level: SeaLevel): string =>
  level === 'oversea'
    ? 'Click the sea to sail at ×60; plan on the map for ×200.'
    : `${boundWord('sailOn')} sails on; ${boundWord('steerLeft')} and ${boundWord('steerRight')} steer.`;

/** The voyage's column: what it is doing, its pace and speed, where it is bound, and a bar of its way sailed. Held,
 *  its line says why. */
function voyageNode(state: ConsoleState): Node {
  const doing = state.sailing ? 'Under way' : state.resumable ? 'Hove to' : 'At anchor';
  const under = state.paceNow < state.pace;
  const why = state.held ? '' : ' · true speed while watched';
  const pace = under ? `×${state.paceNow} (×${state.pace} set)${why}` : `×${state.pace}`;
  return {
    width: 'grow',
    direction: 'column',
    gap: 5,
    children: [
      heading('VOYAGE'),
      {
        width: 'grow',
        gap: 10,
        alignY: 'center',
        children: [
          said(doing, { size: 2, colour: BRASS, wrap: false }),
          state.sailing && said(`${Math.round(state.speed)} m/s`, { colour: DIM }),
        ],
      },
      said(state.sailing || state.resumable ? `Pace ${pace}` : restWords(state.level), { colour: DIM }),
      state.bound !== null && said(`Bound for ${state.bound}`),
      state.share !== null && {
        width: 'grow',
        height: 6,
        fill: BAR_GROUND,
        outline: { width: 1, colour: 'rgba(163,152,128,0.35)' },
        children: [{ width: `${Math.round(state.share * 1000) / 10}%`, height: 'grow', fill: TONES.brass }],
      },
      // Its line, where it says more than what it is doing.
      state.line !== '' && state.line !== doing && said(state.line, { colour: DIM }),
    ],
  };
}

/** The switch between the two views: the one shown lit in brass. */
function switchNode(ui: Interface, state: ConsoleState, act: ConsoleActions): Node {
  const tab = (level: SeaLevel, words: string): Node =>
    hudPress(ui, `sea:view-${level}`, words, () => act.level(level), {
      role: state.level === level ? 'primary' : 'button',
      padding: [7, 14],
    });
  return {
    gap: 4,
    alignY: 'center',
    children: [
      tab('oversea', 'Oversea'),
      tab('sealevel', 'Sealevel'),
      said(withKey('', 'seaView').trim(), { colour: DIM, wrap: false }),
    ],
  };
}

/** The presses of the view switched to. */
function pressesOf(ui: Interface, state: ConsoleState, act: ConsoleActions): Node[] {
  if (state.level === 'oversea')
    return [
      hudPress(ui, 'sea:map', withKey('Plan a voyage', 'map'), act.map, { role: 'primary' }),
      ...(state.sailing || state.resumable
        ? [hudPress(ui, 'sea:voyage', withKey(state.sailing ? 'Stop' : 'Resume voyage', 'voyage'), act.voyage)]
        : []),
    ];
  return [
    hudPress(ui, 'sea:sail-on', withKey('Sail on', 'sailOn'), act.sailOn, { role: 'primary' }),
    hudPress(ui, 'sea:heave-to', withKey('Heave to', 'heaveTo'), act.heaveTo, { disabled: !state.sailing }),
    hudPress(ui, 'sea:manage', withKey('Manage', 'manage'), act.manage, { disabled: !state.canManage }),
    hudPress(ui, 'sea:leave', withKey('Leave the helm', 'leaveHelm'), act.leave, { disabled: !state.canLeave }),
  ];
}

/** What the footer says beside the presses: how this view sails. */
const sailsBy = (level: SeaLevel): string =>
  level === 'oversea'
    ? 'Click the sea to sail · ×60'
    : `${withKey('Steer', 'steerLeft')} / ${withKey('', 'steerRight').trim()}`;

/** The ship's console over the foot of the view, `width` pixels of view across. */
export function shipConsoleNode(ui: Interface, state: ConsoleState, act: ConsoleActions, width: number): Node {
  const narrow = width < WIDE + 80;
  const words = bearingWords(state.heading, state.wind);
  const bars = [
    shareBar('Hull', state.kept.hull),
    shareBar('Canvas', state.kept.sail),
    shareBar('Crew', state.kept.crew),
  ];
  const ship: Node = {
    width: narrow ? 'grow' : 220,
    direction: 'column',
    gap: 6,
    padding: narrow ? 0 : [0, 0, 0, 16],
    draw: narrow ? undefined : rail(),
    children: [
      heading('SHIP'),
      // Narrow, the three bars stand side by side under the rest, so the console stays low.
      ...(narrow ? [{ width: 'grow', gap: 12, children: bars } satisfies Node] : bars),
      said(state.water, { colour: DIM }),
    ],
  };
  const compass: Node = {
    direction: 'column',
    alignX: 'center',
    gap: 4,
    children: [
      compassNode(state),
      said(words.heading, { wrap: false }),
      said(words.wind, { colour: DIM, wrap: false }),
    ],
  };
  return {
    id: 'sea:bar',
    role: 'window',
    direction: 'column',
    width: narrow ? Math.max(320, width - 40) : WIDE,
    padding: 2,
    solid: true,
    label: `${state.name}, ${state.hull}. ${words.heading}. ${state.line}`,
    float: { to: 'screen', at: [0.5, 1], anchor: [0.5, 1], y: -20 },
    children: [
      {
        width: 'grow',
        gap: 12,
        alignY: 'center',
        padding: [8, 14, 8, 16],
        ...header(),
        children: [
          {
            width: 'grow',
            gap: 10,
            alignY: 'center',
            children: [
              said(state.name, { size: 2, colour: BRASS, wrap: false }),
              said(state.hull, { colour: DIM, wrap: false }),
            ],
          },
          switchNode(ui, state, act),
        ],
      },
      {
        width: 'grow',
        gap: 16,
        padding: [10, 16],
        direction: narrow ? 'column' : 'row',
        children: narrow
          ? [{ width: 'grow', gap: 14, children: [compass, voyageNode(state)] }, ship]
          : [compass, voyageNode(state), ship],
      },
      {
        width: 'grow',
        gap: 10,
        alignY: 'center',
        padding: [8, 14, 10, 16],
        ...footer(),
        children: [
          { width: 'grow', children: [said(sailsBy(state.level), { colour: DIM })] },
          { gap: 10, alignY: 'center', children: pressesOf(ui, state, act) },
        ],
      },
    ],
  };
}
