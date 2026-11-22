// The sight while the guns are laid, DFO's, drawn by the interface: a crosshair at the view's middle,
// where the look lays, and under it the aim line: the side and its shot, the range the guns are laid to (and whether
// that is their longest), on target in red, or why the side will not fire yet, dimmed.
import type { FightLay, FightVessel, ShotName } from '../rules/fightRules.ts';
import { TONES } from '../plus/tones.ts';
import type { Node, Text } from '../ui/node.ts';

/** The aim line's parts: its words, the range, its tail, and whether it burns red or stands dim. */
export interface Sight {
  readonly words: string;
  readonly range: string;
  readonly tail: string;
  readonly hot: boolean;
  readonly dim: boolean;
}

const SHOT_LINE: Readonly<Record<ShotName, string>> = {
  round: 'round shot',
  grape: 'grapeshot',
  chain: 'chain shot',
  heated: 'heated shot',
};

/** The aim line of a lay from the player's Sloop; none while nothing is laid. */
export function aimLineOf(lay: FightLay | null, player: FightVessel): Sight | null {
  if (!lay) return null;
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  const [x, y, east, south] = [0, 1, 3, 4].map((field) => mean(lay.launches.map((launch) => launch[field] ?? 0)));
  const way = Math.hypot(east ?? 0, south ?? 0) || 1;
  const ends = lay.ends.filter((end) => end !== null);
  const out = ends.length
    ? mean(
        ends.map((end) => ((end.point[0] - (x ?? 0)) * (east ?? 0) + (end.point[1] - (y ?? 0)) * (south ?? 0)) / way),
      )
    : lay.reach;
  const [range, longest] = [Math.round(out), Math.round(lay.reach)];
  const left = player.guns.left[lay.side === 'port' ? 0 : 1] ?? 0;
  const state = player.state !== 'afloat' ? 'silent' : player.guns.braced ? 'braced' : left > 0 ? 'reloading' : 'ready';
  const tail = {
    silent: ' - guns silent',
    braced: ' - braced',
    reloading: ` - reloading ${left.toFixed(1)}\u00a0s`,
    ready: lay.on_target ? ' - on target' : '',
  }[state];
  const side = lay.side === 'port' ? 'Port' : 'Starboard';
  return {
    words: `${side} broadside, ${SHOT_LINE[player.guns.load]} - `,
    range: `${range} m${range >= longest - 1 ? ' (longest)' : ''}`,
    tail,
    hot: lay.on_target && state === 'ready',
    dim: state !== 'ready',
  };
}

/** How far under the view's middle the aim line stands, CSS pixels, as DFO's stands. */
const AIM_DOWN = 34;
/** The aim line's colours: its words and its range, plain, burning red or dimmed. */
const AIM_INKS = {
  plain: { words: '#efe8d6', range: TONES.brassHi },
  hot: { words: '#ffb4a6', range: '#ff8a76' },
  dim: { words: '#a39a86', range: '#8f8670' },
} as const;
/** The crosshair's side, CSS pixels, with room round it for its dark edge. */
const CROSS = 22;
const CROSS_ROOM = 26;

/** The sight's crosshair: a dot and two fine hairs 22 px long, under a soft dark edge a pixel deep. */
function drawCross(context: OffscreenCanvasRenderingContext2D, width: number): void {
  const unit = width / CROSS_ROOM;
  const middle = (CROSS_ROOM / 2) * unit;
  context.shadowColor = '#000000';
  context.shadowBlur = unit;
  context.fillStyle = 'rgba(242,242,242,0.75)';
  context.fillRect(middle - 0.5 * unit, middle - (CROSS / 2) * unit, unit, CROSS * unit);
  context.fillRect(middle - (CROSS / 2) * unit, middle - 0.5 * unit, CROSS * unit, unit);
  context.fillStyle = '#f2f2f2';
  context.fillRect(middle - unit, middle - unit, 2 * unit, 2 * unit);
}

/** The sight on the display, drawn by the interface: shown while aiming, its line while a lay is held. */
export class SeaSight {
  private aiming = false;
  private sight: Sight | null = null;

  /** Shows the crosshair while `aiming`, with `sight`'s line under it; hides both otherwise. */
  show(aiming: boolean, sight: Sight | null): void {
    [this.aiming, this.sight] = [aiming, sight];
  }

  /** The crosshair at the view's middle and the aim line under it, letting the pointer through; none while not
   *  aiming. */
  node(): Node | null {
    if (!this.aiming) return null;
    const sight = this.sight;
    const inks = sight?.hot ? AIM_INKS.hot : sight?.dim ? AIM_INKS.dim : AIM_INKS.plain;
    const line = (shade?: string): Text => ({
      words: sight
        ? [
            { words: sight.words.toUpperCase(), colour: shade ?? inks.words },
            { words: sight.range.toUpperCase(), colour: shade ?? inks.range },
            { words: sight.tail.toUpperCase(), colour: shade ?? inks.words },
          ]
        : '',
      tracking: 3,
      balance: true,
      align: 'center',
    });
    return {
      width: 'grow',
      height: 'grow',
      through: true,
      children: [
        {
          width: CROSS_ROOM,
          height: CROSS_ROOM,
          float: { to: 'screen', at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
          picture: { key: 'sea sight', source: { draw: drawCross } },
        },
        sight && {
          width: 'grow',
          alignX: 'center',
          float: { to: 'screen', at: [0, 0.5], y: AIM_DOWN, z: 1 },
          // No wider than four fifths of the view, its lines evened, so a long line never reaches its edges.
          children: [
            {
              width: '80%',
              alignX: 'center',
              children: [
                // Under its outline a hard shade 2 px down and right, so the words stand off the sea behind them.
                { text: line('rgba(0,0,0,0.7)'), offset: [2, 2] },
                { text: { ...line(), edge: 'halo' }, float: { anchor: [0.5, 0], at: [0.5, 0], z: 2 } },
              ],
            },
          ],
        },
      ],
    };
  }
}
