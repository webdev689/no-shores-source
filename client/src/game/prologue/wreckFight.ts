// The owner's ninth and tenth beats, played: the player fights through the wreck's foes on foot, as on any node, each
// heap across the way clearing as the wave holding it falls; at its end the camera drives forward to Captain Brannoc
// Thule, his nameplate struck in as he cries out, and the arena closes on a fight one on one that cannot be won. It
// ends as the run says, the player felled or overpowered, and the screen fades out on it.
import { Cues } from '../../cinema/cues.ts';
import { lookAt, type Point3 } from '../../cinema/rail.ts';
import { foeDress } from '../../player/foeDress.ts';
import type { FootFight } from '../foot.ts';
import { onScreen, type Shot } from '../camera.ts';
import type { Overlay } from '../scene.ts';
import type { Beat, Tick } from './beat.ts';
import { ACTOR_IDS, type Actor } from './actors.ts';
import type { HeardFoe, Hearing } from '../audio/music/directorLaw.ts';
import { type FootHeard, hearFoot } from '../audio/music/hearing.ts';
import { fought } from './music.ts';
import { type Done, Lessons } from './lessons.ts';
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
  /** The tasks on the wreck: the controls learned in its quiet first zone, then the fight's own. */
  private readonly lessons = new Lessons();
  /** Whether the player has struck Thule since he last told them to kneel: he says it again only then. */
  private struckSinceKneel = true;
  private clock = 0;
  private lastHealth: { boss: number; you: number } | null = null;
  /** Whether a Tithe hand has cried out at the player. */
  private spotted = false;
  /** Seconds since the fight ended, while the screen fades out on it. */
  private ending: number | null = null;
  /** The fight as the music last heard it. */
  private heard: Hearing | null = null;
  done = false;

  constructor(story: Story, layout: WreckLayout, scenery: WreckScenery, run: Promise<WreckRun>, nameplate: Nameplate) {
    this.story = story;
    this.layout = layout;
    this.scenery = scenery;
    this.nameplate = nameplate;
    setAblaze(story, layout);
    story.stage.parts.ambience.heartbeat(false);
    void run.then(
      (opened) => (this.run = opened),
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
        [PUSH_S + 0.3, () => this.strikeBehindThule()],
        [BACK_S - 1.2, () => this.nameplate.hide()],
        [BACK_S, () => this.fight()],
      ]),
    };
  }

  /** Lightning down 400 m beyond Thule as he cries out, seen from the player: its light on him, then its thunder. */
  private strikeBehindThule(): void {
    const [x, y] = this.layout.arena.thule;
    const [wakeX, wakeY] = this.layout.wake.at;
    const away = Math.hypot(x - wakeX, y - wakeY) || 1;
    const [east, south] = [(x - wakeX) / away, (y - wakeY) / away];
    this.story.lightning.strike(x + east * 400, y + south * 400, [wakeX, wakeY]);
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

  /** The wreck's fights on the Boarding's first part, tense at least, with Thule's own score from his cry. */
  music(): Hearing {
    return fought(this.heard, 'boarding', 'tension');
  }

  /** The fight as the music hears it. Thule is heard from his cry on, before the room stands him, and as the one
   *  foe throughout, so his score wakes once; the fight over, the player is beaten, and his score's end plays. */
  private hearing(fight: FootHeard, distance: number): Hearing {
    const thule: HeardFoe = {
      id: THULE_ID,
      name: 'Captain Brannoc Thule',
      rank: 5,
      alert: 2,
      distance,
      health: this.run?.boss ? this.run.boss.health / Math.max(1, this.run.boss.healthMax) : 1,
      engaged: true,
    };
    const heard = hearFoot({ kind: 'sea' }, fight);
    const foes = heard.foes.filter((foe) => foe.rank < thule.rank);
    const beaten = !!this.run?.outcome;
    return { ...heard, dead: heard.dead || beaten, foes: this.coming || this.fought ? [...foes, thule] : foes };
  }

  frame(tick: Tick): StoryFrame | null {
    if (this.failure) throw this.failure;
    const run = this.run;
    if (!run) return null;
    const { story } = this;
    const { stage, walker, firstPerson } = story;
    this.clock += tick.seconds;
    // No storm's strikes on the wreck; its one is the strike behind Thule as he cries out.
    const [wakeX, wakeY] = this.layout.wake.at;
    const strike = story.lightning.step(tick.seconds, [wakeX, wakeY]);
    stage.stepWeather(tick.seconds, strike.flash, strike.bolt);
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
    const [thuleX, thuleY] = this.layout.arena.thule;
    const own = shown.fight.own;
    this.heard = this.hearing(shown.fight, own ? Math.hypot(own.x - thuleX, own.y - thuleY) : 0);
    this.fallen(shown.fight.own?.action.kind === 'dead');
    this.end(tick.seconds, !!run.outcome);
    const { footView, hud, scene } = stage.parts;
    const fight = footView.frame(run, shown, tick.seconds, {
      size: tick.size,
      viewport: tick.viewport,
      groundAt: (x, y) => scene.groundAt(x, y),
    });
    hud.hints(held ? [] : shown.hints);
    // Read every frame, a cutscene's too, so a turn the camera makes for it is never taken for the player's look.
    const tasks = this.lessons.frame(this.didNow(run, shown.fight, tick.seconds));
    hud.tasks.show(held ? null : tasks);
    hud.reach(shown.standing);
    const thule = coming ? this.thuleActor(tick.clock - coming.since) : null;
    const hands =
      walker.inFirstPerson && !coming
        ? (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => firstPerson.draw(encoder, view, over)
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
      heard: { at: 'sea', deck: true, sailing: false },
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

  /** What the player did this frame, for the tasks: where they stand and look, what their fight does, the foes
   *  alive, and whether the boss fight is on. */
  private didNow(run: WreckRun, fight: FootFight, seconds: number): Done {
    const { body, yaw } = this.story.walker.player;
    // The crew stand on the players' side: neither counted as foes nor taken for one coming at the player.
    const hostile = fight.foes.filter((foe) => foe.view.side === 'foes' && foe.view.health > 0);
    const engaged = hostile.some((foe) => foe.view.target === fight.player);
    const action = fight.own?.action.kind;
    return { seconds, x: body.x, y: body.y, yaw, action, foes: hostile.length, engaged, boss: this.fought || run.arena };
  }

  /** A death before the boss fight says what happens, for as long as the player lies dead: the room raises them at
   *  the last checkpoint. Felled in the boss fight, the fight ends, though the run learns it a frame later. */
  private fallen(dead: boolean): void {
    this.story.stage.parts.hud.toast(...(dead && !this.fought ? ['You will rise at the last checkpoint.'] : []));
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
    const { hud, footView, screen } = this.story.stage.parts;
    this.nameplate.hide();
    hud.hints([]);
    hud.reach({ kind: 'inside' });
    footView.hide();
    hud.tasks.show(null);
    hud.toast();
    screen.bars(false);
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    this.run?.leave();
    this.run = null;
  }
}
