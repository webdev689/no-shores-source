// How a struck figure shows the blow, drawn only (never the rules' body): a flash in held steps, a slide along the
// blow that settles back where the room has the figure, a shake as a stagger begins, and the player's own weapon's
// glow surging and their first person's contact as their blows land.
import { GLOW_RAMPS, type GlowLook, glowSurge } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import { FLASH } from '../player/cardLooks.ts';
import { PX_PER_M } from '../player/figures.ts';
import type { FighterView } from '../rules/fighters.ts';
import { EVENT, HOW } from './cues.ts';

type Point = readonly [number, number, number];
type Rgb = readonly [number, number, number];

/** A frame of the drawing, seconds: every timing here is held in whole frames. */
const FRAME_S = 1 / 60;
/** A struck foe's flash, in frames: its whole figure white, then its outline white (gold, and longer, for a crit),
 *  then its outline in the blow's element (steel for a plain one). The player's own: their outline red, after their
 *  whole figure only for a blow of more than a quarter of their health. */
export const FLASH_FRAMES = {
  whole: 2,
  outline: 2,
  critOutline: 4,
  coloured: 1,
  ownWhole: 2,
  ownOutline: 4,
  heavy: 0.25,
} as const;
const WHITE: Rgb = [1, 1, 1];
/** A crit's gold, the HUD's #ffd95a. */
const GOLD: Rgb = [1, 0.85, 0.35];
const RED: Rgb = [1, 0.16, 0.1];
const STEEL: Rgb = [0.81, 0.88, 1];
/** How far a struck figure slides along the blow (metres): a hit, a stagger, a kill; out over this many frames, back
 *  over this many (a kill stays out). */
export const KNOCK = { hit: 0.12, staggered: 0.35, killed: 0.6, out: 6, back: 10 } as const;
export type KnockKind = 'hit' | 'staggered' | 'killed';
const KNOCK_RANK: Readonly<Record<KnockKind, number>> = { hit: 0, staggered: 1, killed: 2 };
/** A stagger shakes its figure a pixel either way for this many frames as it begins. */
const SHAKE_FRAMES = 6;
/** A death's dissolve, in frames for each element (plain, Blaze, Volt, Cosmic), held in steps of this many frames. */
export const DISSOLVE_FRAMES: Readonly<Record<GlowLook, number>> = { 0: 36, 1: 44, 2: 18, 3: 10 };
const DISSOLVE_STEP = 2;

/** A flash `since` seconds after the blow (null once it is over): the player's `own`, `whole` for one heavy enough to
 *  fill them, else a foe's in the blow's element `look`, its outline gold for a `crit`. */
export function flashAt(
  since: number,
  {
    own,
    whole,
    look,
    crit = false,
  }: { readonly own: boolean; readonly whole: boolean; readonly look: GlowLook; readonly crit?: boolean },
): { readonly stage: number; readonly colour: Rgb } | null {
  const frame = Math.floor(since / FRAME_S + 1e-6);
  if (frame < 0) return null;
  if (own) {
    const filled = whole ? FLASH_FRAMES.ownWhole : 0;
    if (frame < filled) return { stage: FLASH.whole, colour: RED };
    return frame < filled + FLASH_FRAMES.ownOutline ? { stage: FLASH.outline, colour: RED } : null;
  }
  const { whole: full, coloured } = FLASH_FRAMES;
  const outline = crit ? FLASH_FRAMES.critOutline : FLASH_FRAMES.outline;
  if (frame < full) return { stage: FLASH.whole, colour: WHITE };
  if (frame < full + outline) return { stage: FLASH.outline, colour: crit ? GOLD : WHITE };
  if (frame < full + outline + coloured) return { stage: FLASH.outline, colour: look ? GLOW_RAMPS[look][2] : STEEL };
  return null;
}

/** How far a figure has slid along a blow of `kind` `since` seconds after it (metres, in whole figure pixels): out
 *  easing over its first frames, then back to none, a kill's held out. */
export function knockAt(kind: KnockKind, since: number): number {
  const frame = since / FRAME_S;
  if (frame <= 0) return 0;
  const most = KNOCK[kind];
  const out = frame < KNOCK.out ? 1 - (1 - frame / KNOCK.out) ** 2 : 1;
  const back = kind === 'killed' || frame < KNOCK.out ? 1 : Math.max(0, 1 - (frame - KNOCK.out) / KNOCK.back);
  return Math.round(most * out * back * PX_PER_M) / PX_PER_M;
}

/** How far a death in `look` has dissolved its figure `seconds` after it began, 0 whole to 1 gone, in held steps. */
export function dissolveShare(look: GlowLook, seconds: number): number {
  const frames = DISSOLVE_FRAMES[look];
  const held = Math.floor(Math.max(0, seconds) / FRAME_S / DISSOLVE_STEP + 1e-6) * DISSOLVE_STEP;
  return Math.min(1, held / frames);
}

/** What a blow of the player's own met this frame, for their first person: landed, or blocked (theirs, or one they
 *  blocked); null for none. */
export type OwnContact = 'landed' | 'blocked' | null;

/** Who the events are told for, and how: the player, their weapon's element, a caster's Art's element, their health
 *  at most, and where each fighter stands (for the way a blow pushes). */
export interface StruckBy {
  readonly player: number;
  readonly look: GlowLook;
  readonly spellLook?: (caster: number) => GlowLook;
  readonly healthMax?: number;
  readonly where?: (id: number) => Point | null;
}

