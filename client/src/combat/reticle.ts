// The crosshair, after Destiny's. A ranged weapon's own shape while it aims or is out in first person: a bow a
// chevron, a crossbow brackets, a pistolet a dot with four ticks, a thunderlock a circle. It turns red on a foe's
// body, is ringed in gold by a bow's draw and in white by a reload, and marked as a shot lands: white for a hit, gold
// for a crit, red for a kill. With a melee weapon drawn, a small dot closes into red brackets over a foe in reach.
// Drawn by the interface at the view's middle, each look one picture drawn in 2D.
import type { FightEvent } from '../network/messages.ts';
import { FIGHT_TICKS } from '../player/fightMoves.ts';
import { SHOOTERS } from '../player/walker.ts';
import type { FighterView } from '../rules/fighters.ts';
import { EVENT, HOW } from './cues.ts';
import type { Child } from '../ui/node.ts';

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
/** A double pistolet's wait between its barrels, in ticks (crates/combat/src/shots.rs BRACE_GAP): no reload. */
const BRACE_TICKS = 30;
/** How far above or below a foe may stand and still be struck, in metres (crates/combat/src/tuning.rs
 *  STRIKE_HEIGHT). */
const STRIKE_HEIGHT_M = 1.4;
/** The foe's colour on the display, as its alert and the arrows to it are drawn. */
const FOE_RED = '#ff5a4a';

/** The reticle of the weapon in the right hand, `right` as the outfit names it. */
export function reticleOf(right: string | null): Reticle {
  const kind = SHOOTERS.exec(right ?? '')?.[1];
  return kind === 'bow' || kind === 'crossbow' || kind === 'pistolet' || kind === 'thunderlock' ? kind : 'melee';
}

/** The crosshair a frame shows: a ranged one while `sights` (it aims, or is out in first person), a bow's draw ringing
 *  it, the pistolet's plain cross with no ranged weapon drawn (the Test Ground's held aiming view); else the melee one
 *  while a melee weapon is drawn (`reticle`) on a living fighter, judged against `reach`; else none. */
export function crosshairOf(
  reticle: Reticle | null,
  sights: boolean,
  own: FighterView | null,
  reach: number,
): CrosshairFrame | null {
  if (!sights) return reticle === 'melee' && own?.action.kind !== 'dead' ? { reticle, charge: null, reach } : null;
  const action = own?.action;
  const charge =
    reticle === 'bow' && action?.kind === 'draw' ? Math.min(1, action.elapsed / FIGHT_TICKS.drawFull) : null;
  return { reticle: reticle === null || reticle === 'melee' ? 'pistolet' : reticle, charge, reach: null };
}

/** How the player's shots landed among `events`, the strongest of them: a kill, then a crit, then a hit that harmed. */
export function landedBy(events: readonly FightEvent[], player: number): Landed | null {
  let landed: Landed | null = null;
  for (const event of events) {
    if (event.striker !== player || event.defender === player || event.how !== HOW.shot) continue;
    if (event.kind === EVENT.killed) return 'kill';
    const struck = event.kind === EVENT.hit || event.kind === EVENT.shielded || event.kind === EVENT.guardBroken;
    const harmed = event.amount > 0 && struck;
    if (harmed) landed = event.crit || landed === 'crit' ? 'crit' : 'hit';
  }
  return landed;
}

/** What the crosshair shows this frame: its reticle and ink, whether a melee one closes in reach, its ring's share and
 *  ink (a bow's draw or a reload; none without), whether a draw is full, and a shot's mark fading as it lands. */
export interface ReticleLook {
  readonly reticle: Reticle;
  readonly ink: 'plain' | 'foe' | 'reloading';
  readonly reach: boolean;
  readonly ring: { readonly fill: number; readonly ink: 'charge' | 'reload' } | null;
  readonly full: boolean;
  readonly mark: { readonly kind: Landed; readonly opacity: number } | null;
}

