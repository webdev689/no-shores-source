import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import cosmetics from '../../../../content/gear/cosmetics.json' with { type: 'json' };
import castFile from '../../../../content/story/cast.json' with { type: 'json' };
import { layersOf } from '../../forge/looks.ts';
import type { QuestState } from '../../network/questMessages.ts';
import { figureOf } from '../../player/dressing.ts';
import { foeDress } from '../../player/foeDress.ts';
import type { FoeType } from '../../rules/roster.ts';
import { castOf } from '../../speech/cast.ts';
import { KEEPERS } from '../keepers.ts';
import { QUESTS } from './questBook.ts';
import { FIGURE_MOVES, FigureGlides, WARD_PLATE_ID, questActors, wardPlate } from './questFigures.ts';
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

/** The Lamplighters' road at its first task holding a goal of `kind` (its first task for none), with the varied fields
 *  `more`. */
function lamp(kind: string | null, more: Partial<QuestState> = {}): QuestState {
  const quest = QUESTS.findIndex((each) => each.id === 'lamplighters');
  const holds = (task: { goals: readonly { kind: string }[] }) => task.goals.some((goal) => goal.kind === kind);
  const task = kind === null ? 0 : (QUESTS[quest]?.tasks.findIndex(holds) ?? -1);
  assert.ok(task >= 0, `a ${kind} step on the Lamplighters' road`);
  return { quest: quest + 1, task, counts: [], done: [0, 0, 0, 0], choices: [0, 0, 0], at: null, ...more };
}

/** The Lamplighters' first defence's ward, by its name in the file. */
const wardName = (): string | undefined => {
  const quest = lamp('defend');
  return QUESTS[quest.quest - 1]?.tasks[quest.task]?.goals.find((goal) => goal.kind === 'defend')?.ward;
};

test('the figures a step walks stand where the room sends them, going or standing by their state, facing as sent', () => {
  const figures = [
    { look: lookOf('tobin'), x: 10, y: 20, z: 3, facing: 1.2, state: 1 },
    { look: lookOf('tobin'), x: 11, y: 21, z: 3, facing: 0.4, state: 4 },
    { look: ROSTER_LOOKS + COLLECTOR.type, x: 0, y: 0, z: 0, facing: 0, state: 2 },
    { look: 999, x: 0, y: 0, z: 0, facing: 0, state: 1 },
    { look: lookOf('tobin'), x: 50, y: 60, z: 2, facing: 2.5, state: 3 },
  ];
  const actors = questActors(lamp('escort', { figures }), [COLLECTOR], ground);
  assert.deepEqual(
    actors.map(({ anim, x, y, z, facing, scale }) => [anim, x, y, z, facing, scale]),
    [
      ['horsegallop', 10, 20, 3, 1.2, 0.85],
      ['horseidle', 11, 21, 3, 0.4, 0.85],
      ['walk', 0, 0, 0, 0, undefined],
      ['horseidle', 50, 60, 2, 2.5, 0.85],
    ],
    'riding; held by an ambush; a quarry that noticed walking back; a look none knows left out; arrived, standing',
  );
  assert.equal(new Set(actors.map((actor) => actor.id)).size, 4, 'each its own figure');
  assert.deepEqual(questActors(undefined, [], ground), []);
  assert.deepEqual(questActors(lamp('escort', { figures, claimed: false }), [COLLECTOR], ground), []);
});

