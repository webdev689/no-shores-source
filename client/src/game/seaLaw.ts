import type { HeightAt, Point2 } from '../overworld/ground.ts';
import { coastDistance } from '../overworld/islandView.ts';
import { alongNear, PACE_STEPS, type Pace, SHIP_SPEED, type Voyage } from '../overworld/voyage.ts';
import { cellHeight, deckToWorld, type Lying, SLOOP_DECK } from '../ships/deck.ts';
import type { Shot } from './camera.ts';

/** Where a ship lies off a harbour: out from the city's middle through its harbour in steps of `stepM`, past the
 *  shore to water `depthM` deep, then `clearM` on, within `farthestM` of the harbour. */
export const OFFSHORE = { stepM: 50, depthM: 4, clearM: 600, farthestM: 20_000 } as const;

/** A ship's place off a harbour (`through`), out along the way from `from` to it; the harbour itself where no water
 *  that deep lies that way. */
export function offshore(heightAt: HeightAt, from: Point2, through: Point2): Point2 {
  const length = Math.hypot(through[0] - from[0], through[1] - from[1]) || 1;
  const way = [(through[0] - from[0]) / length, (through[1] - from[1]) / length] as const;
  let deepFrom: number | null = null;
  for (let along = 0; along <= OFFSHORE.farthestM; along += OFFSHORE.stepM) {
    const point: Point2 = [through[0] + way[0] * along, through[1] + way[1] * along];
    const ground = heightAt(point[0], point[1]);
    if (Number.isFinite(ground) && ground > -OFFSHORE.depthM) {
      deepFrom = null;
      continue;
    }
    deepFrom ??= along;
    if (along - deepFrom >= OFFSHORE.clearM) return point;
  }
  return through;
}

/** A standing body's eye over its feet, metres (crates/movement/src/body.rs `TUNING.eye`). */
export const STANDING_EYE_M = 1.7;

/** The helm's view, behind the Sloop's wheel on her quarterdeck (her deck's helm spot): how high over the water the
 *  eye stands there at her true scale, a standing eye over her deck, and how far down it looks. */
export const HELM = {
  eyeM: (cellHeight(SLOOP_DECK, ...SLOOP_DECK.helm) ?? 0) + STANDING_EYE_M,
  pitch: 0.1,
} as const;

/** How tall a shot's picture stands at a point, metres: the world its height spans there. A ship that long fills it. */
export function pictureAt(shot: Shot, point: readonly [number, number, number]): number {
  const away = Math.hypot(shot.eye[0] - point[0], shot.eye[1] - point[1], shot.eye[2] - point[2]);
  return 2 * away * Math.tan(shot.fov / 2);
}

/** How tall the picture stands at her (`pictureAt`), metres: on the sea's view, which draws ships `overworldScale`
 *  times their size; on the view shown; and on the view near her (the close view, the helm's, Manage's or the walk's)
 *  it comes down to, `share` of the way there (0 to 1). */
export interface PictureAtHer {
  readonly seaM: number;
  readonly shownM: number;
  readonly nearM: number;
  readonly share: number;
}

/** The scale ships are drawn at: her share of the picture eased from the size the sea's view shows her to her own
 *  size on the near view, by the same ratio each step of `share`, and never under her own size. Held at the sea's
 *  size until her own shows her as large, she would stand still most of the way in, then treble in its last steps,
 *  where the eye's distance falls fastest. The eye coming in, she grows a steady step a notch, and on the near view
 *  she and every ship round her are their own size. */
export function shownScale(overworldScale: number, picture: PictureAtHer): number {
  const share = Math.min(1, Math.max(0, picture.share));
  const held = overworldScale * (picture.shownM / picture.seaM);
  const own = picture.shownM / picture.nearM;
  return Math.max(1, held ** (1 - share) * own ** share);
}

/** Where the eye stands at the helm of a ship as she lies, at the size she lies at. */
export function helmEye(lying: Lying): readonly [number, number, number] {
  const [helmX, helmY] = SLOOP_DECK.helm;
  return deckToWorld(lying, helmX, helmY, HELM.eyeM);
}

/** A port's icon stands over its harbour at sea within this of it, metres: twice a landing's reach, so a port is seen
 *  before the ship can dock there. */
