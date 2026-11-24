import type { FightEvent } from '../network/messages.ts';
import type { FighterView } from '../rules/fighters.ts';
import type { Block } from '../rules/movementRules.ts';
import { PLATES } from '../plus/barLayout.ts';
import { COMPASS, headingOf, type PlaceMark } from '../plus/compass.ts';
import { compassNode } from './compassNode.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { ABILITY_KEYS, AbilityBar, type AbilityState, type ArtPictures } from './abilityBar.ts';
import { ammoNode } from './ammoCounter.ts';
import { animaEdgeNode } from './animaMoment.ts';
import { EVENT, edgeArrow, parryCue, threatens } from './cues.ts';
import { FoeBars, type MarkedFoe, type PlateViewing } from './foeBars.ts';
import { FoePlate } from './foePlate.ts';
import { FoeTarget } from './foeTarget.ts';
import { type Box, type Said, Words, wordsOf } from './hitWords.ts';
import { RING, arrowNode, hurtNode, lockMarkNode, parryNode, veilNode } from './hudCues.ts';
import { Callout, callTop } from './callout.ts';
import { contactOf, strokeTravel } from './impacts.ts';
import { type BannerTone, PublicBanner, type PublicShown, StoreBars } from './publicBanner.ts';
import { cameraOf, landBlocks, PLATE_OVER_M } from './plateSight.ts';
import { CARD_NEAREST_M, cardStand } from '../player/figures.ts';
import type { Cards } from '../player/cards.ts';
import { ItemPictures } from '../player/itemPictures.ts';
import { UNABLE } from './casting.ts';
import { CORNER } from '../plus/barFrame.ts';
import { type HudLayout, hudLayout } from './hudLayout.ts';
import { Crosshair, type CrosshairFrame } from './reticle.ts';
import { Vitals } from './vitals.ts';
import { blockedBy, clearOf, clipOf, meets, project, sidesOf, spanOf, veilOf } from './hudPlace.ts';
import { type PlatedPlayer, PlayerPlates } from './playerPlates.ts';
import { type ArmsShown, LOADOUT_KEYS, WeaponRows } from './weapons.ts';
import type { CapFace } from './shipAbilityBar.ts';

/** What the display is drawn from each frame: the player's fighter, the foes, every fighter's place by number, how the
 *  camera projects a point, the canvas's size in CSS pixels, the fight's events since the last frame, whether the view
 *  is the player's own eyes, whether a swing or a dodge was pressed since the last frame, why the link to the room
 *  was lost (null while it holds), and whether it is joining the room again. */
export interface HudFrame {
  readonly own: FighterView | null;
  readonly foes: readonly MarkedFoe[];
  readonly where: (id: number) => readonly [number, number, number] | null;
  readonly matrix: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly events: readonly FightEvent[];
  readonly player: number;
  readonly firstPerson: boolean;
  readonly pressed: boolean;
  readonly lost: string | null;
  readonly rejoining?: boolean;
  /** An Abyss run's revives left (-1 or none in any other room): with none, the room stands no one fallen again. */
  readonly revivesLeft?: number;
  /** Whether the section killed the player too: only Respawn, on its own veil, stands them again. */
  readonly sectionDead?: boolean;
  /** The crosshair: a ranged one while it aims or is out in first person, the melee one while a melee weapon is drawn. */
  readonly crosshair?: CrosshairFrame | null;
  /** The shots left, beside the crosshair, while the Ranged loadout is drawn; null while they are not shown. */
  readonly ammo?: number | null;
  /** The Ranged loadout's capacity, by which few shots left read as low; null unknown. */
  readonly ammoMost?: number | null;
  /** Whether a press of the player's guard now could open a parry window (Fighting's parryOpen), and how many ticks
   *  that window stays open, as the rules give it (Fighting's parryWindow); with none, no ring shows. */
  readonly parryOpen?: boolean;
  readonly parryWindow?: number;
  /** The blocks of the place, which no plate over a figure is seen through. */
  readonly blocks?: readonly Block[];
  /** The land's height under a point (null where none is known), which no plate over a figure is seen through either;
   *  null for a place with no land of its own. */
  readonly groundAt: ((x: number, y: number) => number | null) | null;
  /** The Art's abilities as the bar shows them (Fighting's abilities); none hides the bar. */
  readonly abilities?: AbilityState | null;
  /** Whether the player has just stepped onto an Ammo box they cannot take, their ammunition full (DropsShown's
   *  ammoFull). */
  readonly ammoFull?: boolean;
  /** The loadouts as the weapons' rows show them; none hides them. */
  readonly arms?: ArmsShown | null;
  /** The zone's public event as the display shows it; none where the zone holds none. */
  readonly public?: PublicShown | null;
  /** Where the houses' roads' next goal stands in the room (x, y), which the compass marks; none for none. */
  readonly questAt?: readonly [number, number] | null;
  /** Every other player as their plate over their head is drawn; none for none. */
  readonly players?: readonly PlatedPlayer[];
}

