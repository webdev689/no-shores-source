// The Art's abilities at the bottom left, as Destiny shows a Super and its abilities: the Anima's icon in a diamond,
// lit from the bottom as it charges and glowing once full; the two Tenets' icons in rings, a dark wedge over each
// sweeping clockwise away as it recharges, its last seconds counted in it, the ring lit once ready. Each has its key on
// a keycap under it. A spell just cast flashes its frame white; while the player cannot cast (staggered, down, dead),
// every icon greys under a hatch; one its road has not earned stands dark under a padlock, saying which road earns it.
// While the room holds the Art unbounded (a house's horde running), each ability glows in the Art's colour, swelling
// slowly (still where less motion is asked), under an infinity mark that says it costs nothing.
// What it shows is worked out from the room's numbers alone; its rings and slots are `ringSlot.ts`'s.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { motionReduced } from '../plus/kit.ts';
import { LOCK_MAP, mapSvg, UNBOUNDED_MAP } from '../player/artGlyphs.ts';
import { roadOf } from '../player/factionNames.ts';
import { ELEMENTS } from '../player/gear.ts';
import type { Child, Node } from '../ui/node.ts';
import { ARMS_SIZES, DIAMOND_CELLS } from './hudLayout.ts';
import { type CapFace, capWords } from './shipAbilityBar.ts';
import {
  flashing,
  framed,
  hatchOver,
  layered,
  ringNode,
  share,
  slotNode,
  type Sweep,
  sweepOf,
  TurnedPictures,
  USED_SECONDS,
  usedRing,
  whole,
} from './ringSlot.ts';

/** The keys the game binds at first to cast the Anima and the two Tenets. */
export const ABILITY_KEYS = ['R', 'Q', 'G'] as const;
/** The Anima's icon's rows: it lights a whole row of its picture at a time. */
export const ANIMA_ROWS = 24;
/** Float error left by a share worked out from ticks, kept from tipping a step. */
const EPSILON = 1e-9;
/** How strong the glow round each ability stands while the Art is unbounded: stronger than a ready one's. */
export const UNBOUNDED_GLOW = 0.85;

/** What the bar is shown from: the Art worn (its id in the Arts' file, 0 for none), how far the Anima has charged,
 *  and how far each Tenet has recharged, each a share from 0 (just cast) to 1 (ready); what its road has earned
 *  (1 the Art, 2 its first Tenet, 4 its second), every bit where none is said; and how many times as long a
 *  recharge takes in the run (a run's Trickle), once where none is said. */
export interface AbilityState {
  readonly art: number;
  readonly animaShare: number;
  readonly tenets: readonly [number, number];
  readonly earned?: number;
  readonly recharge?: number;
  /** Whether the room holds the worn Art unbounded for the player (a house's horde running): nothing costs. */
  readonly unbounded?: boolean;
}

/** What the bar shows: the Art, how many of the Anima's rows are lit from the bottom, whether it is full, each
 *  Tenet's recharge, which of the Anima and the Tenets its road has not yet earned, and whether the room holds the Art
 *  unbounded. */
export interface AbilityShown {
  readonly art: number;
  readonly animaRows: number;
  readonly animaFull: boolean;
  readonly tenets: readonly [Sweep, Sweep];
  readonly locked: readonly [boolean, boolean, boolean];
  readonly unbounded: boolean;
}

/** The pictures the bar draws an Art with, as SVG: its Anima's icon and that icon's outline alone, its two Tenets'
 *  icons, and the Anima's diamond and a Tenet's ring. The game's glyphs make them, so the HUD needs no picture of its
 *  own. */
export interface ArtPictures {
  readonly anima: string;
  readonly animaOutline: string;
  readonly tenets: readonly [string, string];
  readonly diamond: string;
  readonly ring: string;
}

/** A Tenet recharging over `rechargeS` seconds, `charged` of the way. */
export const tenetShown = (charged: number, rechargeS: number): Sweep =>
  sweepOf(charged, (1 - share(charged)) * rechargeS);

/** What the bar shows for `state`. */
export function abilityBarOf(state: AbilityState): AbilityShown {
  const tenets = arts.arts.find((art) => art.id === state.art)?.tenets ?? [];
  const charged = share(state.animaShare);
  const lockedOf = (bit: number) => ((state.earned ?? 0b111) & bit) === 0;
  return {
    art: state.art,
    animaRows: Math.floor(charged * ANIMA_ROWS + EPSILON),
    animaFull: charged >= 1,
    tenets: [
      tenetShown(state.tenets[0], (tenets[0]?.rechargeS ?? 0) * (state.recharge ?? 1)),
      tenetShown(state.tenets[1], (tenets[1]?.rechargeS ?? 0) * (state.recharge ?? 1)),
    ],
    locked: [lockedOf(1), lockedOf(2), lockedOf(4)],
    unbounded: state.unbounded === true,
  };
}

