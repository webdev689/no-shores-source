// The eleven ambiences, each its own: what beds lie under it, where they stand, and the voices heard over them, how
// often by the time of day, where each is placed round the listener and what drives it. Data only; the laws are
// law.ts's, the making the worker's, the playing ambience.ts's.

import type { BedKey } from './beds.ts';
import { type AmbienceKey, type ByPhase, always } from './law.ts';
import type { SoundKey } from './sounds.ts';

/** Where a voice is placed round the listener: in the open round them, on the ground near, in the trees, high in the
 *  sky, on the highest ground near, at the sea's edge or over the water past it; in a port city, at its harbour, in
 *  its streets below, on its plaza's ledges or at its smith; aboard, in her hull or her rigging; or at the ear. */
export type Spot =
  | 'around'
  | 'ground'
  | 'canopy'
  | 'sky'
  | 'ridge'
  | 'shore'
  | 'offshore'
  | 'harbour'
  | 'city'
  | 'plaza'
  | 'smithy'
  | 'hull'
  | 'rigging'
  | 'ear';

/** What scales a bed or a voice besides the hour: a ship's way, her stillness, the coast's nearness, the deck's
 *  nearness to the ear, the wind's strength, how hard rain falls, and how hard sand blows. */
export type Drive = 'way' | 'still' | 'coast' | 'deck' | 'wind' | 'rain' | 'sand';

/** A bed: wide about the listener, or standing at a point (the sea's edge, the harbour, the nearest river, the city
 *  below) through a panner, and `breakers` where a shore's waves swell and crash on it. */
export interface BedLayer {
  readonly bed: BedKey;
  readonly gain: number;
  readonly when: ByPhase;
  /** How deep its slow breathing goes, 0 to 1. */
  readonly breath: number;
  readonly at: 'wide' | 'shore' | 'harbour' | 'river' | 'city';
  /** What scales it; several scale it together. */
  readonly drive?: Drive | readonly Drive[];
  /** Its gain rides the sea's swell. */
  readonly swell?: boolean;
  /** How deep the wind's gusts move it, 0 to 1: its gain, and its top opening as a gust blows. */
  readonly gust?: number;
  /** A hiss whose top stays open between gusts: blown sand or snow, which a gust swells but never darkens. */
  readonly bright?: boolean;
  /** Rain: its top opens the harder it falls. */
  readonly brightens?: boolean;
  readonly breakers?: boolean;
  /** How near a standing bed is heard whole, metres, where not its kind's own. */
  readonly near?: number;
  /** A Freesound cue whose recording plays in its place once the owner has picked it. */
  readonly recorded?: string;
}

/** A voice: its sound, or sounds sung in turn through a bout; a Freesound cue to play once picked (with no sound of
 *  its own, it is silent until then); its calls a minute by phase; its bouts; where, how far and how high; its gain at
 *  its panner's near distance and its pitch's spread; and how fast a call drifts as it sounds, metres a second. */
export interface Voice {
  readonly sounds: readonly SoundKey[];
  readonly recorded?: string;
  readonly perMinute: ByPhase;
  readonly bout: readonly [number, number];
  readonly spacing: readonly [number, number];
  readonly at: Spot;
  readonly distance: readonly [number, number];
  readonly lift: readonly [number, number];
  readonly near: number;
  readonly gain: readonly [number, number];
  readonly pitch: readonly [number, number];
  readonly drift: number;
  readonly drive?: Drive;
}

/** How a place answers a sound: its reverberation's length and top, its echoes off walls or hillsides, and how much
 *  of each call is sent to it. */
export interface Room {
  readonly seconds: number;
  readonly corner: number;
  readonly echoes: readonly number[];
  readonly send: number;
}

/** An ambience: its title, its overall level, how it answers, its beds and its voices. */
export interface Scape {
  readonly title: string;
  readonly level: number;
  readonly room: Room;
  readonly beds: readonly BedLayer[];
  readonly voices: readonly Voice[];
}

