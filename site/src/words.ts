// Every word the website says, by its page and name (`world.title`); a page names them and the build fills them in.
// The premise is the owner's, word for word, split into passages and never reworded. Every other line says only what
// a recorded decision says or what the game has built, each group naming its notes, and tells a newcomer plainly what
// they will do. The lore is shown, not explained (The Game Shows the Mystery and Explains Almost None of It).

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
  // The owner's own words for the game, in No Shores: "A proper pirate sandbox experience" and "A shared world".
  'shell.tagline': 'A pirate sandbox in a shared world.',
  'shell.skip': 'Skip to the page',
  'shell.navLabel': 'The site',
  'shell.footLabel': 'Explore',
  'shell.navHome': 'Home',
  'shell.navWorld': 'The World',
  'shell.navGame': 'The Game',
  'shell.navPanel': 'Discord bot',
  'shell.navPlay': 'Play',
  'shell.navDiscord': 'Discord',
  'shell.copyright': '© Vestige Studios',
} as const;

// Home. Its sources: No Shores and Overlook Is a Shared World After Destiny 1 (a shared world, Overlook the social
// hub, gear-based power, weapon upgrades); The Sea Is a Patrol Zone, and the Ship Is Gear; Ships Have Their Own Power,
// Modules and Crew Who Fight Beside You; Combat Is Soulframe's, With DFO's Enhanced AI; The Player's Swings Chain Side
// Cut, Overhead and Thrust; Arts Are Overlook's Subclasses; Three Factions Keep the Arts, After Destiny 1; Gear and
// Power Follow Destiny 1 Vanilla; Dailies and Weeklies Follow Destiny 1, With One Abyss Dungeon a Week; Public Events
// Run on a Clock, After Destiny 1; Guilds Gain Banners, Levels, Bounties and Outposts; Accounts Start as Guests, on
// Cloudflare D1; WebGPU Only; Every Control Can Be Rebound, and the Pad Plays as Destiny's.
const HOME = {
  'home.title': 'No Shores: a pirate sandbox in a shared world',
  'home.description':
    'No Shores is a pirate action RPG in a shared world. Captain your own ship, fight on land and at sea, and play it in your browser.',
  'home.heroAlt':
    "Overlook at night: its town climbing Saltmere's rock to a beacon, lanterns along the quay, ships at anchor in the bay.",
  'home.pitch':
    'Captain your own ship, fight on land and at sea, and play alongside other captains, right in your browser.',
  'home.play': 'Play now',
  'home.discord': 'Join the Discord',
  'home.needs': 'Runs in your browser with WebGPU. Keyboard and mouse or gamepad.',
  'home.introHead': 'What is No Shores?',
  'home.intro':
    'No Shores is an action RPG set in the Pale Expanse, a vast ocean between nine continents where only three port cities still stand. You begin in Overlook, the one port that refuses the Grey Tithe. From there you sail your own ship, fight on deck and ashore, take on dungeons and events with other players, and grow stronger through the gear you earn.',
  'home.introShared':
    'The world is shared. Overlook is a social hub full of other captains, and the islands, waters and dungeons beyond it are played together with whoever is there.',
  'home.featuresHead': 'What you do',
  'home.portHead': 'Overlook, the last free port',
  'home.portText':
    'Every voyage begins and ends in Overlook, on the island of Saltmere. Meet other captains, trade with the keepers at their stalls, hire a crew, take on bounties and pledge yourself to one of three factions.',
  'home.portHub': 'Social hub',
  'home.portKeepers': 'Keepers and vendors',
  'home.portBounties': 'Bounties',
  'home.portFactions': 'Three factions',
  'home.seaHead': 'A ship of your own',
  'home.seaText':
    'Take the helm and sail the open sea at true scale. Every stretch of water has an owner and a level, and the ships you sight on the horizon are yours to chase, evade or let pass.',
  'home.seaFight':
    'Win with broadsides and rams, then sink your enemy and salvage what floats, or force them to strike and board them for the fight on their deck.',
  'home.seaSailing': 'Free sailing',
  'home.seaBoarding': 'Broadsides and boarding',
  'home.seaCrew': 'Crew and officers',
  'home.seaFleets': 'Fleets with friends',
  'home.fightHead': 'Steel, timing and the Arts',
  'home.fightText':
    'Fights on foot come down to timing. Hold your guard, parry a blow as it lands and answer with a riposte, dodge through attacks and chain your swings, in first or third person.',
  'home.fightArts':
    'Then master an Art. Storm is fast and deadly, Divine heals and empowers your allies, and Shadow deals in the mystic and the unseen.',
  'home.fightParry': 'Parry and riposte',
  'home.fightLock': 'Lock-on',
  'home.fightRanged': 'Ranged weapons',
  'home.fightThree': 'Storm, Divine and Shadow',
  'home.gearHead': 'Power you earn',
  'home.gearText':
    'Your strength comes from what you carry. Earn weapons and armour from drops, activities and quests, then upgrade them node by node. The more you use a weapon, the more of it you unlock.',
  'home.gearRarities': 'Five rarities',
  'home.gearUpgrades': 'Weapon upgrades',
  'home.gearFaction': 'Faction gear',
  'home.gearVestiges': 'Vestiges',
  'home.doHead': 'Dungeons, events and guilds',
  'home.doText':
    'A new dungeon of the day across six styles, from crypts and temples to caverns and mines, with Elite and Abyss dungeons when you want a harder fight. Public events break out in the wilds on a schedule, open to everyone nearby. Find a company for any run, or found a guild under a banner of your own.',
  'home.doDaily': 'Daily dungeons',
  'home.doEvents': 'Public events',
  'home.doCompany': 'Find a Company',
  'home.doGuilds': 'Guilds and outposts',
  'home.gameLead': 'Everything in the game',
  'home.numbersHead': 'No Shores at a glance',
  // The numbers band: the premise ("a vast ocean stretching between nine continents"; "Today, only three remain."),
  // Arts Are Overlook's Subclasses (three Arts) and Dungeons (six styles).
  'home.numberContinents': 'continents',
  'home.numberPorts': 'port cities remain',
  'home.numberArts': 'Arts to master',
  'home.numberStyles': 'dungeon styles',
  'home.storyHead': 'The story',
  'home.storyLead': 'Read the story',
  'home.startHead': 'Start playing',
  'home.stepPlayHead': 'Press Play',
  'home.stepPlayText': 'No Shores runs in your browser. There is nothing to download or install.',
  'home.stepKeepHead': 'Keep your captain',
  'home.stepKeepText':
    'You start as a guest straight away. Add a username, or link your Discord account, to play the same captain on any device.',
  'home.stepCrewHead': 'Find your crew',
  'home.stepCrewText': 'Join the No Shores Discord to meet other captains, form a company and hear about every update.',
  'home.communityHead': 'Join the community',
  'home.communityText':
    'Meet other captains, find a crew for your next run and hear about every update first on the No Shores Discord.',
} as const;

