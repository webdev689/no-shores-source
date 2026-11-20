import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SkyReading, Strike } from '../../../sky/skyLaw.ts';
import { PHASES, byPhase } from './law.ts';
import { SCAPES } from './scapes.ts';
import {
  FAIR,
  SOUND_M_S,
  THUNDER_MOST,
  THUNDER_REACH_M,
  phasesOfSun,
  rainCorner,
  rainLevel,
  shelterOf,
  snowSoftening,
  thunderOf,
  weatherOf,
  windLevelOf,
} from './weatherLaw.ts';

/** The sun at a height (degrees) on the east or west side of the sky. */
const sunAt = (degrees: number, east: boolean): [number, number, number] => {
  const up = Math.sin((degrees * Math.PI) / 180);
  const across = Math.cos((degrees * Math.PI) / 180);
  return [east ? across : -across, 0, up];
};

const reading = (more: Partial<SkyReading>): SkyReading => ({
  latitudeDeg: 40,
  sun: [0, 0, 1],
  moon: [0, 0, -1],
  moonPhase: 0,
  moonLit: 0,
  starTurn: 0,
  daylight: 1,
  cloud: 0,
  falling: 0,
  snowShare: 0,
  storm: 0,
  fog: 0,
  sand: 0,
  wind: [6, 0],
  gust: 0.5,
  temperatureC: 15,
  wetness: 0,
  snowCover: 0,
  steeringMS: 0,
  ...more,
});

test('the sun names the phase: dawn as it rises in the east, day high, dusk as it sets in the west, night under', () => {
  assert.equal(phasesOfSun(sunAt(40, true)).day, 1);
  assert.equal(phasesOfSun(sunAt(-30, false)).night, 1);
  assert.equal(phasesOfSun(sunAt(1, true)).dawn, 1);
  assert.equal(phasesOfSun(sunAt(-2, false)).dusk, 1);
  assert.equal(phasesOfSun(sunAt(-2, false)).dawn, 0);
  for (let degrees = -40; degrees <= 40; degrees += 0.5)
    for (const east of [true, false]) {
      const phases = phasesOfSun(sunAt(degrees, east));
      const sum = PHASES.reduce((total, phase) => total + phases[phase], 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, `${degrees}: ${sum}`);
    }
  // The phases turn smoothly, so beds and voices cross-fade from one to the next and never cut.
  let last = phasesOfSun(sunAt(-20, true));
  for (let degrees = -20; degrees <= 20; degrees += 0.1) {
    const now = phasesOfSun(sunAt(degrees, true));
    for (const phase of PHASES) assert.ok(Math.abs(now[phase] - last[phase]) < 0.05, `${phase} at ${degrees}`);
    last = now;
  }
});

test('the hour brings in the night: every night voice and bed sounds by night and not at noon', () => {
  const [noon, night, dawn] = [
    phasesOfSun(sunAt(60, false)),
    phasesOfSun(sunAt(-30, false)),
    phasesOfSun(sunAt(0, true)),
  ];
  const nightVoices = [
    ['temperate-coast', 'owl.tawny'],
    ['woodland', 'owl.deep'],
    ['highland', 'wolf.howl.low'],
    ['desert', 'jackal.yips'],
    ['savanna', 'hyena.whoops'],
    ['savanna', 'nightjar'],
    ['rainforest', 'frog.peeps'],
    ['desert', 'cricket'],
  ] as const;
  for (const [key, sound] of nightVoices) {
    const voice = SCAPES[key].voices.find((each) => each.sounds.includes(sound));
    assert.ok(voice, `${key} has ${sound}`);
    assert.ok(byPhase(voice.perMinute, night) > 0 && byPhase(voice.perMinute, noon) === 0, `${key}: ${sound}`);
  }
  const lion = SCAPES.savanna.voices.find((each) => each.recorded === 'amb.savanna.lion');
  assert.ok(lion && byPhase(lion.perMinute, night) > 0 && byPhase(lion.perMinute, noon) === 0);
  for (const [key, bed] of [
    ['savanna', 'insects.crickets'],
    ['rainforest', 'frogs.chorus'],
  ] as const) {
    const layer = SCAPES[key].beds.find((each) => each.bed === bed);
    assert.ok(layer && byPhase(layer.when, night) > byPhase(layer.when, noon), `${key}: ${bed}`);
  }
  const warbler = SCAPES.woodland.voices.find((each) => each.sounds.includes('song.warbler'));
  assert.ok(warbler && byPhase(warbler.perMinute, dawn) > byPhase(warbler.perMinute, noon), 'the dawn chorus');
});

test('Saltmere hushes by night: its crowd and its work quieten, its harbour does not', () => {
  const [noon, night] = [phasesOfSun(sunAt(60, false)), phasesOfSun(sunAt(-30, false))];
  const social = SCAPES.social;
  const crowd = social.beds.find((layer) => layer.bed === 'town.crowd');
  assert.ok(crowd && byPhase(crowd.when, night) < byPhase(crowd.when, noon) * 0.2);
  for (const sound of ['hammer', 'cart', 'anvil'] as const) {
    const voice = social.voices.find((each) => each.sounds.includes(sound));
    assert.ok(voice && byPhase(voice.perMinute, night) === 0, sound);
  }
  for (const sound of ['bell', 'halyard', 'hull.creak'] as const) {
    const voice = social.voices.find((each) => each.sounds.includes(sound) && each.at === 'harbour');
    assert.ok(voice && byPhase(voice.perMinute, night) === byPhase(voice.perMinute, noon), sound);
  }
  const lapping = social.beds.find((layer) => layer.bed === 'shore.lap');
  assert.ok(lapping && byPhase(lapping.when, night) === byPhase(lapping.when, noon));
});

