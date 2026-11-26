// Pictures of the Playlist screen, headless (`tools/uiShot.mjs`): the screen as its tile over a port's island opens
// it, over a sample day and week and a character's record. The game never imports it.
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { type PlaylistSearch, PlaylistView } from './playlistScreen.ts';
import type { PlaylistScreenState } from './playlistWords.ts';
import { breachEntries } from './playlistBreach.ts';

const BURN = {
  key: 'burn-shadow',
  name: 'Burn (Shadow)',
  words: 'Shadow spells deal double damage. Wearing Shadow, you take double.',
};
const TRICKLE = { key: 'trickle', name: 'Trickle', words: 'Arts take 50% longer to recharge.' };
const BRAWLER = { key: 'brawler', name: 'Brawler', words: 'Melee deals 50% more damage.' };
const DAILY = "Daily, the first clear: a Boss's worth of XP and Aurem, and a Vestige in a Boss's colours.";
const DRAWN = 'One of the 18 Elite Dungeons, drawn as each run starts.';
const ABYSS_DRAWN = 'One of the 18 Elite Dungeons, at Abyss, drawn as each run starts.';
const [ELITE_GEAR, ABYSS_GEAR] = ['Drops Elite Dungeon gear', 'Drops Abyss Dungeon gear'];
const REVIVES = '5 revives for the company. A wipe starts the run over.';
const [DAY, WEEK] = ['Resets in 14:02:11', 'Resets in 3d 14h'];

/** A level 22 character beside Overlook: the Elite Playlist's daily taken and two clears this week; the Abyss
 *  Playlist open; the week's Abyss shut to them. */
export const SAMPLE_SCREEN: PlaylistScreenState = {
  title: 'Playlist',
  port: 'Beside Overlook',
  note: 'Every clear pays its kills and its cache, as any run does.',
  entries: [
    {
      kind: 'elite',
      name: 'Elite Playlist',
      about: 'Elite · Levels 20 to 24 · Foes at level 22',
      rules: [DRAWN],
      drops: ELITE_GEAR,
      modifiers: [BURN],
      rewards: [
        { words: DAILY, taken: true, clears: null, resets: DAY },
        {
          words: "Weekly, at 3 clears: 2 Essence of each stock and a Vestige in a Boss's colours.",
          taken: false,
          clears: [true, true, false],
          resets: WEEK,
        },
      ],
      shut: null,
      lock: null,
      launch: { place: null, seas: 'elite', playlist: 22, finds: 'playlist-elite' },
    },
    {
      kind: 'abyss',
      name: 'Abyss Playlist',
      about: 'Abyss · Levels 20 to 24 · Foes at level 23',
      rules: [ABYSS_DRAWN, REVIVES],
      drops: ABYSS_GEAR,
      modifiers: [BURN, TRICKLE],
      rewards: [
        { words: DAILY, taken: false, clears: null, resets: DAY },
        {
          words: "Weekly, at 3 clears: 3 Essence of each stock and 2 Vestiges in a Boss's colours.",
          taken: false,
          clears: [false, false, false],
          resets: WEEK,
        },
      ],
      shut: null,
      lock: null,
      launch: { place: null, seas: 'abyss', playlist: 23, finds: 'playlist-abyss' },
    },
    {
      kind: 'week-elite',
      name: 'Elite Dungeon of the week',
      about: 'Forsaken Cistern · Elite · Level 26',
      rules: [],
      drops: ELITE_GEAR,
      modifiers: [BRAWLER],
      rewards: [{ words: 'Once a week: a Legendary Vestige and Essence.', taken: false, clears: null, resets: WEEK }],
      shut: 'This dungeon opens at level 24.',
      lock: 'Opens at level 24 · You are 22',
      launch: { place: 'forsaken-cistern', seas: 'elite', playlist: null, finds: null },
    },
    {
      kind: 'week-abyss',
      name: 'Abyss Dungeon of the week',
      about: 'Saltworm Warrens · Abyss · Level 30',
      rules: [REVIVES, 'Never matched. Bring your company.'],
      drops: ABYSS_GEAR,
      modifiers: [TRICKLE, BRAWLER, BURN],
      rewards: [
        {
          words: 'Once a week: a Legendary or Atheric Vestige, Essence, and the Abyss boon.',
          taken: false,
          clears: null,
          resets: WEEK,
        },
      ],
      shut: 'This dungeon opens at level 28.',
      lock: 'Opens at level 28 · You are 22',
      launch: { place: 'saltworm-warrens', seas: 'abyss', playlist: null, finds: null },
    },
  ],
};

/** The sample with the Breach's two tiers after its four, as a level 22 character sees them: both shut. */
const BREACH_SCREEN: PlaylistScreenState = {
  ...SAMPLE_SCREEN,
  entries: [
    ...SAMPLE_SCREEN.entries,
    ...breachEntries(
      {
        ...{ id: 'drowned-vale', name: 'The Drowned Vale', zone: 'gullwing-vale', spaces: [], seals: [], slabs: [] },
        ...{ slabCycle: 660, slabStands: 420, encounters: [], shores: {}, banner: '', dye: '', horse: '' },
        tiers: [
          { key: 'normal', name: 'Normal', level: 26, opens: 24, revives: null },
          { key: 'hard', name: 'Hard', level: 30, opens: 28, revives: 5 },
        ],
      },
      22,
      () => 'Gullwing Vale',
      WEEK,
    ),
  ],
};

/** The screen the last shot showed. */
let showing: PlaylistView | null = null;

/** The screen shown as its tile opens it (the sample's, unless `screen` says), one a picture, searching as `search`
 *  says, the arrows pressed `right` times to choose another entry. */
function screenShot(search: Partial<PlaylistSearch>, right = 0, screen = SAMPLE_SCREEN): (ui: Interface) => Node {
  const views = new WeakMap<Interface, PlaylistView>();
  return (ui) => {
    let view = views.get(ui);
    if (!view) {
      // The last shot's screen shut, so its keys' listener hears none of this one's.
      showing?.hide();
      const none = () => undefined;
      view = new PlaylistView({ launch: none, find: none, stop: none, close: none });
      view.show(screen, {
        canFind: true,
        finding: null,
        said: null,
        launching: false,
        company: false,
        ...search,
      });
      for (let press = 0; press < right; press += 1) dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      views.set(ui, view);
      showing = view;
    }
    return view.layer(ui) || {};
  };
}

export const playlistShot = screenShot({});
export const playlistFindingShot = screenShot({ finding: 'Finding a company · 0:23' });
export const playlistAbyssShot = screenShot({ company: true }, 1);
export const playlistShutShot = screenShot({}, 3);
export const playlistLaunchingShot = screenShot({ finding: 'Launching…', launching: true, company: true });
export const playlistRefusedShot = screenShot({ said: 'The accounts did not answer. Try again.' }, 1);
export const playlistBreachShot = screenShot({}, 4, BREACH_SCREEN);