/** The keycaps of the Art's abilities (the Anima's, then each Tenet's) and of the two loadouts: a key's name, or a
 *  pad's button with `pad:` before it. */
export interface HudKeys {
  readonly arts: readonly [string, string, string];
  readonly loadouts: readonly [string, string];
}

/** The keys the game binds at first, for a display given none. */
const FIRST_KEYS: HudKeys = { arts: ABILITY_KEYS, loadouts: LOADOUT_KEYS };

/** A foe winding up an iron blow this near is told to be dodged. */
const IRON_NEAR_M = 12;
/** How long the stamina bar flashes for a swing or a dodge asked with none, and the screen's edge for a blow taken. */
const FLASH_SECONDS = 0.45;
/** A view shorter than this (CSS pixels at its zoom) takes the public banner short, clear of the crosshair. */
const SHORT_VIEW = 480;
/** How far inside the canvas's edge an arrow to a foe off the screen stands, in CSS pixels; and how far clear of the
 *  vitals or the Arts and weapons it stands where it would fall on them: half an arrow and a little more. */
const ARROW_INSET = 28;
const ARROW_CLEAR = 22;
/** How high over a foe's feet its parry ring stands, in metres: round its head (a body is 1.8 m tall); and how far
 *  inside the screen's edge its widest stays, in CSS pixels, where the head would stand beyond it. */
const RING_HEIGHT = 1.6;
const RING_KEPT = 6;
/** How far a parry ring set at the screen's edge stands clear of the vitals and the Arts: its widest's half and a
 *  little more. */
const RING_CLEAR = RING.widest / 2 + RING_KEPT;
/** A word with no striker to meet stands this high over its fighter's feet (metres). */
const WORD_HIGH_M = 1.2;
/** What the player is told on stepping onto an Ammo box they cannot take. */
const AMMO_FULL = 'Ammo full';
/** Foul water's edge: its sick green, how long one harm holds it (the floor harms once a second, seals.rs
 *  DROWNED_EVERY), and how long it takes to rise and to fade, seconds. */
const FOUL = { colour: [96, 150, 24], heldS: 1.5, riseS: 0.25, fadeS: 0.6 } as const;
/** How far under the banner the boss bar stands, past the column's own gap, CSS pixels at the first zoom. */
const BOSS_CLEAR = 6;
/** A plate over a figure at its largest, CSS pixels, for one not yet laid; and how near the top's pieces it may stand
 *  before it is hidden, so it never reads as one of them. */
const PLATE_MOST = { width: 220, height: 48 } as const;
const PLATE_CLEAR = 12;
/** The ids of the top's pieces. */
const TOPS = ['fight-compass', 'fight-banner', 'fight-boss', 'fight-target'] as const;