/** The inks: the plain one, a foe's red, the reload's half-faded white, the draw's gold and the ring's empty part. */
const INKS = { plain: '#f2f2f2', foe: FOE_RED, reloading: 'rgba(242,242,242,0.5)' } as const;
const GOLD = '#ffd95a';
const RING_EMPTY = 'rgba(255,255,255,0.22)';
const MARK_INKS: Readonly<Record<Landed, string>> = { hit: '#f2f2f2', crit: GOLD, kill: FOE_RED };
/** The picture's side, CSS pixels: the 22 px crosshair, its ring 5 px past it, and room for the draw's glow. */
const SIDE = 48;
/** A ring's share in whole steps of 2 degrees, so a draw or a reload makes no more than 181 pictures. */
const RING_STEPS = 180;

/** The crosshair in the display's middle. */
export class Crosshair {
  /** The reload's ticks left as first seen, which its ring fills against; 0 while none runs. */
  private reloadFrom = 0;
  /** The reload's ticks left last frame, by which a new one is told from the last going on. */
  private left = 0;
  /** The last shot's landing, and the seconds since. */
  private landed: { readonly kind: Landed; readonly since: number } | null = null;
  private shown: ReticleLook | null = null;

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
    this.reloadFrom = left > this.left ? left : left > 0 ? this.reloadFrom : 0;
    this.left = left;
    const kind = landedBy(events, player);
    this.landed = kind ? { kind, since: 0 } : this.landed && { ...this.landed, since: this.landed.since + seconds };
    // A shot that lands while no crosshair shows marks none later.
    if (!shown) this.landed = null;
    this.shown = shown && this.lookOf(shown, own, under, left);
  }

  /** What the crosshair shows, as the last frame left it; null while hidden. */
  get look(): ReticleLook | null {
    return this.shown;
  }

  private lookOf(shown: CrosshairFrame, own: FighterView | null, under: FighterView | null, left: number): ReticleLook {
    const melee = shown.reticle === 'melee';
    const braced = shown.reticle === 'pistolet' && this.reloadFrom <= BRACE_TICKS;
    const reload = !melee && !braced && this.reloadFrom > 0 ? 1 - left / this.reloadFrom : null;
    const level = own && under && Math.abs(under.z - own.z) <= STRIKE_HEIGHT_M;
    const apart = own && under && level ? Math.hypot(under.x - own.x, under.y - own.y) : Infinity;
    const landed = !melee && this.landed && this.landed.since < MARK_SECONDS ? this.landed : null;
    const charge = shown.charge;
    return {
      reticle: shown.reticle,
      ink: reload !== null ? 'reloading' : !melee && under ? 'foe' : 'plain',
      reach: melee && apart <= (shown.reach ?? -Infinity),
      ring:
        charge !== null
          ? { fill: Math.min(1, charge), ink: 'charge' }
          : reload !== null
            ? { fill: Math.min(1, reload), ink: 'reload' }
            : null,
      full: charge !== null && charge >= 1,
      mark: landed && { kind: landed.kind, opacity: 1 - landed.since / MARK_SECONDS },
    };
  }

  /** The crosshair centred on the view, as the last frame left it; none while hidden. */
  node(): Child {
    const look = this.shown;
    if (!look) return null;
    const steps = look.ring ? Math.round(Math.max(0, look.ring.fill) * RING_STEPS) : 0;
    const key = [
      'reticle',
      look.reticle,
      look.ink,
      look.reach ? 'reach' : '',
      look.ring ? `${look.ring.ink} ${steps}` : '',
      look.full ? 'full' : '',
    ].join(' ');
    const centred = { to: 'screen', at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 } as const;
    return {
      width: SIDE,
      height: SIDE,
      float: centred,
      picture: { key, source: { draw: (context, width) => drawReticle(context, width / SIDE, look, steps) } },
      children: [
        look.mark && {
          width: SIDE,
          height: SIDE,
          opacity: look.mark.opacity,
          float: centred,
          picture: {
            key: `reticle mark ${look.mark.kind}`,
            source: { draw: (context, width) => drawMark(context, width / SIDE, MARK_INKS[look.mark?.kind ?? 'hit']) },
          },
        },
      ],
    };
  }
}

/** Draws `paint` twice over: under a soft dark edge a pixel deep, so it reads on any ground, and, for a full draw, a
 *  gold glow 4 px deep first. */
