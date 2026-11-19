// The camera's kick: a punch as the player's blow lands, a jolt as one lands on them, a lean into their own swing. A
// spring carries each push, overshooting a little and settling, and a struck player's view also shakes, as hard as
// the blow, dying away. Only the view moves: where the player looks and aims is their own.
import type { Orbit } from '../editor/orbit.ts';
import type { FightEvent } from '../network/messages.ts';
import { type StrokeDirection, directionOf } from '../rules/fighters.ts';
import { EVENT, HOW } from './cues.ts';

/** A push on the view: turned right (`yaw`) and down (`pitch`), radians; moved ahead, to the right and up, metres. */
export interface Push {
  readonly yaw?: number;
  readonly pitch?: number;
  readonly ahead?: number;
  readonly aside?: number;
  readonly up?: number;
}
const CHANNELS = ['yaw', 'pitch', 'ahead', 'aside', 'up'] as const;

const DEGREE = Math.PI / 180;
/** The spring: how fast it swings back (radians a second) and how much it is damped; a push's peak is this share of the
 *  speed it is given over the spring's rate, so a push is given the speed that peaks at its own size. */
const SPRING = { rate: 2 * Math.PI * 4.5, damping: 0.42, peak: 0.59 } as const;
/** The shake: as much as this either way at full trauma (radians, metres), its trauma dying this much a second, and its
 *  two wobbles' rates (radians a second). */
const SHAKE = { yaw: 1.6 * DEGREE, pitch: 1.2 * DEGREE, move: 0.025, dies: 1.6, rates: [37, 59] } as const;
/** The longest step the spring is run in, seconds. */
const STEP_S = 1 / 240;

/** Which way a stroke's blade travels across the view, -1 to the left to 1 to the right. */
const SIDE: Readonly<Record<StrokeDirection, number>> = {
  left: -1,
  right: 1,
  downLeft: -0.6,
  downRight: 0.6,
  down: 0,
  up: 0,
};
/** How hard each way a blow lands punches the striker's view: a kill hardest, a guard broken or a stagger next. */
const LANDED: Readonly<Record<number, number | undefined>> = {
  [EVENT.killed]: 1.6,
  [EVENT.guardBroken]: 1.3,
  [EVENT.staggered]: 1.3,
};

/** The pushes and the shake the fight's events give player `player`'s view: their blow landing punches it down and
 *  along the stroke, harder for a kill or a guard broken; their blow stopped by a guard knocks it back; a blow landing
 *  on them jolts it up and back and shakes it, as hard as the harm. A blow's events (a hit and the kill it made) push
 *  once, as hard as the hardest, and so does the player's one stroke however many it strikes; a shot or a spell
 *  pushes nothing: the feel is the blows'. */
export function kicksOf(events: readonly FightEvent[], player: number): { pushes: Push[]; trauma: number } {
  const blows = new Map<string, FightEvent[]>();
  for (const event of events) {
    const notABlow = event.how === HOW.shot || event.how === HOW.spell;
    if (notABlow || (event.striker !== player && event.defender !== player)) continue;
    const struck = event.striker === player ? 'all' : event.defender;
    const key = `${event.tick}:${event.striker}:${struck}`;
    blows.set(key, [...(blows.get(key) ?? []), event]);
  }
  const pushes: Push[] = [];
  let trauma = 0;
  for (const blow of blows.values()) {
    const side = SIDE[directionOf(Math.max(...blow.map((event) => event.stroke)))];
    const stopped = blow.some((event) => event.kind === EVENT.blocked || event.kind === EVENT.parried);
    const harm = Math.max(0, ...blow.map((event) => event.amount));
    if (blow[0]?.striker === player) {
      const landed = Math.max(
        harm > 0 && blow.some((event) => event.kind === EVENT.hit) ? 1 : 0,
        ...blow.map((event) => LANDED[event.kind] ?? 0),
      );
      if (landed > 0) {
        pushes.push({ pitch: 0.9 * DEGREE * landed, yaw: 0.5 * DEGREE * side * landed, ahead: -0.025 * landed });
        trauma = Math.max(trauma, 0.12 * landed);
      } else if (stopped) {
        pushes.push({ yaw: -0.9 * DEGREE * (side || 1), pitch: -0.5 * DEGREE, ahead: -0.04 });
        trauma = Math.max(trauma, 0.22);
      }
    } else if (harm > 0 && blow.some((event) => event.kind === EVENT.hit)) {
      const weight = Math.min(1.6, 0.8 + harm / 40);
      pushes.push({ pitch: -1.3 * DEGREE * weight, yaw: 1 * DEGREE * side * weight, ahead: -0.06 * weight });
      trauma = Math.max(trauma, Math.min(0.8, 0.25 + harm / 80));
    } else if (stopped) {
      pushes.push({ pitch: -0.5 * DEGREE, ahead: -0.03 });
      trauma = Math.max(trauma, 0.15);
    }
  }
  return { pushes, trauma };
}

