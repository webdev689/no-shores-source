// Pictures of the Playlist screen, headless (`tools/uiShot.mjs`): the screen as a Playlist's mark opens it beside a
// port, over a sample day and week and a character's record. The game never imports it.
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { PlaylistView } from './playlistScreen.ts';
import type { PlaylistScreenState } from './playlistWords.ts';

const BURN = {
  key: 'burn-shadow',
  name: 'Burn (Shadow)',
  words: 'Shadow spells deal double damage. Wearing Shadow, you take double.',
};
const TRICKLE = { key: 'trickle', name: 'Trickle', words: 'Arts take 50% longer to recharge.' };
const BRAWLER = { key: 'brawler', name: 'Brawler', words: 'Melee deals 50% more damage.' };
const DAILY = "Daily, the first clear: a Boss's worth of XP and Aurem, and a Vestige.";
const DRAWN = 'One of the 18 Elite Dungeons, drawn as each run starts.';
const REVIVES = '5 revives for the company. A wipe starts the run over.';
const [DAY, WEEK] = ['Resets in 14:02:11', 'Resets in 3d 14h'];

/** A level 22 character beside Overlook: the Elite Playlist's daily taken and two clears this week; the Abyss
 *  Playlist open; the week's Abyss shut to them. */
const SCREEN: PlaylistScreenState = {
  title: 'Playlist',
  port: 'Beside Overlook',
  note: 'Every clear pays its kills and its cache, as any run does.',
  entries: [
    {
      kind: 'elite',
      name: 'Elite Playlist',
      about: 'Elite · Levels 20 to 24 · Foes at level 22',
      rules: [DRAWN],
      modifiers: [BURN],
      rewards: [
        { words: DAILY, taken: true, clears: null, resets: DAY },
        {
          words: 'Weekly, at 3 clears: 2 Essence of each stock and a Vestige.',
          taken: false,
          clears: [true, true, false],
          resets: WEEK,
        },
      ],
      shut: null,
      launch: { place: null, seas: 'elite', playlist: 22, finds: 'playlist-elite' },
    },
    {
      kind: 'abyss',
      name: 'Abyss Playlist',
      about: 'Abyss · Levels 20 to 24 · Foes at level 23',
      rules: [DRAWN, REVIVES],
      modifiers: [BURN, TRICKLE],
      rewards: [
        { words: DAILY, taken: false, clears: null, resets: DAY },
        {
          words: 'Weekly, at 3 clears: 3 Essence of each stock and 2 Vestiges.',
          taken: false,
          clears: [false, false, false],
          resets: WEEK,
        },
      ],
      shut: null,
      launch: { place: null, seas: 'abyss', playlist: 23, finds: 'playlist-abyss' },
    },
    {
      kind: 'week-elite',
      name: 'Elite Dungeon of the week',
      about: 'Forsaken Cistern · Elite · Level 26',
      rules: [],
      modifiers: [BRAWLER],
      rewards: [{ words: 'Once a week: a Legendary Vestige and Essence.', taken: false, clears: null, resets: WEEK }],
      shut: 'This dungeon opens at level 24.',
      launch: { place: 'forsaken-cistern', seas: 'elite', playlist: null, finds: null },
    },
    {
      kind: 'week-abyss',
      name: 'Abyss Dungeon of the week',
      about: 'Saltworm Warrens · Abyss · Level 30',
      rules: [REVIVES, 'Never matched. Bring your company.'],
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
      launch: { place: 'saltworm-warrens', seas: 'abyss', playlist: null, finds: null },
    },
  ],
};

/** The screen shown as its mark opens it, one a picture, `finding` the wait while a search is under way. */
function screenShot(finding: string | null): (ui: Interface) => Node {
  const views = new WeakMap<Interface, PlaylistView>();
  return (ui) => {
    let view = views.get(ui);
    if (!view) {
      const none = () => undefined;
      view = new PlaylistView({ launch: none, find: none, stop: none, close: none });
      view.show(SCREEN, { canFind: true, finding, said: null });
      views.set(ui, view);
    }
    return view.layer(ui) || {};
  };
}

export const playlistShot = screenShot(null);
export const playlistFindingShot = screenShot('Finding a company · 0:23');