// The World: the owner's premise, told as it was written, under headings of its own places.
const WORLD = {
  'world.title': 'The World',
  'world.description':
    'The story of No Shores: the Pale Expanse, a vast ocean between nine continents where only three port cities remain and history itself cannot be trusted.',
  'world.expanseHead': 'The Pale Expanse',
  'world.expanseAlt': 'Open sea under the stars, and a burned port smoking on a far coast.',
  'world.titheHead': 'The Grey Tithe',
  'world.titheAlt': 'Grey, unmarked sails closing out of the mist on a lone ship.',
  'world.overlookHead': 'Overlook',
  'world.ambushHead': 'The Ambush',
  'world.ambushAlt': 'A huge dark flagship beside a smaller ship broken apart and burning, under a red sky.',
  'world.depthsHead': 'The Depths',
  'world.depthsAlt': 'A captain sinking through dark water toward a faint light far below.',
  'world.shoreHead': "Saltmere's Shore",
  'world.shoreAlt': 'A captain lying on a beach at first light, a lit town on the rock above.',
  'world.ruinsHead': 'The Ruined Ports',
  'world.ruinsAlt': 'A ruined port on the coast, overtaken by red and purple crystal.',
} as const;

// The Game. Its sources are Home's, and Islands (coves and guarded isles, their wreckage and dungeon doors), Ship
// Power (the Shipwright's modules), Crew, Public Events (the Fissure, the Grey Tithe's raid, a chest for each player
// who took part), Activities (Find a Company, private runs, bounties and the Journal), Guilds, Gear (five rarities,
// Vestiges opened in a social space) and Accounts.
const GAME = {
  'game.title': 'The Game',
  'game.description':
    'Sail your own ship, fight with steel and the Arts, earn your gear, and take on dungeons, public events and guilds in No Shores.',
  'game.lede': 'A pirate sandbox in a shared world, played in your browser.',
  'game.portHead': 'Overlook',
  'game.portAlt': "Keepers' stalls under lanterns on Overlook's quay at night, ships moored beyond.",
  'game.portStart':
    "Your story begins on Saltmere's shore and leads up into Overlook, a port town climbing the island's rock and the social heart of the game.",
  'game.portPlayers':
    'Other players walk its quays and courts with you. Trade with the keepers at their stalls, hire hands and officers for your ship, collect your bounties and mail, and pledge yourself to a faction.',
  'game.seaHead': 'The sea',
  'game.seaAlt': 'A ship under full sail by moonlight, other ships far off.',
  'game.seaSail':
    'Sail at the helm, from oars to full sail, at true scale across the waters between the islands. Wind, swell and weather are the same for every player.',
  'game.seaWaters':
    "The sea is divided into waters, each with an owner and a level. Overlook's home waters are safe. Beyond them, hostile captains sail Schooners, Brigs and Frigates.",
  'game.seaFight':
    'Sight a ship on the horizon and decide: chase it, evade it or let it pass. Fight with broadsides and rams, then sink it and salvage what floats, or force it to strike and board it.',
  'game.seaShip':
    'Your ship is a second set of gear. Fit it with modules from the Shipwright, raise its level, and sign on hands and named officers, who fight beside you ashore as well.',
  'game.seaIslands':
    'Land on coves and guarded isles, scavenge their wreckage for your ship, and find the dungeon doors they hide. Sail with friends as a fleet: players never fight each other at sea.',
  'game.fightHead': 'Combat',
  'game.fightAlt': 'Two fighters squaring off by firelight on a hamlet path at night, blades raised.',
  'game.fightTiming':
    'Fights on foot are about timing. Hold your guard, parry a blow just as it lands and answer with a riposte, or dodge clean through it. Stamina and poise decide who breaks first.',
  'game.fightSwings':
    'Chain side cuts, overheads and thrusts, lock on to your target, and turn to ranged weapons when a fight calls for distance. Play in first or third person.',
  'game.fightFoes':
    "Enemies fight as groups that lead, break and give ground, from the Grey Tithe's crews to stranger things in the ruined ports.",
  'game.artsHead': 'The Arts and the factions',
  'game.artsAlt': 'Three flames on a quay at night: electric blue, fire orange, violet.',
  'game.artsThree':
    'Three Arts shape how you fight. Storm is agile and deadly, Divine heals and empowers your allies, and Shadow is the Art of the mystic.',
  'game.artsParts':
    'Each Art has its Anima, a powerful main cast, two Tenets, and a Core of fragments to make it your own.',
  'game.artsFactions':
    'The Stormcallers, the Lamplighters and the Veiled each keep one Art. Pledge to one, follow its road to earn your Art, and raise it level by level up to five.',
  'game.artsCape':
    "Wear your faction's cape to earn its reputation out in the world, and buy armour and weapons in its colours. You can change factions later, for a price.",
  'game.gearHead': 'Gear',
  'game.gearAlt': 'A sword, a breastplate and a helm under a lantern.',
  'game.gearPower':
    'Your power comes from your gear. Earn weapons and armour in five rarities from drops, activities and quests.',
  'game.gearNodes':
    'Upgrade them through their nodes with Aurem, fragments from dismantled gear and rare materials. The more you use a weapon, the more nodes it opens.',
  'game.gearVestiges': 'The rarest drops come sealed as Vestiges, crystals you open back in a social space.',
  'game.doHead': 'Things to do',
  'game.doAlt': 'A stone dungeon gate cut into a hillside at night, braziers burning either side of the steps down.',
  'game.doDungeons':
    'Every patrol zone hides dungeons in six styles: crypts, halls, cells, temples, caverns and mines. There is a dungeon of the day, Elite dungeons, and one Abyss dungeon each week.',
  'game.doEvents':
    "Public events break out in the wilds on a set schedule. Seal a Fissure torn in the earth or drive off a Grey Tithe raid on a hamlet's stores, and every player who takes part earns a chest.",
  'game.doGroups':
    'Find a Company matches you with other players for any run, or keep a run private for your own group. Bounties and the Journal show what is on today and this week.',
  'game.doGuilds':
    'Found or join a guild of up to a hundred players, with its own name, tag and banner, guild levels, bounties and outposts.',
  'game.playHead': 'How you play',
  'game.playBrowser': 'No Shores runs in your browser on WebGPU, with nothing to install.',
  'game.playControls': 'Play on keyboard and mouse or a gamepad, and rebind every control.',
  'game.playAccount':
    'Start as a guest at once. Add a username, or link your Discord account, to keep your captain on any device.',
} as const;

// The page for an address with no page of its own.
const LOST = {
  'lost.title': 'Page not found',
  'lost.description': 'There is no page at this address.',
  'lost.text': 'There is no page at this address. The link may be wrong, or the page may have moved.',
  'lost.home': 'Back to the home page',
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

export const WORDS: Readonly<Record<string, string>> = {
  ...PREMISE,
  ...SHELL,
  ...HOME,
  ...WORLD,
  ...GAME,
  ...LOST,
  ...PANEL,
};