interface Flash {
  since: number;
  readonly own: boolean;
  readonly whole: boolean;
  readonly look: GlowLook;
  readonly crit: boolean;
}
interface Knock {
  since: number;
  kind: KnockKind;
  way: readonly [number, number];
}

/** Which fighters flash, slide and shake, struck, and how the player's own blows land. */
export class Flashes {
  private readonly flashes = new Map<number, Flash>();
  private readonly knocks = new Map<number, Knock>();
  private readonly shakes = new Map<number, number>();
  private sinceHit: number | null = null;
  private sinceKill: number | null = null;
  private contact: OwnContact = null;

  /** Runs each flash, slide and shake on by `seconds`, then starts them on every fighter the events struck, as
   *  `told` tells them. */
  update(events: readonly FightEvent[], seconds: number, told: StruckBy | null = null): void {
    for (const [id, flash] of this.flashes) {
      flash.since += seconds;
      if (!flashAt(flash.since, flash)) this.flashes.delete(id);
    }
    for (const [id, knock] of this.knocks) {
      knock.since += seconds;
      if (knock.kind !== 'killed' && knock.since / FRAME_S > KNOCK.out + KNOCK.back) this.knocks.delete(id);
    }
    for (const [id, since] of this.shakes) {
      if (since + seconds >= SHAKE_FRAMES * FRAME_S - 1e-9) this.shakes.delete(id);
      else this.shakes.set(id, since + seconds);
    }
    if (this.sinceHit !== null) this.sinceHit += seconds;
    if (this.sinceKill !== null) this.sinceKill += seconds;
    this.contact = null;
    for (const event of events) this.take(event, told);
  }

  private take(event: FightEvent, told: StruckBy | null): void {
    const player = told?.player ?? null;
    const harms = event.amount > 0;
    const melee = event.how !== HOW.shot && event.how !== HOW.spell;
    if (harms) {
      const own = event.defender === player;
      const spell = event.how === HOW.spell;
      const look = spell ? (told?.spellLook?.(event.striker) ?? 0) : event.striker === player ? (told?.look ?? 0) : 0;
      const whole = own && event.amount > (told?.healthMax ?? Infinity) * FLASH_FRAMES.heavy;
      this.flashes.set(event.defender, { since: 0, own, whole, look, crit: !!event.crit });
    }
    const kind: KnockKind | null =
      event.kind === EVENT.killed
        ? 'killed'
        : event.kind === EVENT.staggered
          ? 'staggered'
          : (event.kind === EVENT.hit || event.kind === EVENT.guardBroken) && harms
            ? 'hit'
            : null;
    if (kind === 'staggered') this.shakes.set(event.defender, 0);
    if (kind) this.knock(event, kind, told?.where);
    if (event.striker === player) {
      if (event.kind === EVENT.killed) this.sinceKill = 0;
      if (melee && harms && event.kind !== EVENT.blocked) [this.sinceHit, this.contact] = [0, 'landed'];
      if (melee && (event.kind === EVENT.blocked || event.kind === EVENT.parried)) this.contact ??= 'blocked';
    } else if (event.defender === player && event.kind === EVENT.blocked) this.contact ??= 'blocked';
  }

  /** Starts or strengthens `event`'s defender's slide, away from its striker. */
  private knock(event: FightEvent, kind: KnockKind, where?: (id: number) => Point | null): void {
    const [from, to] = [where?.(event.striker), where?.(event.defender)];
    if (!from || !to) return;
    const apart = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (apart < 1e-6) return;
    const kept = this.knocks.get(event.defender);
    if (kept && kept.since === 0 && KNOCK_RANK[kept.kind] >= KNOCK_RANK[kind]) return;
    const way = [(to[0] - from[0]) / apart, (to[1] - from[1]) / apart] as const;
    this.knocks.set(event.defender, { since: 0, kind, way: kept?.since === 0 ? kept.way : way });
  }

  /** A fighter's flash now: its stage and colour, or none. */
  flashOf(id: number): { readonly stage: number; readonly colour: Rgb } | undefined {
    const flash = this.flashes.get(id);
    return (flash && flashAt(flash.since, flash)) ?? undefined;
  }

  /** How far a fighter's figure is slid off where it stands (east, south, metres), for one that is `alive` (a kill's
   *  slide is let go once its fighter stands again). */
  knockOf(id: number, alive: boolean): readonly [number, number] {
    const knock = this.knocks.get(id);
    if (!knock) return [0, 0];
    if (alive && knock.kind === 'killed') {
      this.knocks.delete(id);
      return [0, 0];
    }
    const along = knockAt(knock.kind, knock.since);
    return [knock.way[0] * along, knock.way[1] * along];
  }

  /** How many figure pixels a fighter's figure is shaken across: a pixel either way each frame as a stagger begins. */
  shakeOf(id: number): number {
    const since = this.shakes.get(id);
    return since === undefined ? 0 : Math.floor(since / FRAME_S + 1e-6) % 2 === 0 ? 1 : -1;
  }

  /** How the player's own weapon shows their fight now, its fighter `own`: how hard its glow surges (through a swing's
   *  fast part, after a blow it lands and longer after a kill), and what their blow met this frame. */
  ownOf(own: FighterView | null): { readonly surge: number; readonly contact: OwnContact } {
    const action = own?.action;
    const fast =
      action?.kind === 'attack' &&
      action.elapsed >= action.strike * 0.55 &&
      action.elapsed <= action.strike + (action.end - action.strike) * 0.4;
    return { surge: glowSurge(this.sinceHit, this.sinceKill, fast), contact: this.contact };
  }
}
