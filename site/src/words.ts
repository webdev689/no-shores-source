// Every word the website says, by its page and name (`world.title`); a page names them and the build fills them in.
// The premise is the owner's, word for word, split into passages and never reworded. Every other line says only what
// a recorded decision says.

/** The owner's premise, passage by passage, as the owner wrote it. */
const PREMISE = {
  'premise.opening': 'An age without history. A world without certainty.',
  'premise.expanse': 'Beyond the known waters lies The Pale Expanse, a vast ocean stretching between nine continents.',
  'premise.coast':
    'For as long as anyone can remember, civilization has clung to the coast. Great port cities once connected the region through commerce, exploration, and war.',
  'premise.three': 'Today, only three remain.',
  'premise.ruin': 'The others stand in ruin.',
  'premise.stranger':
    'Some were burned. Others were abandoned. And some appear to have suffered something far stranger. Their streets, buildings, and inhabitants have changed in ways that defy explanation.',
  'premise.history': 'Even history itself cannot be trusted.',
  'premise.maps':
    'Old maps contradict the coastlines they describe. Settlements appear older than their own records. People remember events differently, and nobody seems capable of establishing which account is true.',
  'premise.tithe':
    'Across these uncertain waters, the Grey Tithe maintains its authority. Its unmarked vessels demand a tenth of everything carried across the sea. Those who refuse risk losing their ships entirely.',
  'premise.refuses': 'But one port refuses to surrender.',
  'premise.overlook':
    "Overlook, situated on the island of Saltmere, remains a sanctuary for those seeking freedom from the Tithe's rule.",
  'premise.begins': 'It is here that your story begins.',
  'premise.ambush':
    'A captain, bound for Overlook, is ambushed at sea. After surviving an initial engagement, their vessel is shattered by the flagship of Captain Brannoc Thule.',
  'premise.depths': 'Defeated, the captain is thrown into the depths.',
  'premise.calls': 'Something calls through the darkness.',
  'premise.survives': 'Against all expectation, the captain survives, awakening on the shores of Saltmere.',
  'premise.truth': 'Beyond the safety of Overlook, an unsettling truth awaits.',
  'premise.growth':
    'Across the ruined continents, crystalline growth overtakes the remains of civilization. Familiar places become unrecognizable. The living are transformed into something else.',
  'premise.confined': 'Whatever is responsible is not confined to one island, one kingdom, or one stretch of ocean.',
  'premise.farther':
    'And as the captain ventures farther into the Pale Expanse, the distinction between what the world is and what it once was becomes increasingly uncertain.',
  'premise.countless': 'There are countless shores in the Pale Expanse.',
  'premise.safety': 'But none promise safety.',
} as const;

const SHELL = {
  'shell.brand': 'No Shores',
  'shell.skip': 'Skip to the page',
  'shell.navLabel': 'The site',
  'shell.footLabel': 'Pages',
  'shell.navHome': 'Home',
  'shell.navWorld': 'The World',
  'shell.navGame': 'The Game',
  'shell.navPanel': 'Discord bot',
  'shell.navPlay': 'Play',
  'shell.navDiscord': 'Discord',
  'shell.copyright': '© Vestige Studios',
} as const;

const HOME = {
  'home.title': 'No Shores',
  'home.heroAlt':
    'Overlook at night: lit windows climbing the rock of Saltmere, lanterns on the quay, ships at anchor.',
  'home.discord': 'Join the Discord',
  'home.worldLead': 'See The World',
  'home.gameLead': 'See The Game',
  'home.numbersHead': 'At a glance',
  // The numbers band: each number and its label from the premise or a decision, the number in the page beside it.
  // The premise: "a vast ocean stretching between nine continents"; "Great port cities ... Today, only three remain."
  'home.numberContinents': 'continents',
  'home.numberPorts': 'port cities remain',
  // Arts Are Overlook's Subclasses and Three Factions Keep the Arts, After Destiny 1: the three Arts, each kept by a
  // faction.
  'home.numberArts': 'Arts',
  'home.numberFactions': 'factions',
} as const;