/** Which of the Anima and the two Tenets were spent between `was` and `now`: full before, short of it after. */
export function spentBetween(was: AbilityState | null, now: AbilityState): readonly [boolean, boolean, boolean] {
  const spent = (before: number | undefined, after: number) => before !== undefined && before >= 1 && after < 1;
  const same = was?.art === now.art;
  return [
    same && spent(was.animaShare, now.animaShare),
    same && spent(was.tenets[0], now.tenets[0]),
    same && spent(was.tenets[1], now.tenets[1]),
  ];
}

/** The bar on the HUD, kept each frame from an `AbilityState` and drawn from what it last kept. */
export class AbilityBar {
  private readonly pictures: (art: number) => ArtPictures | null;
  private readonly face: CapFace | null;
  /** The keycaps of the Anima and the two Tenets, as last shown. */
  private keys: readonly [string, string, string] = ABILITY_KEYS;
  private shown: AbilityShown | null = null;
  private state: AbilityState | null = null;
  private unable = false;
  /** How long each of the Anima and the Tenets has to flash yet, having just been cast; and the bar's own clock, which
   *  times the full Anima's glow. */
  private readonly used = [0, 0, 0];
  private clock = 0;
  /** Each picture's SVG with its colours turned, made once. */
  private readonly turned = new TurnedPictures();

  /** With `face`, a key that is no word (a pad's button) stands drawn on its keycap. */
  constructor(pictures: (art: number) => ArtPictures | null, face: CapFace | null = null) {
    this.pictures = pictures;
    this.face = face;
  }

  /** Shows `state` `seconds` on, greyed while the player is `unable` to cast, each over its key in `keys`. */
  update(
    state: AbilityState,
    seconds = 0,
    unable = false,
    keys: readonly [string, string, string] = ABILITY_KEYS,
  ): void {
    this.keys = keys;
    const spent = spentBetween(this.state, state);
    this.shown = abilityBarOf(state);
    this.state = state;
    this.unable = unable;
    this.clock += seconds;
    spent.forEach(
      (cast, index) => (this.used[index] = cast ? USED_SECONDS : Math.max(0, (this.used[index] ?? 0) - seconds)),
    );
  }

  /** Hides the bar until it is next shown a state. */
  hide(): void {
    [this.shown, this.state] = [null, null];
  }

  /** What a screen reader says of each ability: its name, then ready, charging with its share, or its seconds, said
   *  unbounded while the room holds the Art so; or, not yet earned, which road earns it. */
  words(): readonly string[] {
    const shown = this.shown;
    const art = shown && arts.arts.find((each) => each.id === shown.art);
    if (!art || !shown || !this.state) return [];
    const unable = this.unable;
    const free = shown.unbounded && !unable ? 'unbounded, ' : '';
    const lock = (index: number, how: string) => (shown.locked[index] ? `earned on ${roadOf(art.id)}` : free + how);
    const animaWords = shown.animaFull ? 'ready' : `charging, ${Math.floor(share(this.state.animaShare) * 100)}%`;
    return [
      `${art.anima.name} (${capWords(this.keys[0])}), ${lock(0, unable ? 'cannot be cast now' : animaWords)}`,
      ...shown.tenets.map((tenet, index) => {
        const name = art.tenets[index]?.name ?? '';
        const rechargeS = (art.tenets[index]?.rechargeS ?? 0) * (this.state?.recharge ?? 1);
        const left = Math.ceil((1 - share(this.state?.tenets[index] ?? 0)) * rechargeS);
        const how = unable ? 'cannot be cast now' : tenet.ready ? 'ready' : `${left} s to recharge`;
        return `${name} (${capWords(this.keys[index + 1] ?? '')}), ${lock(index + 1, how)}`;
      }),
    ];
  }