/** The fight's display over the view, kept each frame from a `HudFrame` and drawn as a layer of the interface. */
export class Hud {
  private readonly vitals = new Vitals();
  private target = new FoePlate({ poise: true, remembers: 'whole' });
  private foeBars = new FoeBars();
  /** The plates over other players, and the one the crosshair rests on within reach. */
  readonly playerPlates = new PlayerPlates();
  private readonly crosshair = new Crosshair();
  private foeTarget = new FoeTarget();
  private readonly words = new Words();
  /** The side the next number with no stroke to follow is thrown to. */
  private nextSide = 1;
  private readonly abilities: AbilityBar | null;
  /** The Arts' and the loadouts' keycaps, as bound now. */
  private readonly caps: () => HudKeys;
  private readonly weapons: WeaponRows;
  private layout: HudLayout = hudLayout(0, 0);
  /** The page's own pieces beside the display (the game's hints), in its CSS pixels, which the arrows keep clear of. */
  private readonly beside: () => readonly Box[];
  /** The foes whose iron wind-up the player has been told of, until it ends. */
  private readonly ironTold = new Set<number>();
  private staminaFlash = 0;
  private hurtFlash = 0;
  /** What the last frame showed: its view, the veil, the shots, the compass's heading, the lock's mark, the target's share shown, the parry rings and the arrows at the edge. */
  private view = { width: 0, height: 0 };
  private veil: ReturnType<typeof veilOf> = null;
  private ammo: { readonly ammo: number | null | undefined; readonly most: number | null } = { ammo: null, most: null };
  private heading: number | null = null;
  /** The public event's banner under the compass, its stores' bars, the places the compass marks round the player
   *  (`from`), and how long the display has run, which the marks blink by. */
  private readonly banner = new PublicBanner();
  private readonly stores = new StoreBars();
  private places: { readonly from: readonly [number, number]; readonly marks: readonly PlaceMark[] } = {
    from: [0, 0],
    marks: [],
  };
  private time = 0;
  /** The quest's mark on the compass and where the player stands, as the last frame had them. */
  private quest: { readonly at: readonly [number, number]; readonly from: readonly [number, number] } | null = null;
  private lockSpot: { readonly x: number; readonly y: number } | null = null;
  private targetShare = 0;
  private rings: readonly {
    readonly x: number;
    readonly y: number;
    readonly span: number;
    readonly window: number;
    readonly kind: 'ring' | 'now' | 'iron';
    /** Set at the screen's edge, its head beyond it: it stands clear of the vitals and the Arts as an arrow does. */
    readonly edge: boolean;
  }[] = [];
  private edges: readonly { readonly x: number; readonly y: number; readonly angle: number }[] = [];
  /** A raid's call over the middle; foul water's green edge as shown, and how much longer its last harm holds it. */
  private readonly callout = new Callout();
  private foulShown = 0;
  private foulHeld = 0;
  /** Where the top's pieces (the compass, the banner, the boss bar, the target's plate, the call) were last laid, which
   *  the words keep under and no plate over a figure shows through. */
  private tops: readonly Box[] = [];
  /** The span down the view the Boss's figure stands in, where it stands across the view's middle; none for none. */
  private bossSpan: { readonly top: number; readonly bottom: number } | null = null;

  /** With `pictures`, the game's pictures of an Art (`abilityPictures`), the Art's abilities stand at the bottom left;
   *  with `forge`, the weapons beside them are drawn as its pictures. The page's own pieces `beside` answers (the game's
   *  hints, CSS pixels) are kept clear of as the display's corners are. With `keys`, the Arts' and the loadouts' keycaps
   *  show the keys `caps` answers each frame, a pad's button drawn on its cap by `face`. */
  constructor(
    pictures: ((art: number) => ArtPictures | null) | null = null,
    forge: Cards | null = null,
    beside: () => readonly Box[] = () => [],
    keys: { readonly caps: () => HudKeys; readonly face: CapFace } | null = null,
  ) {
    this.beside = beside;
    this.caps = keys?.caps ?? (() => FIRST_KEYS);
    this.abilities = pictures && new AbilityBar(pictures, keys?.face);
    this.weapons = new WeaponRows(forge && new ItemPictures(forge), keys?.face);
  }

  /** Forgets every foe the display kept (its target, plates and wind-ups told): a room left, its foes' numbers mean
   *  other foes in the next. */
  forget(): void {
    [this.target, this.foeBars, this.foeTarget] = [
      new FoePlate({ poise: true, remembers: 'whole' }),
      new FoeBars(),
      new FoeTarget(),
    ];
    this.ironTold.clear();
  }

  /** The tone the public event's banner shows in under the compass, none while it shows none. */
  get bannerTone(): BannerTone | null {
    return this.banner.tone;
  }

  /** Whether a Boss's bar stands under the compass. */
  get bossed(): boolean {
    return this.foeBars.bossShown !== null;
  }