function shaded(context: OffscreenCanvasRenderingContext2D, unit: number, glow: boolean, paint: () => void): void {
  const pass = (colour: string, blur: number) => {
    context.save();
    context.shadowColor = colour;
    context.shadowBlur = blur * unit;
    paint();
    context.restore();
  };
  if (glow) pass(GOLD, 8);
  pass('#000000', 1);
}

/** The reticle `look` shows, `unit` device pixels a CSS pixel, its ring filled `steps` of `RING_STEPS`. The 22 px
 *  crosshair stands in the picture's middle; every length is in CSS pixels. */
function drawReticle(context: OffscreenCanvasRenderingContext2D, unit: number, look: ReticleLook, steps: number): void {
  const middle = (SIDE / 2) * unit;
  const ink = look.reticle === 'melee' ? (look.reach ? FOE_RED : INKS.plain) : INKS[look.ink];
  // The crosshair's own box, 22 px square, its top left at (0, 0).
  const box = (x: number, y: number, width: number, height: number) =>
    context.fillRect(middle + (x - 11) * unit, middle + (y - 11) * unit, width * unit, height * unit);
  const bracket = (side: 'left' | 'right', inset: number) => {
    const [from, open] = side === 'left' ? [inset, inset + 2] : [22 - inset - 2, 22 - inset - 5];
    box(from, 5, 2, 12);
    box(Math.min(from, open), 5, 5, 2);
    box(Math.min(from, open), 15, 5, 2);
  };
  shaded(context, unit, look.full, () => {
    if (look.ring) {
      const top = -Math.PI / 2;
      const turned = top + (steps / RING_STEPS) * 2 * Math.PI;
      context.lineWidth = 3 * unit;
      const arc = (start: number, end: number, colour: string) => {
        if (end <= start) return;
        context.strokeStyle = colour;
        context.beginPath();
        context.arc(middle, middle, 14 * unit, start, end);
        context.stroke();
      };
      arc(top, turned, look.ring.ink === 'charge' ? GOLD : INKS.plain);
      arc(turned, top + 2 * Math.PI, RING_EMPTY);
    }
    context.fillStyle = ink;
    context.beginPath();
    context.arc(middle, middle, 1.5 * unit, 0, 2 * Math.PI);
    context.fill();
    if (look.reticle === 'pistolet') {
      box(10, 0, 2, 6);
      box(10, 16, 2, 6);
      box(0, 10, 6, 2);
      box(16, 10, 6, 2);
    } else if (look.reticle === 'crossbow' || (look.reticle === 'melee' && look.reach)) {
      const inset = look.reticle === 'crossbow' ? 2 : 4;
      bracket('left', inset);
      bracket('right', inset);
    } else if (look.reticle === 'thunderlock') {
      context.strokeStyle = ink;
      context.lineWidth = 2 * unit;
      context.beginPath();
      context.arc(middle, middle, 7 * unit, 0, 2 * Math.PI);
      context.stroke();
    } else if (look.reticle === 'bow') {
      // A 12 px box's left and top edges, 2 px each, turned a quarter of a right angle about its middle: a chevron.
      context.save();
      context.translate(middle, middle + unit);
      context.rotate(Math.PI / 4);
      context.fillRect(-6 * unit, -6 * unit, 2 * unit, 12 * unit);
      context.fillRect(-6 * unit, -6 * unit, 12 * unit, 2 * unit);
      context.restore();
    }
  });
}

/** A shot's mark in `colour`: a cross 24 px wide, its middle two fifths left out, so only its four ends show. */
function drawMark(context: OffscreenCanvasRenderingContext2D, unit: number, colour: string): void {
  const middle = (SIDE / 2) * unit;
  shaded(context, unit, false, () => {
    context.fillStyle = colour;
    for (const turn of [Math.PI / 4, -Math.PI / 4]) {
      context.save();
      context.translate(middle, middle);
      context.rotate(turn);
      context.fillRect(-12 * unit, -unit, 7.2 * unit, 2 * unit);
      context.fillRect(4.8 * unit, -unit, 7.2 * unit, 2 * unit);
      context.restore();
    }
  });
}
