import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import items from '../../../content/gear/items.json' with { type: 'json' };
import * as flatbuffers from 'flatbuffers';
import {
  Gear,
  GearColumn,
  GearKeptShip,
  GearOfficer,
  GearShip,
  Input,
} from '../../../generated/messages/ts/overlook/wire.ts';
import { earnedOf } from './artMessages.ts';
import { ASKS, DROPPED, gearOf } from './gearMessages.ts';
import { FIGURE_STATES } from './questMessages.ts';
import { inputBytes, readFromRoom } from './messages.ts';

const written = async (name: string) =>
  new Uint8Array(
    await readFile(new URL(`../../../target/protocol/${name}`, import.meta.url)).catch(() => {
      throw new Error(`${name} is not written: run \`cargo test -p protocol\``);
    }),
  );

test('a players own gear the server wrote reads back whole, every column spelled out', async () => {
  // gear_wire_tests.rs writes it: level 20 by XP, Harbourwarden worn, Goldgrass Seed gathered at the stall's node, an
  // Atheric Vestige for the head carried, two Ammo crates and half the ammunition, seven asks answered, and an Ammo box
  // lying.
  const gear = readFromRoom(await written('gear.bin'));
  assert.equal(gear?.kind, 'gear');
  if (gear?.kind !== 'gear') return;
  assert.equal(gear.prologueDone, false, 'a new character');
  const nothing = {
    ...{ day: 0, cleared: [], week: 0, elite: false, abyss: false, boon: false },
    ...{ playlistTaken: [false, false], playlistClears: [0, 0] },
  };
  assert.deepEqual(gear.activity, nothing, 'a character that has done nothing yet');
  assert.equal(gear.bounties?.length, 6, 'the day’s board');
  assert.equal(
    gear.bounties?.some((bounty) => bounty.held),
    false,
    'a new character holds none',
  );
  assert.deepEqual(
    gear.bounties?.map((bounty) => bounty.pool),
    [0, 0, 1, 1, 2, 2],
    'where each counts',
  );
  assert.ok(
    gear.bounties?.every((bounty) => bounty.name !== ''),
    'each its name',
  );
  assert.equal(gear.bountyXp, 2_500, 'at level 20');
  assert.equal(typeof gear.day, 'number');
  assert.deepEqual([gear.level, gear.answered, gear.answer, gear.atMage, gear.spent], [20, 7, 0, true, [0]]);
  assert.deepEqual([gear.ammo, gear.ammoMost, gear.ammoShare, gear.crates, gear.cratePrice], [0, 0, 0.5, 2, 250]);
  assert.deepEqual(
    gear.drops.map((drop) => [drop.kind, drop.at, drop.from, drop.flying]),
    [
      [DROPPED.ammoBox, [1, 2, 0], [1, 2, 0], 60],
      [DROPPED.vestige, [3, 2, 0], [3, 2, 0], 94],
    ],
    "each just laid flies the room's rest for its kind, AMMO_REST_TICKS and VESTIGE_REST_TICKS",
  );
  assert.equal(gear.xp, 190_000n);
  assert.equal(gear.resources[4], 3, 'three of the node’s resource');
  // Each stock its own count there: Weapon and Armor Fragments, Weapon and Armor Essence, then Fruit of Dagon, the
  // order the inventory names them in (STOCK_NAMES).
  assert.deepEqual(gear.stocks, [11, 12, 13, 14, 2]);
  assert.equal(gear.items.length, 10, 'six pieces and the four modules every ship is built with');
  // Two letters in the mail: a Rare Vestige for the arms at level 9 left lying, and a Magic hull at level 6 salvaged.
  assert.deepEqual(
    gear.mail?.map(({ vestige, item }) => [vestige?.rarity, vestige?.slot, vestige?.level, item?.kind, item?.level]),
    [
      [2, 4, 9, undefined, undefined],
      [undefined, undefined, undefined, 25, 6],
    ],
  );
  assert.deepEqual(
    gear.mail?.map((letter) => [letter.from, letter.crowded]),
    [
      [0, false],
      [4, false],
    ],
    'left lying, then salvage',
  );
  assert.ok(gear.mail?.every((letter) => letter.id > 0 && !letter.vestige?.vaulted));
  assert.ok((gear.mail?.[1]?.item?.columns.length ?? 0) > 0, 'its nodes spelled out');
  const sword = gear.items.find((item) => item.named === 'harbourwarden');
  assert.ok(sword);
  assert.deepEqual(
    [sword.source, gear.mail?.[0]?.vestige?.source],
    [3, 5],
    'Harbourwarden, mithril, an Elite Dungeon’s; the letter’s Vestige a sea dungeon’s',
  );
  assert.deepEqual([sword.at, sword.attack, sword.rarity, sword.level, sword.xpMost], [2, 248, 3, 20, 90_000]);
  assert.deepEqual(
    sword.columns.map((column) => column.kind),
    [1, 0, 3, 0, 2, 3, 0, 0, 0],
  );
  assert.deepEqual(sword.columns[0]?.traits, ['light_grip', 'weighted', 'keen_edge']);
  assert.deepEqual([sword.columns[8]?.essence, sword.columns[8]?.aurem, sword.columns[1]?.resource], [6, 1_500, 10]);
  assert.equal(sword.resource, 0, 'Brineglass, the first island’s');
  assert.deepEqual(
    gear.vestiges.map((vestige) => [vestige.rarity, vestige.slot, vestige.vaulted]),
    [[4, 2, false]],
  );
});