test('the wind is near silent in a calm, as made at its usual speed, and loud in a gale', () => {
  assert.ok(windLevelOf(0.8) < 0.1);
  assert.ok(Math.abs(windLevelOf(6) - 1) < 1e-9);
  assert.equal(windLevelOf(26), 2.5);
  for (let speed = 0; speed < 30; speed += 0.5) assert.ok(windLevelOf(speed + 0.5) >= windLevelOf(speed));
  assert.equal(weatherOf(null), FAIR);
  assert.ok(Math.abs(weatherOf(reading({ wind: [0, -6] })).wind - 1) < 1e-9);
  // Every gusty bed and every gust's voice follows the wind.
  for (const scape of Object.values(SCAPES))
    for (const voice of scape.voices)
      if (voice.sounds.some((sound) => ['wind.gust', 'sand.gust', 'leaf.gust', 'rock.whistle'].includes(sound)))
        assert.equal(voice.drive, 'wind', `${scape.title}: ${voice.sounds.join()}`);
});

test('rain, snow and sand: how hard each comes, the rain brighter the harder, snow softening the land', () => {
  const rain = weatherOf(reading({ falling: 0.8, snowShare: 0.25 }));
  assert.ok(Math.abs(rain.rain - 0.6) < 1e-9 && Math.abs(rain.snow - 0.2) < 1e-9 && rain.fall === 0.8);
  assert.ok(rainLevel(0.1) > 0.2 && rainLevel(1) === 1 && rainLevel(0) === 0);
  assert.ok(rainCorner(1) > rainCorner(0.2) * 3);
  assert.equal(snowSoftening(FAIR), 1);
  assert.ok(snowSoftening(weatherOf(reading({ falling: 1, snowShare: 1 }))) < 0.6);
  for (const [key, scape] of Object.entries(SCAPES)) {
    assert.ok(
      scape.beds.some((layer) => layer.bed === 'rain.hiss' && layer.drive === 'rain'),
      `${key} is rained on`,
    );
  }
  assert.ok(
    SCAPES.sea.beds.some((layer) => layer.bed === 'rain.deck'),
    'rain on its canvas and planks',
  );
  assert.ok(
    SCAPES.social.beds.some((layer) => layer.bed === 'rain.gutters'),
    "Saltmere's gutters",
  );
  assert.ok(
    SCAPES.desert.beds.some((layer) => layer.drive === 'sand'),
    'the sandstorm',
  );
});

test('rain and snow send the birds and insects to shelter by day, never by night', () => {
  const day = phasesOfSun(sunAt(50, true));
  const night = phasesOfSun(sunAt(-40, true));
  const downpour = weatherOf(reading({ falling: 1 }));
  const drizzle = weatherOf(reading({ falling: 0.1 }));
  assert.equal(shelterOf(FAIR, day), 1);
  assert.ok(shelterOf(downpour, day) < 0.2);
  assert.ok(shelterOf(drizzle, day) > shelterOf(downpour, day));
  assert.equal(shelterOf(downpour, night), 1);
});

const strike = (x: number, y: number, more: Partial<Strike> = {}): Strike => ({
  x,
  y,
  atS: 100,
  toGround: true,
  power: 1,
  ...more,
});

test('thunder arrives after its distance at the speed of sound, from the way the strike lies', () => {
  const near = thunderOf(strike(300, -400), [0, 0]);
  assert.ok(near);
  assert.ok(Math.abs(near.arrivesS - (100 + 500 / SOUND_M_S)) < 1e-9);
  assert.deepEqual(near.toward, [0.6, -0.8]);
  const far = thunderOf(strike(0, 20_000), [0, 0]);
  assert.ok(far && Math.abs(far.arrivesS - (100 + 20_000 / SOUND_M_S)) < 1e-9);
  assert.equal(thunderOf(strike(THUNDER_REACH_M + 1, 0), [0, 0]), null);
  assert.ok(thunderOf(strike(THUNDER_REACH_M - 1, 0), [0, 0]));
});

test('a near ground strike cracks and rips, a far one or one in the cloud rolls, darker and quieter far off', () => {
  assert.equal(thunderOf(strike(800, 0), [0, 0])?.sound, 'thunder.crack');
  assert.equal(thunderOf(strike(800, 0, { toGround: false }), [0, 0])?.sound, 'thunder.roll');
  assert.equal(thunderOf(strike(9000, 0), [0, 0])?.sound, 'thunder.roll');
  // A weaker strike must be nearer to crack.
  assert.equal(thunderOf(strike(2000, 0, { power: 0.5 }), [0, 0])?.sound, 'thunder.roll');
  let last = { gain: Infinity, corner: Infinity };
  for (let distance = 0; distance <= THUNDER_REACH_M; distance += 500) {
    const thunder = thunderOf(strike(distance, 0), [0, 0]);
    assert.ok(thunder);
    assert.ok(thunder.gain <= THUNDER_MOST && thunder.gain <= last.gain && thunder.corner <= last.corner);
    last = thunder;
  }
  assert.ok(last.corner < 400 && last.gain < THUNDER_MOST * 0.15, 'the edge of hearing is a low murmur');
  const weak = thunderOf(strike(500, 0, { power: 0.5 }), [0, 0]);
  assert.ok(weak && Math.abs(weak.gain - THUNDER_MOST * 0.5) < 1e-9);
});
