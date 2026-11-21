// The Test Ground's Arts, to try every spell at once: the Art worn, each slot of its Core, each Art's level (owning
// all its fragments; the player joins with every Art at the highest), and the Anima filled and the Tenets readied.
// The room answers each ask as it would the Arts' screen's, and the panel shows its word.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { ArtState } from '../network/artMessages.ts';
import { ASKS, type GearAsk, type GearStanding } from '../network/gearMessages.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { heading, hint, labelled, pick, press } from './panelKit.ts';

/** How many slots an Art's Core has. */
const CORE_SLOTS = 3;
/** An Art's highest level, where every Test Ground player starts each Art. */
const LEVEL_MOST = arts.levels.power.length;

/** The ask that sets `fragment` (its place in the Art's list) in `slot` of `art`'s Core. */
export const coreAsk = (art: number, slot: number, fragment: number): GearAsk => ({
  kind: ASKS.setCore,
  column: art,
  slot,
  node: fragment,
});

/** The ask that sets `art` at `level`, owning all its fragments. */
export const levelAsk = (art: number, level: number): GearAsk => ({ kind: ASKS.grantArtLevel, column: art, level });

/** The Arts' panel, showing the room's last word on the Arts, `state`, and where the player stands with each: every
 *  list shows what the room holds, so a choice it refused is never left shown. */
export function artsNodes(
  ui: Interface,
  ask: (asked: GearAsk) => void,
  state: ArtState | null,
  standing?: GearStanding,
): Node[] {
  const art = state?.art ?? arts.arts[0]?.id ?? 1;
  const worn = pick(
    ui,
    'tg:arts:worn',
    arts.arts.map((each) => [String(each.id), each.name] as const),
    String(art),
    (value) => ask({ kind: ASKS.wearArt, column: Number(value) }),
  );
  const core = state ? (arts.arts.find((each) => each.id === state.art)?.core ?? []) : [];
  const set = state?.cores[state.art - 1] ?? [];
  const fragments = [['', '—'] as const, ...core.map((fragment, place) => [String(place), fragment.name] as const)];
  // A fragment is never taken out, only replaced: "—" leaves what the room holds.
  const slots = Array.from({ length: CORE_SLOTS }, (unused, slot) =>
    labelled(
      `Core ${slot + 1}`,
      pick(ui, `tg:arts:core${slot}`, state ? fragments : [], String(set[slot] ?? ''), (value) => {
        if (state && value !== '') ask(coreAsk(state.art, slot, Number(value)));
      }),
    ),
  );
  // A press a level, so the level shown can be asked for again, owning every fragment once more.
  const levels = arts.arts.map((each, place): Node => {
    const held = state ? (standing?.artLevels[place] ?? LEVEL_MOST) : null;
    return labelled(`${each.name} level`, {
      gap: 4,
      label: `${each.name} level`,
      children: [1, 2, 3, 4, 5].map((level) =>
        press(ui, `tg:arts:${each.id}:${level}`, String(level), () => ask(levelAsk(each.id, level)), {
          active: level === held,
        }),
      ),
    });
  });
  return [
    heading('Arts'),
    labelled('Art', worn),
    ...slots,
    ...levels,
    { children: [press(ui, 'tg:arts:fill', 'Fill the Anima, ready the Tenets', () => ask({ kind: ASKS.grantArts }))] },
    hint(
      'R casts the Anima, Q and G the Tenets. Every Art starts at level 5 owning every fragment; a level picked owns ' +
        'them all again. A fragment set in another slot is refused.',
    ),
  ];
}