test('where a player stands crosses as the server wrote it, away from Shape and while he is here', async () => {
  // gear_wire_tests.rs writes both: the furnished player at the Test Ground's stall, its Arts mastered, and then
  // pledged to the Lamplighters at rank 3, Arts at levels 3, 1 and 5, the Ember Plate barding worn and 9 Shapes on a
  // Friday noon.
  const away = readFromRoom(await written('gear.bin'));
  const here = readFromRoom(await written('gear_shape.bin'));
  assert.ok(away?.kind === 'gear' && here?.kind === 'gear');
  const fresh = { pledge: 0, reputation: [0, 0, 0], packages: [0, 0, 0], artLevels: [5, 5, 5], artXp: [0, 0, 0] };
  assert.deepEqual(away.standing, { ...fresh, artOwned: [0b11_1111, 0b11_1111, 0b11_1111] }, 'every fragment owned');
  assert.deepEqual(away.cosmetics, [23, 0], 'the start pieces: bare, own colours');
  assert.deepEqual(away.worn, { dye: 0, coat: 0, barding: 23 }, 'no horse worn, so no coat');
  assert.deepEqual([away.shapes, away.shape], [0, null], 'he is away');
  assert.deepEqual(here.standing, {
    pledge: 2,
    reputation: [5, 350_000, 0],
    packages: [0, 1, 0],
    artLevels: [3, 1, 5],
    artXp: [700, 0, 0],
    artOwned: [0b101, 0, 0b11_1111],
  });
  assert.deepEqual(here.cosmetics, [23, 24, 14, 0], 'Ember Plate bought and the Lamplighters’ gold earned');
  assert.deepEqual(here.worn, { dye: 0, coat: 0, barding: 24 });
  assert.equal(here.cosmeticsSold?.length, 9, 'four the Tailor’s, four the Tack’s and its Bay Horse');
  assert.equal(here.shapes, 9);
  assert.equal(here.shape?.place, 6);
  const wares = here.shape?.wares ?? [];
  assert.deepEqual(
    wares.map((ware) => [ware.rarity, ware.price, ware.level, ware.named === null]),
    [0, 1, 2, 3, 4, 5].map((place) => [place < 4 ? 3 : 4, place < 4 ? 7 : 23, 20, place < 4]),
    'four rolled Legendary, then two named Atheric (this week both weapons, 23), priced in Shapes',
  );
  // Each is numbered as a page asks for it: an Atheric by its place in the catalogue, a rolled piece by its hash.
  const atheric = wares[4];
  assert.equal(
    atheric?.id,
    items.items.findIndex((entry) => entry.id === atheric?.named),
  );
  assert.equal(new Set(wares.map((ware) => ware.id)).size, 6, 'no two numbered alike');
  const sold = here.factionWares ?? [];
  assert.equal(sold.length, 21, 'seven pieces of each faction’s');
  const hood = sold.find((ware) => ware.named === 'lamplighters_hood');
  assert.deepEqual([hood?.id, hood?.price, hood?.level], [1, 6_000, 20]);
  assert.equal(
    here.day,
    20_778,
    'the clock’s day that Friday noon, begun at 09:00, which the smiths’ wares are asked by',
  );
});

