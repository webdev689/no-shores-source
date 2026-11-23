// An Elite Dungeon's encounters as the page shows them, from the room's word alone: the banner under the compass (the
// seals broken of how many, the encounter's name and its one-line task, its progress, a relic's strength, Fury and a
// Reckoning's countdown written large), the compass's places (each unbroken seal's room, then the Court), and the marks
// on the floor (runes and plates that light, dim or flash wrong, the seal stone's ring, the relic's ring and its
// strength, the anchors, the Reckoning's light, the Boss's ward and its dome, its slam and its Fury). The room judges
// everything; this only shows it.
import { EVENT } from '../combat/cues.ts';
import { markRing } from '../combat/marks.ts';
import type { Banner, BannerBeat, BannerTone } from '../combat/publicBanner.ts';
import type { PlaceMark } from '../plus/compass.ts';
import { type EncounterSeen, RUNE, SEAL_KIND, SEAL_STATE, type SealSeen } from '../network/encounterMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { DungeonLayout, EncounterLayout, SealLayout } from './dungeonLayout.ts';
import { markBeam } from './footGear.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number];

/** The room's ticks a second. */
const TICKS_PER_SECOND = 60;
/** Each seal's name, by its kind. */
export const SEAL_NAMES: Readonly<Record<number, string>> = {
  [SEAL_KIND.litany]: 'The Litany',
  [SEAL_KIND.weighing]: 'The Weighing',
  [SEAL_KIND.ascent]: 'The Ascent',
  [SEAL_KIND.holdfast]: 'The Holdfast',
};
export const COURT = 'The Court';

/** The marks' colours: a piece at rest, one showing or stood on, one done, a drained relic's, the anchors', the
 *  Reckoning's light and the Boss's ward. */
const AT_REST: Colour = [0.55, 0.66, 0.9];
const LIT: Colour = [1, 0.84, 0.42];
const DONE: Colour = [0.62, 0.95, 0.55];
const DRAINED: Colour = [0.95, 0.3, 0.25];
const ANCHOR: Colour = [0.78, 0.55, 1];
const LIGHT: Colour = [1, 0.95, 0.75];
const WARD: Colour = [0.72, 0.5, 1];
const FURY: Colour = [1, 0.22, 0.16];
/** A beam over a piece that wants the company now: how tall, and half its width (m). */
const BEAM = { height: 6, half: 0.35 } as const;
/** The Reckoning's beam: taller and wider, seen from anywhere in the end room. */
const LIGHT_BEAM = { height: 12, half: 0.9 } as const;
/** How wide a ring's band is (m), and how far round the Boss its ward's ring stands. */
const BAND_M = 0.12;
const WARD_M = 1.3;
/** An Ascent's pads lit as its way: the band along each top's edge, how far down each face its glow reaches, how far
 *  off the stone both stand (m), and how fast the brightening runs from the first pad to the last (radians a second,
 *  and between pads). */
const PAD_EDGE = { band: 0.12, face: 0.6, off: 0.02, speed: 2.5, step: 1.1 } as const;
/** How opaque a held plate's filled disc is inside its ring. */
const HELD_FILL = 0.3;
/** An anchor at rest, before or between wards: dim, so it is learnt, not called for. */
const ANCHOR_RESTING = 0.3;
/** The dome of light over the warded Boss: its reach round it and how many bands of light draw it. */
const DOME = { reach: 2.2, bands: 6 } as const;
/** How long before Fury begins the banner warns of it (seconds), and how long a landed Reckoning's flash burns. */
const FURY_WARNED_S = 60;
export const FLASH_S = 0.6;

/** The task a seal or the Court sets, in a line: `plates` the Weighing's plates in play. */
export function taskOf(kind: number, plates: number): string {
  if (kind === SEAL_KIND.litany) return 'Step on the runes in the order they light';
  if (kind === SEAL_KIND.weighing) return plates >= 3 ? 'Hold all three plates together' : 'Hold both plates together';
  if (kind === SEAL_KIND.ascent) return 'Climb to the seal stone together';
  return "Hold the relic's ring";
}

/** The seal the banner speaks of: the unbroken one whose room the player stands in, else the unbroken one whose room's
 *  middle is nearest, else none; `inside` whether the player stands in its room. */