  update(frame: HudFrame, seconds: number): void {
    const { own } = frame;
    this.view = { width: frame.width, height: frame.height };
    this.layout = hudLayout(frame.width, frame.height);
    this.vitals.lay(this.layout.length, this.layout.wide);
    this.weapons.lay(this.layout.wide, this.layout.zoom);
    this.flash(frame, seconds);
    this.veil = veilOf(frame);
    this.ammo = { ammo: frame.ammo, most: frame.ammoMost ?? null };
    const spot = (point: readonly [number, number, number]) => {
      const onScreen = project(frame.matrix, point, frame.width, frame.height);
      return onScreen && { ...onScreen, depth: clipOf(frame.matrix, point)[2] };
    };
    const overHead = (view: FighterView) => spot([view.x, view.y, view.z + PLATE_OVER_M]);
    const lock = own?.target ?? null;
    const chosen = this.foeTarget.step({ player: frame.player, lock, foes: frame.foes, events: frame.events }, seconds);
    const { blocks = [], groundAt } = frame;
    const viewing: PlateViewing = {
      camera: cameraOf(frame.matrix),
      blocked: (from, to) => blockedBy(blocks, from, to) || (!!groundAt && landBlocks(groundAt, from, to)),
      fought: (id) => this.foeTarget.foughtShare(id),
      locked: lock,
    };
    this.heading = viewing.camera ? headingOf(viewing.camera.forward) : this.heading;
    const shown = frame.public ?? null;
    this.time += seconds;
    this.places = { from: [own?.x ?? 0, own?.y ?? 0], marks: shown?.places ?? [] };
    this.banner.update(shown?.banner ?? null, seconds, shown?.beat ?? null);
    this.callout.update(shown?.call ?? null, seconds);
    this.foul(shown?.foul ?? null, seconds);
    this.stores.update(
      shown?.stores ?? [],
      (point) => project(frame.matrix, point, frame.width, frame.height),
      seconds,
    );
    this.quest = frame.questAt && own ? { at: frame.questAt, from: [own.x, own.y] } : null;
    const boss = this.foeBars.update(frame.foes, own, overHead, viewing, seconds);
    this.bossSpan = boss && spanOf(frame, boss.view, this.layout.zoom);
    const feet = own && ([own.x, own.y, own.z] as const);
    this.playerPlates.update(frame.players ?? [], { ...viewing, spot, own: feet }, seconds);
    const under = frame.foes.find((foe) => foe.id === this.foeBars.under)?.view ?? null;
    this.crosshair.update(frame.crosshair ?? null, own, under, frame.events, frame.player, seconds);
    this.markTarget(frame, chosen, boss, seconds);
    this.vitals.update(own, seconds, this.staminaFlash > 0, !!chosen || !!boss);
    const caps = this.caps();
    if (frame.abilities)
      this.abilities?.update(frame.abilities, seconds, UNABLE.has(own?.action.kind ?? ''), caps.arts);
    else this.abilities?.hide();
    const arms = frame.arms ?? { gear: null, loadout: 0, drawn: false, dress: null };
    this.weapons.update(arms, own, seconds, caps.loadouts);
    this.edges = this.threats(frame);
    this.rings = this.parries(frame);
    this.floatWords(frame, seconds);
  }

  /** Round the head of each foe at a blow the player can parry, as its figure is drawn, a ring closing onto a fixed
   *  one as the blow lands, its parry window a band on the fixed one, gold once a press would parry it; round an iron
   *  one's, a red mark with no ring. Each is kept on the screen: a head beyond its edge, behind the eye too, has its
   *  ring at the edge the way it lies, as a threat's arrow is. */
  private parries(frame: HudFrame): Hud['rings'] {
    const keep = RING.widest / 2 + RING_KEPT;
    const kept = (place: number, size: number) => Math.max(keep, Math.min(size - keep, place));
    const across = (share: number) => RING.closed + (RING.widest - RING.closed) * share;
    // Its figure's card stands nearer the eye than its body, and in first person no nearer than CARD_NEAREST_M.
    const eye = cameraOf(frame.matrix)?.eye ?? null;
    return frame.foes.flatMap(({ view }): Hud['rings'] => {
      if (frame.parryWindow === undefined) return [];
      const cue = parryCue(view, frame.player, frame.parryWindow, frame.parryOpen ?? true);
      if (!cue) return [];
      const nearest = frame.firstPerson ? CARD_NEAREST_M : 0;
      const stand = eye ? cardStand(view.x, view.y, eye[0], eye[1], nearest) : view;
      const clip = clipOf(frame.matrix, [stand.x, stand.y, view.z + RING_HEIGHT]);
      const edge = edgeArrow(clip, frame.width, frame.height, keep);
      const [clipX, clipY, clipW] = clip;
      const spot = edge
        ? { x: edge.x, y: edge.y }
        : {
            x: kept(((clipX / clipW + 1) / 2) * frame.width, frame.width),
            y: kept(((1 - clipY / clipW) / 2) * frame.height, frame.height),
          };
      const ring = { ...spot, edge: edge !== null };
      if (cue === 'iron') return [{ ...ring, span: RING.closed, window: 0, kind: 'iron' } as const];
      const window = cue.window > 0 ? across(cue.window) : 0;
      return [{ ...ring, span: across(cue.share), window, kind: cue.now ? 'now' : 'ring' } as const];
    });
  }