/** The lean into the player's own swing as its blow lands, met or not: along the stroke, down for an overhead, in
 *  for a thrust. */
export function leanOf(stroke: number): Push {
  const direction = directionOf(stroke);
  return {
    yaw: 0.35 * DEGREE * SIDE[direction],
    pitch: direction === 'down' || direction === 'downLeft' || direction === 'downRight' ? 0.4 * DEGREE : 0,
    ahead: direction === 'up' ? 0.03 : 0.01,
  };
}

/** The view's kick: a spring on each of its five ways and a dying shake. */
export class CameraKick {
  private readonly offset = [0, 0, 0, 0, 0];
  private readonly speed = [0, 0, 0, 0, 0];
  private trauma = 0;
  private clock = 0;

  /** Pushes the view, `strength` times as hard as `push` (1 as made). */
  push(push: Push, strength = 1): void {
    CHANNELS.forEach((channel, index) => {
      this.speed[index] = (this.speed[index] ?? 0) + ((push[channel] ?? 0) * strength * SPRING.rate) / SPRING.peak;
    });
  }

  /** Shakes the view at least this hard (0 to 1), `strength` times as made. */
  shake(trauma: number, strength = 1): void {
    this.trauma = Math.min(1, Math.max(this.trauma, trauma * strength));
  }

  /** Runs the springs and the shake on by `seconds`. */
  update(seconds: number): void {
    this.clock += seconds;
    this.trauma = Math.max(0, this.trauma - SHAKE.dies * seconds);
    for (let left = seconds; left > 1e-9; left -= STEP_S) {
      const step = Math.min(STEP_S, left);
      for (let index = 0; index < CHANNELS.length; index += 1) {
        const [place, speed] = [this.offset[index] ?? 0, this.speed[index] ?? 0];
        const pull = -SPRING.rate * SPRING.rate * place - 2 * SPRING.damping * SPRING.rate * speed;
        this.speed[index] = speed + pull * step;
        this.offset[index] = place + (this.speed[index] ?? 0) * step;
      }
    }
  }

  /** The view's push now: the springs' and the shake's together. */
  get now(): Required<Push> {
    const shaken = this.trauma * this.trauma;
    const wobble = (seed: number) =>
      0.6 * Math.sin(this.clock * (SHAKE.rates[0] ?? 0) + seed) +
      0.4 * Math.sin(this.clock * (SHAKE.rates[1] ?? 0) + seed * 2.3);
    return {
      yaw: (this.offset[0] ?? 0) + SHAKE.yaw * shaken * wobble(0.7),
      pitch: (this.offset[1] ?? 0) + SHAKE.pitch * shaken * wobble(2.1),
      ahead: (this.offset[2] ?? 0) + SHAKE.move * shaken * wobble(3.9),
      aside: (this.offset[3] ?? 0) + SHAKE.move * shaken * wobble(5.3),
      up: (this.offset[4] ?? 0) + SHAKE.move * shaken * wobble(6.6),
    };
  }

  /** `orbit` kicked: turned about its own eye and moved, so the view moves and nothing it looks at. */
  kicked<Seen extends Orbit>(orbit: Seen, push: Push = this.now): Seen {
    const forward = (yaw: number, pitch: number) =>
      [Math.cos(pitch) * Math.sin(yaw), -Math.cos(pitch) * Math.cos(yaw), -Math.sin(pitch)] as const;
    const was = forward(orbit.yaw, orbit.pitch);
    const target = [orbit.targetX, orbit.targetY, orbit.targetZ] as const;
    const eye = target.map((value, axis) => value - (was[axis] ?? 0) * orbit.distance);
    const [yaw, pitch] = [orbit.yaw + (push.yaw ?? 0), orbit.pitch + (push.pitch ?? 0)];
    const flat = [Math.sin(orbit.yaw), -Math.cos(orbit.yaw)] as const;
    const moved = [
      (eye[0] ?? 0) + flat[0] * (push.ahead ?? 0) - flat[1] * (push.aside ?? 0),
      (eye[1] ?? 0) + flat[1] * (push.ahead ?? 0) + flat[0] * (push.aside ?? 0),
      (eye[2] ?? 0) + (push.up ?? 0),
    ];
    const now = forward(yaw, pitch);
    return {
      ...orbit,
      yaw,
      pitch,
      targetX: (moved[0] ?? 0) + now[0] * orbit.distance,
      targetY: (moved[1] ?? 0) + now[1] * orbit.distance,
      targetZ: (moved[2] ?? 0) + now[2] * orbit.distance,
    };
  }
}
