import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { castOf, scenesOf } from './cast.ts';

const story = new URL('../../../content/story/', import.meta.url);
const castJson = JSON.parse(readFileSync(new URL('cast.json', story), 'utf8'));
const prologueJson = JSON.parse(readFileSync(new URL('prologue.json', story), 'utf8'));

const VOICE = { pitchHz: 120, spreadHz: 10, muffleHz: 1400, volume: 0.3, syllableS: 0.1 };
const small = () => ({ speakers: { mate: { name: 'First Mate', voice: 'mate' } }, voices: { mate: { ...VOICE } } });

test('the mission cast and its prologue read whole', () => {
  const cast = castOf(castJson);
  assert.equal(cast.speakers.thule.name, 'Captain Brannoc Thule');
  assert.equal(cast.voices.deep.pitchHz, 64);
  const scenes = scenesOf(prologueJson, cast);
  assert.equal(scenes.sighted.length, 4);
  assert.deepEqual(scenes.sighted[0], { who: 'lookout', say: 'Sails off the bow!', kind: 'bark', emote: 'alert' });
});

test('a speaker without a voice is refused', () => {
  const json = small();
  json.speakers.mate.voice = 'nobody';
  assert.throws(() => castOf(json), /mate.*nobody/);
});

test('a voice with a missing or empty number is refused', () => {
  const json = small();
  (json.voices.mate as Record<string, unknown>).muffleHz = undefined;
  assert.throws(() => castOf(json), /muffleHz/);
  const silent = small();
  silent.voices.mate.syllableS = 0;
  assert.throws(() => castOf(silent), /syllableS/);
});

test('a cast that is not an object of speakers and voices is refused', () => {
  assert.throws(() => castOf(null), /cast/);
  assert.throws(() => castOf({ speakers: [] }), /speakers/);
});

test('a line by someone not in the cast is refused', () => {
  const cast = castOf(small());
  assert.throws(() => scenesOf({ scenes: { one: [{ who: 'ghost', say: 'Boo.' }] } }, cast), /one.*ghost/);
});

test('a line with no words, an unknown kind or an unknown emote is refused', () => {
  const cast = castOf(small());
  const scene = (line: object) => ({ scenes: { one: [{ who: 'mate', say: 'Brace!', ...line }] } });
  assert.throws(() => scenesOf(scene({ say: '' }), cast), /words/);
  assert.throws(() => scenesOf(scene({ kind: 'song' }), cast), /kind/);
  assert.throws(() => scenesOf(scene({ emote: 'glee' }), cast), /emote/);
  assert.equal(scenesOf(scene({ emote: 'silence' }), cast).one[0].emote, 'silence');
});

test('scenes that are not lists of lines are refused', () => {
  const cast = castOf(small());
  assert.throws(() => scenesOf({ scenes: { one: 'Brace!' } }, cast), /one/);
  assert.throws(() => scenesOf({}, cast), /scenes/);
});

test('a name every object carries is not a speaker or a voice', () => {
  const cast = castOf(small());
  assert.throws(() => scenesOf({ scenes: { one: [{ who: 'toString', say: 'Hi.' }] } }, cast), /toString/);
  const json = small();
  json.speakers.mate.voice = 'constructor';
  assert.throws(() => castOf(json), /constructor/);
});

test("a key that would set an object's prototype is refused as a speaker, a voice or a scene", () => {
  const voice = JSON.stringify(VOICE);
  const speaker = JSON.parse(
    `{"speakers": {"__proto__": {"name": "Mate", "voice": "mate"}}, "voices": {"mate": ${voice}}}`,
  );
  assert.throws(() => castOf(speaker), /__proto__/);
  const voiceKey = JSON.parse(
    `{"speakers": {"mate": {"name": "Mate", "voice": "__proto__"}}, "voices": {"__proto__": ${voice}}}`,
  );
  assert.throws(() => castOf(voiceKey), /__proto__/);
  const scene = JSON.parse('{"scenes": {"__proto__": [{"who": "mate", "say": "Aye."}]}}');
  assert.throws(() => scenesOf(scene, castOf(small())), /__proto__/);
});

test('a syllable too short to swell and fall is refused', () => {
  const json = small();
  json.voices.mate.syllableS = 0.01;
  assert.throws(() => castOf(json), /syllableS/);
});

/** Every scene of the story's files: the speakers who say its lines. */
function sceneSpeakers(): string[][] {
  const files = readdirSync(story).filter((file) => file.endsWith('.json') && file !== 'cast.json');
  return files.flatMap((file) => {
    const { scenes } = JSON.parse(readFileSync(new URL(file, story), 'utf8')) as {
      scenes: Record<string, { who: string }[]>;
    };
    return Object.values(scenes).map((lines) => [...new Set(lines.map((line) => line.who))]);
  });
}

const channel = (css: string, start: number) => parseInt(css.slice(start, start + 2), 16) / 255;
const rgbOf = (css: string): [number, number, number] => [channel(css, 1), channel(css, 3), channel(css, 5)];
const linear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const luminance = ([red, green, blue]: readonly number[]) =>
  0.2126 * linear(red ?? 0) + 0.7152 * linear(green ?? 0) + 0.0722 * linear(blue ?? 0);
/** A colour in OKLab, whose distances are near what the eye sees: 0.02 apart is about the least told apart. */
function oklab(css: string): [number, number, number] {
  const [red, green, blue] = rgbOf(css).map(linear) as [number, number, number];
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const middle = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return [
    0.2104542553 * long + 0.793617785 * middle - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * middle + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * middle - 0.808675766 * short,
  ];
}
const apart = (one: string, two: string) => {
  const [a, b] = [oklab(one), oklab(two)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

test("every named speaker's name has a colour of its own, read on the box over the brightest world", () => {
  const cast = castOf(castJson);
  const named = Object.entries(cast.speakers).filter(([, speaker]) => speaker.name !== '');
  // The box's ground (`TONES.ground`, 93% opaque) over a white sky, under its header's faint lift: its lightest.
  const ground = [12, 14, 18].map((value) => 0.035 + 0.965 * (0.93 * (value / 255) + 0.07));
  for (const [key, { colour }] of named) {
    assert.ok(colour, `${key} has a colour`);
    const contrast = (luminance(rgbOf(colour)) + 0.05) / (luminance(ground) + 0.05);
    assert.ok(contrast >= 4.5, `${key}: ${contrast.toFixed(2)} to 1`);
  }
  for (const [place, [one, first]] of named.entries())
    for (const [two, second] of named.slice(place + 1))
      assert.ok(apart(first.colour ?? '', second.colour ?? '') >= 0.03, `${one} and ${two} are told apart`);
});

test('speakers who share a scene have names far apart in colour', () => {
  const cast = castOf(castJson);
  for (const speakers of sceneSpeakers()) {
    const named = speakers.filter((who) => cast.speakers[who]?.name);
    for (const [place, one] of named.entries())
      for (const two of named.slice(place + 1)) {
        const distance = apart(cast.speakers[one]?.colour ?? '', cast.speakers[two]?.colour ?? '');
        assert.ok(distance >= 0.1, `${one} and ${two}: ${distance.toFixed(3)}`);
      }
  }
});

test("a speaker's colour that is not #rrggbb is none, their name in the kit's brass", () => {
  const json = { ...small(), speakers: { mate: { name: 'First Mate', voice: 'mate', colour: 'red' } } };
  assert.equal(castOf(json).speakers.mate?.colour, null);
  json.speakers.mate.colour = '#8DCCF9';
  assert.equal(castOf(json).speakers.mate?.colour, '#8DCCF9');
});