  /** The stamina bar flashes for a swing or a dodge asked with no stamina; the screen's edge, red, for a blow taken
   *  (never for a drink's heal). */
  private flash(frame: HudFrame, seconds: number): void {
    const { own } = frame;
    if (frame.pressed && own && own.stamina <= 0) this.staminaFlash = FLASH_SECONDS;
    const struck = frame.events.some(
      (event) => event.defender === frame.player && event.amount > 0 && event.kind !== EVENT.healed,
    );
    if (struck) this.hurtFlash = FLASH_SECONDS;
    this.staminaFlash = Math.max(0, this.staminaFlash - seconds);
    this.hurtFlash = Math.max(0, this.hurtFlash - seconds);
  }

  /** The view's edge turns sick green as foul water harms the player, held from one harm to the next while they
   *  stand in it, and fades the moment they leave it. */
  private foul(foul: PublicShown['foul'], seconds: number): void {
    this.foulHeld = !foul ? 0 : foul === 'harmed' ? FOUL.heldS : Math.max(0, this.foulHeld - seconds);
    this.foulShown =
      this.foulHeld > 0
        ? Math.min(1, this.foulShown + seconds / FOUL.riseS)
        : Math.max(0, this.foulShown - seconds / FOUL.fadeS);
  }

  /** The soft lock's mark at its foe's chest, and the target's plate at the top as much as it shows (`chosen`),
   *  unless the boss bar shows that foe already. */
  private markTarget(
    frame: HudFrame,
    chosen: { readonly id: number; readonly share: number } | null,
    boss: MarkedFoe | null,
    seconds: number,
  ): void {
    const lock = frame.own?.target ?? null;
    const locked = frame.foes.find((each) => each.id === lock);
    this.lockSpot =
      (locked &&
        project(frame.matrix, [locked.view.x, locked.view.y, locked.view.z + 1.1], frame.width, frame.height)) ??
      null;
    const foe = chosen && chosen.id !== boss?.id ? frame.foes.find((each) => each.id === chosen.id) : undefined;
    this.target.keep(new Set(frame.foes.map((each) => each.id)));
    this.targetShare = foe && chosen ? chosen.share : 0;
    if (foe) this.target.show(foe, seconds);
  }

  /** Where an arrow at the screen's edge stands toward each foe off the screen at a blow or a draw meant for the
   *  player, until it ends. */
  private threats(frame: HudFrame): Hud['edges'] {
    return frame.foes.flatMap(({ view }) => {
      if (!threatens(view, frame.player)) return [];
      const clip = clipOf(frame.matrix, [view.x, view.y, view.z + 1.1]);
      return edgeArrow(clip, frame.width, frame.height, ARROW_INSET) ?? [];
    });
  }

