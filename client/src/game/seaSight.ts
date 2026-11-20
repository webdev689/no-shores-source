// The sight while the guns are laid, DFO's: a crosshair at the view's middle,
// where the look lays, and under it the aim line: the side and its shot, the range the guns are laid to (and whether
// that is their longest), on target in red, or why the side will not fire yet, dimmed.
import type { FightLay, FightVessel, ShotName } from '../rules/fightRules.ts';
import { TONES } from '../plus/tones.ts';

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
  const [x, y, east, south] = [0, 1, 3, 4].map((at) => mean(lay.launches.map((launch) => launch[at] ?? 0)));
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
const OUTLINED = `-1px 0 0 ${TONES.outline}, 1px 0 0 ${TONES.outline}, 0 -1px 0 ${TONES.outline}, 0 1px 0 ${TONES.outline}, 2px 2px 0 rgba(0,0,0,0.7)`;
const SIGHT_CSS = `
.sea-sight { position: absolute; inset: 0; pointer-events: none; }
.sea-sight[hidden], .sea-sight [hidden] { display: none !important; }
.sea-sight .crosshair { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; translate: -50% -50%;
  border-radius: 50%; filter: drop-shadow(0 0 1px #000);
  background: linear-gradient(#f2f2f2, #f2f2f2) center / 2px 2px no-repeat,
    linear-gradient(#f2f2f2c0, #f2f2f2c0) center / 1px 22px no-repeat,
    linear-gradient(#f2f2f2c0, #f2f2f2c0) center / 22px 1px no-repeat; }
.sea-sight .aim { position: absolute; left: 50%; top: calc(50% + ${AIM_DOWN}px); translate: -50% 0; width: max-content;
  max-width: 80vw; text-align: center; font-size: 13px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: #efe8d6; text-shadow: ${OUTLINED}; text-wrap: balance; }
.sea-sight .aim .range { white-space: nowrap; color: ${TONES.brassHi}; }
.sea-sight .aim.hot { color: #ffb4a6; }
.sea-sight .aim.hot .range { color: #ff8a76; }
.sea-sight .aim.dim { color: #a39a86; }
.sea-sight .aim.dim .range { color: #8f8670; }
`;

/** The sight on the display: shown while aiming, its line while a lay is held. */
export class SeaSight {
  private readonly root: HTMLElement;
  private readonly line: HTMLElement;
  private readonly words: HTMLElement;
  private readonly range: HTMLElement;
  private readonly tail: HTMLElement;
  private shownAs = '';

  constructor(parent: HTMLElement) {
    const document = parent.ownerDocument;
    const make = (className: string, tag = 'div') => {
      const node = document.createElement(tag);
      node.className = className;
      return node;
    };
    if (!document.getElementById('sea-sight-css')) {
      const style = make('', 'style');
      style.id = 'sea-sight-css';
      style.textContent = SIGHT_CSS;
      document.head.append(style);
    }
    this.root = make('sea-sight');
    this.line = make('aim');
    [this.words, this.range, this.tail] = [make('words', 'span'), make('range', 'span'), make('tail', 'span')];
    this.line.append(this.words, this.range, this.tail);
    this.root.append(make('crosshair'), this.line);
    this.root.hidden = true;
    parent.append(this.root);
  }

  /** Shows the crosshair while `aiming`, with `sight`'s line under it; hides both otherwise. */
  show(aiming: boolean, sight: Sight | null): void {
    const key = aiming ? JSON.stringify(sight) : '';
    if (key === this.shownAs) return;
    this.shownAs = key;
    this.root.hidden = !aiming;
    this.line.hidden = sight === null;
    if (!sight) return;
    this.line.className = `aim${sight.hot ? ' hot' : ''}${sight.dim ? ' dim' : ''}`;
    this.words.textContent = sight.words;
    this.range.textContent = sight.range;
    this.tail.textContent = sight.tail;
  }
}