function sealHere(
  layout: DungeonLayout,
  plan: EncounterLayout,
  seen: EncounterSeen,
  feet: Point,
): { index: number; inside: boolean } | null {
  const [column, row] = [Math.floor(feet[0] / layout.cell), Math.floor(feet[1] / layout.cell)];
  const room = column >= 0 && row >= 0 && column < layout.columns ? layout.cells[row * layout.columns + column] : -2;
  const unbroken = plan.seals.flatMap((seal, index) =>
    seen.seals[index] && seen.seals[index].state !== SEAL_STATE.broken ? [{ seal, index }] : [],
  );
  const inside = unbroken.find(({ seal }) => seal.room === room);
  if (inside) return { index: inside.index, inside: true };
  const away = ({ seal }: (typeof unbroken)[number]) => {
    const found = layout.rooms[seal.room];
    if (!found) return Infinity;
    const middle = [(found.x + found.width / 2) * layout.cell, (found.y + found.depth / 2) * layout.cell] as const;
    return Math.hypot(middle[0] - feet[0], middle[1] - feet[1]);
  };
  const nearest = unbroken.reduce<(typeof unbroken)[number] | null>(
    (best, each) => (best === null || away(each) < away(best) ? each : best),
    null,
  );
  return nearest ? { index: nearest.index, inside: false } : null;
}

/** The banner's bar under a seal's task: a Litany's runes stepped of how many, an Ascent's players on its stone of
 *  those in its room, any other's share held. */
function barOf(seal: SealSeen): { share: number; label: string } {
  if (seal.kind === SEAL_KIND.litany) {
    const stepped = seal.marks.filter((mark) => mark === RUNE.stepped).length;
    return { share: seal.progress, label: `${stepped} of ${seal.marks.length}` };
  }
  // With nobody in its room an Ascent says how far it was held, never "0 of 0".
  const [holding = 0, living = 0] = seal.marks;
  if (seal.kind === SEAL_KIND.ascent && living > 0) return { share: seal.progress, label: `${holding} of ${living}` };
  return { share: seal.progress, label: `${Math.floor(seal.progress * 100)}%` };
}

/** A count of seconds as minutes and seconds, 1:00. */
const minutes = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** The Court's Fury in the banner's bonus line: its weight once it has begun, its countdown in its last minute. */
function furyOf(seen: EncounterSeen): Banner['bonus'] {
  if (seen.fury > 0) return { text: `Fury ×${(1 + seen.fury / 10).toFixed(1)}`, state: 'warns' };
  const left = Math.ceil(seen.furyTicks / TICKS_PER_SECOND);
  return seen.furyTicks > 0 && left <= FURY_WARNED_S ? { text: `Fury in ${minutes(left)}`, state: 'holds' } : null;
}

/** The banner for an Elite Dungeon at the player's feet: the seal whose room the player stands in, else the nearest
 *  unbroken seal as the next to go to; once the Boss wakes, the Court; with no seal left unbroken, the count alone. */
export function encounterBanner(layout: DungeonLayout, seen: EncounterSeen, feet: Point): Banner | null {
  const plan = layout.encounters;
  if (!plan) return null;
  const broken = seen.seals.filter((seal) => seal.state === SEAL_STATE.broken).length;
  const kicker = `Seals broken ${broken} of ${seen.seals.length}`;
  const plain = { place: '', urgent: false, heroic: null, bonus: null } as const;
  // The Boss fallen, the Court is over: the cache and the portal say the rest.
  if (seen.woken && !seen.boss) return null;
  if (seen.woken) {
    const warned = seen.reckoningTicks > 0;
    const slammed = seen.slamTicks > 0;
    const objective = warned
      ? 'Stand in the light'
      : slammed
        ? 'Get clear of the Boss'
        : seen.ward > 0
          ? 'Break the anchors'
          : 'Defeat the Boss';
    const anchors = seen.anchors.filter((held) => held >= 1).length;
    const bar =
      seen.ward > 0
        ? { share: anchors / Math.max(1, seen.anchors.length), label: `${anchors} of ${seen.anchors.length}` }
        : null;
    const clock = warned ? `${Math.ceil(seen.reckoningTicks / TICKS_PER_SECOND)}` : '';
    const tone: BannerTone = warned ? 'heroic' : 'running';
    return { ...plain, tone, kicker, title: COURT, clock, urgent: warned, objective, bar, bonus: furyOf(seen) };
  }
  const here = sealHere(layout, plan, seen, feet);
  const seal = here === null ? null : seen.seals[here.index];
  if (!seal)
    return {
      ...plain,
      tone: 'next',
      kicker: 'Seals',
      title: `Broken ${broken} of ${seen.seals.length}`,
      clock: '',
      objective: '',
      bar: null,
    };
  const plates = seal.kind === SEAL_KIND.weighing ? seal.marks.length : 0;
  const relic = Math.round(seal.relic * 100);
  return {
    ...plain,
    tone: here?.inside ? 'running' : 'next',
    kicker,
    title: SEAL_NAMES[seal.kind] ?? '',
    clock: '',
    objective: taskOf(seal.kind, plates),
    bar: barOf(seal),
    bonus:
      seal.kind === SEAL_KIND.holdfast
        ? { text: `Relic ${relic}%`, state: relic < 30 ? 'warns' : 'holds' }
        : seal.kind === SEAL_KIND.ascent
          ? { text: 'Foul water harms', state: 'warns' }
          : null,
  };
}