  /** The events' words, each where its blow met the body, thrown the way the stroke went, and clear of the plates (in
   *  first person, those on the player below the crosshair); a warning over a foe near the player as it begins an
   *  iron wind-up; and "Ammo full" on the player as they step onto an Ammo box they cannot take. */
  private floatWords(frame: HudFrame, seconds: number): void {
    const holding = (id: number) => frame.foes.find((foe) => foe.id === id)?.view.action.kind === 'telegraph';
    const projectWord = (point: readonly [number, number, number]) =>
      project(frame.matrix, point, frame.width, frame.height);
    for (const said of wordsOf(frame.events, frame.player, holding)) {
      const place = frame.where(said.defender);
      if (!place) continue;
      const own = frame.firstPerson && said.defender === frame.player;
      // What a shield took is said in its element's colour.
      const shield = said.tone === 'shield' ? frame.foes.find((foe) => foe.id === said.defender)?.shield : null;
      const told = shield ? { ...said, shield: shield.element } : said;
      const from = said.striker === undefined ? null : frame.where(said.striker);
      const contact = from ? contactOf(place, from) : ([place[0], place[1], place[2] + WORD_HIGH_M] as const);
      this.words.say(told, own ? null : contact, this.sideOf(said, place, from, contact, projectWord));
    }
    for (const { id, view } of frame.foes) {
      const iron = view.action.kind === 'telegraph' && view.action.iron;
      const near = !!frame.own && Math.hypot(view.x - frame.own.x, view.y - frame.own.y) <= IRON_NEAR_M;
      if (!iron) this.ironTold.delete(id);
      else if (near && !this.ironTold.has(id)) {
        this.ironTold.add(id);
        this.words.say({ text: 'Dodge!', tone: 'warn', tags: [] }, [view.x, view.y, view.z + 2.3], 0, 0.5);
      }
    }
    if (frame.ammoFull && frame.own) {
      const { x, y, z } = frame.own;
      const place = frame.firstPerson ? null : ([x, y, z + WORD_HIGH_M] as const);
      this.words.say({ text: AMMO_FULL, tone: 'plain', tags: [] }, place, 0, 0.5);
    }
    this.words.update(projectWord, frame.width, frame.height, seconds, [...this.foeBars.columns, ...this.tops]);
  }

  /** The side of the screen a word is thrown to: the way its stroke's blade travelled as the eye sees it, else one
   *  side and the other in turn for a number, and neither for a word alone. */
  private sideOf(
    said: Said,
    place: readonly [number, number, number],
    from: readonly [number, number, number] | null,
    contact: readonly [number, number, number],
    projectWord: (point: readonly [number, number, number]) => { readonly x: number; readonly y: number } | null,
  ): number {
    const travel = from && strokeTravel(said.stroke ?? 0, from, place);
    const [here, there] = travel
      ? [projectWord(contact), projectWord([contact[0] + travel[0], contact[1] + travel[1], contact[2] + travel[2]])]
      : [null, null];
    if (here && there && Math.abs(there.x - here.x) > 1) return Math.sign(there.x - here.x);
    if (said.amount === undefined) return 0;
    this.nextSide = -this.nextSide;
    return this.nextSide;
  }