/** Each spot's distances (m), heights over the ground there (m), and the distance its calls are heard whole at. */
const SPOTS: Readonly<Record<Spot, { distance: [number, number]; lift: [number, number]; near: number }>> = {
  around: { distance: [12, 60], lift: [0.5, 3], near: 8 },
  ground: { distance: [3, 25], lift: [0, 0.3], near: 3 },
  canopy: { distance: [8, 50], lift: [4, 14], near: 6 },
  sky: { distance: [30, 140], lift: [35, 110], near: 15 },
  ridge: { distance: [150, 600], lift: [2, 8], near: 40 },
  shore: { distance: [0, 60], lift: [0, 1], near: 12 },
  offshore: { distance: [20, 90], lift: [10, 35], near: 12 },
  harbour: { distance: [0, 70], lift: [1, 9], near: 10 },
  city: { distance: [0, 90], lift: [1, 6], near: 20 },
  plaza: { distance: [5, 40], lift: [3, 9], near: 4 },
  smithy: { distance: [0, 2], lift: [1, 1.5], near: 4 },
  hull: { distance: [3, 9], lift: [-2.5, 0], near: 2 },
  rigging: { distance: [1, 6], lift: [3, 14], near: 3 },
  ear: { distance: [0.4, 1.5], lift: [-0.3, 0.4], near: 0.5 },
};

const voice = (
  sounds: SoundKey | readonly SoundKey[],
  spot: Spot,
  perMinute: ByPhase,
  more: Partial<Voice> = {},
): Voice => ({
  sounds: typeof sounds === 'string' ? [sounds] : sounds,
  perMinute,
  bout: [1, 1],
  spacing: [0, 0],
  at: spot,
  ...SPOTS[spot],
  gain: [0.5, 1],
  pitch: [0.94, 1.06],
  drift: 0,
  ...more,
});
/** A voice heard only as its Freesound recording, silent until the owner picks one. */
const recordedOnly = (cue: string, spot: Spot, perMinute: ByPhase, more: Partial<Voice> = {}): Voice => ({
  ...voice([], spot, perMinute, more),
  recorded: cue,
});

const bed = (key: BedKey, gain: number, more: Partial<BedLayer> = {}): BedLayer => ({
  bed: key,
  gain,
  when: always(1),
  breath: 0.4,
  at: 'wide',
  ...more,
});

/** A number of calls a minute through the phases a voice keeps: the day's birds (loudest at the dawn's chorus), the
 *  day's alone, the evening's, the night's. */
const dawnChorus = (perMinute: number): ByPhase => ({ dawn: perMinute * 1.6, day: perMinute, dusk: perMinute * 0.5 });
const byDay = (perMinute: number): ByPhase => ({ dawn: perMinute * 0.7, day: perMinute, dusk: perMinute * 0.3 });
const byNight = (perMinute: number): ByPhase => ({ dusk: perMinute * 0.3, night: perMinute, dawn: perMinute * 0.2 });
const evening = (perMinute: number): ByPhase => ({ dusk: perMinute, night: perMinute * 0.8, dawn: perMinute * 0.1 });

/** Gulls wherever the sea is near: the recording once picked, the synthesiser's until then. */
const GULLS = (perMinute: number) =>
  voice('gull', 'offshore', byDay(perMinute), { recorded: 'amb.sea.gull', drive: 'coast', drift: 4, gain: [0.3, 0.7] });
/** The sea's edge on any island: its surf, breaking as the sea's swell runs in. */
const SURF = (gain: number) => bed('shore.surf', gain, { at: 'shore', breakers: true, breath: 0 });
const RIVER = (gain: number) => bed('water.brook', gain, { at: 'river', breath: 0.2 });
/** Rain wherever it falls: its hiss all round and its patter near, both opening as it falls harder. */
const RAIN = [
  bed('rain.hiss', 0.75, { drive: 'rain', brightens: true, breath: 0.2 }),
  bed('rain.patter', 0.7, { drive: 'rain', brightens: true, breath: 0.3 }),
];
/** A sandstorm's hiss over the ground, where the ground lifts sand. */
const SANDSTORM = bed('wind.sand', 1.4, { drive: 'sand', bright: true, gust: 0.7, breath: 0.3 });
const RAVEN = (perMinute: ByPhase) =>
  voice('raven', 'sky', perMinute, { recorded: 'amb.highland.raven', distance: [40, 160], lift: [20, 60], drift: 6 });

