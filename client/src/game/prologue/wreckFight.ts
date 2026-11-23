// The owner's ninth and tenth beats, played: the player is taught on the wreck's quiet deck (tutorial.ts), the fight
// frozen on a boarder's blows until they parry and dodge; the boarder's bow is taught, a wisp gives them the Storm
// (wispScene.ts) and the next fight freezes to teach each of its abilities (stormTeaching.ts); then they fight through
// the wreck's foes on foot, as on any node,
// each heap across the way clearing as the wave holding it falls; at its end the camera drives forward to Captain
// Brannoc Thule, his nameplate struck in as he cries out, and the arena closes on a fight one on one that cannot be
// won. It ends as the run says, the player felled or overpowered, and the screen fades out on it.
import { Cues } from '../../cinema/cues.ts';
import type { AbilityState } from '../../combat/abilityBar.ts';
import { EVENT } from '../../combat/cues.ts';
import { lookAt, type Point3 } from '../../cinema/rail.ts';
import { foeDress } from '../../player/foeDress.ts';
import { MELEE, RANGED_SLOT } from '../../player/gear.ts';
import { handsFree, type InputFrame } from '../../player/input.ts';
import { type Dressed, dressInGear } from '../footFigures.ts';
import { askedKey } from '../controls.ts';
import type { FootFight } from '../foot.ts';
import { gearScreenOpen, type GearHere } from '../gearScreen.ts';
import { onScreen, type Shot } from '../camera.ts';
import type { Overlay } from '../scene.ts';
import type { Quest } from '../tasks.ts';
import type { Beat, Tick } from './beat.ts';
import { ACTOR_IDS, type Actor } from './actors.ts';
import type { HeardFoe, Hearing } from '../audio/music/directorLaw.ts';
import { type FootHeard, hearFoot } from '../audio/music/hearing.ts';
import { fought } from './music.ts';
import type { Nameplate } from './nameplate.ts';
import { unarmed } from './look.ts';
import { headOnView, type StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { castBetween, CastFreeze, castPrompt, teachable } from './stormTeaching.ts';
import { type Done, Freeze, Tutorial } from './tutorial.ts';
import { WispScene } from './wispScene.ts';
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
/** What the frozen fight asks of the player, naming the key as bound now on the keys or the pad. */
const asked = (lesson: 'parry' | 'dodge'): string =>
  lesson === 'parry' ? `Press ${askedKey('guard')} to parry` : `Press ${askedKey('dodge')} to dodge`;
/** The wreck's fight as the music hears it from the foot's `heard`: no foe of `thule`'s rank or over but him, once he
 *  is `heard`; the player dead only once the fight is `beaten`, so his score's end plays then. A death before him is
 *  not heard: the player rises at the last checkpoint in seconds, and the Boarding plays on. */
export function heardOnWreck(
  heard: Hearing,
  thule: HeardFoe,
  { thuleHeard, beaten }: { readonly thuleHeard: boolean; readonly beaten: boolean },
): Hearing {
  const foes = heard.foes.filter((foe) => foe.rank < thule.rank);
  return { ...heard, dead: beaten, foes: thuleHeard ? [...foes, thule] : foes };
}

/** How far into the wisp's coming a page under development asks to begin the wreck, to picture it: `&wisp=1` at its
 *  start, `&wisp=<n>` n - 1 seconds into it; null for none. */
const wispAsked = (): number | null => {
  if (!import.meta.env?.DEV || typeof location === 'undefined') return null;
  const asked = Number(new URLSearchParams(location.search).get('wisp') ?? NaN);
  return asked >= 1 ? asked - 1 : null;
};

/** While the fight is frozen the world drains this far toward grey under the interface, easing there and back over
 *  this long, so the stop reads as time held. */
const FROZEN_DRAIN = 0.55;
const DRAIN_S = 0.2;

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
  /** The teaching on the wreck's quiet deck, then the fight's own task; and the fight frozen on a blow to teach. */
  private readonly tutorial = new Tutorial(wispAsked() === null ? 'find' : 'wisp');
  private readonly freeze = new Freeze();
  private readonly castFreeze = new CastFreeze();
  /** The wisp's coming, while it plays; the bar of the Storm's abilities and the shots left last frame, for what was
   *  cast and loosed since. */
  private wisp: WispScene | null = null;
  /** Whether the wisp has come, so it comes once however late the room's word of the Storm is. */
  private wispCame = false;
  private abilities: AbilityState | null = null;
  private ammo: number | null = null;
  /** The prompt the frozen fight shows, and how long the reminder after both lessons has left, seconds. */
  private prompting: string | null = null;
  /** How far the world is drained toward grey now, easing toward `FROZEN_DRAIN` while frozen and back after. */
  private drained = 0;
  /** The run's own clock, held while the fight is frozen; and the gear and loadout the player was last dressed in. */
  private playClock: number | null = null;
  private readonly dressed: Dressed = { gear: null, loadout: MELEE };
  /** Whether a Tithe hand and one of the Brig's crew have cried out at each other, seen together. */
  private cried = false;
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
  /** Whether the beat has been left, after which a run that opens late is let go. */
  private left = false;
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
        // Opened after the beat was left: it is let go at once, or its edges, arms and heights would stay set.
        if (this.left) opened.leave();
        else this.run = opened;
      },
      (error: unknown) => (this.failure = error ?? new Error('the wreck did not open')),
    );
  }

  /** Whether the player plays: the pointer is theirs to lock. */
  get playing(): boolean {
    return !!this.run && !this.coming && this.ending === null;
  }

  /** Whether the fight stands frozen on a blow, its world held still with it. */
  get still(): boolean {
    return this.prompting !== null;
  }

  /** The player's gear in the wreck's room, for the menu, while they play. */
  get gear(): GearHere | null {
    return this.playing ? (this.run?.gearHere(this.story.walker.you.dress) ?? null) : null;
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
   *  foe throughout, so his score wakes once (`heardOnWreck`). */
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
    return heardOnWreck(heard, thule, { thuleHeard: !!(this.coming || this.fought), beaten: !!this.run?.outcome });
  }

  frame(tick: Tick): StoryFrame | null {
    if (this.failure) throw this.failure;
    const run = this.run;
    // Held on the picture before it until the wreck is drawn, so the run's camera never plays against its course alone.
    if (!run || this.scenery.coming) return null;
    const { story } = this;
    const { stage, walker, firstPerson } = story;
    this.clock += tick.seconds;
    // Frozen, the fight and its storm stand still: only the player's answer moves them on.
    const frozen = this.frozen(run, tick.controls);
    const seconds = frozen ? 0 : tick.seconds;
    const easing = tick.seconds / DRAIN_S;
    this.drained = frozen ? Math.min(FROZEN_DRAIN, this.drained + easing) : Math.max(0, this.drained - easing);
    this.playClock = this.playClock === null ? tick.clock : this.playClock + seconds;
    this.dress(run);
    const wisp = this.wispFrame(run, tick.seconds, tick.clock);
    // No storm's strikes on the wreck; its one is the strike behind Thule as he cries out.
    const [wakeX, wakeY] = this.layout.wake.at;
    const strike = story.lightning.step(seconds, [wakeX, wakeY]);
    stage.stepWeather(seconds, Math.max(strike.flash, wisp?.flash ?? 0), strike.bolt);
    if (this.coming) {
      this.coming.since += tick.seconds;
      this.coming.cues.step(this.coming.since);
    }
    // Read after its cues: the last of them begins the fight, and the push in is over.
    const coming = this.coming;
    const held = !!coming || !!wisp || this.ending !== null;
    const aspect = tick.size.width / Math.max(1, tick.size.height);
    // Over the menu the player's presses rest, though the room runs on, so what they equip is worn at once.
    const paused = held || gearScreenOpen();
    const shown = run.frame(tick.controls, tick.seconds, this.playClock, {
      paused,
      hands: handsFree(tick.controls, paused) && !held,
      aspect,
      held,
      frozen,
      ...(wisp && { more: wisp.marks }),
    });
    if (run.arena && !this.fought && !coming) this.bossComes(shown.shot);
    const [thuleX, thuleY] = this.layout.arena.thule;
    const own = shown.fight.own;
    this.heard = this.hearing(shown.fight, own ? Math.hypot(own.x - thuleX, own.y - thuleY) : 0);
    this.fallen(shown.fight.own?.action.kind === 'dead');
    this.end(tick.seconds, !!run.outcome);
    const { footView, hud, scene } = stage.parts;
    const fight = footView.frame(run, shown, seconds, {
      size: tick.size,
      viewport: tick.viewport,
      groundAt: (x, y) => scene.groundAt(x, y),
    });
    hud.hints(held ? [] : shown.hints);
    // Read every frame, a cutscene's too, so a turn the camera makes for it is never taken for the player's look.
    const tasks = this.teach(run, shown.fight, seconds);
    hud.tasks.show(held ? null : tasks);
    hud.reach(shown.standing);
    // Until the room's Thule is shown (asked of the rooms' worker, answered a moment later), the story's stands for him.
    const waiting = !coming && this.fought && !run.boss && !run.outcome;
    const thule = coming ? this.thuleActor(tick.clock - coming.since) : waiting ? this.thuleActor(tick.clock) : null;
    const hands =
      walker.inFirstPerson && !coming
        ? (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => firstPerson.draw(encoder, view, over)
        : undefined;
    const heads = new Map([...run.heads(), ...(thule ? [['thule', [thule.x, thule.y, thule.z + 2.2]] as const] : [])]);
    const shot = coming ? this.comingShot() : (wisp?.shot ?? shown.shot);
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
      hulls: this.scenery.hulls,
      after: hands,
      heads,
      focus: [shown.shot.eye[0], shown.shot.eye[1]],
      heard: { at: 'sea', deck: true, sailing: false },
      drain: this.drained,
      dark: shown.dark,
    };
  }

  /** The first Tithe hand the player sees cries out at them, once; and the first time a Tithe hand and one of the
   *  Brig's crew are seen together, they cry out at each other, once. */
  private spot(
    shot: Shot,
    heads: ReadonlyMap<string, readonly [number, number, number]>,
    view: { readonly width: number; readonly height: number },
  ): void {
    if (this.spotted && this.cried) return;
    let [tithe, crew]: (string | undefined)[] = [undefined, undefined];
    for (const [name, point] of heads) {
      const side = name.startsWith('tithe-') ? 'tithe' : name.startsWith('crew-') ? 'crew' : null;
      if (!side || (side === 'tithe' ? tithe : crew) || !headOnView(onScreen(shot, view, point), view)) continue;
      if (side === 'tithe') tithe = name;
      else crew = name;
    }
    if (!this.spotted && tithe) {
      this.spotted = true;
      void this.story.stage.play('survivor', true, { tithe });
    } else if (!this.cried && tithe && crew) {
      this.cried = true;
      void this.story.stage.play('wreck', true, { tithe, crew });
    }
  }

  /** Whether the fight stands frozen this frame on the boarder's blow, its prompt shown while it does. The press that
   *  answers it, with the pointer the game's, lets the blow play on, the press the fight's own; a pointer let go
   *  leaves it frozen until it is taken again. */
  private frozen(run: WreckRun, controls: InputFrame): boolean {
    const { lesson, spell } = this.tutorial;
    const held = !!this.coming || !!this.wisp || this.ending !== null;
    const { player, parryOpen, own, abilities } = run.fight;
    const answer = () => ({
      locked: controls.locked,
      guard: controls.pressed('guard'),
      dodge: controls.pressed('dodge'),
    });
    const parrying = !held && this.freeze.frame(run.boarderView, { player, own, lesson, parryOpen }, answer);
    const foes = () => [...run.fight.foes.values()].map((kept) => kept.view);
    const teaches = !!spell && teachable(spell, own, foes(), abilities);
    const pressed = () => ({ locked: controls.locked, pressed: controls.pressed });
    const casting = !held && !parrying && this.castFreeze.frame(spell, teaches, pressed);
    const frozen = parrying || casting;
    const prompt = parrying && lesson ? asked(lesson) : casting && spell ? castPrompt(spell) : null;
    if (prompt !== this.prompting) {
      this.prompting = prompt;
      this.story.stage.parts.screen.showPrompt(prompt);
    }
    return frozen;
  }

  /** Dresses the player in their gear as the room last sent it, as the game's gear is drawn: the story's steel, the
   *  arms in hand once worn and the bow the other loadout; before its first word, without the arms the ram threw. The
   *  Melee loadout's dress, put away, is the story's dress after the wreck. */
  private dress(run: WreckRun): void {
    const { story } = this;
    const { walker } = story;
    if (!run.gear) {
      walker.you.dress = unarmed(story.dress);
      return;
    }
    const [gear, loadout] = [this.dressed.gear, this.dressed.loadout];
    dressInGear(walker, run.forge, run.gear, this.dressed);
    const { dress } = walker.you;
    const redressed = gear !== this.dressed.gear || loadout !== this.dressed.loadout;
    if (redressed && walker.player.loadout === MELEE)
      story.dress = { ...dress, outfit: { ...dress.outfit, drawn: false } };
  }

  /** The wisp's coming this frame: begun once the bow is taught, from the player's own shot, the room giving them the
   *  Storm as it engulfs them; none once it is over. */
  private wispFrame(run: WreckRun, seconds: number, clock: number): ReturnType<WispScene['frame']> | null {
    if (!this.wispCame && this.tutorial.wantsWisp && !this.coming) {
      this.wispCame = true;
      const { body, facing } = this.story.walker.player;
      const give = () => run.giveStorm();
      this.wisp = new WispScene(
        this.story,
        [body.x, body.y, body.z],
        facing,
        run.restingShot(),
        give,
        wispAsked() ?? 0,
      );
    }
    const shown = this.wisp?.frame(seconds, clock, run.restingShot()) ?? null;
    if (shown?.done) this.wisp = null;
    return shown;
  }

  /** The teaching this frame: what the player did read, the boarder stood when one is wanted, and the waves held
   *  until the duel is won. */
  private teach(run: WreckRun, fight: FootFight, seconds: number): Quest {
    const quest = this.tutorial.frame(this.didNow(run, fight, seconds));
    if (this.tutorial.wantsBoarder(run.boarder)) run.standBoarder();
    const fell = run.boarderPlace;
    if (this.tutorial.bowDrops && fell && run.storyArms.bow === 'none') run.storyArms.dropBow(fell);
    // The wisp's coming holds them too: the room's word of the Storm comes before its end.
    run.holdWaves(this.tutorial.holding || !!this.wisp);
    return quest;
  }

  /** What the player did this frame, for the tasks: where they stand and look, how they move, what their fight does
   *  and what came of it, their arms, the menu, the boarder, the foes alive, and whether the boss fight is on. */
  private didNow(run: WreckRun, fight: FootFight, seconds: number): Done {
    const { body, yaw } = this.story.walker.player;
    const { player } = fight;
    // The crew stand on the players' side: not counted as foes.
    const hostile = fight.foes.filter((foe) => foe.view.side === 'foes' && foe.view.health > 0);
    // A drink's heal is the drinker's own, on either side of its event.
    const befell = (kinds: readonly number[]) =>
      fight.events.some((event) => kinds.includes(event.kind) && event.defender === player);
    const drank = fight.events.some(
      (event) => event.kind === EVENT.healed && (event.striker === player || event.defender === player),
    );
    // An arrow loosed is a shot gone from the bow; a spell cast is its charge spent.
    const ammo = fight.own?.ammo ?? null;
    const loosed = this.ammo !== null && ammo !== null && ammo < this.ammo;
    const abilities = this.abilities;
    [this.ammo, this.abilities] = [ammo, fight.abilities ?? null];
    return {
      seconds,
      x: body.x,
      y: body.y,
      yaw,
      speed: Math.hypot(body.vx, body.vy),
      rising: body.mode === 'air' && body.vz > 0,
      action: fight.own?.action.kind,
      arms: run.storyArms.arms,
      menu: gearScreenOpen(),
      healed: drank,
      parried: befell([EVENT.parried]),
      dodged: befell([EVENT.dodged, EVENT.perfect]),
      boarder: run.boarder,
      foes: hostile.length,
      boss: this.fought || run.arena,
      bow: run.storyArms.bow,
      ranged: this.story.walker.player.loadout === RANGED_SLOT,
      loosed,
      storm: run.storm,
      cast: castBetween(abilities, fight.abilities ?? null),
    };
  }

  /** A death before the boss fight says what happens, for as long as the player lies dead: the room raises them at
   *  the last checkpoint. Felled in the boss fight, the fight ends, though the run learns it a frame later. */
  private fallen(dead: boolean): void {
    const reminder = this.tutorial.reminder;
    const said = dead && !this.fought ? ['You will rise at the last checkpoint.'] : reminder ? [reminder] : [];
    this.story.stage.parts.hud.toast(...said);
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
   *  letterbox's bars down, the player in their story dress, the pointer free, and the run's room let go. */
  leave(): void {
    const { hud, footView, screen } = this.story.stage.parts;
    this.nameplate.hide();
    screen.showPrompt(null);
    this.story.walker.you.dress = this.story.dress;
    hud.hints([]);
    hud.reach({ kind: 'inside' });
    footView.hide();
    hud.tasks.show(null);
    hud.toast();
    screen.bars(false);
    this.wisp?.leave();
    this.wisp = null;
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    this.run?.leave();
    this.run = null;
    this.left = true;
  }
}
