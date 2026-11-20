import scenes from '../../../../content/story/prologue.json' with { type: 'json' };
import { Lightning } from '../../cinema/lightning.ts';
import type { MarkView } from '../../ships/markView.ts';
import { shipSails, shipWaterline } from '../../ships/shipMesh.ts';
import { AUTO_HOLD_S } from '../../speech/conversation.ts';
import { CHARACTERS_PER_SECOND } from '../../speech/typing.ts';
import type { FightEvent, FightView } from '../../rules/fightRules.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import { onScreen, type Shot } from '../camera.ts';
import { Brig } from './brig.ts';
import { Sailing, type Sailed } from './sailing.ts';
import { headOnView, type StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import type { Beat } from './beat.ts';
import type { Line } from '../../speech/cast.ts';

// The sea beats' tests' own story: a stage that writes down what is said and done, and the fight's answers.

export const VIEW = { width: 1600, height: 900 };
export const STEP_S = 1 / 30;

type Said = { readonly scene: string; readonly at: number };

/** A story over a stage that writes down what is said and done, its scenes played at once or when the test says. */
export function storied(options: { land?: LandWorker; refused?: boolean } = {}) {
  const said: Said[] = [];
  const done: string[] = [];
  const playing = new Map<string, () => void>();
  /** What each scene played hears as its lines begin, for a test to say a line when it chooses. */
  const saying = new Map<string, (line: Line) => void>();
  const clock = { now: 0 };
  const note = (what: string) => () => void done.push(what);
  const stage = {
    play: (scene: string, _auto?: boolean, _heads?: unknown, hears?: (line: Line) => void) => {
      said.push({ scene, at: clock.now });
      if (hears) saying.set(scene, hears);
      if (options.refused) return Promise.reject(new Error(`${scene} could not be played`));
      return new Promise<void>((resolve) => playing.set(scene, resolve));
    },
    weatherTowards: (_to: unknown, seconds: number) => done.push(`weather ${seconds}`),
    stepWeather: () => undefined,
    windBearing: () => 0,
    wind: () => [14, 6],
    swell: () => undefined,
    parts: {
      scenes: scenes.scenes,
      ambience: {
        set: note('sound'),
        thunder: note('thunder'),
        whoosh: note('whoosh'),
        crash: note('crash'),
        ringing: note('ringing'),
      },
      dialogue: { skip: note('cut') },
      screen: { fade: note('fade'), flash: note('flash') },
      objective: { show: note('objective'), clear: () => undefined },
      hud: {
        hints: (lines: string[]) => done.push(`hints ${lines[0] ?? ''}`),
        shipBars: () => undefined,
        seaFight: () => undefined,
      },
    },
  };
  const brig = new Brig([10_000, 20_000], 0.7);
  const sailing = new Sailing({
    brig: { waterline: shipWaterline('brig'), sails: shipSails('brig') },
    sloop: { waterline: shipWaterline('sloop'), sails: shipSails('sloop') },
    frigate: { waterline: shipWaterline('frigate'), sails: shipSails('frigate') },
  });
  const story = {
    stage,
    sailing,
    brig,
    lightning: new Lightning(17, () => undefined),
    land: options.land,
    marks: { drawInto: () => undefined } as unknown as MarkView,
    dress: brig.crew({ x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 }, 0)[0]?.dress,
  } as unknown as Story;
  /** Plays `beat` for `seconds`, each frame's shot and heads kept with its time. */
  const run = (beat: Beat, seconds: number, from = 0) => {
    const frames: { at: number; frame: StoryFrame }[] = [];
    for (let time = from + STEP_S; time <= from + seconds + 1e-9; time += STEP_S) {
      clock.now = time;
      const frame = beat.frame({ seconds: STEP_S, clock: time, controls: null as never, size: VIEW, viewport: VIEW });
      if (frame) frames.push({ at: time, frame });
    }
    return frames;
  };
  return { story, said, done, playing, saying, run, clock };
}

/** How long a scene takes to say, roughly: a bark and the gap after it, each line typed and held. */
export function sayingS(scene: keyof typeof scenes.scenes): number {
  return scenes.scenes[scene].reduce(
    (sum, line) => sum + ('kind' in line ? 1.1 : line.say.length / CHARACTERS_PER_SECOND + AUTO_HOLD_S + 0.6),
    0,
  );
}

/** Who says a line of the scene. */
export const speakers = (scene: keyof typeof scenes.scenes) => [
  ...new Set(scenes.scenes[scene].map((line) => line.who)),
];

/** The speakers whose heads are off the view of a frame. */
export function unseen(frame: StoryFrame, who: readonly string[]): string[] {
  return who.filter((name) => {
    const head = frame.heads?.get(name);
    return !head || !headOnView(onScreen(frame.shot, VIEW, head), VIEW);
  });
}

/** A beaten Sloop lying still at (x, y). */
export const lying = (who: string, x: number, y: number, heading: number): Sailed => ({
  who,
  hull: 'sloop',
  x,
  y,
  heading,
  underWay: false,
});

export const turnBetween = (first: number, second: number) =>
  Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));

export const FROM: Shot = { eye: [9_950, 20_050, 30], yaw: 0.7, pitch: 0.3, fov: 1.134, near: 0.3, far: 30_000 };

/** A Sloop going down as the rules send her: settled, trimmed and listed to port so far, and how she will lie. */
export const GOING = { founder: [1.5, 0.1, -0.3], sunk_founder: [9, 0.35, -0.56], sinks_in: 10 } as const;

/** The fight's answer with a captain in each of `states`, and `events` since the last. */
export const viewOf = (
  states: readonly ('afloat' | 'struck' | 'sinking')[],
  events: readonly FightEvent[] = [],
): FightView => {
  const vessel = {
    ship: [10_000, 20_000, 0.7, 0, 0, 0, 0, 2],
    pose: [0, 0, 0, 0],
    hull: 240,
    max_hull: 240,
    sail: 96,
    max_sail: 96,
    crew: 0,
    max_crew: 0,
    state: 'afloat',
    fires: 0,
    guns: { left: [0, 0], progress: [1, 1], load: 'round', braced: false },
  } as const;
  const [first, ...rest] = states.map((state, index) => ({
    ...vessel,
    ship: [10_300 + index * 50, 19_300, 3, 0, 0, 0, 0, 2],
    state,
    name: 'Pirate Sloop',
    faction: 2,
    rank: 2,
    mode: 'engage' as const,
    hostile: true,
    run_out: [],
    ...(state === 'sinking' ? GOING : { founder: [0, 0, 0] as const }),
  }));
  if (!first) throw new Error('a captain');
  const beaten = states.every((state) => state !== 'afloat');
  return {
    clock: 0,
    player: vessel,
    captain: first,
    others: rest,
    balls: [],
    lay: null,
    events,
    over: beaten ? 'beaten' : null,
    fingerprint: '',
  };
};
