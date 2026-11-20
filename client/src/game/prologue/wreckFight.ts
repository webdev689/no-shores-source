// The owner's ninth and tenth beats, played: the player fights through the wreck's foes on foot, as on any node, each
// heap across the way clearing as the wave holding it falls; at its end the camera drives forward to Captain Brannoc
// Thule, his nameplate struck in as he cries out, and the arena closes on a fight one on one that cannot be won. It
// ends as the run says, the player felled or overpowered, and the screen fades out on it.
import { Cues } from '../../cinema/cues.ts';
import { lookAt, type Point3 } from '../../cinema/rail.ts';
import { foeDress } from '../../player/foeDress.ts';
import { onScreen, type Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { ACTOR_IDS, type Actor } from './actors.ts';
import { storyCue } from './music.ts';
import type { Nameplate } from './nameplate.ts';
import { headOnView, type StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { topAt, type WreckLayout } from './wreckLayout.ts';
import type { WreckRun } from './wreckRun.ts';
import { setAblaze, type WreckScenery } from './wreckScenery.ts';

/** Captain Brannoc Thule's type in the roster, and his faction's. */
const THULE = 12;
const THULE_ID = ACTOR_IDS + 50;
/** The boss's coming: the push in to him, his cry, and the camera back to the player. */
const PUSH_S = 0.9;
const BACK_S = 5.6;
/** The fewest seconds between two of Thule's barks of one kind. */
const BARK_GAP_S = 9;
/** How long the screen takes to fade out on the fight's end, seconds. */
const END_S = 0.6;

export class WreckFight implements Beat {
  readonly name = 'wreck';
  readonly skippable = false;
  private readonly story: Story;
  private readonly layout: WreckLayout;
  private readonly nameplate: Nameplate;
  private readonly scenery: WreckScenery;
  private run: WreckRun | null = null;
  /** Why the run could not open, thrown from the next frame so the story goes on past the wreck. */
  private failure: unknown = null;
  /** The boss's coming, from its first frame: its cues and the shot it began from. */
  private coming: { since: number; cues: Cues; from: Shot } | null = null;
  private fought = false;
  private barked = { struck: -Infinity, strikes: -Infinity };
  /** Whether the player has struck Thule since he last told them to kneel: he says it again only then. */
  private struckSinceKneel = true;
  private clock = 0;
  private lastHealth: { boss: number; you: number } | null = null;
  /** Whether a Tithe hand has cried out at the player, and whether the player lay dead last frame. */
  private spotted = false;
  private wasDead = false;
  /** Seconds since the fight ended, while the screen fades out on it. */
  private ending: number | null = null;
  done = false;

  constructor(story: Story, layout: WreckLayout, scenery: WreckScenery, run: Promise<WreckRun>, nameplate: Nameplate) {
    this.story = story;
    this.layout = layout;
    this.scenery = scenery;
    this.nameplate = nameplate;
    setAblaze(story, layout);
    story.stage.parts.ambience.heartbeat(false);
    void run.then(
      (opened) => {
        this.run = opened;
        story.stage.parts.objective.show('Fight', 'Fight your way through the wreck.', 7);
      },
      (error: unknown) => (this.failure = error ?? new Error('the wreck did not open')),
    );
  }

  /** Whether the player plays: the pointer is theirs to lock. */
  get playing(): boolean {
    return !!this.run && !this.coming && this.ending === null;
  }

  private thuleAt(): Point3 {
    const [x, y] = this.layout.arena.thule;
    return [x, y, topAt(this.layout.course, x, y)];
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
        [
          PUSH_S,
          () =>
            this.nameplate.show(
              kind?.name ?? 'Captain Brannoc Thule',
              kind?.faction ?? 1,
              kind?.factionName ?? 'The Grey Tithe',
            ),
        ],
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
    const near: Point3 = [head[0] - Math.sin(toward.yaw) * 4.2, head[1] + Math.cos(toward.yaw) * 4.2, head[2] - 0.2];
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
    if (this.failure) throw this.failure;
    const run = this.run;
    if (!run) return null;
    const { story } = this;
    const { stage, walker, firstPerson } = story;
    this.clock += tick.seconds;
    stage.stepWeather(tick.seconds);
    if (this.coming) {
      this.coming.since += tick.seconds;
      this.coming.cues.step(this.coming.since);
    }
    // Read after its cues: the last of them begins the fight, and the push in is over.
    const coming = this.coming;
    const held = !!coming || this.ending !== null;
    const aspect = tick.size.width / Math.max(1, tick.size.height);
    const shown = run.frame(tick.controls, tick.seconds, tick.clock, {
      paused: held,
      hands: tick.controls.locked && !held,
      aspect,
      held,
    });
    if (run.arena && !this.fought && !coming) this.bossComes(shown.shot);
    this.fallen(shown.fight.own?.action.kind === 'dead');
    this.end(tick.seconds, !!run.outcome);
    const { footView, hud, scene } = stage.parts;
    const fight = footView.frame(run, shown, tick.seconds, {
      size: tick.size,
      viewport: tick.viewport,
      groundAt: (x, y) => scene.groundAt(x, y),
    });
    hud.hints(held ? [] : shown.hints);
    hud.reach(shown.standing);
    const thule = coming ? this.thuleActor(tick.clock - coming.since) : null;
    const hands =
      walker.inFirstPerson && !coming
        ? (encoder: GPUCommandEncoder, view: GPUTextureView) =>
            firstPerson.draw(encoder, view, tick.size.width, tick.size.height)
        : undefined;
    const heads = new Map([...run.heads(), ...(thule ? [['thule', [thule.x, thule.y, thule.z + 2.2]] as const] : [])]);
    const shot = coming ? this.comingShot() : shown.shot;
    const thuleHead = heads.get('thule');
    this.barks(
      shown.fight.own?.health ?? 0,
      !!thuleHead && !!headOnView(onScreen(shot, tick.viewport, thuleHead), tick.viewport),
    );
    if (!held) this.spot(shot, heads, tick.viewport);
    return {
      shot,
      cards: shown.figures,
      actors: thule ? [thule] : [],
      drawers: [this.scenery.drawer, fight.under, fight.over],
      after: hands,
      heads,
      focus: [shown.shot.eye[0], shown.shot.eye[1]],
    };
  }

  /** The first Tithe hand the player sees cries out at them, once. */
  private spot(
    shot: Shot,
    heads: ReadonlyMap<string, readonly [number, number, number]>,
    view: { readonly width: number; readonly height: number },
  ): void {
    if (this.spotted) return;
    for (const [name, point] of heads) {
      if (!name.startsWith('tithe-') || !headOnView(onScreen(shot, view, point), view)) continue;
      this.spotted = true;
      void this.story.stage.play('survivor', true, { tithe: name });
      return;
    }
  }

  /** A death before the boss fight says what happens: the room raises the player at the last checkpoint. Felled in
   *  the boss fight, the fight ends, though the run learns it a frame later. */
  private fallen(dead: boolean): void {
    if (dead && !this.wasDead && !this.fought)
      this.story.stage.parts.objective.show('Fallen', 'You will rise at the last checkpoint.', 4);
    this.wasDead = dead;
  }

  /** Once the fight has ended, the screen fades out on it, and the beat is done when it is black. */
  private end(seconds: number, over: boolean): void {
    if (this.ending === null) {
      if (!over) return;
      this.ending = 0;
      this.story.stage.parts.screen.fade(1, END_S);
      return;
    }
    this.ending += seconds;
    if (this.ending >= END_S) this.done = true;
  }

  /** Thule's barks as the fight goes: when the player's blows land, and when his land on them. Only a cry `heard`,
   *  his head on the view, counts toward the gap before the next; and he tells the player to kneel again only once
   *  they have struck him since. */
  private barks(yours: number, heard: boolean): void {
    const boss = this.run?.boss;
    if (!boss) return;
    const health = { boss: boss.health, you: yours };
    const last = this.lastHealth;
    this.lastHealth = health;
    if (!last) return;
    if (health.boss < last.boss) this.struckSinceKneel = true;
    if (!heard) return;
    if (health.boss < last.boss && this.clock - this.barked.struck > BARK_GAP_S) {
      this.barked.struck = this.clock;
      void this.story.stage.play('bossStruck', true, { thule: 'thule' });
    } else if (health.you < last.you && this.struckSinceKneel && this.clock - this.barked.strikes > BARK_GAP_S) {
      this.barked.strikes = this.clock;
      this.struckSinceKneel = false;
      void this.story.stage.play('bossStrikes', true, { thule: 'thule' });
    }
  }

  /** Hands the game back as it was before the wreck: no nameplate, prompt, hints, death or fight's display, the
   *  letterbox's bars down, the pointer free, and the run's room let go. */
  leave(): void {
    const { hud, footView, objective, screen } = this.story.stage.parts;
    this.nameplate.hide();
    hud.hints([]);
    hud.reach({ kind: 'inside' });
    footView.hide();
    objective.clear();
    screen.bars(false);
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    this.run?.leave();
    this.run = null;
  }
}
