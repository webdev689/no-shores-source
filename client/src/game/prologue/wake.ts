// The owner's eighth beat: in first person, flat on the deck, the eyes blinking, the view swimming, the ears ringing;
// rising to the feet and looking round at two ships jammed into one and burning; then the camera pulls back out of the
// eyes and rushes the length of the wreck, past its factions fighting each other, to the arena at its end, and comes
// back to the player, whose control it is.
import { Cues } from '../../cinema/cues.ts';
import { type Point3, type RailKey, railShot } from '../../cinema/rail.ts';
import type { FoeType } from '../../rules/roster.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { type Pairing, fighters } from './fighters.ts';
import { storyCue } from './music.ts';
import { WRECK } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { topAt, type WreckLayout } from './wreckLayout.ts';

const LENS = { fov: 1.0, near: 0.05, far: 20_000 } as const;
/** When the eyes are open for good, when the player stands, when the camera leaves the eyes, and when control comes. */
const OPEN_S = 6.5;
const STAND_S = 10.5;
const LEAVE_S = 13;
const CONTROL_S = 25;
/** The lids' shut share over the first seconds, a slow blinking awake: [seconds, shut]. */
const BLINKS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1.1, 0.45],
  [1.9, 1],
  [3.1, 0.25],
  [3.7, 0.85],
  [5.2, 0.05],
  [OPEN_S, 0],
];

/** The lids' shut share at `time`, eased between the blinks. */
export function lidsAt(time: number): number {
  for (let index = 1; index < BLINKS.length; index++) {
    const [after, shut] = BLINKS[index] ?? [0, 0];
    const [before, was] = BLINKS[index - 1] ?? [0, 0];
    if (time <= after) {
      const share = Math.min(1, Math.max(0, (time - before) / (after - before)));
      return was + (shut - was) * share * share * (3 - 2 * share);
    }
  }
  return 0;
}

/** The faction a deck crew's type fights for: the Grey Tithe's are 7 to 12, the pirates' 13 to 17. */
const tithe = (type: number) => type >= 7 && type <= 12;

/** The fights the camera passes: in each zone, each Grey Tithe foe paired with a pirate beside them. */
export function stagedFights(layout: WreckLayout, roster: readonly FoeType[]): Pairing[] {
  const pairs: Pairing[] = [];
  for (const zone of layout.zones.slice(0, layout.arena.zone)) {
    const tithes = zone.wave.filter((foe) => tithe(foe.type));
    const pirates = zone.wave.filter((foe) => !tithe(foe.type));
    tithes.forEach((foe, index) => {
      const pirate = pirates[index];
      if (!pirate || !roster.some((each) => each.type === foe.type)) return;
      const [x, y] = [(foe.at[0] + pirate.at[0]) / 2, (foe.at[1] + pirate.at[1]) / 2];
      const facing = Math.atan2(pirate.at[0] - foe.at[0], foe.at[1] - pirate.at[1]);
      pairs.push({ first: foe.type, second: pirate.type, at: [x, y, topAt(layout.decks, x, y)], facing });
    });
  }
  return pairs;
}

export class Wake implements Beat {
  readonly name = 'wake';
  readonly skippable = true;
  private readonly story: Story;
  private readonly layout: WreckLayout;
  private readonly cues: Cues;
  private readonly flight: RailKey[];
  private readonly pairs: Pairing[];
  private since = 0;
  done = false;

  constructor(story: Story, layout: WreckLayout) {
    this.story = story;
    this.layout = layout;
    const { stage } = story;
    const { ambience, screen, flames } = stage.parts;
    storyCue('wreck');
    stage.weatherTowards(WRECK, 0);
    flames.clear();
    layout.fires.forEach((fire, index) => flames.light(fire.at, fire.size, index + 1));
    ambience.set({ fire: 0.8, rain: 0.65, wind: 0.5, waves: 0.8, creak: 0.9, deep: 0 }, 2);
    ambience.heartbeat(true);
    screen.bars(false);
    screen.lids(1);
    screen.blur(9);
    screen.fade(0, 1.4);
    this.pairs = stagedFights(layout, stage.parts.roster);
    this.flight = this.flightKeys();
    this.cues = new Cues([
      [0.4, () => ambience.thud()],
      [STAND_S, () => ambience.heartbeat(false)],
      [LEAVE_S + 0.2, () => ambience.whoosh()],
      [LEAVE_S + 2.5, () => void stage.play('wreck', true, { tithe: 'fight-0-tithe', pirate: 'fight-0-pirate' })],
    ]);
  }

