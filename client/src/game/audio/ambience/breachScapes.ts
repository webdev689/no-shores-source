// A Breach's ambiences, kept apart from the world's (scapes.ts): one for each kind of space of its run, each with the
// cave's air and the drone under it, its own bed over them, the voices of the rock and the water placed round the
// listener, and its own room; and the gate's hollow in the vale, heard over its zone's own with the Spire's hum.
// Underground the sky's hours and weather never reach, so every rate is the same at every hour and nothing is driven
// by wind, rain or sand. Data only; ambience.ts plays them as it plays the world's.

import { type AmbienceKey, type BreachKey, always } from './law.ts';
import { type BedLayer, type Room, SCAPES, type Scape, type Voice, bed, recordedOnly } from './scapes.ts';

/** How loud a scape's beds stand together where nothing drives them: its level times the power sum of the gains of
 *  its wide beds heard by day. Every bed's recording is levelled alike (recordings.ts BED_LOUD), so this is its
 *  loudness but for its calls. */
export function bedLoudness(scape: Pick<Scape, 'level' | 'beds'>): number {
  const steady = scape.beds.filter((layer) => layer.at === 'wide' && !layer.drive && (layer.when.day ?? 0) > 0);
  return scape.level * Math.hypot(...steady.map((layer) => layer.gain));
}

/** The downs' loudness, about -30 LUFS at the first volume: each space stands at it too. */
const LOUDNESS = bedLoudness(SCAPES['temperate-coast']);

/** A space's ambience, its level set so that its beds stand as loud as the downs'. */
const space = (title: string, room: Room, beds: readonly BedLayer[], voices: readonly Voice[]): Scape => ({
  title,
  level: LOUDNESS / bedLoudness({ level: 1, beds }),
  room,
  beds,
  voices,
});

/** The cave's air and the low drone, under every space of the run. */
const UNDER = (cave: number, drone: number) => [
  bed('breach.cave', cave, { breath: 0.3 }),
  bed('breach.drone', drone, { breath: 0.5 }),
];

/** A voice of the rock or the water round the listener: its cue, calls a minute at every hour, how far (m), how high
 *  over or under the ear (m), and how loud. */
const rock = (
  cue: string,
  perMinute: number,
  distance: readonly [number, number],
  lift: readonly [number, number],
  gain: readonly [number, number] = [0.3, 0.6],
  more: Partial<Voice> = {},
): Voice => recordedOnly(cue, 'cave', always(perMinute), { distance, lift, gain, pitch: [0.9, 1.08], ...more });

const DRIP = (perMinute: number) => rock('amb.breach.drip', perMinute, [2, 14], [-1.6, 5], [0.15, 0.4], { near: 2 });
const STONES = (perMinute: number) => rock('amb.breach.stones', perMinute, [6, 35], [-2, 8]);
const CHAIN = (perMinute: number) => rock('amb.breach.chain', perMinute, [6, 25], [0, 6]);
const BELL_FAR = (perMinute: number) =>
  rock('amb.breach.bell.far', perMinute, [40, 120], [0, 12], [0.3, 0.55], { near: 30, pitch: [0.97, 1.03] });
const BUBBLES = (perMinute: number) => rock('amb.breach.bubbles', perMinute, [3, 18], [-1.7, -1.2]);
const CREAK = (perMinute: number) => rock('amb.breach.creak', perMinute, [4, 22], [-0.5, 4]);
const CRYSTAL = (perMinute: number) => rock('amb.breach.crystal', perMinute, [5, 25], [0, 6], [0.2, 0.45]);
const WHISPER = (perMinute: number) =>
  rock('amb.breach.whisper', perMinute, [15, 45], [-1, 3], [0.2, 0.4], { near: 8, pitch: [0.95, 1.05] });
const GROAN = (perMinute: number) =>
  rock('amb.breach.groan', perMinute, [15, 50], [-12, -3], [0.4, 0.7], { near: 12, pitch: [0.85, 1.05] });