test('an ask crosses into an input with every field it names', () => {
  const ask = { kind: ASKS.buy, item: 7, column: 6, node: 1 } as const;
  const bytes = inputBytes(3, {
    intent: new Float64Array(18),
    look: { anim: 'idle', frame: 0, facing: 0 },
    arms: 0,
    seen: 0n,
    spawn: { type: 14, rank: 2, shield: 1 },
    spawnLevel: 12,
    ask,
  });
  const input = Input.getRootAsInput(new flatbuffers.ByteBuffer(bytes));
  const read = input.ask();
  assert.deepEqual([read?.kind(), read?.item(), read?.column(), read?.node()], [ASKS.buy, 7, 6, 1]);
  assert.deepEqual([input.spawn(), input.spawnType(), input.spawnLevel()], [1 << 4, 14, 12], 'its shield above');
  const named = Input.getRootAsInput(
    new flatbuffers.ByteBuffer(
      inputBytes(4, {
        intent: new Float64Array(18),
        look: { anim: 'idle', frame: 0, facing: 0 },
        arms: 0,
        seen: 0n,
        ask: { kind: ASKS.grantNamed, named: 'gullwing' },
      }),
    ),
  );
  assert.equal(named.ask()?.named(), 'gullwing');
  const none = Input.getRootAsInput(
    new flatbuffers.ByteBuffer(
      inputBytes(5, {
        intent: new Float64Array(18),
        look: { anim: 'idle', frame: 0, facing: 0 },
        arms: 0,
        seen: 0n,
      }),
    ),
  );
  assert.equal(none.ask(), null, 'an input that asks nothing carries no ask');
});

test("the ship's part of the gear message reads back: its power, materials, hands, officers, offers and fleet", () => {
  const builder = new flatbuffers.Builder(256);
  const traits = GearColumn.createTraitsVector(builder, [builder.createString('steady_hand')]);
  const column = GearColumn.createGearColumn(builder, 3, traits, 400, 900, 0, 2, 0);
  const officer = (id: number, duty: number, wage: number) =>
    GearOfficer.createGearOfficer(
      builder,
      id,
      1,
      2,
      3,
      4,
      duty,
      12,
      0.5,
      300,
      2_000,
      0.8,
      1,
      GearOfficer.createChosenVector(builder, [0]),
      GearOfficer.createColumnsVector(builder, [column]),
      wage,
    );
  const officers = GearShip.createOfficersVector(builder, [officer(5, 1, 0)]);
  const offers = GearShip.createOffersVector(builder, [officer(0, 0, 4_000)]);
  const brig = GearKeptShip.createGearKeptShip(
    builder,
    2,
    GearKeptShip.createNameVector(builder, [255, 3]),
    true,
    GearKeptShip.createDressVector(builder, [1, 11, 21, 31]),
  );
  const fleet = GearShip.createFleetVector(builder, [brig]);
  const dresses = GearShip.createDressesVector(builder, [0, 1, 11]);
  const ship = GearShip.createGearShip(
    builder,
    9_000n,
    6,
    12,
    80,
    140,
    0.25,
    1_200,
    GearShip.createStocksVector(builder, [10, 20, 30, 4]),
    18,
    24,
    officers,
    offers,
    GearShip.createTrimVector(builder, [1, 2]),
    2,
    fleet,
    2,
    dresses,
  );
  Gear.startGear(builder);
  Gear.addShip(builder, ship);
  builder.finish(Gear.endGear(builder));
  const read = gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(builder.asUint8Array()))).ship;
  assert.ok(read);
  assert.deepEqual(
    [read.xp, read.level, read.prestige, read.attack, read.defense, read.toNext, read.toNextNeeds],
    [9_000n, 6, 12, 80, 140, 0.25, 1_200],
  );
  assert.deepEqual(
    [read.stocks, read.hands, read.handsMost, read.trim, read.pledge],
    [[10, 20, 30, 4], 18, 24, [1, 2], 2],
  );
  assert.deepEqual(read.fleet, [{ hull: 2, name: [255, 3], named: true, dress: [1, 11, 21, 31] }]);
  assert.deepEqual([read.sailed, read.dresses], [2, [0, 1, 11]]);
  const [kept] = read.officers;
  assert.deepEqual(
    [kept?.id, kept?.post, kept?.grade, kept?.given, kept?.family, kept?.duty, kept?.level, kept?.toNext],
    [5, 1, 2, 3, 4, 1, 12, 0.5],
  );
  assert.deepEqual(
    [kept?.trained, kept?.trainedMost, kept?.strength, kept?.bought, kept?.chosen],
    [300, 2_000, 0.8, 1, [0]],
  );
  assert.deepEqual(kept?.columns, [
    { kind: 3, traits: ['steady_hand'], xp: 400, aurem: 900, fragments: 0, essence: 2, resource: 0 },
  ]);
  assert.deepEqual(
    read.offers.map((each) => [each.id, each.wage]),
    [[0, 4_000]],
  );
  const bare = new flatbuffers.Builder(16);
  Gear.startGear(bare);
  bare.finish(Gear.endGear(bare));
  assert.equal(gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(bare.asUint8Array()))).ship, null, 'none sent');
});

