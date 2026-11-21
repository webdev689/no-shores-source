// The crosshair, after Destiny's. A ranged weapon's own shape while it aims or is out in first person: a bow a
// chevron, a crossbow brackets, a pistolet a dot with four ticks, a thunderlock a circle. It turns red on a foe's
// body, is ringed in gold by a bow's draw and in white by a reload, and marked as a shot lands: white for a hit, gold
// for a crit, red for a kill. With a melee weapon drawn, a small dot closes into red brackets over a foe in reach.
import type { FightEvent } from '../network/messages.ts';
import { FIGHT_TICKS } from '../player/fightMoves.ts';
import { SHOOTERS } from '../player/walker.ts';
import type { FighterView } from '../rules/fighters.ts';
import { EVENT, HOW } from './cues.ts';
import { element, setStyle, showNode } from './meter.ts';

/** Which crosshair a weapon drawn shows: a ranged weapon's by its kind, any other's (bare fists too) the melee one. */
export type Reticle = 'bow' | 'crossbow' | 'pistolet' | 'thunderlock' | 'melee';
/** How a shot of the player's landed, as its mark shows it. */
export type Landed = 'hit' | 'crit' | 'kill';

/** The crosshair a frame shows: its reticle, a bow's draw (0 to 1) while it aims, and for the melee one how far apart,
 *  centre to centre, a foe may stand for the longest stroke to reach it. */
export interface CrosshairFrame {
  readonly reticle: Reticle;
  readonly charge: number | null;
  readonly reach: number | null;
}

/** How long a shot's mark shows as it lands, fading, in seconds. */
export const MARK_SECONDS = 0.25;
/** The foe's colour on the display, as its alert and the arrows to it are drawn. */
const FOE_RED = '#ff5a4a';

/** The reticle of the weapon in the right hand, `right` as the outfit names it. */
export function reticleOf(right: string | null): Reticle {
  const kind = SHOOTERS.exec(right ?? '')?.[1];
  return kind === 'bow' || kind === 'crossbow' || kind === 'pistolet' || kind === 'thunderlock' ? kind : 'melee';
}

/** The crosshair a frame shows: a ranged one while `sights` (it aims, or is out in first person), a bow's draw ringing
 *  it; else the melee one while a melee weapon is drawn (`reticle`), judged against `reach`; else none. */
export function crosshairOf(
  reticle: Reticle | null,
  sights: boolean,
  own: FighterView | null,
  reach: number,
): CrosshairFrame | null {
  if (reticle === 'melee') return { reticle, charge: null, reach };
  if (!sights || reticle === null) return null;
  const action = own?.action;
  const charge =
    reticle === 'bow' && action?.kind === 'draw' ? Math.min(1, action.elapsed / FIGHT_TICKS.drawFull) : null;
  return { reticle, charge, reach: null };
}

/** How the player's shots landed among `events`, the strongest of them: a kill, then a crit, then a hit that harmed. */
export function landedBy(events: readonly FightEvent[], player: number): Landed | null {
  let landed: Landed | null = null;
  for (const event of events) {
    if (event.striker !== player || event.defender === player || event.how !== HOW.shot) continue;
    if (event.kind === EVENT.killed) return 'kill';
    const harmed = event.amount > 0 && (event.kind === EVENT.hit || event.kind === EVENT.shielded);
    if (harmed) landed = event.crit || landed === 'crit' ? 'crit' : 'hit';
  }
  return landed;
}

/** The crosshair in the display's middle. */
export class Crosshair {
  private readonly node: HTMLElement;
  private readonly mark: HTMLElement;
  /** The reload's ticks left as first seen, which its ring fills against; 0 while none runs. */
  private reloadFrom = 0;
  /** The last shot's landing, and the seconds since. */
  private landed: { readonly kind: Landed; readonly since: number } | null = null;

  constructor(root: HTMLElement) {
    this.node = element('div', 'crosshair', root);
    this.node.hidden = true;
    element('div', 'ring', this.node);
    this.mark = element('div', 'landed', this.node);
  }

  /** Shows `shown` (none hides it) for the player's fighter `own`, red or bracketed over `under`, the foe whose body
   *  it rests on, and marked by the player's shots landing among `events`. */
  update(
    shown: CrosshairFrame | null,
    own: FighterView | null,
    under: FighterView | null,
    events: readonly FightEvent[],
    player: number,
    seconds: number,
  ): void {
    const left = own?.action.kind === 'reload' ? own.action.left : 0;
    // shortcut: the reload's length is read from its first tick seen, so its ring may start a frame late; take the
    // rules' own length once the page holds the weapon's trim.
    this.reloadFrom = left > 0 ? Math.max(this.reloadFrom, left) : 0;
    const kind = landedBy(events, player);
    this.landed = kind ? { kind, since: 0 } : this.landed && { ...this.landed, since: this.landed.since + seconds };
    showNode(this.node, !!shown);
    if (!shown) return;
    const melee = shown.reticle === 'melee';
    const reload = !melee && this.reloadFrom > 0 ? 1 - left / this.reloadFrom : null;
    const apart = own && under ? Math.hypot(under.x - own.x, under.y - own.y) : Infinity;
    if (this.node.dataset['reticle'] !== shown.reticle) this.node.dataset['reticle'] = shown.reticle;
    this.node.classList.toggle('foe', !melee && !!under);
    this.node.classList.toggle('reach', melee && apart <= (shown.reach ?? -Infinity));
    this.node.classList.toggle('charging', shown.charge !== null);
    this.node.classList.toggle('full', shown.charge !== null && shown.charge >= 1);
    this.node.classList.toggle('reloading', reload !== null);
    setStyle(this.node, '--fill', `${Math.round(Math.min(1, shown.charge ?? reload ?? 0) * 360)}deg`);
    const mark = !melee && this.landed && this.landed.since < MARK_SECONDS ? this.landed : null;
    showNode(this.mark, !!mark);
    if (!mark) return;
    if (this.mark.dataset['landed'] !== mark.kind) this.mark.dataset['landed'] = mark.kind;
    setStyle(this.mark, 'opacity', (1 - mark.since / MARK_SECONDS).toFixed(2));
  }
}