export const PORT_SEEN_M = 60_000;
/** Within this of a harbour the ship is offered to dock there; elsewhere off a coast, to go ashore. */
export const DOCK_REACH_M = 20_000;

/** What a ship is offered off an island: to dock at its port, to go ashore on its coast, or nothing out of reach. */
export type Landfall = { readonly kind: 'dock'; readonly port: string } | { readonly kind: 'ashore' } | null;

/** The landfall offered a ship that lies off an island's coast (`offCoast`), whose port, if it has one, has its harbour
 *  at `harbour`. */
export function landfallOf(
  ship: Point2,
  offCoast: boolean,
  port: { readonly name: string; readonly harbour: Point2 } | null,
): Landfall {
  if (!offCoast) return null;
  const toHarbour = port ? Math.hypot(port.harbour[0] - ship[0], port.harbour[1] - ship[1]) : Infinity;
  return port && toHarbour <= DOCK_REACH_M ? { kind: 'dock', port: port.name } : { kind: 'ashore' };
}

/** How near another continent's coast a ship comes before that landmass is opened and drawn in place of the open
 *  one, metres. */
export const CHART_REACH_M = 60_000;

/** The continent to open as the ship sails: the one whose coast is nearest it, when that is not the open one and
 *  lies within reach; else null, and the open one stays. */
export function continentToOpen(
  ship: Point2,
  continents: readonly { readonly id: string; readonly outline: readonly Point2[] }[],
  openId: string,
  reachM: number = CHART_REACH_M,
): string | null {
  let nearest: { id: string; distance: number } | null = null;
  for (const { id, outline } of continents) {
    const distance = coastDistance(ship, outline);
    if (!nearest || distance < nearest.distance) nearest = { id, distance };
  }
  return nearest && nearest.id !== openId && nearest.distance <= reachM ? nearest.id : null;
}

/** The points of a voyage still ahead of a ship `travelledM` along it, as the sea room takes a course: it sails from
 *  where the ship is through each in turn. */
export function courseAhead(voyage: Voyage, travelledM: number): Point2[] {
  return voyage.points.filter((unused, index) => (voyage.along[index] ?? 0) > travelledM);
}

/** Marks laid farthest first, less any nearer than `gapPx` on the picture to a nearer one kept, so marks of one place
 *  (a city and its port) or far behind one another do not pile up; still farthest first. */
export function declutter<T extends { readonly x: number; readonly y: number }>(
  placed: readonly T[],
  gapPx: number,
): T[] {
  const kept: T[] = [];
  for (let index = placed.length - 1; index >= 0; index--) {
    const mark = placed[index];
    if (mark && kept.every((other) => Math.hypot(other.x - mark.x, other.y - mark.y) >= gapPx)) kept.push(mark);
  }
  return kept.reverse();
}

/** About how wide a letter of a mark's name is, and how tall its name and note are under it, CSS pixels. */
export const LABEL = { letterPx: 8, linesPx: 34 } as const;

/** The marks whose names show, of marks laid farthest first: nearest first, a name shows where the box it takes
 *  under its mark meets no name shown already, so names never print over each other. */
