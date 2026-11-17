import type { Vector } from './spray.ts';

/** Below half its health a body bleeds, every 2 to 5 seconds (DaggerBlood's cadence), up to six small drops at its
 *  feet within 0.35 m, sized as a chunk's splat is. */
export const BLEED_THRESHOLD = 0.5;
export const BLEED_WAIT = { min: 2, max: 5 } as const;
export const BLEED_DROPS_MAX = 6;
export const BLEED_RADIUS = 0.35;
/** A corpse's pool spreads from a body's width to a metre and a half over twelve seconds, in eight steps. */
export const POOL_SIZE = { start: 0.45, end: 1.5 } as const;
export const POOL_SPREAD = 12;
export const POOL_STEPS = 8;
/** A body's steps are counted off the ground it covers, one a stride; faster than 40 m/s is a teleport, not a walk. */
export const STRIDE = 0.7;
export const TELEPORT_SPEED = 40;

/** DaggerBlood's ramp: nothing at the threshold, everything at one percent of health. */
export function bleedShare(health: number, healthMax: number, threshold = BLEED_THRESHOLD): number {
  if (!(healthMax > 0) || !(health > 0)) return 0;
  const share = health / healthMax;
  if (share >= threshold) return 0;
  return Math.max(0, Math.min(1, 1 - (share - 0.01) / (threshold - 0.01)));
}

/** A drip's drops for a share: at least one once bleeding. */
export function bleedDrops(share: number): number {
  if (!(share > 0)) return 0;
  return Math.max(1, Math.round(share * BLEED_DROPS_MAX));
}

export function poolSizeAt(seconds: number): number {
  const along = Math.max(0, Math.min(1, seconds / POOL_SPREAD));
  const step = Math.floor(along * POOL_STEPS) / POOL_STEPS;
  return POOL_SIZE.start + (POOL_SIZE.end - POOL_SIZE.start) * step;
}

/** A body as the ledger sees it each frame: who it is, its feet, its health, and whether it lies dead. */
export interface BodySeen {
  readonly key: string;
  readonly feet: Vector;
  readonly health: number;
  readonly healthMax: number;
  readonly dead: boolean;
}

/** What a frame's bodies are due: a drip of `count` drops, a step where a foot came down, or a corpse's pool. */
export type Bleed =
  | { readonly kind: 'drip'; readonly key: string; readonly at: Vector; readonly count: number }
  | { readonly kind: 'step'; readonly key: string; readonly at: Vector; readonly forward: Vector }
  | { readonly kind: 'pool'; readonly key: string; readonly at: Vector };

interface Kept {
  next: number;
  pooled: boolean;
  bleeding: boolean;
  last: Vector | null;
  walked: number;
}

/**
 * Wounded bodies drip a trail and the dead pool once. A body first seen dead has already bled out elsewhere and never
 * pools; one alive again is a new life that may pool again. A body that leaves the list is forgotten.
 */
export class Bleeding {
  private readonly random: () => number;
  private kept = new Map<string, Kept>();

  constructor(random: () => number) {
    this.random = random;
  }

  private wait(): number {
    return BLEED_WAIT.min + this.random() * (BLEED_WAIT.max - BLEED_WAIT.min);
  }

  tick(dt: number, bodies: readonly BodySeen[]): Bleed[] {
    const out: Bleed[] = [];
    if (!(dt > 0)) return out;
    const seen = new Map<string, Kept>();
    for (const body of bodies) {
      if (!body.feet.every(Number.isFinite)) continue;
      const kept = this.kept.get(body.key) ?? {
        next: this.wait(),
        pooled: body.dead,
        bleeding: false,
        last: null,
        walked: 0,
      };
      seen.set(body.key, kept);
      this.steps(dt, body, kept, out);
      if (body.dead) {
        if (!kept.pooled) {
          kept.pooled = true;
          out.push({ kind: 'pool', key: body.key, at: body.feet });
        }
        kept.bleeding = false;
        continue;
      }
      kept.pooled = false;
      const share = bleedShare(body.health, body.healthMax);
      if (!(share > 0)) {
        // Healed past the threshold: the next wound starts a fresh wait.
        if (kept.bleeding) {
          kept.bleeding = false;
          kept.next = this.wait();
        }
        continue;
      }
      kept.bleeding = true;
      kept.next -= dt;
      if (kept.next > 0) continue;
      kept.next = this.wait();
      out.push({ kind: 'drip', key: body.key, at: body.feet, count: bleedDrops(share) });
    }
    this.kept = seen;
    return out;
  }

  /** A step every stride along the run since last frame, facing the way it went; the remainder carries. */
  private steps(dt: number, body: BodySeen, kept: Kept, out: Bleed[]): void {
    const last = kept.last;
    kept.last = body.feet;
    if (!last) return;
    const moveX = body.feet[0] - last[0];
    const moveY = body.feet[1] - last[1];
    const moveZ = body.feet[2] - last[2];
    const run = Math.hypot(moveX, moveY);
    if (!(run > 0)) return;
    if (run > TELEPORT_SPEED * dt) {
      kept.walked = 0;
      return;
    }
    const forward: Vector = [moveX / run, moveY / run, 0];
    for (let along = STRIDE - kept.walked; along <= run; along += STRIDE) {
      const share = along / run;
      out.push({
        kind: 'step',
        key: body.key,
        at: [last[0] + moveX * share, last[1] + moveY * share, last[2] + moveZ * share],
        forward,
      });
    }
    kept.walked = (kept.walked + run) % STRIDE;
  }

  clear(): void {
    this.kept = new Map();
  }
}