  /** The player's eye on the deck where they woke: lying, sitting, standing. */
  private eyeAt(height: number): Point3 {
    const [x, y] = this.layout.wake.at;
    return [x, y, topAt(this.layout.decks, x, y) + height];
  }

  /** Out of the eyes and back over the player's shoulder, then the length of the wreck along its path to the arena's
   *  gate, and back to the player. */
  private flightKeys(): RailKey[] {
    const facing = this.layout.wake.facing;
    const stand = this.eyeAt(1.65);
    const behind: Point3 = [stand[0] - Math.sin(facing) * 3.6, stand[1] + Math.cos(facing) * 3.6, stand[2] + 0.6];
    const ahead = (from: Point3): Point3 => [from[0] + Math.sin(facing) * 20, from[1] - Math.cos(facing) * 20, from[2] - 2];
    const path = this.layout.path;
    const along = path.map(([x, y], index): RailKey => {
      const next = path[Math.min(path.length - 1, index + 1)] ?? [x, y];
      const deck = topAt(this.layout.decks, x, y);
      return {
        at: LEAVE_S + 2 + (index / Math.max(1, path.length - 1)) * 7,
        eye: [x - 1.5, y - 1.5, deck + 5.5],
        look: [next[0] + (next[0] - x) * 2, next[1] + (next[1] - y) * 2, deck + 1.5],
      };
    });
    return [
      { at: LEAVE_S, eye: stand, look: ahead(stand), fov: LENS.fov },
      { at: LEAVE_S + 1.4, eye: behind, look: ahead(stand), fov: 0.9 },
      ...along,
      { at: CONTROL_S - 1.6, eye: behind, look: ahead(stand), fov: 0.9 },
      { at: CONTROL_S, eye: behind, look: ahead(stand), fov: 0.9 },
    ];
  }

  skip(): void {
    this.cues.finish();
    const { screen } = this.story.stage.parts;
    screen.lids(0);
    screen.blur(0);
    this.done = true;
  }

  frame(tick: Tick): StoryFrame {
    const { stage } = this.story;
    this.since += tick.seconds;
    this.cues.step(this.since);
    stage.stepWeather(tick.seconds);
    const { screen } = stage.parts;
    screen.lids(lidsAt(this.since));
    screen.blur(Math.max(0, 9 * (1 - this.since / (OPEN_S + 1))));
    if (this.since >= CONTROL_S) this.done = true;
    const shot = this.shot();
    const flying = this.since >= LEAVE_S;
    const actors = flying ? fighters(stage.parts.roster, this.pairs, tick.clock) : [];
    const heads = new Map<string, readonly [number, number, number]>();
    const first = this.pairs[0];
    if (first) {
      heads.set('fight-0-tithe', [first.at[0] - Math.sin(first.facing) * 0.9, first.at[1] + Math.cos(first.facing) * 0.9, first.at[2] + 2.1]);
      heads.set('fight-0-pirate', [first.at[0] + Math.sin(first.facing) * 0.9, first.at[1] - Math.cos(first.facing) * 0.9, first.at[2] + 2.1]);
    }
    return { shot, actors, heads, focus: [shot.eye[0], shot.eye[1]] };
  }

  /** Whether the player's own figure shows: once the camera has left their eyes. */
  get thirdPerson(): boolean {
    return this.since >= LEAVE_S + 0.6;
  }

  private shot(): Shot {
    const facing = this.layout.wake.facing;
    if (this.since >= LEAVE_S) return { ...LENS, ...railShot(this.flight, this.since, LENS.fov, 'both') };
    // Lying: looking up into the storm, the head lolling; sitting up; standing and looking round.
    const rise = Math.min(1, Math.max(0, (this.since - OPEN_S) / (STAND_S - OPEN_S)));
    const eased = rise * rise * (3 - 2 * rise);
    const sway = Math.sin(this.since * 0.9) * 0.08 * (1 - eased);
    const around = this.since > STAND_S ? Math.sin((this.since - STAND_S) * 1.6) * 0.8 : 0;
    return {
      ...LENS,
      eye: this.eyeAt(0.3 + 1.35 * eased),
      yaw: facing + sway + around,
      pitch: -1.25 * (1 - eased) + 0.12 * eased,
    };
  }
}
