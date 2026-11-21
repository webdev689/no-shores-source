// The player's vitals at the top left, after a souls-like display: long thin bars with pointed ends in a fine frame,
// health over stamina over poise, each as long as what it holds. Their losses read as DFO's Enhanced HUD read them (a
// strip holds and drains, a bite breaks off and falls); health's frame flashes blood when it runs low and stamina's
// white when a swing or a dodge is asked of it with none; poise fills toward a break and says Iron, Staggered or Open
// beside it. The player's buffs stand in a row under them. Whole and untouched, with no buff and no foe on the target
// plate, the bars rest out of sight, and the first point lost or spent brings them back at once.
import { BAR_TONES, type BarTone, CORNER, VITAL_SIZES } from '../plus/barFrame.ts';
import { motionReduced } from '../plus/kit.ts';
import { FILLS, TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import type { FighterView } from '../rules/fighters.ts';
import { PIECE_LEAST } from '../plus/barLoss.ts';
import { poiseTrackOf, type PoiseState } from './foePlate.ts';
import { LOW_SHARE, lowShare, Meter } from '../plus/meter.ts';
import { drawMeter, hatch, paintBox, type Pen, ring, span, thinBarNode } from './barDraw.ts';
import { barLength } from './hudLayout.ts';
import { ownBuffs, StatusRow } from './statusIcons.ts';

/** Health at or under this share of the whole warns (the kit's low law, which a ship's hull keeps too). */
export const LOW_HEALTH = LOW_SHARE;

export type VitalName = 'health' | 'stamina' | 'poise';
const VITALS: readonly [VitalName, string][] = [
  ['health', 'Health'],
  ['stamina', 'Stamina'],
  ['poise', 'Poise'],
];
/** The stamina a fighter has in all (crates/combat/src/tuning.rs). */
const STAMINA_WHOLE = 100;

/** A vital as its bar shows it: its share of the whole, and what a screen reader says of it, rounded as a player
 *  reads it, never 0% while anything is left and never more than 100%. */
export function vitalOf(now: number, whole: number): { share: number; text: string } {
  const share = Math.max(0, Math.min(1, now / Math.max(1, whole)));
  const shown = now > 0 ? Math.max(1, Math.round(share * 100)) : 0;
  return { share, text: `${shown}%` };
}

/** The player's three vitals; with no fighter yet, full health and stamina and no poise taken. */
export function vitalsOf(own: FighterView | null): Record<VitalName, { share: number; text: string }> {
  return {
    health: own ? vitalOf(own.health, own.healthMax) : vitalOf(1, 1),
    stamina: own ? vitalOf(own.stamina, STAMINA_WHOLE) : vitalOf(1, 1),
    poise: own ? vitalOf(own.poise, own.poiseMax) : vitalOf(0, 1),
  };
}

/** Each vital's most: health's and poise's the fighter's own, stamina's the rules' whole. */
export function vitalMost(own: FighterView | null): Record<VitalName, number> {
  return { health: own?.healthMax ?? 100, stamina: STAMINA_WHOLE, poise: own?.poiseMax ?? 40 };
}

/** Whether the health warns: some left, but no more than `LOW_HEALTH` of it. */
export const healthLow = (own: FighterView | null): boolean =>
  !!own && lowShare(own.health / Math.max(1, own.healthMax));

/** How long the vitals stand full and untouched before they rest, in seconds. */
export const REST_SECONDS = 4;

/** Whether every vital is whole: health and stamina short of no whole point, and no whole point of poise taken. */
export const vitalsWhole = (own: FighterView | null): boolean =>
  !own || (own.health > own.healthMax - 1 && own.stamina > STAMINA_WHOLE - 1 && own.poise < 1);

/** How long the vitals have stood calm, `seconds` after `was`: whole, with no foe on the target plate. */
export const calmFor = (was: number, whole: boolean, targeted: boolean, seconds: number): number =>
  whole && !targeted ? was + Math.max(0, seconds) : 0;

/** One vital's bar: its meter, and how long its warning has stood (`warned`, Infinity while none). */
interface Bar {
  readonly meter: Meter;
  warned: number;
}

/** How each bar's frame flashes: health's blood when low, stamina's white for a press with none, poise's brass while
 *  open. */
const ALERTS: Record<VitalName, BarTone> = {
  health: BAR_TONES.blood,
  stamina: BAR_TONES.light,
  poise: BAR_TONES.brass,
};
/** The low health's blink (on for its first half), the empty stamina's (on and off each half), and the poise's flash
 *  as it breaks, in seconds. */
const LOW_BLINK = 0.9;
const FLASH_BLINK = 0.15;
const POISE_FLASH = 0.45;
/** How the vitals go to rest (in six steps over 1.2 s) and come back (in two over 0.12 s). */
const FADE = { out: { seconds: 1.2, steps: 6 }, back: { seconds: 0.12, steps: 2 } } as const;

/** The vitals at the top left. */
export class Vitals {
  private readonly bars: Record<VitalName, Bar>;
  private readonly buffs = new StatusRow('Your buffs');
  private calm = 0;
  private poise: PoiseState | null = null;
  private poiseWord = '';
  /** Seconds since poise broke into a stagger, Infinity before. */
  private broke = Infinity;
  private flashing = false;
  private low = false;
  private shown: Record<VitalName, { share: number; text: string }> = vitalsOf(null);
  private most: Record<VitalName, number> = vitalMost(null);
  /** How far the vitals show (1 whole, 0 at rest), where a fade began from and how long it has run. */
  private fade = { now: 1, from: 1, age: Infinity, resting: false };
  /** Health's length, as the layout last gave it, and whether the bars stand at the larger step. */
  private length = 0;
  private wide = false;

  constructor() {
    // Poise drains of itself, so it shows no lost strip and breaks off nothing.
    const bar = (name: VitalName): Bar => ({
      meter: new Meter({ lossShown: name !== 'poise', pieceLeast: name === 'poise' ? null : PIECE_LEAST.vital }),
      warned: Infinity,
    });
    this.bars = { health: bar('health'), stamina: bar('stamina'), poise: bar('poise') };
  }

  /** Lays the bars at health's `length` and the step the display stands at. */
  lay(length: number, wide: boolean): void {
    [this.length, this.wide] = [length, wide];
  }

  /** Shows `own`'s vitals `seconds` on; `flashing` while the stamina flashes for a press with none, and `targeted`
   *  while a foe stands on the target plate. */
  update(own: FighterView | null, seconds: number, flashing: boolean, targeted: boolean): void {
    this.shown = vitalsOf(own);
    this.most = vitalMost(own);
    const track = own ? poiseTrackOf(own) : { state: 'empty' as const, fill: 0, word: '' };
    for (const [name] of VITALS)
      this.bars[name].meter.set(name === 'poise' ? track.fill : this.shown[name].share, seconds);
    const low = healthLow(own);
    const warn = (bar: Bar, now: boolean, was: boolean) =>
      (bar.warned = now ? (was ? bar.warned + seconds : 0) : Infinity);
    warn(this.bars.health, low, this.low);
    warn(this.bars.stamina, flashing, this.flashing);
    [this.low, this.flashing] = [low, flashing];
    if (track.state !== this.poise) {
      this.broke = track.state === 'staggered' && this.poise !== null ? 0 : Infinity;
      this.poise = track.state;
    } else this.broke += seconds;
    this.poiseWord = track.word;
    const buffs = ownBuffs(own?.statuses);
    this.buffs.show(0, buffs);
    this.calm = calmFor(this.calm, vitalsWhole(own) && !flashing && buffs.length === 0, targeted, seconds);
    this.stepFade(this.calm >= REST_SECONDS, seconds);
  }

  /** What the bars warn of: health low (its frame flashing blood), stamina asked of with none (flashing white), and
   *  poise's state, its word, and whether it is flashing as it breaks. */
  get warnings(): { low: boolean; flashing: boolean; poise: PoiseState | null; word: string; breaking: boolean } {
    return {
      low: this.low,
      flashing: this.flashing,
      poise: this.poise,
      word: this.poiseWord,
      breaking: this.broke < POISE_FLASH,
    };
  }

  /** Whether the vitals stand at rest, out of sight. */
  get resting(): boolean {
    return this.fade.resting;
  }

  private stepFade(resting: boolean, seconds: number): void {
    const fade = this.fade;
    if (resting !== fade.resting) Object.assign(fade, { from: fade.now, age: 0, resting });
    else fade.age += seconds;
    const { seconds: long, steps } = resting ? FADE.out : FADE.back;
    const done = Math.min(1, Math.floor((fade.age / long) * steps + 1e-9) / steps);
    fade.now = fade.from + ((resting ? 0 : 1) - fade.from) * done;
  }

  /** The vitals at `zoom` times their size, standing at the view's top left. */
  node(zoom = 1): Node {
    const sizes = this.wide ? VITAL_SIZES.wide : VITAL_SIZES.base;
    const buffs = this.buffs.node((this.wide ? 36 : 24) * zoom, 6 * zoom, zoom);
    return {
      id: 'fight-vitals',
      label: 'Your vitals',
      direction: 'column',
      gap: sizes.gap * zoom,
      opacity: this.fade.now,
      float: { to: 'screen', x: CORNER.side * zoom, y: CORNER.top * zoom, z: 1 },
      children: [
        ...VITALS.map(([name, label]) => this.barNode(name, label, sizes[name], zoom)),
        buffs && { padding: [4 * zoom, 0, 0, 0], children: [buffs] },
      ],
    };
  }

  private barNode(name: VitalName, label: string, height: number, zoom: number): Node {
    const bar = this.bars[name];
    const length = this.length > 0 ? barLength(this.length, this.most[name], this.most.health, height) : 160;
    const still = motionReduced();
    const warned = bar.warned;
    const alert =
      name === 'health'
        ? warned < Infinity && (still || warned % LOW_BLINK < LOW_BLINK / 2)
        : name === 'stamina'
          ? warned < Infinity && (still || warned % FLASH_BLINK < FLASH_BLINK / 2)
          : this.poise === 'open';
    const blinkGround = name === 'stamina' && warned < Infinity && !still && warned % FLASH_BLINK >= FLASH_BLINK / 2;
    const poise = name === 'poise' ? this.poise : null;
    const word = name === 'poise' && this.poiseWord ? this.poiseNode(zoom) : null;
    const percent = this.shown[name].text;
    return thinBarNode({
      name,
      label: `${label}: ${name === 'poise' ? this.poiseWord || percent : percent}`,
      length,
      height,
      zoom,
      ground: blinkGround ? 'rgba(255,255,255,0.27)' : undefined,
      fill: (pen) => this.drawFill(pen, name, poise, still),
      alert: alert ? ALERTS[name] : null,
      children: word ? [word] : [],
    });
  }

  /** A bar's lost strip and fill: poise in brass toward a break, an iron blow hatched in red, a stagger white, glowing
   *  white for a moment as it breaks. */
  private drawFill(pen: Pen, name: VitalName, poise: PoiseState | null, still: boolean): void {
    const meter = this.bars[name].meter;
    if (poise === 'iron') {
      const fill = span(pen, 0, meter.shown.share);
      hatch(pen, fill);
      paintBox(
        pen,
        { ...fill, x: fill.x + fill.width - 2 * pen.scale, width: Math.min(fill.width, 2 * pen.scale) },
        'rgba(255,255,255,0.42)',
      );
    } else drawMeter(pen, meter, poise === 'staggered' ? '#ffffff' : FILLS[name], 'faint');
    if (poise === 'staggered' && !still && this.broke < POISE_FLASH) {
      const left = 1 - this.broke / POISE_FLASH;
      const glow = span(pen, 0, meter.shown.share);
      for (let step = 1; step <= 3; step++)
        ring(
          pen,
          {
            ...glow,
            x: glow.x - (step - 1) * pen.scale,
            y: glow.y - (step - 1) * pen.scale,
            width: glow.width + 2 * (step - 1) * pen.scale,
            height: glow.height + 2 * (step - 1) * pen.scale,
          },
          `rgba(255,255,255,${(0.9 * left * left * (4 - step)) / 3})`,
        );
    }
  }

  /** Poise's word beside its bar: Iron in red, Open in brass, the rest in the words' own colour. */
  private poiseNode(zoom: number): Node {
    const colour = this.poise === 'iron' ? '#ff6a5a' : this.poise === 'open' ? '#f1c04f' : TONES.word;
    const text: Node['text'] = {
      words: this.poiseWord.toUpperCase(),
      size: (this.wide ? 2 : 1) * zoom,
      colour,
      edge: 'halo',
      wrap: false,
    };
    // Its left edge stands past the bar's point; at the larger step its top meets the bar's.
    return this.wide
      ? { text, float: { at: [1, 0], x: 10 * zoom, z: 1 } }
      : { text, float: { at: [1, 0.5], anchor: [0, 0.5], x: 6 * zoom, z: 1 } };
  }
}