test("the ship's, crew's, story's and bounties' asks carry the numbers the protocol reads them by", async () => {
  const read = (file: string) => readFile(new URL(`../../../crates/protocol/src/${file}`, import.meta.url), 'utf8');
  const wire = (await read('gear_wire.rs')) + (await read('lore_wire.rs'));
  const number = (name: string) => Number(new RegExp(`pub const ${name}: u8 = (\\d+);`).exec(wire)?.[1]);
  assert.deepEqual(
    [
      ASKS.infuse,
      ASKS.recruit,
      ASKS.station,
      ASKS.dismiss,
      ASKS.train,
      ASKS.chooseOfficer,
      ASKS.grantOfficers,
      ASKS.scavenge,
      ASKS.stopGather,
      ASKS.finishPrologue,
      ASKS.takeBounty,
      ASKS.turnInBounty,
      ASKS.takeLetter,
      ASKS.takeAllLetters,
      ASKS.findLore,
    ],
    [
      ...['INFUSE', 'RECRUIT', 'STATION', 'DISMISS', 'TRAIN', 'CHOOSE_OFFICER', 'GRANT_OFFICERS', 'SCAVENGE'],
      ...['STOP_GATHER', 'FINISH_PROLOGUE', 'TAKE_BOUNTY', 'TURN_IN_BOUNTY', 'TAKE_LETTER', 'TAKE_ALL_LETTERS'],
      'FIND_LORE',
    ].map(number),
  );
  const numbers = Object.values(ASKS);
  assert.equal(new Set(numbers).size, numbers.length, 'no two asks share a number');
});

test("the roads' part of the gear message reads back: the quest walked, its counts, what is done, earned and waiting, and where its goal stands", () => {
  const builder = new flatbuffers.Builder(256);
  const counts = Gear.createQuestCountsVector(builder, [2, 0]);
  const done = Gear.createQuestsDoneVector(builder, [1, 0, 0, 0]);
  const earned = Gear.createArtsEarnedVector(builder, [0b011, 0, 0]);
  const choices = Gear.createFragmentChoicesVector(builder, [1, 0, 0]);
  const where = Gear.createQuestAtVector(builder, [120.5, -40, 30]);
  Gear.startGear(builder);
  Gear.addQuest(builder, 2);
  Gear.addQuestTask(builder, 4);
  Gear.addQuestCounts(builder, counts);
  Gear.addQuestsDone(builder, done);
  Gear.addArtsEarned(builder, earned);
  Gear.addFragmentChoices(builder, choices);
  Gear.addQuestAt(builder, where);
  Gear.addClaimed(builder, true);
  builder.finish(Gear.endGear(builder));
  const read = gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(builder.asUint8Array())));
  assert.deepEqual(read.quest, {
    quest: 2,
    task: 4,
    counts: [2, 0],
    done: [1, 0, 0, 0],
    choices: [1, 0, 0],
    at: [120.5, -40, 30],
    ...{ clock: null, fails: [], points: [], figures: [], ward: null, claimed: true },
  });
  assert.deepEqual(read.arts?.earned, [0b011, 0, 0]);
  assert.deepEqual(
    [earnedOf(read.arts, 1), earnedOf(read.arts, 2)],
    [0b011, 0],
    'Storm and Quicken; nothing of Divine',
  );
  const bare = new flatbuffers.Builder(16);
  Gear.startGear(bare);
  bare.finish(Gear.endGear(bare));
  const none = gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(bare.asUint8Array())));
  assert.deepEqual(
    none.quest,
    {
      quest: 0,
      task: 0,
      counts: [],
      done: [],
      choices: [],
      at: null,
      clock: null,
      fails: [],
      points: [],
      figures: [],
      ward: null,
      claimed: false,
    },
    "none walked, nor on the player's own character",
  );
  assert.equal(earnedOf(none.arts, 3), 0b111, 'a room that says nothing of it locks nothing');
});