/** The places the compass marks: the middle of each unbroken seal's room, then the end room's once the Boss wakes,
 *  until it falls. */
export function encounterPlaces(layout: DungeonLayout, seen: EncounterSeen): PlaceMark[] {
  const plan = layout.encounters;
  if (!plan) return [];
  const middle = (room: number): PlaceMark | null => {
    const found = layout.rooms[room];
    if (!found) return null;
    return {
      x: (found.x + found.width / 2) * layout.cell,
      y: (found.y + found.depth / 2) * layout.cell,
      kind: 'event',
    };
  };
  if (seen.woken) return seen.boss ? [middle(layout.end)].filter((place) => place !== null) : [];
  return plan.seals
    .filter((seal, index) => seen.seals[index] && seen.seals[index].state !== SEAL_STATE.broken)
    .map((seal) => middle(seal.room))
    .filter((place) => place !== null);
}

/** The banner's beat for the room's events this frame: the Boss woken, a seal broken, a ward raised or broken. */
export function encounterBeat(events: readonly FightEvent[]): BannerBeat | null {
  const beats: Readonly<Record<number, BannerBeat>> = {
    [EVENT.bossWoke]: 'begun',
    [EVENT.sealBroken]: 'stage',
    [EVENT.wardRaised]: 'stage',
    [EVENT.wardBroken]: 'stage',
  };
  return events.reduce<BannerBeat | null>((last, event) => beats[event.kind] ?? last, null);
}

/** The colour `share` of the way from `from` to `to`. */
const mix = (from: Colour, to: Colour, share: number): Colour => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
  from[2] + (to[2] - from[2]) * share,
];

/** A rune's glyph inside its ring, one of its own for each of a Litany's six runes at the most: one, two or three
 *  strokes spaced evenly round its middle, about a dot (the first three) or a small ring (the last three), so no two
 *  runes of a Litany read alike whichever way they are seen. */
function glyphAt(out: number[], middle: Point, reach: number, colour: Colour, alpha: number, nth: number): void {
  const strokes = (nth % 3) + 1;
  for (let stroke = 0; stroke < strokes; stroke += 1) {
    const from = (stroke * 2 * Math.PI) / strokes - Math.PI / 6;
    markRing(out, middle, reach * 0.45, reach * 0.62, [...colour, alpha], [from, from + Math.PI / 3]);
  }
  const heart = nth % 6 < 3 ? [0, reach * 0.14] : [reach * 0.2, reach * 0.3];
  markRing(out, middle, heart[0] ?? 0, heart[1] ?? 0, [...colour, alpha]);
}

/** A ring `reach` round a piece on the floor, a beam over it while `beam`, in `colour` at `alpha`. */
function ringAt(out: number[], middle: Point, reach: number, colour: Colour, alpha: number, beam = false): void {
  markRing(out, middle, Math.max(0, reach - BAND_M), reach, [...colour, alpha]);
  markRing(out, middle, 0.15, 0.3, [...colour, alpha]);
  if (beam) markBeam(out, middle, BEAM, [...colour, alpha]);
}

/** Two triangles of one colour from four corners in turn, each corner's opacity its own. */
function quad(out: number[], corners: readonly (readonly number[])[], colour: Colour, alphas: readonly number[]): void {
  for (const corner of [0, 1, 2, 0, 2, 3]) out.push(...(corners[corner] ?? []), ...colour, alphas[corner] ?? 0);
}

