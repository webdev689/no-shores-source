import { BarLayout, PLATES } from '../plus/barLayout.ts';
import { motionReduced } from '../plus/kit.ts';
import { TONES } from '../plus/tones.ts';
import type { Child, Node } from '../ui/node.ts';
import { baselineRise } from './barDraw.ts';
import type { FighterView } from '../rules/fighters.ts';
import { BOSS_RANK, PUBLIC_CLIMAX } from '../rules/roster.ts';
import { FoePlate, type MarkedFoe, OVERHEAD_SIZES, plateTier } from './foePlate.ts';
import type { Box } from './hitWords.ts';
import {
  aimedFoe,
  bodyDegrees,
  CONE,
  coneStep,
  coneWant,
  HEAD_M,
  PLATE_RANGE_M,
  PlateSight,
  plateScale,
} from './plateSight.ts';

export type { MarkedFoe } from './foePlate.ts';

const ALERT = { suspicious: 1, alert: 2, searching: 3 } as const;
/** How long a foe that turns alert shows its "!", in seconds. */
export const ALERT_MARK_SECONDS = 1;

/** The mark of a foe's alert state over its name: nothing while idle, "?" while suspicious or searching, "!" for a
 *  moment once it turns alert (`sinceAlert` seconds ago), then nothing while it fights. */
export function alertMark(alert: number, sinceAlert: number): '' | '?' | '!' {
  if (alert === ALERT.suspicious || alert === ALERT.searching) return '?';
  return alert === ALERT.alert && sinceAlert < ALERT_MARK_SECONDS ? '!' : '';
}

/** The Boss in the fight: the nearest to `near` of the living Boss foes that are alert or have been struck. */
export function bossInFight(
  foes: readonly MarkedFoe[],
  near: { readonly x: number; readonly y: number } | null,
): MarkedFoe | null {
  const apart = (foe: MarkedFoe) => (near ? Math.hypot(foe.view.x - near.x, foe.view.y - near.y) : 0);
  const fighting = foes.filter(
    (foe) =>
      (foe.rank === BOSS_RANK || PUBLIC_CLIMAX.has(foe.name)) &&
      foe.view.action.kind !== 'dead' &&
      (foe.alert === ALERT.alert || foe.view.health < foe.view.healthMax),
  );
  return fighting.reduce<MarkedFoe | null>((best, foe) => (best && apart(best) <= apart(foe) ? best : foe), null);
}

/** Where the boss bar marks its health, as shares of the whole: where its phases change. */
export const PHASE_MARKS: readonly number[] = [2 / 3, 1 / 3];

/** What the boss bar shows of a Boss: its name and faction, its health's share, and its phase, 1 to 3 (none for a
 *  public event's climax, a Miniboss of one phase). */
export function bossBarOf(foe: MarkedFoe): { title: string; faction: string; share: number; phase: string } {
  const phase = Math.min(3, Math.max(1, foe.phase));
  const share = Math.max(0, Math.min(1, foe.view.health / Math.max(1, foe.view.healthMax)));
  return { title: foe.name, faction: foe.faction, share, phase: foe.rank >= BOSS_RANK ? `Phase ${phase} of 3` : '' };
}

/** How the plates over figures are seen this frame: the camera (its eye, the way it looks and its focal length; null
 *  when its matrix says none), whether the line between two points is blocked, how much the fight holds a foe's plate
 *  wherever the player looks (1 down to 0, `FoeTarget.foughtShare`), and the foe the soft lock holds, if any. */
export interface PlateViewing {
  readonly camera: {
    readonly eye: readonly [number, number, number];
    readonly forward: readonly [number, number, number];
    readonly focal: number;
  } | null;
  readonly blocked: (from: readonly [number, number, number], to: readonly [number, number, number]) => boolean;
  readonly fought: (id: number) => number;
  readonly locked: number | null;
}

/** A plate over a figure as this frame draws it: where its foot stands (CSS pixels), how much the cone shows of it,
 *  how large it stands and how far in front of the others. */
interface Overhead {
  readonly id: number;
  readonly plate: FoePlate;
  readonly x: number;
  readonly y: number;
  readonly cone: number;
  readonly scale: number;
  readonly front: number;
}

/** Over a living foe its plate, shown for the one nearest the crosshair, the one locked and those fought lately, laid
 *  so none covers another, and under the compass the boss bar of the Boss in the fight, who shows none over its head. */