/** A bar of the reticle's ink, `width` by `height` pixels, at `place` in its box. */
const bar = (place: string, width: number, height: number) =>
  `linear-gradient(var(--ink), var(--ink)) ${place} / ${width}px ${height}px no-repeat`;
/** The dot in the reticle's middle, `radius` pixels round. */
const dot = (radius: number) => `radial-gradient(circle, var(--ink) ${radius}px, transparent ${radius + 0.5}px)`;
/** A bracket on one side of the box, `inset` pixels in from it. */
const bracket = (side: 'left' | 'right', inset: number) => {
  const open = side === 'left' ? 'right' : 'left';
  return `${side}: ${inset}px; top: 5px; width: 5px; height: 12px; border: 2px solid var(--ink); border-${open}: none;`;
};

/** The crosshair's sheet, laid in the display's own. */
export function reticleCss(): string {
  return `
.fight-hud .crosshair { --ink: #f2f2f2; position: absolute; left: 50%; top: 50%; width: 22px; height: 22px;
  translate: -50% -50%; filter: drop-shadow(0 0 1px #000); background: ${dot(1.5)}; }
.fight-hud .crosshair.foe { --ink: ${FOE_RED}; }
.fight-hud .crosshair.reloading { --ink: #f2f2f280; }
.fight-hud .crosshair::before, .fight-hud .crosshair::after { content: ''; position: absolute; box-sizing: border-box; }
.fight-hud .crosshair[data-reticle='pistolet'] { background: ${dot(1.5)}, ${bar('50% 0', 2, 6)}, ${bar('50% 100%', 2, 6)},
  ${bar('0 50%', 6, 2)}, ${bar('100% 50%', 6, 2)}; }
.fight-hud .crosshair[data-reticle='bow']::before { left: 5px; top: 6px; width: 12px; height: 12px;
  border-left: 2px solid var(--ink); border-top: 2px solid var(--ink); rotate: 45deg; }
.fight-hud .crosshair[data-reticle='crossbow']::before { ${bracket('left', 2)} }
.fight-hud .crosshair[data-reticle='crossbow']::after { ${bracket('right', 2)} }
.fight-hud .crosshair[data-reticle='thunderlock']::before { inset: 3px; border: 2px solid var(--ink); border-radius: 50%; }
.fight-hud .crosshair[data-reticle='melee'] { background: ${dot(1.5)}; }
.fight-hud .crosshair[data-reticle='melee'].reach { --ink: ${FOE_RED}; }
.fight-hud .crosshair[data-reticle='melee'].reach::before { ${bracket('left', 4)} }
.fight-hud .crosshair[data-reticle='melee'].reach::after { ${bracket('right', 4)} }
.fight-hud .crosshair .ring { position: absolute; inset: -5px; border-radius: 50%; display: none;
  mask: radial-gradient(circle, transparent 12px, #000 13px, #000 15px, transparent 16px); }
.fight-hud .crosshair.charging .ring, .fight-hud .crosshair.reloading .ring { display: block;
  background: conic-gradient(var(--fill-ink) var(--fill), #ffffff38 var(--fill)); }
.fight-hud .crosshair.charging { --fill-ink: #ffd95a; }
.fight-hud .crosshair.reloading { --fill-ink: #f2f2f2; }
.fight-hud .crosshair.full { filter: drop-shadow(0 0 4px #ffd95a); }
.fight-hud .crosshair .landed { position: absolute; inset: -4px; color: #f2f2f2; }
.fight-hud .crosshair .landed[data-landed='crit'] { color: #ffd95a; }
.fight-hud .crosshair .landed[data-landed='kill'] { color: ${FOE_RED}; }
.fight-hud .crosshair .landed::before, .fight-hud .crosshair .landed::after { content: ''; position: absolute; left: 50%;
  top: 50%; width: 24px; height: 2px; translate: -50% -50%; background: currentColor;
  mask: linear-gradient(90deg, #000 30%, transparent 30% 70%, #000 70%); }
.fight-hud .crosshair .landed::before { rotate: 45deg; }
.fight-hud .crosshair .landed::after { rotate: -45deg; }
`;
}