  /** The display as the last frame left it, over the whole view, letting the pointer through to the world: what
   *  stands over the world, then the compass's column at the top over it (the compass, the boss bar, the target's
   *  plate), then the veil over all. The arrows keep clear of the vitals and the Arts and weapons where `ui` last laid
   *  them. */
  node(ui: Interface): Node {
    const { zoom, stacked, compassTop } = this.layout;
    const room = this.view.width / zoom;
    const arms = this.armsNode();
    const column = TOPS.flatMap((id) => sidesOf(ui.boxOf(id)) ?? []);
    this.tops = [...column, ...[sidesOf(ui.boxOf('fight-call'))].flatMap((box) => box ?? [])];
    // A plate over a figure standing under the top's pieces is laid unseen, so it never shows through them: its box
    // at its foot this frame, as large as it was last laid (a plate first shown, as large as a plate is at most).
    const hidden = (id: string, x: number, y: number) => {
      const { width, height } = ui.boxOf(id) ?? PLATE_MOST;
      const half = width / 2 + PLATE_CLEAR;
      const box = { left: x - half, right: x + half, top: y - height - PLATE_CLEAR, bottom: y + PLATE_CLEAR };
      return this.tops.some((top) => meets(box, top));
    };
    const short = this.view.height / zoom < SHORT_VIEW;
    // A short view has no room under the column for a call: it stands in the banner's place while it shows, the
    // banner's own words saying the same.
    const inColumn = short && this.callout.shown;
    const banner = inColumn ? this.callout.node(null, zoom, true) : this.banner.node(room, zoom, short);
    const boss = this.foeBars.bossNode(Math.round(Math.min(PLATES.boss.width, PLATES.boss.share * room) * zoom), zoom);
    const top: Node = {
      direction: 'column',
      alignX: 'center',
      gap: COMPASS.gap * zoom,
      width: 'grow',
      float: { to: 'screen', y: stacked ? compassTop : COMPASS.top * zoom, z: 1 },
      children: [
        this.heading !== null && {
          ...compassNode(
            Math.min(COMPASS.width, COMPASS.share * room) * zoom,
            this.heading,
            zoom,
            this.places.from,
            [],
            this.quest?.at ?? null,
            { marks: this.places.marks, time: this.time },
          ),
          id: 'fight-compass',
        },
        // Under the compass, over the boss bar and the target's plate, so neither ever stands on it.
        banner && !inColumn && { ...banner, id: 'fight-banner' },
        inColumn && banner,
        banner && boss && { height: BOSS_CLEAR * zoom },
        boss && { ...boss, id: 'fight-boss' },
        this.targetShare > 0 && this.targetNode(room, zoom),
      ],
    };
    // The page's pieces beside the display are read only while something at the screen's edge keeps clear of them.
    const clear = this.edges.length > 0 || this.rings.some((ring) => ring.edge) ? this.clearing(ui) : null;
    const foul = hurtNode(this.foulShown, FOUL.colour);
    return {
      width: 'grow',
      height: 'grow',
      through: true,
      children: [
        hurtNode(this.hurtFlash / FLASH_SECONDS),
        foul && { ...foul, id: 'fight-foul' },
        this.vitals.node(zoom),
        arms,
        this.lockSpot && lockMarkNode(this.lockSpot),
        ...this.stores.nodes(zoom),
        ...this.playerPlates.nodes(hidden),
        ...this.foeBars.overheadNodes(hidden),
        ...this.rings.map((ring) =>
          parryNode(ring.edge && clear ? clear(ring, RING_CLEAR) : ring, ring.span, ring.kind, ring.window),
        ),
        ...this.edges.map((edge) => (clear ? clear(edge, ARROW_CLEAR) : edge)).map(arrowNode),
        ...this.words.nodes(),
        this.crosshair.node(),
        ammoNode(this.ammo.ammo, this.ammo.most),
        top,
        !inColumn &&
          this.callout.node(
            callTop(this.view.height, Math.max(0, ...column.map((piece) => piece.bottom)), zoom, this.bossSpan),
            zoom,
          ),
        this.veil && veilNode(this.veil),
        animaEdgeNode(),
      ],
    };
  }

  private targetNode(room: number, zoom: number): Child {
    const made = this.target.node({
      kind: 'target',
      width: Math.round(Math.min(340, PLATES.boss.share * room) * zoom),
      zoom,
    });
    return made && { ...made, id: 'fight-target', ...(this.targetShare < 1 ? { opacity: this.targetShare } : {}) };
  }

  /** The Art's abilities and the weapons at the bottom left, the weapons over the Arts in a view too narrow for both. */
  private armsNode(): Child {
    const { zoom, wide, stacked } = this.layout;
    const abilities = this.abilities?.node(wide, zoom) ?? null;
    const weapons = this.weapons.node();
    if (!abilities && !weapons) return null;
    return {
      id: 'fight-arms',
      direction: stacked ? 'column' : 'row',
      alignY: 'end',
      alignX: 'start',
      gap: (wide ? 20 : 14) * zoom,
      float: { to: 'screen', at: [0, 1], anchor: [0, 1], x: CORNER.side * zoom, y: -CORNER.foot * zoom, z: 1 },
      children: stacked ? [weapons, abilities] : [abilities, weapons],
    };
  }

  /** How a spot at the screen's edge, an arrow to a threat off it or a parry ring set there, stands below the vitals
   *  and above the Arts and weapons (and the page's pieces beside the display) where it would fall within `gap` of
   *  them. */
  private clearing(
    ui: Interface,
  ): <Spot extends { readonly x: number; readonly y: number }>(spot: Spot, gap: number) => Spot {
    const vitals = sidesOf(ui.boxOf('fight-vitals'));
    // Above what stands from the foot, the lowest first, so a move past one lands clear of the next.
    const under = [sidesOf(ui.boxOf('fight-arms')), ...this.beside()].flatMap((box) =>
      box && box.right > box.left && box.bottom > box.top ? [box] : [],
    );
    under.sort((one, other) => other.bottom - one.bottom);
    return (edge, gap) => {
      let spot = vitals ? clearOf(edge, vitals, gap, true) : edge;
      for (const box of under) spot = clearOf(spot, box, gap);
      return spot;
    };
  }
}
