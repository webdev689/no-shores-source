import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import castFile from '../../../../content/story/cast.json' with { type: 'json' };
import { layersOf } from '../../forge/looks.ts';
import type { QuestState } from '../../network/questMessages.ts';
import { figureOf } from '../../player/dressing.ts';
import { foeDress } from '../../player/foeDress.ts';
import type { FoeType } from '../../rules/roster.ts';
import { castOf } from '../../speech/cast.ts';
import { KEEPERS } from '../keepers.ts';
import { QUESTS } from './questBook.ts';
import { WARD_PLATE_ID, questActors, wardPlate } from './questFigures.ts';
import { FACES, ROSTER_LOOKS, SPEAKERS, faceOf, speakerFace } from './questLooks.ts';

const CAST = castOf(castFile);
const COLLECTOR: FoeType = {
  type: 7,
  name: 'Collector',
  faction: 1,
  factionName: 'The Grey Tithe',
  domain: 'land',
  role: 0,
  ranks: [1],
  right: null,
  left: null,
};
const ground = () => 4;
/** The look a speaker's figure comes in on the wire. */
const lookOf = (speaker: string) => SPEAKERS.indexOf(speaker) + 1;

/** The forge's own tables for a body: the layers it drew in each move (its fitted table, and the body's own strips). */
function drawnBy(body: string): Record<string, string[]> {
  const forge = new URL('../../../../tools/forge/tools/sprite-forge/', import.meta.url);
  const read = (path: string) => JSON.parse(readFileSync(new URL(path, forge), 'utf8')) as Record<string, unknown>;
  const fitted = read(`fitted/${body}.json`) as Record<string, Record<string, string[]>>;
  const keys = read(`keys/keys-${body}.json`);
  const drawn: Record<string, string[]> = {};
  for (const [anim, sets] of Object.entries(fitted))
    for (const layer of Object.values(sets).flat()) if (!drawn[layer]?.includes(anim)) (drawn[layer] ??= []).push(anim);
  drawn.body = Object.keys(fitted).filter((anim) => keys[`body_${anim}`]);
  return drawn;
}

test("the roads' new faces are clothed, hair and all, in every move a step draws them in, by the forge's own table", () => {
  const tables = { male: drawnBy('male'), female: drawnBy('female') };
  assert.deepEqual(Object.keys(FACES).sort(), ['corvane', 'pell', 'reeve', 'tobin', 'wren']);
  for (const [speaker, { dress }] of Object.entries(FACES)) {
    assert.ok(SPEAKERS.includes(speaker), `${speaker} speaks in the cast`);
    const drawn = tables[dress.body as 'male' | 'female'];
    for (const anim of ['idle', 'walk']) {
      const layers = layersOf(figureOf(dress, drawn, anim), anim, {
        bodies: { [dress.body]: { anims: {}, layers: drawn } },
      });
      // A garment under armour is drawn in its fitted variant (`short_tunic_plated`).
      const shows = (worn: string) => layers.some((layer) => layer === worn || layer.startsWith(`${worn}_`));
      for (const worn of ['body', `hair_${dress.outfit.hair?.style}`, ...dress.outfit.garments])
        assert.ok(shows(worn), `${speaker}'s ${worn} is drawn in ${anim}: ${layers.join(', ')}`);
    }
  }
});

test("a figure's look is a speaker's face, a keeper's own dress, or a roster type's; one known to neither is none", () => {
  assert.equal(faceOf(lookOf('tobin'), [])?.scale, 0.85, 'Tobin, a boy');
  assert.deepEqual(faceOf(lookOf('wren'), [])?.dress, FACES.wren?.dress);
  assert.deepEqual(
    faceOf(lookOf('maren'), [])?.dress,
    KEEPERS.lamplighters.dress,
    'Elder Maren Hale as at her counter',
  );
  assert.deepEqual(speakerFace('stormcaller').dress, KEEPERS.stormcallers.dress);
  assert.deepEqual(faceOf(ROSTER_LOOKS + COLLECTOR.type, [COLLECTOR])?.dress, foeDress(COLLECTOR), 'the Collector');
  assert.equal(faceOf(ROSTER_LOOKS + 99, [COLLECTOR]), null);
  assert.equal(faceOf(SPEAKERS.length + 1, []), null);
  assert.ok(faceOf(lookOf('mate'), [])?.dress, 'a speaker with no face of their own in plain dress');
});

/** The Lamplighters' road at the task `id`, with the varied fields `more`. */
function lamp(id: string, more: Partial<QuestState> = {}): QuestState {
  const quest = QUESTS.findIndex((each) => each.id === 'lamplighters');
  const task = QUESTS[quest]?.tasks.findIndex((each) => each.id === id) ?? -1;
  return { quest: quest + 1, task, counts: [], done: [0, 0, 0, 0], choices: [0, 0, 0], at: null, ...more };
}

test('the figures a step walks stand where the room sends them, walking or standing by their state, facing as sent', () => {
  const figures = [
    { look: lookOf('tobin'), x: 10, y: 20, z: 3, facing: 1.2, state: 1 },
    { look: lookOf('tobin'), x: 11, y: 21, z: 3, facing: 0.4, state: 4 },
    { look: ROSTER_LOOKS + COLLECTOR.type, x: 0, y: 0, z: 0, facing: 0, state: 2 },
    { look: 999, x: 0, y: 0, z: 0, facing: 0, state: 1 },
    { look: lookOf('tobin'), x: 50, y: 60, z: 2, facing: 2.5, state: 3 },
  ];
  const actors = questActors(lamp('bring-tobin-moorend', { figures }), [COLLECTOR], ground);
  assert.deepEqual(
    actors.map(({ anim, x, y, z, facing, scale }) => [anim, x, y, z, facing, scale]),
    [
      ['walk', 10, 20, 3, 1.2, 0.85],
      ['idle', 11, 21, 3, 0.4, 0.85],
      ['walk', 0, 0, 0, 0, undefined],
      ['idle', 50, 60, 2, 2.5, 0.85],
    ],
    'walking; held by an ambush; a quarry that noticed walking back; a look none knows left out; arrived, standing',
  );
  assert.equal(new Set(actors.map((actor) => actor.id)).size, 4, 'each its own figure');
  assert.deepEqual(questActors(undefined, [], ground), []);
  assert.deepEqual(questActors(lamp('bring-tobin-moorend', { figures, claimed: false }), [COLLECTOR], ground), []);
});

test("the ward stands with a plate in the players' green, its name and health; a named one has no figure", () => {
  const wounded = lamp('hold-saltgrass', { ward: { x: 40, y: -2, health: 0.25 } });
  assert.deepEqual(questActors(wounded, [], ground), [], 'the wounded are a mark on the ground');
  const plate = wardPlate(wounded, CAST, ground);
  assert.ok(plate);
  assert.deepEqual(
    [plate.id, plate.name, plate.ally, plate.held, plate.view.side, plate.view.health / plate.view.healthMax],
    [WARD_PLATE_ID, 'The wounded', true, true, 'players', 0.25],
    'held in view as a fought foe’s',
  );
  assert.deepEqual([plate.view.x, plate.view.y, plate.view.z], [40, -2, 5], 'over its mark');
  assert.equal(wardPlate(lamp('hold-saltgrass'), CAST, ground), null, 'none in this room');
  assert.equal(wardPlate(lamp('walk-strand', { ward: { x: 0, y: 0, health: 1 } }), CAST, ground), null, 'no defence');
});
