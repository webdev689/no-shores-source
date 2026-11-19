// The owner's ninth and tenth beats, played: the player fights through the wreck's foes on foot, as on any node; at
// its end the camera drives forward to Captain Brannoc Thule, his nameplate struck in as he cries out, and the arena
// closes on a fight one on one that cannot be won. It ends as the run says: the player felled, or overpowered.
import { Cues } from '../../cinema/cues.ts';
import { lookAt, type Point3 } from '../../cinema/rail.ts';
import { foeDress } from '../../player/foeDress.ts';
import type { Shot } from '../camera.ts';
import { footHints } from '../hints.ts';
import type { Beat, Tick } from './beat.ts';
import { ACTOR_IDS, type Actor } from './actors.ts';
import { storyCue } from './music.ts';
import type { Nameplate } from './nameplate.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { topAt, type WreckLayout } from './wreckLayout.ts';
import type { WreckRun } from './wreckRun.ts';

/** Captain Brannoc Thule's type in the roster, and his faction's. */
const THULE = 12;
const THULE_ID = ACTOR_IDS + 50;
/** The boss's coming: the push in to him, his cry, and the camera back to the player. */
const PUSH_S = 0.9;
const CRY_S = 2.4;
const BACK_S = 5.6;
/** The fewest seconds between two of Thule's barks of one kind. */
const BARK_GAP_S = 9;

export class WreckFight implements Beat {
  readonly name = 'wreck';
  readonly skippable = false;
  private readonly story: Story;
  private readonly layout: WreckLayout;
  private readonly nameplate: Nameplate;
  private run: WreckRun | null = null;
  /** The boss's coming, from its first frame: its cues and the shot it began from. */
  private coming: { since: number; cues: Cues; from: Shot } | null = null;
  private fought = false;
  private barked = { struck: -Infinity, strikes: -Infinity };
  private clock = 0;
  private lastHealth: { boss: number; you: number } | null = null;
  done = false;

  constructor(story: Story, layout: WreckLayout, run: Promise<WreckRun>, nameplate: Nameplate) {
    this.story = story;
    this.layout = layout;
    this.nameplate = nameplate;
    void run.then((opened) => {
      this.run = opened;
      story.stage.parts.objective.show('Fight', 'Fight your way through the wreck.', 7);
      window.setTimeout(() => void story.stage.play('wreck', true), 1500);
    });
  }

  /** Whether the player plays: the pointer is theirs to lock. */
  get playing(): boolean {
    return !!this.run && !this.coming;
  }

  private thuleAt(): Point3 {
    const [x, y] = this.layout.arena.thule;
    return [x, y, topAt(this.layout.decks, x, y)];
  }

  /** Thule at his post, crying out: drawn by the story until the fight stands him in the room. */
  private thuleActor(clock: number): Actor | null {
    const kind = this.story.stage.parts.roster.find((each) => each.type === THULE);
    const dress = kind && foeDress(kind);
    if (!dress) return null;
    const [x, y, z] = this.thuleAt();
    const [wakeX, wakeY] = this.layout.wake.at;
    return { id: THULE_ID, dress, anim: 'warcry', x, y, z, facing: Math.atan2(wakeX - x, y - wakeY), since: clock };
  }

  private bossComes(from: Shot): void {
    const { stage } = this.story;
    storyCue('boss');
    stage.parts.ambience.whoosh();
    stage.parts.screen.bars(true);
    const kind = stage.parts.roster.find((each) => each.type === THULE);
    this.coming = {
      since: 0,
      from,
      cues: new Cues([
        [PUSH_S, () => this.nameplate.show(kind?.name ?? 'Captain Brannoc Thule', kind?.faction ?? 1, kind?.factionName ?? 'The Grey Tithe')],
        [PUSH_S + 0.2, () => void stage.play('warCry', true, { thule: 'thule' })],
        [PUSH_S + 0.3, () => stage.parts.ambience.thunder(0.4)],
        [BACK_S - 1.2, () => this.nameplate.hide()],
        [BACK_S, () => this.fight()],
      ]),
    };
  }