  /** The bar at its step (`wide`) and `zoom`: the Anima's diamond and the two Tenets' rings, each over its key; none
   *  without an Art drawn. */
  node(wide: boolean, zoom = 1): Node | null {
    const shown = this.shown;
    const pictures = shown && this.pictures(shown.art);
    const element = shown && ELEMENTS[arts.arts.find((each) => each.id === shown.art)?.element ?? 0];
    if (!shown || !pictures || !element) return null;
    const { cell, gap } = wide ? ARMS_SIZES.wide : ARMS_SIZES.base;
    const unit = cell * zoom;
    const still = motionReduced();
    const unable = this.unable;
    const words = this.words();
    const turned = this.turned;
    const keyOf = (name: string) => `art ${shown.art} ${name}`;
    const glowing = (this.clock / 0.4) % 8;
    const pulse = still ? 2 : 1 + Math.floor(glowing < 4 ? glowing : 8 - glowing) / 1.5;
    const artElement = arts.arts.find((each) => each.id === shown.art)?.element ?? 0;
    const unbounded = shown.unbounded && !unable;
    // The unbounded glow swells over 4 s, slower than a full Anima's, from 2 to 4 pixels.
    const swelling = (this.clock / 0.5) % 8;
    const swell = still ? 3 : 2 + Math.floor(swelling < 4 ? swelling : 8 - swelling) / 2;
    const unboundedGlow = { width: swell, colour: element.colour, opacity: UNBOUNDED_GLOW };
    /** The infinity mark standing above an ability while the Art is unbounded: it costs nothing. One not earned keeps
     *  its padlock alone, as its words say. */
    const freeOver = (): Child =>
      unbounded
        ? {
            width: 11 * unit,
            height: 5 * unit,
            picture: { key: `ability unbounded ${artElement}`, source: { svg: mapSvg(UNBOUNDED_MAP, artElement) } },
            float: { at: [0.5, 0], anchor: [0.5, 1], z: 2 },
          }
        : null;
    /** A padlock over an ability its road has not earned. */
    const lockOver = (index: number): Child =>
      shown.locked[index]
        ? {
            width: 10 * unit,
            height: 12 * unit,
            picture: { key: `ability lock ${artElement}`, source: { svg: mapSvg(LOCK_MAP, artElement) } },
            float: { at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
          }
        : null;
    const diamond = DIAMOND_CELLS * unit;
    const icon = ANIMA_ROWS * unit;
    const [animaLocked] = shown.locked;
    const full = shown.animaFull && !animaLocked;
    const lit = animaLocked ? 0 : Math.round((shown.animaRows / ANIMA_ROWS) * icon);
    const anima = layered(diamond, [
      ...framed(
        turned,
        { key: keyOf('diamond'), svg: pictures.diamond },
        [
          full ? 1 : animaLocked ? 0 : 0.45,
          flashing(this.used[0] ?? 0, still) ? 3 : full ? 1 : animaLocked ? 0.5 : 0.8,
        ],
        unbounded && !animaLocked
          ? { ...unboundedGlow, width: Math.round(swell * zoom) }
          : full
            ? { width: Math.round(pulse * zoom), colour: element.colour, opacity: 0.45 }
            : null,
        diamond,
        unable,
      ),
      {
        width: icon,
        height: icon,
        float: { at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
        children: [
          whole(turned.picture(keyOf('anima unlit'), pictures.anima, 0.15, 0.5, unable)),
          whole(turned.picture(keyOf('anima outline'), pictures.animaOutline, 1, 1, unable)),
          lit > 0 && {
            width: 'grow',
            height: lit,
            clip: true,
            float: { at: [0, 1], anchor: [0, 1], z: 1 },
            children: [
              {
                width: icon,
                height: icon,
                picture: turned.picture(keyOf('anima lit'), pictures.anima, 1, 1, unable),
                float: { at: [0, 1], anchor: [0, 1], z: 1, clipped: true },
              },
            ],
          },
        ],
      },
      hatchOver(diamond, unable),
      lockOver(0) ?? freeOver(),
      usedRing(this.used[0] ?? 0, still),
    ]);
    const tenet = (index: 0 | 1): Node => {
      const recharge = shown.tenets[index];
      const locked = shown.locked[index + 1] ?? false;
      const ready = recharge.ready && !locked;
      const look = {
        ring: { key: keyOf('ring'), svg: pictures.ring },
        icon: { key: keyOf(`tenet ${index}`), svg: pictures.tenets[index] },
        frame: [ready ? 1 : locked ? 0 : 0.45, ready ? 1.25 : locked ? 0.5 : 0.8],
        iconTurn: [ready ? 1 : locked ? 0 : 0.5, ready ? 1 : 0.7],
        glow: unbounded && !locked ? unboundedGlow : ready ? { width: 2, colour: element.colour, opacity: 0.45 } : null,
        sweep: locked ? null : recharge,
        unable,
        used: this.used[index + 1] ?? 0,
        over: lockOver(index + 1) ?? freeOver(),
      } as const;
      return ringNode(look, turned, cell, zoom, still);
    };
    const texel = (cell === 2 ? 1 : 2) * zoom;
    const slot = (made: Node, index: number) => {
      const key = this.keys[index] ?? '';
      return slotNode(made, capWords(key), words[index] ?? '', cell, zoom, this.face?.(key, texel) ?? null);
    };
    return {
      label: 'Your Art',
      direction: 'row',
      alignY: 'end',
      gap: gap * zoom,
      children: [slot(anima, 0), slot(tenet(0), 1), slot(tenet(1), 2)],
    };
  }
}