export const SCAPES: Readonly<Record<AmbienceKey, Scape>> = {
  'sea': {
    title: 'The open sea',
    level: 1.38,
    room: { seconds: 0.9, corner: 2500, echoes: [], send: 0.06 },
    beds: [
      bed('sea.swell', 0.8, { swell: true, breath: 0.5 }),
      bed('sea.wash', 0.45, { drive: 'way', swell: true, breath: 0.25 }),
      bed('wind.breeze', 0.3, { gust: 0.5, breath: 0.3 }),
      bed('sea.rigging', 0.35, { gust: 0.6, drive: 'deck', breath: 0.3 }),
      bed('deck.timbers', 0.55, { drive: 'deck', breath: 0.3 }),
      bed('rain.hiss', 0.75, { drive: 'rain', brightens: true, breath: 0.2 }),
      bed('rain.deck', 0.75, { drive: ['rain', 'deck'], brightens: true, breath: 0.25 }),
    ],
    voices: [
      voice('hull.creak', 'hull', always(7), { drive: 'deck', near: 3, gain: [0.4, 0.8] }),
      voice('rope.creak', 'rigging', always(5), { drive: 'deck', gain: [0.4, 0.8] }),
      voice('hull.slap', 'hull', always(8), { drive: 'deck', gain: [0.25, 0.55] }),
      voice('bow.thump', 'hull', always(0.8), { drive: 'way', distance: [6, 10], gain: [0.3, 0.6] }),
      voice('canvas.flap', 'rigging', always(1.2), { drive: 'deck', gain: [0.3, 0.6] }),
      voice('block.knock', 'rigging', always(1.5), {
        drive: 'deck',
        gain: [0.3, 0.6],
        bout: [1, 2],
        spacing: [0.3, 0.9],
      }),
      GULLS(3),
    ],
  },
  'social': {
    title: 'Saltmere: Overlook and its port',
    level: 1.24,
    room: { seconds: 1.7, corner: 3500, echoes: [0.07, 0.13, 0.21], send: 0.14 },
    beds: [
      bed('town.hum', 0.5, { breath: 0.3 }),
      bed('wind.breeze', 0.35, { gust: 0.5, breath: 0.3 }),
      bed('shore.lap', 2.5, { at: 'harbour', breath: 0.2 }),
      SURF(1.2),
      bed('town.crowd', 2.5, {
        at: 'city',
        when: { dawn: 0.3, day: 1, dusk: 0.6, night: 0.08 },
        breath: 0.35,
        recorded: 'amb.social.crowd',
      }),
      bed('sea.rigging', 0.6, { gust: 0.6, at: 'harbour', breath: 0.3 }),
      bed('insects.crickets', 0.35, { when: evening(1) }),
      ...RAIN,
      bed('rain.gutters', 1, { drive: 'rain', breath: 0.2, recorded: 'amb.rain.gutters' }),
    ],
    voices: [
      voice('gull', 'plaza', byDay(2), {
        recorded: 'amb.sea.gull',
        distance: [15, 60],
        lift: [12, 40],
        near: 12,
        drift: 4,
        gain: [0.3, 0.6],
      }),
      voice('gull', 'harbour', byDay(2.5), { recorded: 'amb.sea.gull', lift: [8, 30], near: 40, drift: 4 }),
      voice('bell', 'harbour', always(0.4), {
        bout: [1, 3],
        spacing: [1.4, 1.8],
        near: 120,
        gain: [0.5, 0.7],
        pitch: [0.99, 1.01],
      }),
      voice(['anvil', 'anvil.light'], 'smithy', byDay(1.4), {
        bout: [5, 12],
        spacing: [0.3, 0.42],
        near: 10,
        gain: [0.5, 0.7],
        pitch: [0.98, 1.02],
      }),
      voice('hull.creak', 'harbour', always(3), { near: 40, gain: [0.5, 0.9] }),
      voice('rope.creak', 'harbour', always(2.5), { near: 40, gain: [0.4, 0.8] }),
      voice('halyard', 'harbour', always(1.2), { bout: [2, 5], spacing: [0.35, 1.1], near: 40, gain: [0.3, 0.6] }),
      voice('block.knock', 'harbour', always(1), { near: 40, gain: [0.3, 0.6] }),
      voice('fish.splash', 'harbour', always(0.3), { near: 30, gain: [0.3, 0.6] }),
      voice('hammer', 'city', byDay(0.7), { bout: [3, 8], spacing: [0.42, 0.6], near: 40, gain: [0.5, 0.8] }),
      voice('cart', 'city', byDay(0.5), { drift: 2.5, near: 40, gain: [0.6, 0.9] }),
      voice('pigeon', 'plaza', byDay(1.6), { bout: [1, 3], spacing: [1.4, 2], gain: [0.3, 0.5] }),
      voice('song.sparrow', 'plaza', byDay(2.2), { gain: [0.2, 0.4] }),
      voice('owl.tawny', 'city', byNight(0.5), { distance: [40, 140], lift: [8, 20], near: 30, gain: [0.4, 0.6] }),
    ],
  },
  'temperate-coast': {
    title: "Saltmere's downs and vales",
    level: 1.0,
    room: { seconds: 1.0, corner: 3000, echoes: [], send: 0.07 },
    beds: [
      bed('wind.breeze', 0.9, { gust: 0.5, breath: 0.3 }),
      bed('grass', 0.55, { gust: 0.5, breath: 0.3 }),
      SURF(1),
      ...RAIN,
      RIVER(0.9),
      bed('insects.crickets', 0.6, { when: { dusk: 1, night: 0.8, dawn: 0.1 } }),
    ],
    voices: [
      voice('song.lark', 'sky', byDay(1.6), { distance: [30, 90], lift: [30, 70], gain: [0.4, 0.7] }),
      voice('song.warbler', 'around', dawnChorus(2), { distance: [10, 50], lift: [0.5, 3], gain: [0.3, 0.6] }),
      voice('song.finch', 'canopy', dawnChorus(1.2), { gain: [0.3, 0.6] }),
      voice('song.thrush', 'canopy', { dawn: 1.5, day: 0.4, dusk: 1.8 }, { gain: [0.3, 0.6] }),
      voice('curlew', 'around', byDay(0.6), { distance: [60, 200], gain: [0.4, 0.7] }),
      voice('buzzard', 'sky', byDay(0.35)),
      voice(
        'cuckoo',
        'canopy',
        { dawn: 0.8, day: 0.5 },
        { bout: [4, 10], spacing: [0.9, 1.1], distance: [80, 250], pitch: [0.97, 1.03] },
      ),
      GULLS(3),
      voice('backwash', 'shore', always(1.5), { drive: 'coast', gain: [0.3, 0.6] }),
      voice('owl.tawny', 'canopy', byNight(0.9), { distance: [25, 90], gain: [0.4, 0.6] }),
      voice('owl.deep', 'canopy', byNight(0.25), { distance: [40, 120], gain: [0.4, 0.6] }),
      voice('nightjar', 'ground', { dusk: 0.6, night: 0.4 }, { distance: [30, 120], gain: [0.3, 0.5] }),
    ],
  },
  'highland': {
    title: "Cairnwatch's fells and tors",
    level: 1.17,
    room: { seconds: 2.4, corner: 2500, echoes: [0.42, 0.78], send: 0.1 },
    beds: [
      bed('wind.moan', 1, { gust: 0.6, breath: 0.3 }),
      bed('wind.whistle', 0.3, { gust: 0.8, breath: 0.3 }),
      bed('grass', 0.3, { gust: 0.5, breath: 0.3 }),
      RIVER(1),
      SURF(0.8),
      ...RAIN,
    ],
    voices: [
      voice('wind.gust', 'ridge', always(2), { drive: 'wind', distance: [40, 160], gain: [0.5, 0.9] }),
      voice('rock.whistle', 'ridge', always(0.8), { drive: 'wind', distance: [30, 120], gain: [0.3, 0.6] }),
      voice('rock.fall', 'ridge', always(0.4), { distance: [80, 300], gain: [0.5, 0.9] }),
      RAVEN(always(0.8)),
      voice('buzzard', 'sky', byDay(0.7)),
      voice('curlew', 'around', byDay(0.7), { distance: [60, 220] }),
      voice('song.lark', 'sky', byDay(0.5), { distance: [40, 100], lift: [30, 70], gain: [0.3, 0.5] }),
      voice('wolf.howl', 'ridge', byNight(0.5), { gain: [0.6, 0.9] }),
      voice('wolf.howl.low', 'ridge', byNight(0.3), { gain: [0.6, 0.9] }),
      voice('owl.deep', 'canopy', byNight(0.25), { distance: [40, 140] }),
      GULLS(1.5),
    ],
  },
  'woodland': {
    title: "Elmhaven's woods",
    level: 1.05,
    room: { seconds: 1.9, corner: 3800, echoes: [], send: 0.12 },
    beds: [
      bed('leaves', 0.6, { gust: 0.5, breath: 0.3 }),
      bed('wind.breeze', 0.35, { gust: 0.5, breath: 0.3 }),
      RIVER(0.9),
      bed('insects.crickets', 0.55, { when: { dusk: 0.8, night: 0.6 } }),
      SURF(0.7),
      ...RAIN,
    ],
    voices: [
      voice('song.warbler', 'canopy', dawnChorus(3), { gain: [0.3, 0.6] }),
      voice('song.thrush', 'canopy', { dawn: 2, day: 1, dusk: 2.5 }, { gain: [0.3, 0.6] }),
      voice('song.finch', 'canopy', dawnChorus(1.6), { gain: [0.3, 0.6] }),
      voice('song.wren', 'canopy', dawnChorus(1.2), { lift: [0.3, 3], gain: [0.3, 0.55] }),
      voice('song.chiff', 'canopy', byDay(1), { gain: [0.25, 0.5] }),
      voice('woodpecker', 'canopy', byDay(0.7), { distance: [20, 90], gain: [0.5, 0.8] }),
      voice('cuckoo', 'canopy', byDay(0.5), {
        bout: [4, 10],
        spacing: [0.9, 1.1],
        distance: [80, 250],
        pitch: [0.97, 1.03],
      }),
      voice('dove', 'canopy', byDay(0.7), { gain: [0.3, 0.5] }),
      voice('crow', 'canopy', byDay(0.6), { recorded: 'amb.woodland.crow', distance: [30, 120] }),
      voice('branch.creak', 'canopy', always(1), { gain: [0.3, 0.6] }),
      voice('twig.snap', 'ground', always(0.5), { distance: [6, 30], gain: [0.3, 0.6] }),
      voice('leaf.gust', 'canopy', always(1.4), { drive: 'wind', distance: [10, 40], gain: [0.3, 0.6] }),
      voice('owl.tawny', 'canopy', byNight(1.2), { distance: [20, 80], gain: [0.4, 0.6] }),
      voice('owl.deep', 'canopy', byNight(0.35), { distance: [40, 120], gain: [0.4, 0.6] }),
      voice('wolf.howl', 'ridge', byNight(0.3), { gain: [0.5, 0.8] }),
      GULLS(1),
    ],
  },
  'desert': {
    title: "Sunspire's wastes",
    level: 1.55,
    room: { seconds: 0.7, corner: 4000, echoes: [0.55], send: 0.05 },
    beds: [
      bed('wind.sand', 0.65, { bright: true, gust: 0.7, breath: 0.3 }),
      bed('wind.moan', 0.45, { gust: 0.6, breath: 0.3 }),
      bed('wind.whistle', 0.12, { gust: 0.8, breath: 0.3 }),
      bed('insects.crickets', 0.25, { when: byNight(1) }),
      SURF(0.7),
      ...RAIN,
      SANDSTORM,
    ],
    voices: [
      voice('sand.gust', 'around', always(3), { drive: 'wind', distance: [6, 40], lift: [0, 0.5], gain: [0.5, 0.9] }),
      voice('rock.whistle', 'ridge', always(0.7), { drive: 'wind', distance: [30, 120], gain: [0.3, 0.6] }),
      voice('rock.fall', 'ridge', always(0.25), { distance: [80, 300] }),
      voice('buzzard', 'sky', byDay(0.3)),
      RAVEN(byDay(0.3)),
      voice('fly', 'ear', byDay(0.5), { drift: 0.8, gain: [0.15, 0.3] }),
      voice('jackal.yips', 'ridge', byNight(0.6), { gain: [0.5, 0.8] }),
      voice('owl.deep', 'around', byNight(0.15), { distance: [40, 120] }),
      voice('cricket', 'ground', byNight(1.2), { gain: [0.2, 0.4] }),
      GULLS(0.8),
    ],
  },
  'savanna': {
    title: "Goldreach's grasslands",
    level: 0.84,
    room: { seconds: 0.9, corner: 3200, echoes: [], send: 0.08 },
    beds: [
      bed('grass', 0.9, { gust: 0.5, breath: 0.3 }),
      bed('wind.breeze', 0.5, { gust: 0.5, breath: 0.3 }),
      bed('insects.cicadas', 0.8, { when: { day: 1, dawn: 0.3, dusk: 0.5 }, breath: 0.5 }),
      bed('insects.crickets', 0.6, { when: { dusk: 0.8, night: 1 } }),
      RIVER(0.7),
      SURF(0.7),
      ...RAIN,
    ],
    voices: [
      voice('song.weaver', 'canopy', byDay(2.5), { gain: [0.3, 0.6] }),
      voice('dove', 'canopy', dawnChorus(2), { gain: [0.3, 0.6] }),
      voice('song.fluter', 'canopy', byDay(0.9), { distance: [20, 80], gain: [0.3, 0.6] }),
      voice('buzzard', 'sky', byDay(0.4)),
      voice('cicada', 'canopy', byDay(1.2), { gain: [0.2, 0.45] }),
      voice('fly', 'ear', byDay(0.4), { drift: 0.8, gain: [0.15, 0.3] }),
      voice('hyena.whoops', 'around', byNight(0.5), { distance: [150, 450], near: 40, gain: [0.6, 0.9] }),
      voice('jackal.yips', 'ridge', byNight(0.2)),
      voice('nightjar', 'ground', { dusk: 0.8, night: 0.5 }, { distance: [30, 120], gain: [0.3, 0.5] }),
      voice('owl.deep', 'canopy', byNight(0.3), { distance: [40, 120] }),
      recordedOnly('amb.savanna.lion', 'around', byNight(0.3), { distance: [300, 800], near: 80, gain: [0.6, 0.9] }),
      GULLS(0.8),
    ],
  },
  'rainforest': {
    title: "Mistfall's rainforest",
    level: 0.7,
    room: { seconds: 2.6, corner: 3500, echoes: [], send: 0.15 },
    beds: [
      bed('forest.drips', 1, { breath: 0.4 }),
      bed('insects.cicadas', 0.7, { when: { day: 1, dawn: 0.4, dusk: 0.7 }, breath: 0.5 }),
      bed('insects.crickets', 0.6, { when: { dusk: 0.8, night: 1 } }),
      bed('frogs.chorus', 0.8, { when: { dusk: 0.6, night: 1, dawn: 0.3 } }),
      bed('leaves', 0.3, { gust: 0.5, breath: 0.3 }),
      RIVER(1),
      SURF(0.7),
      ...RAIN,
    ],
    voices: [
      voice('song.fluter', 'canopy', dawnChorus(3), { gain: [0.3, 0.6] }),
      voice('song.warbler', 'canopy', byDay(1), { gain: [0.25, 0.5] }),
      voice('drip', 'canopy', always(6), { distance: [2, 12], lift: [1, 8], near: 2, gain: [0.1, 0.3] }),
      voice('cicada', 'canopy', byDay(2), { gain: [0.2, 0.45] }),
      voice('mosquito', 'ear', always(0.6), { drift: 0.5, gain: [0.08, 0.18] }),
      voice('frog.peeps', 'canopy', { dusk: 2, night: 3 }, { distance: [6, 30], lift: [1, 6], gain: [0.25, 0.5] }),
      voice('frog.croak', 'ground', byNight(1.5), { distance: [6, 30] }),
      voice('woodpecker', 'canopy', byDay(0.3), { distance: [30, 90] }),
      recordedOnly('amb.rainforest.parrot', 'canopy', byDay(1.2), { distance: [20, 80], drift: 5 }),
      voice('owl.deep', 'canopy', byNight(0.4), { distance: [30, 100] }),
      voice('branch.creak', 'canopy', always(0.4)),
      GULLS(0.6),
    ],
  },
  'steppe': {
    title: "Windmere's steppe",
    level: 0.95,
    room: { seconds: 0.8, corner: 3000, echoes: [], send: 0.06 },
    beds: [
      bed('wind.moan', 0.8, { gust: 0.6, breath: 0.3 }),
      bed('grass', 0.85, { gust: 0.5, breath: 0.3 }),
      bed('wind.breeze', 0.45, { gust: 0.5, breath: 0.3 }),
      bed('insects.crickets', 0.55, { when: { dusk: 0.9, night: 0.8 } }),
      RIVER(0.7),
      SURF(0.7),
      ...RAIN,
      SANDSTORM,
    ],
    voices: [
      voice('song.lark', 'sky', byDay(2.2), { distance: [30, 90], lift: [30, 70], gain: [0.4, 0.7] }),
      voice('marmot', 'around', byDay(1.2), { distance: [30, 150], bout: [1, 2], spacing: [2, 4] }),
      voice('buzzard', 'sky', byDay(0.8)),
      voice('wind.gust', 'around', always(1.6), { drive: 'wind', distance: [20, 80], gain: [0.4, 0.8] }),
      RAVEN(byDay(0.25)),
      voice('wolf.howl', 'ridge', byNight(0.6), { gain: [0.6, 0.9] }),
      voice('wolf.howl.low', 'ridge', byNight(0.4), { gain: [0.6, 0.9] }),
      voice('cricket', 'ground', byNight(1), { gain: [0.2, 0.4] }),
      GULLS(0.8),
    ],
  },
  'swamp': {
    title: "Fenhallow's marshes",
    level: 0.78,
    room: { seconds: 1.3, corner: 2600, echoes: [], send: 0.1 },
    beds: [
      bed('insects.marsh', 1, { when: { day: 1, dusk: 1.2, night: 1.4, dawn: 1 }, breath: 0.35 }),
      bed('frogs.chorus', 0.9, { when: { day: 0.3, dawn: 0.5, dusk: 0.8, night: 1 }, breath: 0.4 }),
      bed('shore.lap', 0.35, { breath: 0.4 }),
      bed('wind.breeze', 0.25, { gust: 0.5, breath: 0.3 }),
      RIVER(0.5),
      SURF(0.6),
      ...RAIN,
    ],
    voices: [
      voice('bubbles', 'ground', always(4), { distance: [3, 25], gain: [0.3, 0.6] }),
      voice('frog.croak', 'ground', { dawn: 2, day: 2, dusk: 4, night: 5 }, { distance: [4, 30], gain: [0.3, 0.7] }),
      voice('frog.bull', 'ground', { day: 0.6, dusk: 1.5, night: 2.5 }, { distance: [10, 50], gain: [0.4, 0.8] }),
      voice('frog.peeps', 'ground', byNight(2), { distance: [5, 30], gain: [0.2, 0.45] }),
      voice('mosquito', 'ear', always(1.5), { drift: 0.5, gain: [0.08, 0.2] }),
      voice('fly', 'ear', byDay(0.5), { drift: 0.8, gain: [0.12, 0.25] }),
      voice('fish.splash', 'around', always(0.3), { distance: [10, 40], lift: [0, 0.2] }),
      recordedOnly('amb.swamp.heron', 'around', always(0.4), { distance: [40, 150], gain: [0.5, 0.8] }),
      voice('song.warbler', 'around', byDay(0.8), { distance: [10, 40], lift: [0.5, 2], gain: [0.25, 0.5] }),
      RAVEN(byDay(0.25)),
      voice('owl.deep', 'canopy', byNight(0.5), { distance: [30, 100] }),
      voice('branch.creak', 'canopy', always(0.3)),
      GULLS(0.6),
    ],
  },
  'tundra': {
    title: "Rimeholt's frozen wastes",
    level: 1.26,
    room: { seconds: 1.2, corner: 5000, echoes: [0.6], send: 0.08 },
    beds: [
      bed('wind.moan', 1, { gust: 0.6, breath: 0.3 }),
      bed('wind.whistle', 0.45, { gust: 0.8, breath: 0.3 }),
      bed('wind.snow', 0.55, { bright: true, gust: 0.7, breath: 0.3 }),
      SURF(0.8),
      ...RAIN,
    ],
    voices: [
      voice('wind.gust', 'around', always(2.5), { drive: 'wind', distance: [20, 80], gain: [0.5, 0.9] }),
      voice('rock.whistle', 'ridge', always(0.8), { drive: 'wind', distance: [30, 120], gain: [0.3, 0.6] }),
      voice('ice.creak', 'ground', always(1), { distance: [30, 150], near: 10, gain: [0.5, 0.9] }),
      voice('ice.crack', 'ground', always(0.5), { distance: [40, 200], near: 15, gain: [0.5, 0.9] }),
      voice('ice.ping', 'ground', always(0.7), { distance: [30, 120], near: 10, gain: [0.3, 0.6] }),
      RAVEN(always(0.5)),
      voice('wolf.howl', 'ridge', { day: 0.15, dusk: 0.4, night: 0.7, dawn: 0.3 }, { gain: [0.6, 0.9] }),
      voice('wolf.howl.low', 'ridge', byNight(0.4), { gain: [0.6, 0.9] }),
      voice('owl.deep', 'around', byNight(0.15), { distance: [40, 140] }),
      GULLS(0.8),
    ],
  },
};
