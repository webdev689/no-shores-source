import assert from 'node:assert/strict';
import { test } from 'node:test';
import vale from '../../../../../content/dungeon/breach-drowned-vale.json' with { type: 'json' };
import listed from '../../../../../content/audio/freesound.json' with { type: 'json' };
import { BREACH_SCAPES, GATE_SCAPE, bedLoudness, scapeOf } from './breachScapes.ts';
import { BREACH_AMBIENCES, PHASES, ambienceOf, breachAmbienceOf, underground } from './law.ts';
import { SCAPES } from './scapes.ts';

const scapes = Object.values(BREACH_SCAPES);
const recordingsOf = (scape: (typeof scapes)[number]) => [
  ...scape.beds.map((layer) => layer.recorded),
  ...scape.voices.map((voice) => voice.recorded),
];

test("every amb.breach cue is played by some space of the run or the gate's hollow, and they play no other", () => {
  const cues = listed.cues.map((cue) => cue.id).filter((id) => id.startsWith('amb.breach.'));
  const played = new Set([...scapes.flatMap(recordingsOf), ...recordingsOf(GATE_SCAPE)]);
  for (const cue of cues) assert.ok(played.has(cue), `${cue} is played`);
  for (const scape of scapes)
    for (const recorded of recordingsOf(scape)) assert.match(recorded, /^amb\.breach\./, `${scape.title}: ${recorded}`);
  assert.deepEqual(recordingsOf(GATE_SCAPE), ['amb.breach.hollow', 'breach.spire.fill']);
});

test('each space has its beds over the cave and the drone, voices round the listener, and its own room', () => {
  for (const scape of scapes) {
    const beds = scape.beds.map((layer) => layer.recorded);
    assert.ok(beds.includes('amb.breach.cave') && beds.includes('amb.breach.drone'), scape.title);
    assert.ok(beds.length >= 3 && scape.voices.length >= 5, scape.title);
    for (const voice of scape.voices) assert.equal(voice.at, 'cave', `${scape.title}: ${voice.recorded}`);
  }
  const rooms = new Set(scapes.map((scape) => JSON.stringify(scape.room)));
  assert.equal(rooms.size, scapes.length, 'no two rooms alike');
  const longest = Math.max(...scapes.map((scape) => scape.room.seconds));
  assert.equal(BREACH_SCAPES['breach.choir'].room.seconds, longest, "the chapel's tail the longest");
  assert.ok(BREACH_SCAPES['breach.ways'].room.echoes.length >= 3, "the streets' echoes");
});

test('no hour and no weather reach under the ground: every rate the same at every hour, nothing driven', () => {
  for (const scape of scapes) {
    for (const layer of scape.beds) {
      assert.equal(layer.drive, undefined, `${scape.title}: ${layer.bed}`);
      assert.equal(layer.gust, undefined);
      assert.equal(new Set(PHASES.map((phase) => layer.when[phase])).size, 1);
    }
    for (const voice of scape.voices) {
      assert.equal(voice.drive, undefined);
      assert.equal(new Set(PHASES.map((phase) => voice.perMinute[phase])).size, 1, voice.recorded);
    }
  }
  for (const key of BREACH_AMBIENCES) assert.ok(underground(key));
  assert.equal(underground('breach.gate'), false, 'the gate stands in the open vale');
  assert.equal(underground('woodland'), false);
});

test('every space stands as loud as the downs, about -30 LUFS at the first volume', () => {
  const downs = bedLoudness(SCAPES['temperate-coast']);
  for (const scape of scapes) assert.ok(Math.abs(bedLoudness(scape) - downs) < 1e-9, scape.title);
});

test("every space of the Drowned Vale's plan sounds as its own, its four shores as one", () => {
  const heard = vale.spaces.map((space) => breachAmbienceOf(space.key));
  assert.deepEqual(heard, [
    'breach.descent',
    'breach.mending',
    'breach.choir',
    'breach.ways',
    'breach.stair',
    'breach.hall',
    'breach.court',
    'breach.shore',
    'breach.shore',
    'breach.shore',
    'breach.shore',
  ]);
  assert.equal(breachAmbienceOf('nowhere'), 'breach.descent');
  assert.equal(ambienceOf({ kind: 'breach', climate: 'woodland', space: 'choir' }), 'breach.choir');
  assert.equal(scapeOf('breach.choir'), BREACH_SCAPES['breach.choir']);
  assert.equal(scapeOf('breach.gate'), GATE_SCAPE);
  assert.equal(scapeOf('woodland'), SCAPES.woodland);
});