export function namesShown(
  marks: readonly {
    readonly id: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly sizePx: number;
  }[],
): Set<string> {
  const shown: { left: number; right: number; top: number; bottom: number }[] = [];
  const named = new Set<string>();
  for (let index = marks.length - 1; index >= 0; index--) {
    const mark = marks[index];
    if (!mark) continue;
    const half = (mark.name.length * LABEL.letterPx) / 2;
    const top = mark.y + mark.sizePx / 2;
    const box = { left: mark.x - half, right: mark.x + half, top, bottom: top + LABEL.linesPx };
    const meets = shown.some(
      (other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
    );
    if (meets) continue;
    shown.push(box);
    named.add(mark.id);
  }
  return named;
}

/** A voyage's time left, as the player reads it: seconds under a minute, then minutes. */
export function timeText(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  return `${Math.round(seconds / 60)} min`;
}

/** How fast the page draws its ship toward where the room has her, a share a second, and how far along her voyage it
 *  looks for that place either side of its own, metres. */
const FOLLOW = { perSecond: 4, windowM: 3_000 } as const;

/** The room's word on the player's ship: where it has her and the pace it sailed her at, held down near a pirate. */
export interface RoomWord {
  readonly x: number;
  readonly y: number;
  readonly pace: number;
}

/** How far along her voyage the ship is `dt` seconds on: at the pace the room last sailed her at and drawn toward where
 *  it has her, the room being the law; while it has not taken her course yet (`room` null), at the pace it last sailed
 *  her at (`held`) while she was under way, else at the pace she is sailed at (`sailed`). Each by `way`, the share of
 *  her pace the canvas she keeps leaves her, as the room sails her (crates/room/src/sea.rs). */
export function followed(
  voyage: Voyage,
  travelledM: number,
  dt: number,
  sailed: SailedPace,
  room: RoomWord | null,
  held: number | null = null,
  way = 1,
): number {
  const seconds = Math.max(0, dt);
  // The room sails her at its last pace until it takes the course: matching it, she never drifts off where it has her.
  const asked = SHIP_SPEED * way * (held !== null && held > 0 ? held : sailed);
  if (!room) return travelledM + asked * seconds;
  const ahead = travelledM + SHIP_SPEED * way * room.pace * seconds;
  const there = alongNear(voyage, [room.x, room.y], ahead, FOLLOW.windowM);
  return there === null ? ahead : ahead + (there - ahead) * Math.min(1, seconds * FOLLOW.perSecond);
}

/** What the voyage's line adds while the room holds her under the pace she is sailed at: a pirate near. */
export const heldNote = (sailed: SailedPace, room: RoomWord | null): string =>
  room && room.pace > 0 && room.pace < sailed ? ` · Held to ×${room.pace}: a pirate near` : '';

/** The world's own time, a pace of 1 (crates/room/src/sea.rs `WORLD_PACE`): a ship is sailed at it while watched close,
 *  so she is seen at her true speed. */
export const WORLD_PACE = 1;
/** The pace a ship is sailed at: her dial's step, or the world's own time while the view is close on her. */
export type SailedPace = Pace | typeof WORLD_PACE;
/** The ladder the sailed pace eases along, DFO's steps down to the world's own time, and the seconds a step takes. */
const EASED_LADDER: readonly SailedPace[] = [WORLD_PACE, ...PACE_STEPS];
export const PACE_EASE_S = 0.15;

/** The next step of the sailed pace eased toward the view's: down the ladder to the world's own time while the view is
 *  close on her (`watched`), back up to the dial's step while it is not. */
export function easedPace(sailed: SailedPace, dial: Pace, watched: boolean): SailedPace {
  const [from, to] = [EASED_LADDER.indexOf(sailed), EASED_LADDER.indexOf(watched ? WORLD_PACE : dial)];
  return EASED_LADDER[from + Math.sign(to - from)] ?? dial;
}

/** Whether the room's word on her pace (`room`) disagrees with the pace she is sailed at, so the page asks it again:
 *  a step the room refused. A slower word with a hostile ship within `holdReachM` (the rules' furthest hold,
 *  crates/room/src/threat.rs `hold_reach_m`) is the room holding her, not a refusal; no word yet, or at rest, says
 *  nothing. */
export function paceToAskAgain(
  sailed: SailedPace,
  room: RoomWord | null,
  hostiles: readonly { readonly x: number; readonly y: number }[],
  holdReachM: number,
): boolean {
  if (!room || room.pace === 0 || room.pace === sailed) return false;
  const near = hostiles.some((ship) => Math.hypot(ship.x - room.x, ship.y - room.y) <= holdReachM);
  return room.pace > sailed || !near;
}

/** What the voyage's line adds while the pace is eased under the dial's for the view. */
export const easedNote = (sailed: SailedPace, dial: Pace): string =>
  sailed < dial ? ' · Sailing at true speed while you watch close.' : '';

/** What the sea's note says of its room: only a link lost, or a room being joined again; nothing while all is well. */
export function roomWords(room: { readonly rejoining: boolean } | null, lost: boolean): string {
  if (room) return room.rejoining ? ' · Reconnecting…' : '';
  return lost ? ' · The sea room was lost: sailing on alone' : '';
}