test("an escort's figure rides its horse in the coat its goal names: galloping while it goes, else standing", () => {
  const state = lamp('escort', {
    figures: [
      { look: lookOf('tobin'), x: 1, y: 2, z: 3, facing: 0.5, state: 1 },
      { look: lookOf('tobin'), x: 1, y: 2, z: 3, facing: 0.5, state: 5 },
      { look: lookOf('tobin'), x: 1, y: 2, z: 3, facing: 0.5, state: 4 },
      { look: ROSTER_LOOKS + COLLECTOR.type, x: 0, y: 0, z: 0, facing: 0, state: 1 },
    ],
  });
  const escort = QUESTS[state.quest - 1]?.tasks[state.task]?.goals.find((goal) => goal.kind === 'escort');
  assert.equal(escort?.horse, 'dun', "Tobin's dun, bred on the downs");
  const actors = questActors(state, [COLLECTOR], ground);
  assert.deepEqual(
    actors.map(({ anim, fps, dress }) => [anim, fps, dress.outfit.coat]),
    [
      ['horsegallop', 16, 'dun'],
      ['horseidle', 4, 'dun'],
      ['horseidle', 4, 'dun'],
      ['walk', undefined, undefined],
    ],
    'galloping; waiting for the player to mount; reined in by an ambush; another look on foot',
  );
  for (const anim of ['horsegallop', 'horseidle']) assert.ok(FIGURE_MOVES.includes(anim), `${anim} warmed`);
});

test('every escort rides a coat the forge draws, and each rider and their horse are drawn in its moves', () => {
  const tables = { male: drawnBy('male'), female: drawnBy('female') };
  const coats = new Set(cosmetics.cosmetics.filter((each) => each.kind === 'coat').map((each) => each.id));
  const escorts = QUESTS.flatMap((quest) => quest.tasks.flatMap((task) => task.goals)).filter(
    (goal) => goal.kind === 'escort',
  );
  assert.ok(escorts.length >= 2);
  for (const { who, horse } of escorts) {
    assert.ok(horse && coats.has(horse), `${who} rides a coat: ${horse}`);
    const dress = FACES[who ?? '']?.dress;
    assert.ok(dress, `${who} has a face`);
    const drawn = tables[dress.body as 'male' | 'female'];
    for (const anim of ['horsegallop', 'horseidle']) {
      const layers = layersOf(figureOf(dress, drawn, anim), anim, {
        bodies: { [dress.body]: { anims: {}, layers: drawn } },
      });
      assert.ok(layers.includes('horse'), `${who}'s horse in ${anim}: ${layers.join(', ')}`);
      assert.ok(layers.includes('body'), `${who} on it in ${anim}`);
    }
  }
});

test("a figure is drawn between the room's words, turning the short way round", () => {
  const glides = new FigureGlides();
  const word = (facing: number, x: number) => ({ look: 1, x, y: 0, z: 0, facing, state: 1 });
  glides.heard([word(3, 0)], 0);
  glides.heard([word(-3, 2.4)], 200);
  const half = glides.place(0, 300);
  assert.ok(half);
  assert.equal(half[0], 1.2, 'half way along');
  assert.ok(Math.abs(Math.abs(half[3]) - Math.PI) < 1e-9, `through south, not round by north: ${half[3]}`);
  assert.equal(glides.place(0, 400)?.[3], -3, 'at the newest word');
});

test("the ward stands with a plate in the players' green, its name and health; a named one has no figure", () => {
  const wounded = lamp('defend', { ward: { x: 40, y: -2, health: 0.25 } });
  assert.deepEqual(questActors(wounded, [], ground), [], 'the wounded are a mark on the ground');
  const plate = wardPlate(wounded, CAST, ground);
  assert.ok(plate);
  assert.deepEqual(
    [plate.id, plate.name, plate.ally, plate.held, plate.view.side, plate.view.health / plate.view.healthMax],
    [WARD_PLATE_ID, wardName(), true, true, 'players', 0.25],
    'held in view as a fought foe’s',
  );
  assert.deepEqual([plate.view.x, plate.view.y, plate.view.z], [40, -2, 5], 'over its mark');
  assert.equal(wardPlate(lamp('defend'), CAST, ground), null, 'none in this room');
  assert.equal(wardPlate(lamp(null, { ward: { x: 0, y: 0, health: 1 } }), CAST, ground), null, 'no defence');
});
