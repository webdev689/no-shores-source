// The owner's eleventh beat: the screen, faded out on the fight, fades back in on the player thrown over the rammer's
// rail, Thule and his crew crying out and leaping on her quarterdeck as the body arcs into the sea; a splash, and the
// fade again.
import { Cues } from '../../cinema/cues.ts';
import { lookAt, type Point3 } from '../../cinema/rail.ts';
import { foeDress } from '../../player/foeDress.ts';
import type { Shot } from '../camera.ts';
import { type Actor, ACTOR_IDS } from './actors.ts';
import type { Beat, Tick } from './beat.ts';
import { YOU_ID } from './helm.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { topAt, type WreckLayout } from './wreckLayout.ts';
import { setAblaze, type WreckScenery } from './wreckScenery.ts';

const LENS = { fov: 0.85, near: 0.2, far: 20_000 } as const;
/** The widest a view is framed for as it is: a narrower one is framed from further back. */
const FRAMED_ASPECT = 16 / 9;
/** The crew who celebrate by the boss: their roster types, their moves, and where they stand from him (east, south). */
const CELEBRANTS: readonly {
  readonly type: number;
  readonly anim: string;
  readonly from: readonly [number, number];
}[] = [
  { type: 12, anim: 'warcry', from: [0, 0] },
  { type: 7, anim: 'jump', from: [-2.6, 0.0] },
  { type: 8, anim: 'warcry', from: [-1.4, 2.6] },
  { type: 10, anim: 'jump', from: [1.2, 1.8] },
];
/** The throw: when it starts, how long the body is in the air, how far it is thrown east over the rail and how high. */
const THROW_AT_S = 1.6;
const FLIGHT_S = 1.5;
const THROW_M = 9;
const THROW_UP_M = 2.6;
const OVER_S = 6.2;

/** Where a thrown body is `into` seconds after leaving the deck at `from`: up and over, down into the sea. */
export function thrownAt(from: Point3, into: number): Point3 {
  const share = Math.min(1, Math.max(0, into / FLIGHT_S));
  const [x, y, z] = from;
  // A throw up and out falling to the sea a metre under the surface: a parabola through its rise.
  const fall = z + 1;
  const height = z + THROW_UP_M * 4 * share * (1 - share) - fall * share * share;
  return [x + THROW_M * share, y, height];
}

export class Overboard implements Beat {
  readonly name = 'overboard';
  readonly skippable = true;
  private readonly story: Story;
  private readonly layout: WreckLayout;
  private readonly scenery: WreckScenery;
  private readonly cues: Cues;
  private since = 0;
  done = false;

  constructor(story: Story, layout: WreckLayout, scenery: WreckScenery) {
    this.story = story;
    this.layout = layout;
    this.scenery = scenery;
    const { stage } = story;
    const { screen, ambience } = stage.parts;
    setAblaze(story, layout);
    ambience.heartbeat(false);
    stage.parts.hud.hints([]);
    stage.parts.hud.tasks.show(null);
    // The fight has faded out already; begun here, the beat starts as black as the fight left it.
    screen.fade(1, 0);
    this.cues = new Cues([
      [0.3, () => screen.fade(0, 0.9)],
      [1.1, () => void stage.play('overboard', true, { thule: 'thule', tithe: 'celebrant-1' })],
      [THROW_AT_S + FLIGHT_S, () => ambience.splash(1)],
      [OVER_S - 1, () => screen.fade(1, 1)],
      [OVER_S, () => (this.done = true)],
    ]);
  }

  private thule(): Point3 {
    const [x, y] = this.layout.arena.thule;
    return [x, y, topAt(this.layout.course, x, y)];
  }

  skip(): void {
    this.cues.finish();
    this.done = true;
  }

  frame(tick: Tick): StoryFrame {
    const { stage } = this.story;
    this.since += tick.seconds;
    this.cues.step(this.since);
    stage.stepWeather(tick.seconds);
    const [x, y, z] = this.thule();
    const actors: Actor[] = [];
    const heads = new Map<string, readonly [number, number, number]>();
    CELEBRANTS.forEach((one, index) => {
      const [standX, standY] = [x + one.from[0], y + one.from[1]];
      const stand = topAt(this.layout.course, standX, standY);
      heads.set(index === 0 ? 'thule' : `celebrant-${index}`, [standX, standY, stand + 2.2]);
      const kind = stage.parts.roster.find((each) => each.type === one.type);
      const dress = kind && foeDress(kind);
      if (!dress) return;
      actors.push({
        id: ACTOR_IDS + 60 + index,
        dress,
        anim: one.anim,
        x: standX,
        y: standY,
        z: stand,
        facing: Math.PI / 2,
        since: index * 0.3,
      });
    });
    const thrown = this.since >= THROW_AT_S ? thrownAt([x + 1.6, y, z + 0.9], this.since - THROW_AT_S) : null;
    if (thrown && thrown[2] > -0.8)
      actors.push({
        id: YOU_ID,
        dress: this.story.dress,
        anim: 'hurt',
        x: thrown[0],
        y: thrown[1],
        z: thrown[2],
        facing: -Math.PI / 2,
      });
    const aspect = tick.viewport.width / Math.max(1, tick.viewport.height);
    const shot = this.shot([x, y, z], aspect);
    return {
      shot,
      actors,
      drawers: [this.scenery.drawer],
      heads,
      focus: [x, y],
      heard: { at: 'sea', deck: true, sailing: false },
    };
  }

  /** From off the rammer's other side and a little astern, watching the deck and the rail the body goes over; on a
   *  view narrower than `FRAMED_ASPECT`, as much further back as it is narrower, so the same crew stand on it. */
  private shot(thule: Point3, aspect: number): Shot {
    const target: Point3 = [thule[0] + 3 + Math.min(1, this.since / 4) * 2.5, thule[1], thule[2] + 1.2];
    const back = Math.max(1, FRAMED_ASPECT / aspect);
    const from: Point3 = [-7.5 - 3 - Math.min(1, this.since / 4) * 2.5, 6.5, 2];
    const eye: Point3 = [target[0] + from[0] * back, target[1] + from[1] * back, target[2] + from[2] * back];
    return { ...LENS, eye: [...eye], ...lookAt(eye, target) };
  }
}