const WORLD = {
  'world.title': 'The World',
  'world.expanseHead': 'The Pale Expanse',
  'world.expanseAlt': 'Open sea under the stars, and a burned port smoking on a far coast.',
  'world.titheHead': 'The Grey Tithe',
  'world.titheAlt': 'Grey, unmarked sails closing out of the mist on a lone ship.',
  'world.overlookHead': 'Overlook',
  'world.ambushHead': 'The Ambush',
  'world.ambushAlt': 'A huge dark flagship beside a smaller ship broken apart and burning.',
  'world.depthsHead': 'The Depths',
  'world.depthsAlt': 'A captain sinking through dark water toward a faint light far below.',
  'world.shoreHead': "Saltmere's Shore",
  'world.shoreAlt': 'A captain lying on a beach at first light, a lit town on the rock above.',
  'world.ruinsHead': 'The Ruined Ports',
  'world.ruinsAlt': 'A ruined port on the coast, overtaken by red and purple crystal.',
} as const;

const GAME = {
  'game.title': 'The Game',
  'game.lede': 'A pirate sandbox in a shared world.',
  'game.overlookHead': 'Overlook',
  'game.overlookSetOut': 'You set out from Overlook, the port on Saltmere.',
  'game.overlookPlayers': 'Other players are there too.',
  'game.overlookDo': 'Buy goods, hire crew, join a faction and take on quests.',
  'game.shipHead': 'Your ship',
  'game.shipAlt': 'A ship under full sail by moonlight, other ships far off.',
  'game.shipOwn': 'You sail your own ship, and you see other captains on their own voyages.',
  'game.shipWaters': 'The sea is split into waters, each with its owner and its level.',
  'game.shipGear': 'Your ship is gear: its hull, guns, sails and crew.',
  'game.shipCrew': 'Named crew fight beside you, with perks of their own.',
  'game.shipPeace': 'Players never fight each other at sea.',
  'game.artsHead': 'The Arts and the three factions',
  'game.artsAlt': 'Three flames on a quay at night: electric blue, fire orange, violet.',
  'game.artsThree': 'There are three Arts: Storm, Divine and Shadow.',
  'game.artsEach':
    'Storm is agile and quick to hurt. Divine heals and lifts its allies. Shadow is the Art of the mystic.',
  'game.artsKept': 'Each is kept by a faction: the Stormcallers, the Lamplighters and the Veiled.',
  'game.artsPledge': 'Pledge to one. You can switch later, for a cost.',
  'game.artsLevels': 'Your faction raises your Art, level by level, up to five.',
  'game.gearHead': 'Gear',
  'game.gearAlt': 'A sword, a breastplate and a helm under a lantern.',
  'game.gearPower': 'Your power comes from your gear.',
  'game.gearEarn': 'Earn it from drops, activities and quests.',
  'game.gearNodes': 'Weapons and armour are upgraded through nodes.',
  'game.gearSpend': 'Spend Aurem, fragments from dismantled gear, and rare resources.',
  'game.gearUse': 'The more you use a weapon, the more nodes it opens.',
} as const;

const PANEL = {
  'panel.title': 'Discord bot',
  'panel.description':
    'Set up the No Shores bot for your Discord server: welcome messages, roles, levels and moderation.',
  'panel.lede': 'Sign in with Discord to set up the bot for a server you run.',
  'panel.bellAlt': "A ship's bell hanging from a post on the quay at night, a lantern beside it and ships beyond.",
  'panel.noScript': 'The panel needs JavaScript.',
  'panel.loading': 'Loading the panel.',
  'panel.english': 'The panel is in English for now.',
} as const;

export const WORDS: Readonly<Record<string, string>> = { ...PREMISE, ...SHELL, ...HOME, ...WORLD, ...GAME, ...PANEL };
