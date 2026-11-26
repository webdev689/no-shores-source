// Pictures of a house's horde on the HUD, headless (`tools/uiShot.mjs`), over a plain dusk in place of the world: the
// Stormcallers' horde running, its foes left of all counted down in the tracker, the Art toasted unbounded and the
// ability bar whole, full and glowing unbounded; and as it falls, the Art bound again and the bar as the road has
// earned it. The game never imports it.
import { AbilityBar, type AbilityState } from '../combat/abilityBar.ts';
import type { QuestState } from '../network/questMessages.ts';
import { abilityPictures } from '../player/artGlyphs.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { Hud } from './hud.ts';
import { QUESTS, trackedOf } from './quests/questBook.ts';
import { boundWords, unboundedWords } from './quests/quests.ts';

const DUSK = '#4a5662';
const STORM_ART = 1;
const ROAD = QUESTS.findIndex((quest) => quest.id === 'stormcallers') + 1;
const HORDE_TASK = QUESTS[ROAD - 1]?.tasks.findIndex((task) => task.goals.some((goal) => goal.horde)) ?? -1;

/** The Stormcallers' road at `task`, with more of the room's word. */
const onTask = (task: number, more: Partial<QuestState> = {}): QuestState => ({
  quest: ROAD,
  task,
  counts: [],
  done: [0, 0, 0, 0],
  choices: [0, 0, 0],
  at: null,
  ...more,
});

/** Each shot's HUD and bar, kept across its frames. */
const kept = new Map<string, { hud: Hud; bar: AbilityBar }>();

/** The HUD of shot `name` over dusk, its tracker showing `quest`, toasting `toast`, its bar showing `bar`. */
function hordeOver(ui: Interface, name: string, quest: QuestState, toast: string, state: AbilityState): Node {
  let shot = kept.get(name);
  if (!shot) {
    shot = { hud: new Hud(), bar: new AbilityBar(abilityPictures) };
    shot.hud.veil(null);
    shot.hud.place('The High Downs', 'Saltgrass Downs');
    kept.set(name, shot);
  }
  const { hud, bar } = shot;
  hud.tasks.show(trackedOf(quest));
  hud.toast(toast);
  bar.update(state, 1 / 60);
  return {
    width: 'grow',
    height: 'grow',
    fill: DUSK,
    children: [
      hud.node(ui),
      {
        width: 'grow',
        height: 'grow',
        float: { to: 'screen' },
        alignX: 'center',
        alignY: 'end',
        padding: [0, 0, 24, 0],
        children: [bar.node(false)],
      },
    ],
  };
}

/** The horde running: 17 of its 29 foes left, the Storm unbounded, every ability lit and full. */
export function hordeRunningShot(ui: Interface): Node {
  const quest = onTask(HORDE_TASK, { horde: { left: 17, all: 29 } });
  const state = { art: STORM_ART, animaShare: 1, tenets: [1, 1] as const, earned: 0b111, unbounded: true };
  return hordeOver(ui, 'running', quest, unboundedWords('Storm'), state);
}

/** The horde fallen: the road on its next task, the Storm bound again, its unearned Tenets locked once more. */
export function hordeBoundShot(ui: Interface): Node {
  const quest = onTask(HORDE_TASK + 1);
  const state = { art: STORM_ART, animaShare: 1, tenets: [1, 1] as const, earned: 0b001 };
  return hordeOver(ui, 'bound', quest, boundWords('Storm'), state);
}
