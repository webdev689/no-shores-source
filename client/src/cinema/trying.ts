// The weather, birds and fire set up round the arrival from the page's address, for trying them by hand and taking
// pictures in a development build. Nothing here is part of the game's story: the director sets the real weather.
import type { Gpu } from '../gpu.ts';
import { Birds } from './birds.ts';
import { Flames } from './flames.ts';
import { CLEAR, strikeAt, type Weather, WEATHERS } from './weather.ts';

type Point = readonly [number, number, number];

/** The camera as the game's drawers are handed it. */
interface Shot {
  readonly eye: Point;
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

/** What the address asks to try: `?weather=` one of WEATHERS, `?birds=1`, `?flames=1`, `?shot=sea` to look out
 *  over the nearest open sea instead of the arrival (the deep always looks up from under it), and `?strike=1` to
 *  hold a storm's lightning lit, for a picture of it. */
export function askedOf(search: string): {
  weather: keyof typeof WEATHERS | null;
  birds: boolean;
  flames: boolean;
  sea: boolean;
  strike: boolean;
} {
  const asked = new URLSearchParams(search);
  const named = asked.get('weather');
  const weather = named !== null && named in WEATHERS ? (named as keyof typeof WEATHERS) : null;
  return {
    weather,
    birds: asked.get('birds') === '1',
    flames: asked.get('flames') === '1',
    sea: asked.get('shot') === 'sea' || weather === 'deep',
    strike: asked.get('strike') === '1',
  };
}

/** The first point of open water (ground 6 m or more under the sea) found going out from `from`, ring by ring. */
export function openSeaNear(
  from: readonly [number, number],
  groundAt: (x: number, y: number) => number | null,
): [number, number] | null {
  for (let reach = 50; reach <= 4000; reach += 50) {
    for (let step = 0; step < 32; step++) {
      const angle = (step / 32) * Math.PI * 2;
      const x = from[0] + Math.sin(angle) * reach;
      const y = from[1] - Math.cos(angle) * reach;
      const ground = groundAt(x, y);
      if (ground !== null && ground < -6) return [x, y];
    }
  }
  return null;
}

/** The address's weather, flocks and fires, placed round the first shot it is handed. */
export class Trying {
  private readonly asked: ReturnType<typeof askedOf>;
  private readonly birds: Birds;
  private readonly flames: Flames;
  private readonly groundAt: (x: number, y: number) => number | null;
  private placed: { look: Shot | null; ahead: Point } | null = null;

  constructor(gpu: Gpu, search: string, groundAt: (x: number, y: number) => number | null) {
    this.asked = askedOf(search);
    this.birds = new Birds(gpu);
    this.flames = new Flames(gpu);
    this.groundAt = groundAt;
  }

  /** The shot to draw: the game's, or one over (or under) the open sea when asked. */
  shotOf(shot: Shot): Shot {
    const placed = this.place(shot);
    return placed.look ?? shot;
  }

  /** The weather at `seconds`, lightning striking every few seconds in a storm. */
  weatherAt(seconds: number): Weather {
    const name = this.asked.weather;
    const weather: Weather = name ? WEATHERS[name] : CLEAR;
    this.flames.wind = weather.wind;
    if (name !== 'storm' || !this.placed) return weather;
    const ahead: [number, number] = [this.placed.ahead[0], this.placed.ahead[1]];
    if (this.asked.strike) return { ...weather, flash: 1, bolt: { x: ahead[0] + 120, y: ahead[1], seed: 5 } };
    return { ...weather, ...strikeAt(seconds + 4, 5, ahead, 250, 1) };
  }

  /** The drawers to add to the game's. */
  drawers(): (Birds | Flames)[] {
    return [...(this.asked.birds ? [this.birds] : []), ...(this.asked.flames ? [this.flames] : [])];
  }

  private place(shot: Shot): { look: Shot | null; ahead: Point } {
    if (this.placed) return this.placed;
    let look: Shot | null = null;
    let base = shot;
    const sea = this.asked.sea ? openSeaNear([shot.eye[0], shot.eye[1]], this.groundAt) : null;
    if (sea) {
      const outward = Math.atan2(sea[0] - shot.eye[0], -(sea[1] - shot.eye[1]));
      const deep = this.asked.weather === 'deep';
      look = { ...shot, eye: [sea[0], sea[1], deep ? -9 : 14], yaw: outward, pitch: deep ? -0.55 : 0.04 };
      base = look;
    }
    const along = (metres: number, rise: number): Point => [
      base.eye[0] + Math.sin(base.yaw) * metres,
      base.eye[1] - Math.cos(base.yaw) * metres,
      base.eye[2] + rise,
    ];
    if (this.asked.birds) {
      this.birds.flock(along(35, 14), 22, 22, 1);
      this.birds.flock(along(200, 40), 14, 45, 2);
    }
    if (this.asked.flames) {
      const fire = (metres: number, side: number, size: number, seed: number) => {
        const [x, y] = along(metres, 0);
        const across: [number, number] = [x + Math.cos(base.yaw) * side, y + Math.sin(base.yaw) * side];
        this.flames.light([...across, this.groundAt(...across) ?? 0], size, seed);
      };
      fire(6, -1.5, 0.5, 1);
      fire(8, 1.8, 1.5, 2);
      fire(16, -2, 4, 3);
    }
    this.placed = { look, ahead: along(700, 0) };
    return this.placed;
  }
}