export class FoeBars {
  readonly boss = new FoePlate({ poise: true, remembers: 'found' });
  private readonly overheads = new Map<number, FoePlate>();
  /** Where each plate was last laid, kept for one fading out of the cone, which lays out nothing new. */
  private readonly places = new Map<number, { readonly lift: number; readonly front: number }>();
  private readonly layout = new BarLayout();
  private readonly sight = new PlateSight();
  /** How much of each plate the cone shows, as last drawn. */
  private readonly cones = new Map<number, number>();
  /** The foe the cone showed last frame. */
  private aimed: number | null = null;
  /** The foe whose body the crosshair rests on, the nearest of several, as last drawn; null for none. */
  under: number | null = null;
  /** The columns the plates over figures stand in this frame, each as wide as its plate from its foot up, which the
   *  blows' words keep clear of. */
  columns: readonly Box[] = [];
  /** The plates over figures this frame, and the Boss on the boss bar. */
  drawn: readonly Overhead[] = [];
  bossShown: MarkedFoe | null = null;
  /** Each foe's alert state as last seen, and the seconds since it last turned alert. */
  private readonly alerts = new Map<number, { alert: number; since: number }>();

  /** Lays the foes' bars, each over the point `spotOf` puts above its head (null off the screen) with how far that is
   *  from the eye, as `viewing` sees them, `seconds` on. Answers the Boss on the boss bar. */
  update(
    foes: readonly MarkedFoe[],
    own: FighterView | null,
    spotOf: (view: FighterView) => { readonly x: number; readonly y: number; readonly depth: number } | null,
    viewing: PlateViewing,
    seconds: number,
  ): MarkedFoe | null {
    const { height } = PLATES.overhead;
    const { camera } = viewing;
    const edge = CONE.degrees + CONE.band / 2;
    const seen: {
      foe: MarkedFoe;
      spot: { x: number; y: number; depth: number };
      since: number;
      off: number;
      held: number;
    }[] = [];
    // Only a foe that can show a plate or take the cone has its line tried against the blocks and the land, so a crowd
    // off the crosshair costs nothing.
    const tried = new Set<number>();
    for (const foe of foes) {
      const was = this.alerts.get(foe.id);
      const turned = foe.alert === ALERT.alert && was?.alert !== ALERT.alert;
      const since = turned ? 0 : (was?.since ?? 0) + seconds;
      this.alerts.set(foe.id, { alert: foe.alert, since });
      const spot = spotOf(foe.view);
      const feet = [foe.view.x, foe.view.y, foe.view.z] as const;
      const head = [feet[0], feet[1], feet[2] + HEAD_M] as const;
      const far = !!camera && Math.hypot(head[0] - camera.eye[0], head[1] - camera.eye[1]) > PLATE_RANGE_M;
      if (foe.view.action.kind === 'dead' || !spot || far) {
        this.cones.delete(foe.id);
        continue;
      }
      // With no camera no angle is known, so the cone shows none.
      const off = camera ? bodyDegrees(camera, feet, HEAD_M) : Number.NaN;
      const kept = foe.held || viewing.locked === foe.id ? 1 : 0;
      const held = foe.rank === BOSS_RANK ? 0 : Math.max(viewing.fought(foe.id), kept);
      if (!(off < edge) && held <= 0 && !(this.cones.get(foe.id) ?? 0)) {
        this.cones.set(foe.id, 0);
        continue;
      }
      tried.add(foe.id);
      // The hold keeps a plate shown from flickering at a railing; one not showing, perhaps long behind a hill no line
      // was tried to, is hidden the moment its line is blocked.
      const blocked = !!camera && viewing.blocked(camera.eye, head);
      if (this.sight.hidden(foe.id, blocked, seconds) || (blocked && !((this.cones.get(foe.id) ?? 0) > 0))) {
        this.cones.delete(foe.id);
        continue;
      }
      seen.push({ foe, spot, since, off, held });
    }
    // A Boss nearest the crosshair takes the cone too, though its bar stands under the compass, not over its head.
    const offs = new Map(seen.map(({ foe, off }) => [foe.id, off]));
    this.aimed = aimedFoe(offs, this.aimed, new Map(seen.map(({ foe, spot }) => [foe.id, spot.depth])));
    // An ally under the crosshair is none of its foes: the rules never strike their own side.
    const aimedAt = seen.find(({ foe }) => foe.id === this.aimed)?.foe;
    const foe = aimedAt && aimedAt.view.side !== 'players' ? aimedAt.id : null;
    this.under = foe !== null && (offs.get(foe) ?? Infinity) <= 0 ? foe : null;
    const shown: {
      foe: MarkedFoe;
      x: number;
      y: number;
      depth: number;
      since: number;
      cone: number;
      want: number;
      scale: number;
    }[] = [];
    for (const { foe, spot, since, off, held } of seen) {
      if (foe.rank === BOSS_RANK) continue;
      const want = coneWant(foe.id === this.aimed ? off : null, held);
      const cone = coneStep(this.cones.get(foe.id) ?? null, want, seconds);
      this.cones.set(foe.id, cone);
      if (cone <= 0) continue;
      shown.push({ foe, ...spot, since, cone, want, scale: plateScale(spot.depth, camera?.focal ?? NaN) });
    }
    // A plate fading out lays out nothing new, so the one taking its place is not lifted over it and then let down.
    const spots = shown
      .filter(({ want }) => want > 0)
      .map(({ foe, x, y, depth, scale }) => ({
        key: foe.id,
        x,
        y,
        depth,
        width: OVERHEAD_SIZES[plateTier(foe.rank)].width * scale,
        height: height * scale,
      }));
    const laid = this.layout.lay(spots, motionReduced() ? Infinity : seconds);
    this.columns = shown.map(({ foe, x, y, scale }) => {
      const width = OVERHEAD_SIZES[plateTier(foe.rank)].width * scale;
      return { left: x - width / 2, right: x + width / 2, top: -Infinity, bottom: y };
    });
    this.drawn = shown.map(({ foe, x, y, since, cone, scale }) => {
      const plate = this.overheads.get(foe.id) ?? new FoePlate();
      this.overheads.set(foe.id, plate);
      // An ally's alertness is the boarders' business, not the player's to read.
      plate.show(foe, seconds, foe.view.side === 'players' ? '' : alertMark(foe.alert, since));
      const place = laid.get(foe.id) ?? this.places.get(foe.id) ?? { lift: 0, front: 0 };
      this.places.set(foe.id, place);
      return { id: foe.id, plate, x, y: y - place.lift, cone, scale, front: place.front };
    });
    // A plate out of the cone is kept for its foe's next showing; one whose foe has gone or fallen is let go.
    const drawn = new Set(shown.map(({ foe }) => foe.id));
    const standing = new Set(foes.filter((foe) => foe.view.action.kind !== 'dead').map((foe) => foe.id));
    for (const id of this.overheads.keys()) {
      if (drawn.has(id)) continue;
      this.places.delete(id);
      if (!standing.has(id)) this.overheads.delete(id);
    }
    const present = new Set(foes.map((foe) => foe.id));
    for (const id of this.alerts.keys()) if (!present.has(id)) this.alerts.delete(id);
    for (const id of this.cones.keys()) if (!present.has(id)) this.cones.delete(id);
    this.sight.keep(tried);
    this.boss.keep(present);
    const boss = bossInFight(foes, own);
    this.bossShown = boss;
    if (boss) this.boss.show(boss, seconds);
    return boss;
  }

