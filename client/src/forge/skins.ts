type Colour = readonly [number, number, number];
type Ramp = readonly Colour[];

/** Each body's skin ramp a view and each race's ramp on it (the forge's forgeRaceSkins.json). */
export interface RaceSkins {
  readonly bodies: Readonly<
    Record<string, { readonly skin?: readonly Ramp[]; readonly races?: Readonly<Record<string, Ramp>> }>
  >;
}

/** Each body's hair colour ramps, by race, `*` for any race (the forge's forgeHairColours.json). */
export interface HairColours {
  readonly bodies: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, Ramp>>>>>>;
}

const sum3 = (colour: readonly number[]) => (colour[0] ?? 0) + (colour[1] ?? 0) + (colour[2] ?? 0);
const CHANNELS = [0, 1, 2] as const;
/** How wide a race's tone is smoothed, in its ramp's shares either side. */
const TONE_SPAN = 12;

/** A colour along a ramp at a fractional index, the shares either side mixed. */
function along(ramp: Ramp, spot: number): number[] {
  const index = Math.max(0, Math.min(ramp.length - 1, spot));
  const low = Math.floor(index);
  const high = Math.min(ramp.length - 1, low + 1);
  const share = index - low;
  return CHANNELS.map((channel) => (ramp[low]?.[channel] ?? 0) * (1 - share) + (ramp[high]?.[channel] ?? 0) * share);
}

/** The races' mean skin on a body, share for share. */
function racesMean(races: Readonly<Record<string, Ramp>>): Colour[] {
  const ramps = Object.values(races);
  const length = ramps[0]?.length ?? 0;
  return Array.from({ length }, (unused, index) => {
    const mean = CHANNELS.map((channel) => ramps.reduce((total, ramp) => total + (ramp[index]?.[channel] ?? 0), 0));
    return [mean[0] / ramps.length, mean[1] / ramps.length, mean[2] / ramps.length] as const;
  });
}

/** A race's tone at each share of its ramp: its colour over the races' mean, smoothed, held within a third and three
 *  times. */
function raceTones(races: Readonly<Record<string, Ramp>>, ramp: Ramp): Colour[] {
  const mean = racesMean(races);
  const raw = ramp.map((colour, index) =>
    CHANNELS.map((channel) => colour[channel] / Math.max(1, mean[index]?.[channel] ?? 0)),
  );
  return raw.map((unused, index) => {
    const near = raw.slice(Math.max(0, index - TONE_SPAN), index + TONE_SPAN + 1);
    const tone = CHANNELS.map((channel) => {
      const average = near.reduce((total, rawTone) => total + (rawTone[channel] ?? 0), 0) / near.length;
      return Math.max(1 / 3, Math.min(3, average));
    });
    return [tone[0], tone[1], tone[2]] as const;
  });
}

/** A body's skin in a race's colours in one view, for each texel brightness 0..255: the body's own colour at that
 *  share of its ramp times the race's tone there. Null where the race or the body has no skin ramp. */
export function raceSkinLut(skins: RaceSkins, body: string, race: string, view: number): Uint8Array | null {
  const own = skins.bodies[body];
  const ramp = own?.races?.[race];
  const skin = own?.skin?.[view];
  if (!ramp || !skin || !own.races) return null;
  const tones = raceTones(own.races, ramp);
  const lum = skin.map((colour) => sum3(colour) / 3);
  const count = lum.length;
  const first = lum[0] ?? 0;
  const last = lum[count - 1] ?? 0;
  const lut = new Uint8Array(256 * 3);
  for (let bright = 0; bright < 256; bright++) {
    let spot = count - 1;
    let scale = 1;
    if (bright <= first) {
      spot = 0;
      scale = bright / Math.max(1, first);
    } else if (bright < last) {
      let index = 0;
      while ((lum[index + 1] ?? Infinity) <= bright) index++;
      const span = (lum[index + 1] ?? 0) - (lum[index] ?? 0);
      spot = index + (span > 0 ? (bright - (lum[index] ?? 0)) / span : 0);
    }
    const base = along(skin, spot);
    const tone = along(tones, ((spot + 0.5) / count) * tones.length - 0.5);
    let colour = CHANNELS.map((channel) => (base[channel] ?? 0) * scale * (tone[channel] ?? 1));
    // Never darker than the brightness below it: the ramp holds runs of shares at one light in different hues.
    const floor = bright > 0 ? sum3([...lut.subarray(bright * 3 - 3, bright * 3)]) : 0;
    const got = sum3(colour);
    if (got < floor && got > 0) colour = colour.map((value) => value * (floor / got));
    lut.set(
      colour.map((value) => Math.max(0, Math.min(255, Math.round(value)))),
      bright * 3,
    );
  }
  return lut;
}