/** An Ascent's pads lit as the way up while its seal holds: a band of the seal's colour along each top's edge and a
 *  glow fading down each face under it, brightening pad by pad from the first to the last in a slow wave, so the way
 *  reads in its order; the last pad, the stone's, in gold. */
function padMarks(out: number[], pads: SealLayout['pads'], seconds: number): void {
  const { band, face, off, speed, step } = PAD_EDGE;
  pads.forEach(([minX, minY, maxX, maxY, top], index) => {
    const colour = index === pads.length - 1 ? LIT : AT_REST;
    const alpha = 0.45 + 0.45 * (0.5 + 0.5 * Math.cos(seconds * speed - index * step));
    const z = top + off;
    // Each side's outer and inner edge on the top, then its face's foot and head just off the stone.
    const sides = [
      [
        [minX, minY],
        [maxX, minY],
        [0, -1],
      ],
      [
        [maxX, minY],
        [maxX, maxY],
        [1, 0],
      ],
      [
        [maxX, maxY],
        [minX, maxY],
        [0, 1],
      ],
      [
        [minX, maxY],
        [minX, minY],
        [-1, 0],
      ],
    ] as const;
    for (const [[fromX, fromY], [toX, toY], [outX, outY]] of sides) {
      const [inX, inY] = [-outX * band, -outY * band];
      const top4 = [
        [fromX, fromY, z],
        [toX, toY, z],
        [toX + inX, toY + inY, z],
        [fromX + inX, fromY + inY, z],
      ];
      quad(out, top4, colour, [alpha, alpha, alpha, alpha]);
      const [startX, startY, endX, endY] = [fromX + outX * off, fromY + outY * off, toX + outX * off, toY + outY * off];
      const sideways = [
        [startX, startY, top],
        [endX, endY, top],
        [endX, endY, top - face],
        [startX, startY, top - face],
      ];
      quad(out, sideways, colour, [alpha, alpha, alpha * 0.15, alpha * 0.15]);
    }
  });
}

/** One seal's marks: a Litany's runes dark, showing under a beam, lit or flashing wrong; a Weighing's plates in play
 *  dim or held; an Ascent's stone ringed on its top pad, lighting as its players stand on it; a Holdfast's ring,
 *  reddening as its relic drains, held or not, and the relic's strength as an arc inside it. None once broken. */
function sealMarks(
  out: number[],
  plan: SealLayout,
  seal: SealSeen,
  reach: EncounterLayout['reach'],
  beat: number,
  seconds: number,
): void {
  if (seal.state === SEAL_STATE.broken) return;
  if (seal.kind === SEAL_KIND.ascent) padMarks(out, plan.pads, seconds);
  if (seal.kind === SEAL_KIND.litany)
    plan.pieces.forEach((rune, index) => {
      const mark = seal.marks[index] ?? RUNE.dark;
      const [colour, alpha, beam]: [Colour, number, boolean] =
        mark === RUNE.wrong
          ? [DRAINED, 1, true]
          : mark === RUNE.showing
            ? [LIT, 1, true]
            : mark === RUNE.stepped
              ? [DONE, 0.95, false]
              : [AT_REST, 0.35 + 0.1 * beat, false];
      markRing(out, rune, reach.rune - BAND_M, reach.rune, [...colour, alpha]);
      if (beam) markBeam(out, rune, BEAM, [...colour, alpha]);
      glyphAt(out, rune, reach.rune, colour, alpha, index);
    });
  if (seal.kind === SEAL_KIND.weighing)
    plan.pieces.slice(0, seal.marks.length).forEach((plate, index) => {
      // At rest under a beam, so every plate in play is found from across the room; held, gold and filled, its beam
      // gone so it never stands in the way of the camera of the player on it.
      const held = seal.marks[index] === 1;
      ringAt(out, plate, reach.plate, held ? LIT : AT_REST, held ? 1 : 0.5 + 0.2 * beat, !held);
      if (held) markRing(out, plate, 0, reach.plate - BAND_M, [...LIT, HELD_FILL]);
    });
  const [first] = plan.pieces;
  if (seal.kind === SEAL_KIND.ascent && first) {
    const [holding = 0, living = 0] = seal.marks;
    const all = living > 0 && holding >= living;
    ringAt(out, first, 0.6, mix(AT_REST, LIT, living > 0 ? holding / living : 0), 0.6 + 0.3 * beat, !all);
  }
  if (seal.kind === SEAL_KIND.holdfast && first) {
    const held = seal.marks[0] === 1;
    const colour = mix(DRAINED, held ? LIT : AT_REST, seal.relic);
    ringAt(out, first, reach.relic, colour, held ? 0.9 : 0.7, !held);
    markRing(out, first, reach.relic - 0.3, reach.relic - 0.15, [...colour, 1], [0, 2 * Math.PI * seal.relic]);
  }
}