  private fight(): void {
    this.coming = null;
    this.fought = true;
    this.story.stage.parts.screen.bars(false);
    this.run?.beginBoss();
  }

  /** The push in to Thule over the player's head and back, held still while he cries out. */
  private comingShot(): Shot {
    const coming = this.coming;
    if (!coming) throw new Error('no boss is coming');
    const thule = this.thuleAt();
    const head: Point3 = [thule[0], thule[1], thule[2] + 1.9];
    const toward = lookAt(coming.from.eye, head);
    const near: Point3 = [
      head[0] - Math.sin(toward.yaw) * 4.2,
      head[1] + Math.cos(toward.yaw) * 4.2,
      head[2] - 0.2,
    ];
    const into = coming.since;
    const share = into < PUSH_S ? into / PUSH_S : into < BACK_S - 0.7 ? 1 : Math.max(0, (BACK_S - into) / 0.7);
    const eased = 1 - (1 - share) ** 3;
    const eye: [number, number, number] = [0, 1, 2].map(
      (axis) => (coming.from.eye[axis] ?? 0) * (1 - eased) + (near[axis] ?? 0) * eased,
    ) as [number, number, number];
    const look = lookAt(eye, head);
    return { ...coming.from, eye, yaw: look.yaw, pitch: look.pitch, fov: coming.from.fov * (1 - 0.35 * eased) };
  }

  frame(tick: Tick): StoryFrame | null {
    const run = this.run;
    if (!run) return null;
    const { story } = this;
    const { stage, walker, firstPerson } = story;
    this.clock += tick.seconds;
    stage.stepWeather(tick.seconds);
    const coming = this.coming;
    if (coming) {
      coming.since += tick.seconds;
      coming.cues.step(coming.since);
    }
    const aspect = tick.size.width / Math.max(1, tick.size.height);
    const shown = run.frame(tick.controls, tick.seconds, tick.clock, {
      paused: !!coming,
      hands: tick.controls.locked && !coming,
      aspect,
      held: !!coming,
    });
    if (run.arena && !this.fought && !coming) this.bossComes(shown.shot);
    this.barks(shown.fight.own?.health ?? 0);
    if (run.outcome) this.done = true;
    const { footView, hud, scene } = stage.parts;
    const fight = footView.frame(run, shown, tick.seconds, {
      size: tick.size,
      viewport: tick.viewport,
      groundAt: (x, y) => scene.groundAt(x, y),
    });
    hud.hints(coming ? [] : footHints(0));
    hud.reach(shown.standing);
    const thule = coming ? this.thuleActor(tick.clock - coming.since) : null;
    const hands =
      walker.inFirstPerson && !coming
        ? (encoder: GPUCommandEncoder, view: GPUTextureView) => firstPerson.draw(encoder, view, tick.size.width, tick.size.height)
        : undefined;
    return {
      shot: coming ? this.comingShot() : shown.shot,
      cards: shown.figures,
      actors: thule ? [thule] : [],
      drawers: [fight.under, fight.over],
      after: hands,
      heads: new Map([...run.heads(), ...(thule ? [['thule', [thule.x, thule.y, thule.z + 2.2]] as const] : [])]),
      focus: [shown.shot.eye[0], shown.shot.eye[1]],
    };
  }

  /** Thule's barks as the fight goes: when the player's blows land, and when his land on them. */
  private barks(yours: number): void {
    const boss = this.run?.boss;
    if (!boss) return;
    const health = { boss: boss.health, you: yours };
    const last = this.lastHealth;
    this.lastHealth = health;
    if (!last) return;
    if (health.boss < last.boss && this.clock - this.barked.struck > BARK_GAP_S) {
      this.barked.struck = this.clock;
      void this.story.stage.play('bossStruck', true, { thule: 'thule' });
    } else if (health.you < last.you && this.clock - this.barked.strikes > BARK_GAP_S) {
      this.barked.strikes = this.clock;
      void this.story.stage.play('bossStrikes', true, { thule: 'thule' });
    }
  }

  get outcome(): WreckRun['outcome'] {
    return this.run?.outcome ?? null;
  }

  leave(): void {
    this.nameplate.hide();
    this.story.stage.parts.hud.hints([]);
  }
}