/** A race's tone on a body as a whole: its skin's mean over the races' mean, factors for red, green and blue. */
export function raceTone(skins: RaceSkins, body: string, race: string): Colour | null {
  const own = skins.bodies[body];
  const ramp = own?.races?.[race];
  if (!ramp || !own.races || !own.skin?.length) return null;
  const mean = (list: readonly Colour[]) =>
    CHANNELS.map((channel) => list.reduce((total, colour) => total + colour[channel], 0) / list.length);
  const mine = mean(ramp);
  const theirs = mean(racesMean(own.races));
  return [
    (mine[0] ?? 0) / Math.max(1, theirs[0] ?? 0),
    (mine[1] ?? 0) / Math.max(1, theirs[1] ?? 0),
    (mine[2] ?? 0) / Math.max(1, theirs[2] ?? 0),
  ];
}

/** How a layer's texels take a race in one view, changing `rgb` in place; null where the layer is not skin. The bare
 *  body follows its ramp; a painted face (`face`, `face_…`) takes the race's tone as a whole. */
export function raceSkinOf(
  skins: RaceSkins,
  layer: string,
  body: string,
  race: string | null,
  view: number,
): ((rgb: number[]) => void) | null {
  if (!race) return null;
  if (layer === 'body') {
    const lut = raceSkinLut(skins, body, race, view);
    return (
      lut &&
      ((rgb) => {
        const spot = Math.round(sum3(rgb) / 3) * 3;
        rgb[0] = lut[spot] ?? 0;
        rgb[1] = lut[spot + 1] ?? 0;
        rgb[2] = lut[spot + 2] ?? 0;
      })
    );
  }
  if (layer === 'face' || layer.startsWith('face_')) {
    const tone = raceTone(skins, body, race);
    return (
      tone &&
      ((rgb) => {
        for (const channel of CHANNELS) rgb[channel] = Math.min(255, Math.round((rgb[channel] ?? 0) * tone[channel]));
      })
    );
  }
  return null;
}

/** A hair colour's ramp on a body for a race: 16 colours darkest first; the body's own across its races where the
 *  race has none; else null. */
export function hairRamp(hair: HairColours, body: string, race: string | null, colour: string): Ramp | null {
  const own = hair.bodies[body];
  return (race ? own?.[race]?.[colour] : undefined) ?? own?.['*']?.[colour] ?? null;
}

/** The forge's skin ramps a human may take, the four of natural skin; the forge's ash-grey and golden ones are not. */
const HUMAN_SKINS = ['nord', 'breton', 'woodelf', 'redguard'];
/** How much darker than the darkest ramp the deepest tone is. */
const DEEPEST = 0.6;

/** The human skin ramps a body has, lightest first. */
export function skinTones(skins: RaceSkins, body: string): string[] {
  const races = skins.bodies[body]?.races ?? {};
  const light = (race: string) => (races[race] ?? []).reduce((total, colour) => total + sum3(colour), 0);
  return HUMAN_SKINS.filter((race) => races[race]).sort((first, second) => light(second) - light(first));
}

/** How a layer's texels take a human skin tone from 0 (the lightest) to 1 (the deepest), changing `rgb` in place: the
 *  two nearest ramps mixed by where the tone lies between them, the darkest ramp darkened for the deepest tones. Null
 *  where the layer is not skin. */
export function toneSkinOf(
  skins: RaceSkins,
  layer: string,
  body: string,
  tone: number,
  view: number,
): ((rgb: number[]) => void) | null {
  const tones = skinTones(skins, body);
  const spot = Math.max(0, Math.min(1, tone)) * tones.length;
  const at = (index: number): ((rgb: number[]) => void) | null => {
    const own = raceSkinOf(skins, layer, body, tones[Math.min(index, tones.length - 1)] ?? null, view);
    if (!own || index < tones.length) return own;
    return (rgb) => {
      own(rgb);
      for (const channel of CHANNELS) rgb[channel] = Math.round((rgb[channel] ?? 0) * DEEPEST);
    };
  };
  const low = at(Math.floor(spot));
  const high = at(Math.ceil(spot));
  if (!low || !high) return low ?? high;
  const share = spot - Math.floor(spot);
  return (rgb) => {
    const first = [...rgb];
    const second = [...rgb];
    low(first);
    high(second);
    for (const channel of CHANNELS)
      rgb[channel] = Math.round((first[channel] ?? 0) * (1 - share) + (second[channel] ?? 0) * share);
  };
}