/** Every mark of the encounters this frame at `seconds` of the page's clock: each seal's pieces, then while a ward
 *  stands each anchor ringed and filling, a Reckoning's light while one is shown and its flash as it lands (`flash`:
 *  its anchor and the share of its flash left), and round the Boss where `where` finds it its ward and dome, its slam
 *  filling as it comes and its Fury. */
export function encounterMarks(
  plan: EncounterLayout,
  seen: EncounterSeen,
  seconds: number,
  where: (id: number) => Point | null,
  flash: { readonly at: number; readonly share: number } | null = null,
): number[] {
  const out: number[] = [];
  const beat = 0.5 + 0.5 * Math.sin(seconds * 4);
  plan.seals.forEach((seal, index) => {
    const state = seen.seals[index];
    if (state) sealMarks(out, seal, state, plan.reach, beat, seconds);
  });
  // Every anchor shows while the Boss stands, dim at rest so the company learns where they are before a ward.
  const fallen = seen.woken && !seen.boss;
  if (!fallen && seen.ward === 0)
    plan.anchors.forEach((anchor) => ringAt(out, anchor, plan.reach.anchor, ANCHOR, ANCHOR_RESTING));
  if (seen.ward > 0)
    plan.anchors.forEach((anchor, index) => {
      const held = seen.anchors[index] ?? 0;
      ringAt(out, anchor, plan.reach.anchor, held >= 1 ? DONE : ANCHOR, held >= 1 ? 0.9 : 0.55 + 0.3 * beat, held < 1);
      if (held > 0 && held < 1)
        markRing(out, anchor, plan.reach.anchor - 0.3, plan.reach.anchor - 0.15, [...LIT, 1], [0, 2 * Math.PI * held]);
    });
  const light = seen.reckoningTicks > 0 ? plan.anchors[seen.reckoningAt] : undefined;
  if (light) {
    markRing(out, light, plan.reach.light - BAND_M * 2, plan.reach.light, [...LIGHT, 0.7 + 0.3 * beat]);
    markBeam(out, light, LIGHT_BEAM, [...LIGHT, 0.55 + 0.35 * beat]);
  }
  const landed = flash && flash.share > 0 ? plan.anchors[flash.at] : undefined;
  if (landed && flash) {
    const { share } = flash;
    markBeam(out, landed, { height: LIGHT_BEAM.height, half: LIGHT_BEAM.half * (1 + share * 2) }, [...LIGHT, share]);
    markRing(out, landed, 0, plan.reach.light * (1 + (1 - share) * 4), [...LIGHT, share * 0.8]);
  }
  const boss = seen.boss ? where(seen.boss) : null;
  if (boss && seen.ward > 0) {
    markRing(out, boss, WARD_M - 0.2, WARD_M, [...WARD, 0.6 + 0.4 * beat]);
    for (let band = 1; band <= DOME.bands; band += 1) {
      const angle = (band / (DOME.bands + 1)) * (Math.PI / 2);
      const [reach, up] = [DOME.reach * Math.cos(angle), DOME.reach * Math.sin(angle)];
      markRing(out, [boss[0], boss[1], boss[2] + up], reach - BAND_M, reach, [...WARD, 0.35 + 0.2 * beat]);
    }
  }
  if (boss && seen.slamTicks > 0) {
    const coming = 1 - seen.slamTicks / (2 * TICKS_PER_SECOND);
    markRing(out, boss, plan.reach.slam - BAND_M * 2, plan.reach.slam, [...FURY, 0.6 + 0.4 * beat]);
    markRing(out, boss, 0, plan.reach.slam * Math.max(0, Math.min(1, coming)), [...FURY, 0.25]);
  }
  if (boss && seen.fury > 0) markRing(out, boss, WARD_M + 0.1, WARD_M + 0.3, [...FURY, 0.7 + 0.3 * beat]);
  return out;
}