export const BREACH_SCAPES: Readonly<Record<BreachKey, Scape>> = {
  'breach.descent': space(
    'The Descent: the old mill race',
    { seconds: 1.6, corner: 3000, echoes: [0.09, 0.17], send: 0.14 },
    [bed('breach.race', 1, { breath: 0.2 }), ...UNDER(0.6, 0.4)],
    [DRIP(5), STONES(1), CREAK(1.2), WHISPER(0.3), GROAN(0.2)],
  ),
  'breach.mending': space(
    "The Mending: the drowned green's still water",
    { seconds: 3, corner: 2500, echoes: [0.25], send: 0.18 },
    [bed('breach.pool', 0.9, { breath: 0.35 }), ...UNDER(0.5, 0.45)],
    [BUBBLES(3), DRIP(5), CRYSTAL(0.6), WHISPER(0.3), GROAN(0.2)],
  ),
  'breach.choir': space(
    'The Choir: the drowned chapel',
    { seconds: 4.5, corner: 2200, echoes: [], send: 0.24 },
    [bed('breach.chapel', 0.9, { breath: 0.3 }), ...UNDER(0.3, 0.45)],
    [BELL_FAR(0.5), WHISPER(0.8), CRYSTAL(0.8), DRIP(2), CREAK(0.6)],
  ),
  'breach.ways': space(
    "The Unlit Ways: the drowned town's cold streets",
    { seconds: 1.8, corner: 3200, echoes: [0.11, 0.23, 0.37], send: 0.16 },
    [bed('breach.streets', 1, { breath: 0.4 }), ...UNDER(0.3, 0.4)],
    [BELL_FAR(0.6), CHAIN(0.8), CREAK(1), STONES(0.8), WHISPER(0.4)],
  ),
  'breach.stair': space(
    'The Broken Stair: the dark below',
    { seconds: 2.8, corner: 2000, echoes: [0.6], send: 0.12 },
    [bed('breach.void', 1, { breath: 0.4 }), ...UNDER(0.3, 0.5)],
    [STONES(1.5), GROAN(0.8), CHAIN(0.5), CRYSTAL(0.3), WHISPER(0.3)],
  ),
  'breach.court': space(
    "The Steward's court: its open dark",
    { seconds: 3.5, corner: 1800, echoes: [0.8], send: 0.1 },
    [bed('breach.void', 0.9, { breath: 0.45 }), ...UNDER(0.3, 0.6)],
    [CHAIN(1), GROAN(0.6), WHISPER(0.6), BELL_FAR(0.3), CRYSTAL(0.5), STONES(0.6)],
  ),
  'breach.hall': space(
    "The Two Shores' hall",
    { seconds: 3.2, corner: 2600, echoes: [0.18, 0.31], send: 0.2 },
    [bed('breach.hall', 0.9, { breath: 0.3 }), bed('breach.rift', 0.5, { breath: 0.3 }), ...UNDER(0.3, 0.45)],
    [CRYSTAL(0.8), CHAIN(0.6), DRIP(2), WHISPER(0.4), CREAK(0.4)],
  ),
  'breach.shore': space(
    'A shore through a rift: its roar',
    { seconds: 2.2, corner: 3000, echoes: [0.4], send: 0.12 },
    [bed('breach.rift', 1, { breath: 0.3 }), ...UNDER(0.4, 0.4)],
    [DRIP(3), BUBBLES(1.5), STONES(0.8), WHISPER(0.5), CRYSTAL(0.4), GROAN(0.3)],
  ),
};

/** The gate's hollow in the Saltgrass Downs, heard over the zone's own near it: its bed standing at the gate, and the
 *  Spire's hum at the Spire rising with its fill while the listener's company holds the Waking. */
export const GATE_SCAPE: Scape = {
  title: 'The Sunken Gate: its hollow',
  level: 1,
  room: { seconds: 1.4, corner: 3000, echoes: [0.12], send: 0.1 },
  beds: [
    bed('breach.hollow', 1, { at: 'gate', near: 20, breath: 0.3 }),
    bed('spire.hum', 1.2, { at: 'spire', near: 15, drive: 'fill', breath: 0.1 }),
  ],
  voices: [],
};

/** Any ambience's scape: the world's, a Breach's space's, or the gate's hollow. */
export function scapeOf(key: AmbienceKey): Scape {
  if (key === 'breach.gate') return GATE_SCAPE;
  return isBreach(key) ? BREACH_SCAPES[key] : SCAPES[key];
}

const isBreach = (key: AmbienceKey): key is BreachKey => key in BREACH_SCAPES;