  /** The plates over figures, each with its foot just over its foe's head, the nearest drawn over the farther; those
   *  `hidden` says are laid unseen (asked by each one's id and the spot its foot stands at). */
  overheadNodes(hidden: (id: string, x: number, y: number) => boolean = () => false): Node[] {
    const order = [...this.drawn].sort((one, two) => two.front - one.front);
    return order.flatMap(({ id, plate, x, y, cone, scale }) => {
      const made = plate.node({ kind: 'overhead', width: 0, scale });
      const named = `foe-plate-${id}`;
      return made
        ? [
            {
              ...made,
              id: named,
              ...(hidden(named, x, y - 4) ? { opacity: 0 } : cone < 1 ? { opacity: cone } : {}),
              float: { to: 'screen', anchor: [0.5, 1], x, y: y - 4, z: 1 },
            } satisfies Node,
          ]
        : [];
    });
  }

  /** The boss bar, `width` CSS pixels wide at `zoom`: the Boss's name, faction and phase over its health, marked where
   *  its phases change. */
  bossNode(width: number, zoom: number): Child {
    const boss = this.bossShown;
    if (!boss) return null;
    const shown = bossBarOf(boss);
    const small = (words: string): Node => ({
      text: { words: words.toUpperCase(), size: zoom, colour: TONES.wordDim, edge: 'halo', wrap: false },
      offset: [0, -baselineRise(zoom, 2 * zoom)],
    });
    return this.boss.node({
      kind: 'boss',
      width,
      zoom,
      words: [small(shown.faction), { width: 'grow' }, ...(shown.phase === '' ? [] : [small(shown.phase)])],
      marks: PHASE_MARKS,
    });
  }
}