test("a varied step reads back: its clock, each goal's failures, a puzzle's points, the figures walking and the ward", () => {
  const builder = new flatbuffers.Builder(256);
  const fails = Gear.createQuestFailsVector(builder, [0, 2]);
  const points = Gear.createQuestPointsVector(builder, [10, 0, 1, 0, -10, 0, 99]);
  const figures = Gear.createQuestFiguresVector(builder, [22, 5, 6, 7, 1.5, 4, 107, 1, 2, 3, 0, 1]);
  const ward = Gear.createQuestWardVector(builder, [40, -2, 0.25]);
  Gear.startGear(builder);
  Gear.addQuest(builder, 3);
  Gear.addQuestClock(builder, 83.5);
  Gear.addQuestFails(builder, fails);
  Gear.addQuestPoints(builder, points);
  Gear.addQuestFigures(builder, figures);
  Gear.addQuestWard(builder, ward);
  builder.finish(Gear.endGear(builder));
  const read = gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(builder.asUint8Array()))).quest;
  assert.equal(read?.clock, 83.5);
  assert.deepEqual(read?.fails, [0, 2]);
  assert.deepEqual(
    read?.points,
    [
      { x: 10, y: 0, lit: true },
      { x: 0, y: -10, lit: false },
    ],
    'whole points only, a stray number left',
  );
  assert.deepEqual(read?.figures, [
    { look: 22, x: 5, y: 6, z: 7, facing: 1.5, state: FIGURE_STATES.ambushed },
    { look: 107, x: 1, y: 2, z: 3, facing: 0, state: FIGURE_STATES.walking },
  ]);
  assert.deepEqual(read?.ward, { x: 40, y: -2, health: 0.25 });
});

test("the roads' asks carry the numbers the protocol reads them by, with the keeper and the fragment they name", async () => {
  const wire = await readFile(new URL('../../../crates/protocol/src/gear_wire.rs', import.meta.url), 'utf8');
  const number = (name: string) => Number(new RegExp(`pub const ${name}: u8 = (\\d+);`).exec(wire)?.[1]);
  assert.deepEqual([ASKS.speakWith, ASKS.chooseFragment], [number('SPEAK'), number('CHOOSE_FRAGMENT')]);
  assert.deepEqual([ASKS.speakWith, ASKS.chooseFragment, ASKS.usePoint], [64, 65, 66]);
  const bytes = inputBytes(6, {
    intent: new Float64Array(18),
    look: { anim: 'idle', frame: 0, facing: 0 },
    arms: 0,
    seen: 0n,
    ask: { kind: ASKS.chooseFragment, column: 2, node: 5 },
  });
  const ask = Input.getRootAsInput(new flatbuffers.ByteBuffer(bytes)).ask();
  assert.deepEqual([ask?.kind(), ask?.column(), ask?.node()], [65, 2, 5]);
});

test('the lore found and lying in the node read back: each found by its number, each lying by its number and place', () => {
  const builder = new flatbuffers.Builder(64);
  const found = Gear.createLoreVector(builder, [4, 0, 2]);
  const lying = Gear.createLoreHereVector(builder, [1, 120.5, -40, 3, 7, 8.25]);
  Gear.startGear(builder);
  Gear.addLore(builder, found);
  Gear.addLoreHere(builder, lying);
  builder.finish(Gear.endGear(builder));
  const read = gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(builder.asUint8Array())));
  assert.deepEqual(read.lore, [4, 0, 2], 'in the order found');
  assert.deepEqual(read.loreHere, [
    { chapter: 1, at: [120.5, -40] },
    { chapter: 3, at: [7, 8.25] },
  ]);
  const bare = new flatbuffers.Builder(16);
  Gear.startGear(bare);
  bare.finish(Gear.endGear(bare));
  const none = gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(bare.asUint8Array())));
  assert.deepEqual([none.lore, none.loreHere], [[], []], 'a room that sends none');
});
